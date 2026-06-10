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
  console.log("========================================");
  console.log("💰 [PaymentService] createPaymentIntent STARTED");
  console.log("========================================");
  console.log("👤 User ID:", userId);
  console.log("💳 Payment Method:", paymentMethod);
  console.log("📍 Address:", address?.address || address);

  try {
    console.log("🛒 Fetching cart items for user:", userId);
    const cartItems = await Cart.find({ userId }).lean();

    if (!cartItems || cartItems.length === 0) {
      console.log("❌ Cart is empty");
      throw new Error("Cart is empty");
    }

    console.log(`✅ Found ${cartItems.length} cart item(s)`);

    const cartItem = cartItems[0];
    const productData = cartItem?.productData || {};

    // ✅ FIX: Check both 'calculated' and 'calculatedData' fields
    const calculatedData =
      cartItem?.calculated || cartItem?.calculatedData || {};

    console.log("📊 Cart Item:", {
      id: cartItem?._id,
      productId: cartItem?.productId,
      quantity: cartItem?.quantity,
      hasCalculated: !!cartItem?.calculated,
      hasCalculatedData: !!cartItem?.calculatedData,
      calculatedGrandTotal: calculatedData?.grandTotal,
    });

    const customProductId = getProductId(cartItem, productData);
    if (!customProductId) {
      console.log("❌ Product ID missing");
      throw new Error("Product ID missing");
    }
    console.log("✅ Product ID:", customProductId);

    const isCodAvailable = productData?.cashOnDelivery === true;
    if (paymentMethod === "cod" && !isCodAvailable) {
      console.log("❌ COD not available for this product");
      throw new Error("Cash on Delivery not available");
    }

    // ✅ FIX: Get final amount with multiple fallback sources
    let finalAmount = getFinalAmount(calculatedData);

    // Fallback 1: Try from selectedVariant
    if (!finalAmount || finalAmount <= 0) {
      console.log("⚠️ getFinalAmount returned:", finalAmount);
      const selectedVariant = cartItem.selectedVariant;
      const quantity = cartItem?.quantity || 1;

      if (selectedVariant?.finalPrice) {
        finalAmount = selectedVariant.finalPrice * quantity;
        console.log("💰 Amount from selectedVariant.finalPrice:", finalAmount);
      } else if (selectedVariant?.price) {
        finalAmount = selectedVariant.price * quantity;
        console.log("💰 Amount from selectedVariant.price:", finalAmount);
      } else if (productData?.finalPrice) {
        finalAmount = productData.finalPrice * quantity;
        console.log("💰 Amount from productData.finalPrice:", finalAmount);
      } else if (productData?.price) {
        finalAmount = productData.price * quantity;
        console.log("💰 Amount from productData.price:", finalAmount);
      } else {
        // Fallback: use selectedVariant.mrp
        const mrp = selectedVariant?.mrp || productData?.mrp || 0;
        finalAmount = mrp * quantity;
        console.log("💰 Amount from mrp fallback:", finalAmount);
      }
    }

    // ✅ Final validation
    if (!finalAmount || finalAmount <= 0) {
      console.error("❌ Invalid final amount:", finalAmount);
      console.error("Cart item selectedVariant:", cartItem.selectedVariant);
      console.error("Cart item productData:", productData);
      throw new Error(
        `Invalid final amount: ${finalAmount}. Please check cart calculations.`,
      );
    }

    finalAmount = Math.round(finalAmount * 100) / 100;
    console.log("✅ Final amount validated:", finalAmount);

    const userDetails = (await User.findById(userId).lean()) as any;
    if (!userDetails) {
      console.log("❌ User not found");
      throw new Error("User not found");
    }
    console.log("✅ User found:", userDetails?.name || userDetails?.email);

    const cartSnapshot = createCartSnapshot(
      cartItem,
      calculatedData,
      finalAmount,
    );
    console.log("📸 Cart snapshot created");

    const orderId = generateOrderId();
    const checkoutSessionId = generateCheckoutSessionId();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    console.log("📦 Order ID:", orderId);
    console.log("🔑 Checkout Session ID:", checkoutSessionId);

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
      deliveryCharge: cartSnapshot.calculatedData.deliveryCharge || 0,
      platformFee: cartSnapshot.calculatedData.platformFee || 0,
      productGst: cartSnapshot.calculatedData.productGst || 0,
      productGstRate: cartSnapshot.calculatedData.productGstRate || 0,
      paymentMethod: paymentMethod === "cod" ? "cod" : "online",
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
    console.log("✅ Order saved:", order._id);

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
    console.log("✅ Checkout session saved:", checkoutSession._id);

    if (paymentMethod === "cod") {
      await Cart.deleteMany({ userId }, { session });
      console.log("🗑️ Cart cleared for COD order");
    }

    console.log("✅ Payment intent created successfully");
    console.log("========================================");

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
  } catch (error: any) {
    console.error("❌ Payment Service Error:", error.message);
    console.error("Stack:", error.stack);
    throw error;
  }
};
