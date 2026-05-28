import { Response } from "express";
import { AuthRequest } from "../../../middleware/tizzygo/authMiddleware";
import { Product } from "../../../models/tizzyos/seller/AddProducts/Products";
import {
  findOrCreateCartItem,
  updateCartCalculations,
} from "../../../services/tizzygo/cartService";
import { calculateDelivery } from "../../../services/tizzygo/deliveryService";
import { applyCoupon } from "../../../services/tizzygo/couponService";
import { calculatePrices } from "../../../utils/tizzygo/calculations";
import { getGstRate } from "../../../config/tizzygo/gstRates";
import { CalculatedData } from "../../../types/tizzygo/buyer";
import { DELIVERY_RATE_PER_KM_PER_KG } from "../../../utils/tizzygo/calculations";

export const checkout = async (req: AuthRequest, res: Response) => {
  console.log("\n" + "=".repeat(60));
  console.log("🚀 CHECKOUT ROUTE HIT!");
  console.log("=".repeat(60));

  try {
    const userId = req.user?.userId || req.user?._id;
    const {
      productId,
      vendorCodeUID,
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

    // Validations
    if (!userId)
      return res.status(401).json({ success: false, error: "Unauthorized" });
    if (!productId)
      return res
        .status(400)
        .json({ success: false, error: "Product ID required" });
    if (!vendorCodeUID)
      return res
        .status(400)
        .json({ success: false, error: "Vendor code UID required" });
    if (!sellerId)
      return res
        .status(400)
        .json({ success: false, error: "Seller ID required" });
    if (!productDataId)
      return res
        .status(400)
        .json({ success: false, error: "Product data ID required" });

    // Step 1: Get or create cart item
    const quantity = Number(qty) || 1;
    const cartItem = await findOrCreateCartItem(
      userId,
      productId,
      vendorCodeUID,
      sellerId,
      productDataId,
      quantity,
    );

    // Step 2: Fetch product from database
    const product = await Product.findOne({
      productId: productDataId,
      sellerId,
      vendorCodeUID,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found in database",
      });
    }

    const activeVariant =
      cartItem.selectedVariant || product.variants?.[0] || product;
    const finalQuantity = Math.max(quantity || cartItem.quantity || 1, 1);

    // Step 3: Check seller location
    if (
      !product.sellerLocation ||
      !product.sellerLocation.latitude ||
      !product.sellerLocation.longitude
    ) {
      return res.status(400).json({
        success: false,
        error: "Seller location not found",
      });
    }

    // Step 4: Pricing calculation
    let mrp = Number(activeVariant.mrp || activeVariant.price || 0);
    let finalPrice = Number(
      activeVariant.finalPrice || activeVariant.price || 0,
    );
    if (finalPrice > mrp) finalPrice = mrp;

    const category = product.category || "";
    const subcategory = product.subcategory || "";
    const gstRate = getGstRate(category, subcategory);

    const priceCalculations = calculatePrices(
      mrp,
      finalPrice,
      finalQuantity,
      gstRate,
    );

    // Step 5: Delivery calculation
    const sellerLat = Number(product.sellerLocation.latitude);
    const sellerLng = Number(product.sellerLocation.longitude);
    const buyerLatNum = buyerLat ? Number(buyerLat) : null;
    const buyerLngNum = buyerLng ? Number(buyerLng) : null;

    const deliveryCalculations = await calculateDelivery(
      sellerLat,
      sellerLng,
      buyerLatNum,
      buyerLngNum,
      activeVariant,
    );

    // Step 6: Calculate totals
    const subtotal = priceCalculations.subtotal;
    const totalBeforeCoupon = subtotal + deliveryCalculations.deliveryCharge;

    // Step 7: Apply coupon
    const shouldSkipRevalidation = isLocationUpdate === "true";
    const couponResult = await applyCoupon(
      couponCode,
      String(userId),
      totalBeforeCoupon,
      shouldSkipRevalidation,
      cartItem.discountApplied,
      cartItem.couponCode,
    );

    const grandTotal = Math.max(
      totalBeforeCoupon - couponResult.discountAmount,
      0,
    );

    // Step 8: Build final calculated object
    const calculated: CalculatedData = {
      mrp,
      price: activeVariant.price || mrp,
      finalPrice,
      savedAmount: priceCalculations.savedAmount,
      discountPercent: priceCalculations.discountPercent,
      quantity: finalQuantity,
      totalMrp: priceCalculations.totalMrp,
      totalFinalPrice: priceCalculations.totalFinalPrice,
      totalSavedAmount: priceCalculations.totalSavedAmount,
      gstRate,
      gstAmount: priceCalculations.totalGstAmount,
      perProductGst: priceCalculations.perProductGst,
      deliveryCharge: deliveryCalculations.deliveryCharge,
      distanceKm: deliveryCalculations.distanceKm,
      volumetricWeight: deliveryCalculations.volumetricWeight,
      actualWeight: deliveryCalculations.actualWeight,
      chargeableWeight: deliveryCalculations.chargeableWeight,
      deliveryRatePerKmPerKg: DELIVERY_RATE_PER_KM_PER_KG,
      deliveryCalculationBreakdown: deliveryCalculations.deliveryBreakdown,
      subtotal: priceCalculations.subtotal,
      totalBeforeCoupon: Math.round(totalBeforeCoupon * 100) / 100,
      discountAppliedAmount:
        Math.round(couponResult.discountAmount * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
      couponUsed: couponResult.usedCoupon,
      couponData: couponResult.couponData,
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

    // Step 9: Save to cart
    await updateCartCalculations(
      cartItem,
      calculated,
      finalQuantity,
      couponResult.usedCoupon || undefined,
      couponResult.discountAmount,
    );

    // Step 10: Return response
    res.json({
      success: true,
      calculated,
      couponMessage: couponResult.message,
    });
  } catch (err: any) {
    console.error("\n❌ CHECKOUT ERROR:", err.message);
    res.status(500).json({
      success: false,
      error: "Checkout failed",
      message: err.message,
    });
  }
};
