import mongoose from "mongoose";
import Order from "../../models/tizzygo/order/order";
import CheckoutSession from "../../models/tizzygo/checkout/CheckoutSession";
import Cart from "../../models/tizzygo/cart/Cart";
import {
  generateOrderId,
  extractBuyerAddress,
  extractSellerAddress,
  formatAddress,
  generateTempGooglePlaceId,
  serializeCouponData,
} from "../../utils/tizzygo/orderHelpers";

interface CreateOrderParams {
  checkoutSession: any;
  user: any;
  session: mongoose.ClientSession;
}

export const createCODOrder = async ({
  checkoutSession,
  user,
  session,
}: CreateOrderParams) => {
  const cartSnapshot = checkoutSession.cartSnapshot;
  const firstItem = cartSnapshot.items[0];
  const calculatedData = cartSnapshot.calculatedData;

  // Extract addresses
  const buyerAddressRaw = extractBuyerAddress(checkoutSession, cartSnapshot);
  const sellerAddressRaw = extractSellerAddress(cartSnapshot, firstItem);

  // Format addresses
  let buyerAddress = formatAddress(buyerAddressRaw);
  let sellerAddress = formatAddress(sellerAddressRaw);

  // Generate temp Google Place IDs if missing
  if (
    buyerAddress.address !== "Address not specified" &&
    !buyerAddress.googlePlaceId
  ) {
    buyerAddress.googlePlaceId = generateTempGooglePlaceId(
      buyerAddress.address,
    );
  }

  if (
    sellerAddress.address !== "Default Seller Address" &&
    !sellerAddress.googlePlaceId
  ) {
    sellerAddress.googlePlaceId = generateTempGooglePlaceId(
      sellerAddress.address,
    );
  }

  // Extract seller ID
  const sellerId =
    firstItem.productData.sellerId ||
    firstItem.productData.seller?._id ||
    firstItem.sellerId ||
    cartSnapshot.sellerId;

  // Serialize coupon data
  const couponDataValue = serializeCouponData(calculatedData.couponData);

  // Prepare order data
  const orderId = generateOrderId();

  const orderData: any = {
    orderId,
    productId: firstItem.productId,
    buyerId: user.userId,
    sellerId: sellerId,
    buyerName: user.name || user.email?.split("@")[0] || "Customer",

    items: cartSnapshot.items.map((item: any) => {
      const itemSellerId =
        item.productData.sellerId ||
        item.productData.seller?._id ||
        item.sellerId ||
        sellerId;

      return {
        quantity: item.quantity,
        selectedVariant: item.selectedVariant,
        productData: {
          ...item.productData,
          buyerId: user.userId,
          buyerName: user.name || user.email?.split("@")[0] || "Customer",
          sellerLocation: sellerAddressRaw,
          buyerLocation: buyerAddressRaw,
        },
        sellerId: itemSellerId,
      };
    }),

    productPrice:
      firstItem.productData.price || firstItem.productData.finalPrice || 0,
    productMrp:
      firstItem.productData.mrp ||
      firstItem.productData.originalPrice ||
      firstItem.productData.price ||
      0,
    productSavedAmount: firstItem.productData.savedAmount || 0,
    productDiscount: firstItem.productData.discount || 0,
    productOfferText:
      firstItem.productData.offerText || firstItem.productData.offer || "",
    productFinalPrice:
      calculatedData.finalAmount ||
      firstItem.productData.finalPrice ||
      firstItem.productData.price ||
      0,

    productGst: calculatedData.productGst || 0,
    productGstRate: calculatedData.productGstRate || 0,
    deliveryCharge: calculatedData.deliveryCharge || 0,
    distanceKm: calculatedData.distanceKm || 0,
    totalBeforeCoupon:
      calculatedData.totalBeforeCoupon || calculatedData.finalAmount || 0,
    discountApplied: calculatedData.discountApplied || 0,
    platformFee: calculatedData.platformFee || 0,
    finalAmount: calculatedData.finalAmount || 0,

    status: "cod_confirmed",
    paymentMethod: "cod",
    token: Math.random().toString(36).substr(2, 12),

    buyerAddress: buyerAddress,
    sellerAddress: sellerAddress,
    buyerLocation: buyerAddressRaw,
    sellerLocation: sellerAddressRaw,

    couponUsed: calculatedData.couponUsed,
    couponData: couponDataValue || undefined,
    coFundApplied: calculatedData.coFundApplied || false,
    fundSplit: calculatedData.fundSplit || { bank: 0, merchant: 0 },
  };

  // Create and save order
  const order = new Order(orderData);
  await order.save({ session });

  // Mark checkout session as completed
  checkoutSession.status = "completed";
  await checkoutSession.save({ session });

  // Clear user's cart
  await Cart.deleteMany({ userId: user.userId }).session(session);

  return { order, checkoutSession };
};

export const validateCheckoutSession = async (
  checkoutSessionId: string,
  userId: string,
): Promise<any> => {
  const checkoutSession = await CheckoutSession.findOne({
    checkoutSessionId,
    userId: userId,
    status: "pending",
    expiresAt: { $gt: new Date() },
  });

  if (!checkoutSession) {
    throw new Error(
      "Checkout session not found, expired, or already completed",
    );
  }

  if (checkoutSession.paymentMethod !== "cod") {
    throw new Error("Invalid payment method for COD confirmation");
  }

  return checkoutSession;
};
