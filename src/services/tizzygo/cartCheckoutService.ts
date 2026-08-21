import mongoose from "mongoose";
import Cart from "../../models/tizzygo/cart/Cart";
import BuyerLocation from "../../models/tizzygo/locations/locations";
import { Product } from "../../models/tizzyos/seller/AddProducts/Products";
import User from "../../models/tizzygo/auths/User";
import { calculateDelivery } from "./deliveryService";
import { applyCoupon } from "./couponService";
import {
  calculatePrices,
  DELIVERY_RATE_PER_KM,
  DELIVERY_RATE_PER_KG,
} from "../../utils/tizzygo/calculations";
import {
  roundToTwoDecimals,
  calculateCartSummary,
  buildCartProductCalculation,
} from "../../utils/tizzygo/cartCheckoutUtils";
import {
  CartCheckoutResponse,
  CartCheckoutParams,
} from "../../types/tizzygo/cartCheckout";

export const getCartCheckout = async (
  params: CartCheckoutParams,
): Promise<CartCheckoutResponse> => {
  const { userId, address, couponCode } = params;

  console.log("🛒 [CartCheckoutService] getCartCheckout STARTED");
  console.log("👤 User ID:", userId);
  console.log("📍 Address provided:", !!address);

  if (address) {
    console.log("💾 Saving buyer location...");
    await saveBuyerLocation({
      userId,
      address,
      isDefault: true,
      label: address.label || "Home",
    });
    console.log("✅ Location saved");
  }

  let buyerLocation = null;

  if (address) {
    buyerLocation = {
      address: address.address,
      latitude: address.latitude,
      longitude: address.longitude,
      googlePlaceId: address.googlePlaceId || "",
      city: address.city || "",
      state: address.state || "",
      country: address.country || "India",
      pinCode: address.pinCode || "",
      landmark: address.landmark || "",
    };
  } else {
    const existingLocation = await BuyerLocation.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      isDefault: true,
    });

    if (existingLocation) {
      buyerLocation = {
        address: existingLocation.location.address,
        latitude: existingLocation.location.coordinates[1],
        longitude: existingLocation.location.coordinates[0],
        googlePlaceId: (existingLocation.location as any).googlePlaceId || "",
        city: existingLocation.location.city || "",
        state: existingLocation.location.state || "",
        country: existingLocation.location.country || "India",
        pinCode: existingLocation.location.pinCode || "",
        landmark: existingLocation.location.landmark || "",
      };
      console.log("✅ Using existing location:", buyerLocation.address);
    }
  }

  if (!buyerLocation) {
    console.log("❌ No location found");
    return { hasLocation: false };
  }

  return await calculateCartCheckout(userId, buyerLocation, couponCode);
};

async function saveBuyerLocation({
  userId,
  address,
  isDefault = true,
  label = "Home",
}: {
  userId: string;
  address: any;
  isDefault?: boolean;
  label?: string;
}) {
  const locationData = {
    type: "Point" as const,
    coordinates: [address.longitude, address.latitude] as [number, number],
    address: address.address,
    city: address.city || "",
    state: address.state || "",
    country: address.country || "India",
    pinCode: address.pinCode || "",
    landmark: address.landmark || "",
  };

  const existingLocation = await BuyerLocation.findOne({
    userId: new mongoose.Types.ObjectId(userId),
  });

  if (existingLocation) {
    existingLocation.label = label || existingLocation.label || "Home";
    existingLocation.location = locationData;
    existingLocation.isDefault = isDefault;
    await existingLocation.save();
    return existingLocation;
  }

  const newLocation = new BuyerLocation({
    userId: new mongoose.Types.ObjectId(userId),
    label: label || "Home",
    location: locationData,
    isDefault: isDefault,
    gpsTrackingEnabled: false,
  });

  await newLocation.save();
  return newLocation;
}

export const getBuyerLocation = async (userId: string) => {
  const location = await BuyerLocation.findOne({
    userId: new mongoose.Types.ObjectId(userId),
    isDefault: true,
  });
  return location;
};

/**
 * ✅ Calculate cart checkout and SAVE to cart
 * This ensures cart items have calculated.grandTotal for payment
 */
async function calculateCartCheckout(
  userId: string,
  address: any,
  couponCode?: string,
): Promise<CartCheckoutResponse> {
  console.log("🧮 [CartCheckoutService] Calculating cart checkout...");

  const cartItems = await Cart.find({
    userId: new mongoose.Types.ObjectId(userId),
  });

  if (!cartItems || cartItems.length === 0) {
    console.log("❌ Cart is empty");
    return {
      hasLocation: true,
      products: [],
      summary: {
        subtotal: 0,
        platformFee: 0,
        packagingFee: 0,
        deliveryCharge: 0,
        discount: 0,
        grandTotal: 0,
      },
    };
  }

  console.log(`📦 Found ${cartItems.length} items in cart`);

  const user = await User.findById(userId);
  const zeptPayAccountId =
    (user as any)?.zeptPayAccountId ||
    (user as any)?.vendorCode ||
    "DEFAULT_VENDOR";

  console.log("👤 User loaded, zeptPayAccountId:", zeptPayAccountId);

  const products: any[] = [];
  let subtotalTotal = 0;
  let platformFeeTotal = 0;
  let packagingFeeTotal = 0;
  let deliveryChargeTotal = 0;

  // ✅ Store updated cart items for saving
  const updatedCartItems: any[] = [];

  for (const cartItem of cartItems) {
    console.log(`📝 Processing cart item: ${cartItem.productId}`);

    const product = await Product.findOne({
      productId: cartItem.productData?.productDataId,
      sellerId: cartItem.productData?.sellerId,
    });

    if (!product) {
      console.log(`❌ Product not found for: ${cartItem.productId}`);
      continue;
    }

    const activeVariant =
      cartItem.selectedVariant || product.variants?.[0] || product;
    const quantity = cartItem.quantity || 1;

    let mrp = Number(activeVariant.mrp || activeVariant.price || 0);
    let finalPrice = Number(
      activeVariant.finalPrice || activeVariant.price || 0,
    );
    if (finalPrice > mrp) finalPrice = mrp;

    const gstRate = Number(activeVariant.gstRate || 18);
    const gstType = activeVariant.gstType || "INCLUSIVE";

    const priceCalculations = calculatePrices(
      mrp,
      finalPrice,
      quantity,
      gstRate,
      gstType,
    );

    const sellerLat = Number(product.sellerLocation?.latitude);
    const sellerLng = Number(product.sellerLocation?.longitude);
    const buyerLat = Number(address.latitude);
    const buyerLng = Number(address.longitude);

    const deliveryCalculations = await calculateDelivery(
      sellerLat,
      sellerLng,
      buyerLat,
      buyerLng,
      activeVariant,
    );

    const platformFee = roundToTwoDecimals(
      (priceCalculations.totalFinalPrice * 3.1) / 100,
    );
    const packagingFee = roundToTwoDecimals(
      (priceCalculations.totalFinalPrice * 3.2) / 100,
    );

    const subtotal = priceCalculations.subtotal;
    const totalBeforeCoupon = roundToTwoDecimals(
      subtotal +
        deliveryCalculations.deliveryCharge +
        platformFee +
        packagingFee,
    );

    subtotalTotal += subtotal;
    platformFeeTotal += platformFee;
    packagingFeeTotal += packagingFee;
    deliveryChargeTotal += deliveryCalculations.deliveryCharge;

    const productCalculation = buildCartProductCalculation(
      product,
      cartItem,
      deliveryCalculations,
      {
        mrp,
        price: activeVariant.price || mrp,
        finalPrice,
        savedAmount: priceCalculations.savedAmount,
        discountPercent: priceCalculations.discountPercent,
        totalMrp: priceCalculations.totalMrp,
        totalFinalPrice: priceCalculations.totalFinalPrice,
        totalSavedAmount: priceCalculations.totalSavedAmount,
        gstRate,
        gstType: gstType.toUpperCase(),
        gstAmount: priceCalculations.totalGstAmount,
        perProductGst: priceCalculations.perProductGst,
        subtotal,
      },
      {
        discountAmount: 0,
        usedCoupon: null,
        couponData: null,
        message: "",
      },
      platformFee,
      packagingFee,
      totalBeforeCoupon,
      totalBeforeCoupon,
      {
        address: address.address,
        latitude: address.latitude,
        longitude: address.longitude,
        googlePlaceId: address.googlePlaceId || null,
      },
      {
        address: product.sellerLocation?.address || null,
        latitude: product.sellerLocation?.latitude || null,
        longitude: product.sellerLocation?.longitude || null,
        googlePlaceId: product.sellerLocation?.googlePlaceId || null,
      },
    );

    // ✅ ✅ ✅ YAHAN PE ADD KARO (just before products.push)
    productCalculation.variantId =
      cartItem.selectedVariant?._id ||
      cartItem.selectedVariant?.variantId ||
      null;
    // ✅ VARIANT IMAGE (variant ke andar jo images array hai)
    // normalize variant images to an array or single image (fallback to empty array)
    (productCalculation as any).variantImages = Array.isArray(
      cartItem.selectedVariant?.images,
    )
      ? cartItem.selectedVariant.images
      : cartItem.selectedVariant?.image || [];

    // ✅ VARIANT DETAILS (saari variant info)
    if (cartItem.selectedVariant) {
      (productCalculation as any).variantDetails = {
        inStock: cartItem.selectedVariant.inStock ?? true,
        quantityAvailable: cartItem.selectedVariant.quantityAvailable || 0,
        sku: cartItem.selectedVariant.sku || null,
        images: cartItem.selectedVariant.images || [],
      };
    }

    // ✅ PRODUCT DETAILS (title, shortDescription, etc.)
    (productCalculation as any).productTitle =
      product.title || null;
    (productCalculation as any).productShortDescription =
      product.shortDescription || null;
    (productCalculation as any).productCategory = product.category || null;
    (productCalculation as any).productBrand = product.brand || null;

    products.push(productCalculation);

    // ✅ ✅ ✅ SAVE CALCULATED DATA TO CART ITEM
    // This is the CRITICAL FIX - ensures cart has grandTotal for payment
    const calculatedDataForCart = {
      mrp: productCalculation.calculated.mrp || mrp,
      price: productCalculation.calculated.price || finalPrice,
      finalPrice: productCalculation.calculated.finalPrice || finalPrice,
      savedAmount: productCalculation.calculated.savedAmount || 0,
      discountPercent: productCalculation.calculated.discountPercent || 0,
      totalMrp: productCalculation.calculated.totalMrp || 0,
      totalFinalPrice: productCalculation.calculated.totalFinalPrice || 0,
      totalSavedAmount: productCalculation.calculated.totalSavedAmount || 0,
      gstRate: productCalculation.calculated.gstRate || 0,
      gstType: productCalculation.calculated.gstType || "INCLUSIVE",
      gstAmount: productCalculation.calculated.gstAmount || 0,
      perProductGst: productCalculation.calculated.perProductGst || 0,
      subtotal: productCalculation.calculated.subtotal || 0,
      platformFee: productCalculation.calculated.platformFee || 0,
      packagingFee: productCalculation.calculated.packagingFee || 0,
      deliveryCharge: productCalculation.calculated.deliveryCharge || 0,
      distanceKm: productCalculation.calculated.distanceKm || 0,
      volumetricWeight: productCalculation.calculated.volumetricWeight || 0,
      actualWeight: productCalculation.calculated.actualWeight || 0,
      chargeableWeight: productCalculation.calculated.chargeableWeight || 0,
      totalBeforeCoupon: productCalculation.calculated.totalBeforeCoupon || 0,
      // ✅ CRITICAL: Store grandTotal for payment
      grandTotal: productCalculation.calculated.grandTotal || 0,
      finalAmount: productCalculation.calculated.grandTotal || 0,
      couponUsed: productCalculation.calculated.couponUsed || null,
      couponData: productCalculation.calculated.couponData || null,
      discountAppliedAmount:
        productCalculation.calculated.discountAppliedAmount || 0,
      sellerLocation: productCalculation.calculated.sellerLocation || {},
    };

    console.log(
      `💰 Saving to cart item ${cartItem._id}: grandTotal = ${calculatedDataForCart.grandTotal}`,
    );

    // ✅ Update cart item with calculated data
    cartItem.calculated = calculatedDataForCart;
    updatedCartItems.push(cartItem);
  }

  const totalBeforeCoupon = roundToTwoDecimals(
    subtotalTotal + deliveryChargeTotal + platformFeeTotal + packagingFeeTotal,
  );

  console.log("💰 Total before coupon:", totalBeforeCoupon);

  let couponResult: {
    discountAmount: number;
    usedCoupon: string | null;
    couponData: any;
    message: string | null;
  } = {
    discountAmount: 0,
    usedCoupon: null,
    couponData: null,
    message: null,
  };

  if (couponCode) {
    console.log("🏷️ Applying coupon:", couponCode);
    couponResult = await applyCoupon(
      couponCode,
      String(userId),
      totalBeforeCoupon,
      false,
      0,
      undefined,
    );
    console.log("🏷️ Coupon result:", couponResult);
  }

  const grandTotal = roundToTwoDecimals(
    Math.max(totalBeforeCoupon - couponResult.discountAmount, 0),
  );

  let remainingDiscount = couponResult.discountAmount;

  if (couponResult.discountAmount > 0 && products.length > 0) {
    const totalBeforeCouponAll = products.reduce(
      (sum, p) => sum + p.calculated.totalBeforeCoupon,
      0,
    );

    for (const product of products) {
      const productRatio =
        product.calculated.totalBeforeCoupon / totalBeforeCouponAll;
      const productDiscount = roundToTwoDecimals(
        couponResult.discountAmount * productRatio,
      );

      product.calculated.discountAppliedAmount = productDiscount;
      product.calculated.grandTotal = roundToTwoDecimals(
        Math.max(product.calculated.totalBeforeCoupon - productDiscount, 0),
      );
      product.calculated.couponUsed = couponResult.usedCoupon;
      product.calculated.couponData = couponResult.couponData;

      remainingDiscount -= productDiscount;
    }

    if (remainingDiscount > 0.01 && products.length > 0) {
      products[0].calculated.discountAppliedAmount +=
        roundToTwoDecimals(remainingDiscount);
      products[0].calculated.grandTotal = roundToTwoDecimals(
        Math.max(
          products[0].calculated.totalBeforeCoupon -
            products[0].calculated.discountAppliedAmount,
          0,
        ),
      );
    }

    // ✅ ✅ ✅ Update cart items with coupon discount
    for (let i = 0; i < products.length && i < updatedCartItems.length; i++) {
      const product = products[i];
      const cartItem = updatedCartItems[i];
      if (cartItem) {
        cartItem.calculated.discountAppliedAmount =
          product.calculated.discountAppliedAmount || 0;
        cartItem.calculated.grandTotal = product.calculated.grandTotal || 0;
        cartItem.calculated.finalAmount = product.calculated.grandTotal || 0;
        cartItem.calculated.couponUsed = product.calculated.couponUsed || null;
        cartItem.calculated.couponData = product.calculated.couponData || null;
        console.log(
          `💰 Updated cart item ${cartItem._id} with coupon: grandTotal = ${cartItem.calculated.grandTotal}`,
        );
      }
    }
  }

  // ✅ ✅ ✅ SAVE ALL UPDATED CART ITEMS TO DATABASE
  console.log(
    `💾 Saving ${updatedCartItems.length} cart items with calculated data...`,
  );

  for (const cartItem of updatedCartItems) {
    await Cart.findByIdAndUpdate(cartItem._id, {
      $set: {
        calculated: cartItem.calculated,
      },
    });
    console.log(
      `✅ Cart item ${cartItem._id} saved with grandTotal: ${cartItem.calculated?.grandTotal}`,
    );
  }

  // ✅ Verify data was saved
  const verifyCartItems = await Cart.find({
    userId: new mongoose.Types.ObjectId(userId),
  }).lean();

  console.log("✅ Verification: Cart items after save:");
  for (const item of verifyCartItems) {
    console.log(
      `  - ${item.productId}: grandTotal = ${item.calculated?.grandTotal || 0}`,
    );
  }

  const summary = {
    subtotal: roundToTwoDecimals(subtotalTotal),
    platformFee: roundToTwoDecimals(platformFeeTotal),
    packagingFee: roundToTwoDecimals(packagingFeeTotal),
    deliveryCharge: roundToTwoDecimals(deliveryChargeTotal),
    discount: roundToTwoDecimals(couponResult.discountAmount),
    grandTotal: grandTotal,
  };

  console.log("📊 Cart Summary:", summary);
  console.log("✅ Cart checkout calculation complete and saved to cart!");

  return {
    hasLocation: true,
    products,
    summary,
  };
}
