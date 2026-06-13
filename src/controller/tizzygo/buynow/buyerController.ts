import { DELIVERY_RATE_PER_KG } from "./../../../utils/tizzygo/calculations";
import { Response } from "express";
import { AuthRequest } from "../../../middleware/tizzygo/authMiddleware";
import { Product } from "../../../models/tizzyos/seller/AddProducts/Products";
import User from "../../../models/tizzygo/auths/User";
import {
  findOrCreateCartItem,
  updateCartCalculations,
} from "../../../services/tizzygo/cartService";
import { calculateDelivery } from "../../../services/tizzygo/deliveryService";
import { applyCoupon } from "../../../services/tizzygo/couponService";
import {
  calculatePrices,
  DELIVERY_RATE_PER_KM,
  convertWeightToKg,
  convertDimensionToCm,
  calculateGST,
} from "../../../utils/tizzygo/calculations";
import { CalculatedData } from "../../../types/tizzygo/buyer";

// Helper for consistent rounding
const roundToTwoDecimals = (value: number): number => {
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

export const checkout = async (req: AuthRequest, res: Response) => {
  console.log("\n" + "=".repeat(60));
  console.log("🚀 CHECKOUT ROUTE HIT!");
  console.log("=".repeat(60));

  console.log("📥 Full Query Params:", JSON.stringify(req.query, null, 2));
  console.log("👤 User ID:", req.user?.userId || req.user?._id);

  try {
    const userId = req.user?.userId || req.user?._id;
    const {
      productId,
      sellerId,
      productDataId,
      buyerLat,
      buyerLng,
      buyerAddress,
      buyerGooglePlaceId,
      couponCode,
      quantity: qty,
      isLocationUpdate = "false",
    } = req.query as any;

    console.log("📦 Parsed values:", {
      productId,
      sellerId,
      productDataId,
      buyerLat,
      buyerLng,
      quantity: qty,
    });

    // Validations
    if (!userId) {
      console.log("❌ No userId");
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    if (!productId) {
      console.log("❌ No productId");
      return res
        .status(400)
        .json({ success: false, error: "Product ID required" });
    }
    if (!sellerId) {
      console.log("❌ No sellerId");
      return res
        .status(400)
        .json({ success: false, error: "Seller ID required" });
    }
    if (!productDataId) {
      console.log("❌ No productDataId");
      return res
        .status(400)
        .json({ success: false, error: "Product data ID required" });
    }

    // Get vendor code from user model
    console.log("🔍 Fetching user from database to get vendor code...");
    const user = await User.findById(userId);

    if (!user) {
      console.log("❌ User not found");
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const vendorCodeUID =
      (user as any).vendorCodeUID ||
      (user as any).vendorCode ||
      "DEFAULT_VENDOR";
    console.log("✅ Vendor code from user:", vendorCodeUID);

    // Get or create cart item
    const quantity = Number(qty) || 1;
    if (quantity < 1) {
      return res.status(400).json({
        success: false,
        error: "Quantity must be at least 1",
      });
    }

    console.log("🛒 Creating/updating cart item...");
    const cartItem = await findOrCreateCartItem({
      userId,
      productId,
      vendorCodeUID,
      sellerId,
      productDataId,
      quantity,
    });

    console.log("✅ Cart item ID:", cartItem?._id);

    // Fetch product from database
    console.log("🔍 Fetching product from DB...");
    const product = await Product.findOne({
      productId: productDataId,
      sellerId,
    });

    if (!product) {
      console.log("❌ Product not found");
      return res.status(404).json({
        success: false,
        error: "Product not found in database",
      });
    }

    console.log("✅ Product found:", product.title);

    // Get active variant (cart selected variant or first variant or product itself)
    const activeVariant =
      cartItem.selectedVariant || product.variants?.[0] || product;
    const finalQuantity = Math.max(quantity || cartItem.quantity || 1, 1);

    console.log("📦 Active variant data:", {
      variantId: activeVariant.variantId,
      gstType: activeVariant.gstType,
      gstRate: activeVariant.gstRate,
      weight: activeVariant.weight,
      weightUnit: activeVariant.weightUnit,
      dimensions: {
        length: activeVariant.length,
        width: activeVariant.width,
        height: activeVariant.height,
      },
      dimensionUnit: activeVariant.dimensionUnit,
    });

    // Check seller location
    if (
      !product.sellerLocation ||
      !product.sellerLocation.latitude ||
      !product.sellerLocation.longitude
    ) {
      console.log("❌ Seller location missing");
      return res.status(400).json({
        success: false,
        error: "Seller location not found",
      });
    }

    console.log("✅ Seller location found");

    // ============================================================
    // PRICING CALCULATION WITH GST TYPE
    // ============================================================
    let mrp = Number(activeVariant.mrp || activeVariant.price || 0);
    let finalPrice = Number(
      activeVariant.finalPrice || activeVariant.price || 0,
    );
    if (finalPrice > mrp) finalPrice = mrp;

    // Get GST details from variant
    const gstRate = Number(activeVariant.gstRate || 18);
    const gstType = activeVariant.gstType || "INCLUSIVE";

    // Calculate GST using the helper
    const gstCalculation = calculateGST(finalPrice, gstRate, gstType);

    console.log("💰 GST Calculation:", {
      finalPrice,
      gstRate,
      gstType,
      gstAmount: gstCalculation.gstAmount,
      basePrice: gstCalculation.basePrice,
      priceWithGST: gstCalculation.priceWithGST,
    });

    // Calculate all prices with GST type
    const priceCalculations = calculatePrices(
      mrp,
      finalPrice,
      finalQuantity,
      gstRate,
      gstType,
    );

    console.log("💰 Price calculations:", priceCalculations);

    // ============================================================
    // DELIVERY CALCULATION WITH UNIT CONVERSIONS
    // ============================================================
    const sellerLat = Number(product.sellerLocation.latitude);
    const sellerLng = Number(product.sellerLocation.longitude);
    const buyerLatNum = buyerLat ? Number(buyerLat) : null;
    const buyerLngNum = buyerLng ? Number(buyerLng) : null;

    console.log("📍 Delivery calculation - Seller:", { sellerLat, sellerLng });
    console.log("📍 Delivery calculation - Buyer:", {
      buyerLatNum,
      buyerLngNum,
    });

    // Pass the variant with all unit data - delivery service will handle conversions
    const deliveryCalculations = await calculateDelivery(
      sellerLat,
      sellerLng,
      buyerLatNum,
      buyerLngNum,
      activeVariant,
    );

    console.log("🚚 Delivery calculations:", deliveryCalculations);

    const platformFee = roundToTwoDecimals(
      (priceCalculations.totalFinalPrice * 3.1) / 100,
    );

    const packagingFee = roundToTwoDecimals(
      (priceCalculations.totalFinalPrice * 3.2) / 100,
    );

    // ============================================================
    // TOTALS AND COUPON
    // ============================================================
    const subtotal = priceCalculations.subtotal;
    const totalBeforeCoupon = roundToTwoDecimals(
      subtotal +
        deliveryCalculations.deliveryCharge +
        platformFee +
        packagingFee,
    );

    console.log("💰 Subtotal:", subtotal);
    console.log("💰 Total before coupon:", totalBeforeCoupon);

    const shouldSkipRevalidation = isLocationUpdate === "true";
    const couponResult = await applyCoupon(
      couponCode,
      String(userId),
      totalBeforeCoupon,
      shouldSkipRevalidation,
      cartItem.discountApplied,
      cartItem.couponCode,
    );

    console.log("🏷️ Coupon result:", couponResult);

    const grandTotal = roundToTwoDecimals(
      Math.max(totalBeforeCoupon - couponResult.discountAmount, 0),
    );

    // ============================================================
    // BUILD FINAL CALCULATED OBJECT
    // ============================================================
    const calculated: CalculatedData = {
      // Product basic info
      mrp: roundToTwoDecimals(mrp),
      price: roundToTwoDecimals(activeVariant.price || mrp),
      finalPrice: roundToTwoDecimals(finalPrice),

      // Discount info
      savedAmount: priceCalculations.savedAmount,
      discountPercent: priceCalculations.discountPercent,

      // Quantity based totals
      quantity: finalQuantity,
      totalMrp: priceCalculations.totalMrp,
      totalFinalPrice: priceCalculations.totalFinalPrice,
      totalSavedAmount: priceCalculations.totalSavedAmount,

      // GST info (with type)
      gstRate,
      gstType: gstType.toUpperCase(), // Add this to CalculatedData type
      gstAmount: priceCalculations.totalGstAmount,
      perProductGst: priceCalculations.perProductGst,

      // Fees
      platformFee,
      packagingFee,

      // Delivery info
      deliveryCharge: deliveryCalculations.deliveryCharge,
      distanceKm: deliveryCalculations.distanceKm,
      volumetricWeight: deliveryCalculations.volumetricWeight,
      actualWeight: deliveryCalculations.actualWeight,
      chargeableWeight: deliveryCalculations.chargeableWeight,
      deliveryRatePerKm: DELIVERY_RATE_PER_KM,
      deliveryRatePerKg: DELIVERY_RATE_PER_KG,

      // Totals
      subtotal: priceCalculations.subtotal,
      totalBeforeCoupon,
      discountAppliedAmount: roundToTwoDecimals(couponResult.discountAmount),
      grandTotal,

      // Coupon info
      couponUsed: couponResult.usedCoupon,
      couponData: couponResult.couponData,

      // Locations
      buyerLocation: {
        latitude: buyerLatNum,
        longitude: buyerLngNum,
        address: buyerAddress ? String(buyerAddress) : null,
        googlePlaceId: buyerGooglePlaceId ? String(buyerGooglePlaceId) : null,
      },
      sellerLocation: {
        latitude: sellerLat,
        longitude: sellerLng,
        address: product.sellerLocation.address || null,
        googlePlaceId: product.sellerLocation.googlePlaceId || null,
      },
    };

    // Save to cart
    await updateCartCalculations({
      cartItem,
      calculated,
      quantity: finalQuantity,
      couponCode: couponResult.usedCoupon || undefined,
      discountAmount: couponResult.discountAmount,
    });

    // Return response
    console.log("✅ Checkout successful, returning response");
    res.json({
      success: true,
      calculated,
      couponMessage: couponResult.message,
    });
  } catch (err: any) {
    console.error("\n❌ CHECKOUT ERROR:", err.message);
    console.error("📚 Error Stack:", err.stack);
    console.error("🔍 Full Error Object:", JSON.stringify(err, null, 2));

    res.status(500).json({
      success: false,
      error: "Checkout failed",
      message: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
};
