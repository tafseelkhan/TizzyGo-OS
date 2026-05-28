import { ZeptPay } from "@flixora/zeptpay-payment-core";
import mongoose from "mongoose";
import Order from "../../models/tizzygo/order/order";
import CheckoutSession from "../../models/tizzygo/checkout/CheckoutSession";
import Cart from "../../models/tizzygo/cart/Cart";
import User from "../../models/tizzygo/auths/User";
import {
  generateCheckoutSessionId,
  generateOrderId,
  generateToken,
  createCartSnapshot,
  getProductId,
  getFinalAmount,
} from "../../utils/tizzygo/paymentHelpers";

const zeptpay = new ZeptPay({
  clientKey: process.env.ZEPTPAY_CLIENT_KEY!,
  secretKey: process.env.ZEPTPAY_SECRET_KEY!,
});

interface CreatePaymentIntentParams {
  userId: string;
  address: any;
  paymentMethod: string;
  session: mongoose.ClientSession;
}

export const createPaymentIntent = async ({
  userId,
  address,
  paymentMethod,
  session,
}: CreatePaymentIntentParams) => {
  // Get cart items
  const cartItems = await Cart.find({ userId }).lean();

  if (!cartItems || cartItems.length === 0) {
    throw new Error("Cart is empty");
  }

  const cartItem = cartItems[0];
  const productData = cartItem?.productData || {};
  const calculatedData = cartItem?.calculated || {};

  // Validate product ID
  const customProductId = getProductId(cartItem, productData);
  if (!customProductId) {
    throw new Error("Product ID missing");
  }

  // Check COD availability
  const isCodAvailable = productData?.cashOnDelivery === true;
  if (paymentMethod === "cod" && !isCodAvailable) {
    throw new Error("Cash on Delivery not available");
  }

  // Get final amount
  const finalAmount = getFinalAmount(calculatedData);
  if (!finalAmount || finalAmount <= 0) {
    throw new Error("Invalid final amount");
  }

  // Get user details
  const userDetails = await User.findById(userId).lean();

  // Create cart snapshot
  const cartSnapshot = createCartSnapshot(
    cartItem,
    calculatedData,
    finalAmount,
  );

  // Generate IDs
  const orderId = generateOrderId();
  const checkoutSessionId = generateCheckoutSessionId();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  // Create order
  const order = new Order({
    orderId,
    buyerId: userId,
    buyerName: (userDetails as any)?.name || "Customer",
    sellerId: productData?.sellerId || productData?.seller?._id || null,
    items: cartSnapshot.items.map((item: any) => ({
      productId: item.productId,
      quantity: item.quantity,
      selectedVariant: item.selectedVariant,
      sellerId:
        item?.productData?.sellerId || item?.productData?.seller?._id || null,
      productData: {
        ...item.productData,
        buyerId: userId,
        buyerName: (userDetails as any)?.name || "Customer",
      },
    })),
    productId: customProductId,
    productPrice:
      Number(productData?.price) ||
      Number(productData?.finalPrice) ||
      finalAmount,
    finalAmount,
    deliveryCharge: cartSnapshot.calculatedData.deliveryCharge,
    platformFee: cartSnapshot.calculatedData.platformFee,
    productGst: cartSnapshot.calculatedData.productGst,
    productGstRate: cartSnapshot.calculatedData.productGstRate,
    paymentMethod: paymentMethod === "cod" ? "cod" : paymentMethod,
    paymentGateway: paymentMethod === "cod" ? null : "zeptpay",
    status: paymentMethod === "cod" ? "confirmed" : "processing",
    paymentStatus: paymentMethod === "cod" ? "pending_cod" : "pending",
    buyerAddress: address,
    sellerAddress: productData?.sellerLocation || {
      address: "Unknown",
      latitude: 0,
      longitude: 0,
    },
    couponUsed: cartSnapshot.calculatedData.couponUsed,
    couponData: cartSnapshot.calculatedData.couponData,
    coFundApplied: cartSnapshot.calculatedData.coFundApplied,
    fundSplit: cartSnapshot.calculatedData.fundSplit,
    paymentAttempts: [],
    checkoutSessionId,
    fulfillmentType: productData?.fulfillmentType || "SELLER",
    token: generateToken(),
  });

  await order.save({ session });

  // Create checkout session
  const checkoutSession = new CheckoutSession({
    checkoutSessionId,
    orderId: order._id,
    userId,
    cartSnapshot,
    address: {
      address: address?.address || address?.fullAddress || String(address),
      latitude: Number(address?.latitude || 0),
      longitude: Number(address?.longitude || 0),
      googlePlaceId: address?.googlePlaceId || "",
    },
    paymentMethod,
    status: paymentMethod === "cod" ? "completed" : "pending",
    paymentGateway: paymentMethod === "cod" ? null : "zeptpay",
    paymentIntentId: null,
    qrCodeId: null,
    expiresAt,
  });

  await checkoutSession.save({ session });

  // Clear cart for COD
  if (paymentMethod === "cod") {
    await Cart.deleteMany({ userId }, { session });
  }

  return {
    order,
    checkoutSession,
    checkoutSessionId,
    orderId: order.orderId,
    finalAmount,
    expiresAt,
    productData,
    userDetails,
  };
};
