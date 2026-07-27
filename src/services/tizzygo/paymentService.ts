// services/tizzygo/paymentService.ts - FINAL FIXED VERSION

import mongoose from "mongoose";
import { PaymentGatewayFactory } from "../../factories/PaymentGatewayFactory";
import { IPaymentGateway } from "../../interfaces/seller/IPaymentGateway";
import { PaymentStatus } from "../../enums/PaymentGatewayType";
import Order from "../../models/tizzygo/checkout/order";
import CheckoutSession from "../../models/tizzygo/checkout/CheckoutSession";
import User from "../../models/tizzygo/auths/User";
import Cart from "../../models/tizzygo/cart/Cart";
import Transaction from "../../models/tizzygo/checkout/Transaction";
import {
  generateCheckoutSessionId,
  generateOrderId,
  generateToken,
  getProductId,
  getFinalAmount,
  generateQrCodeDataUrl,
} from "../../utils/tizzygo/paymentHelpers";
import Razorpay from "razorpay";

// ✅ Razorpay initialization
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "",
});

interface CreatePaymentIntentParams {
  userId: string;
  address: any;
  paymentMethod: string;
  session: mongoose.ClientSession;
  idempotencyKey?: string;
}

interface ProcessPaymentParams {
  checkoutSessionId: string;
  paymentType: string;
  userId: string;
  user: any;
  transactionId?: string;
  frequency?: string;
  startDate?: Date;
  endDate?: Date | null;
  session: mongoose.ClientSession;
}

export const createPaymentIntent = async ({
  userId,
  address,
  paymentMethod,
  session,
  idempotencyKey,
}: CreatePaymentIntentParams) => {
  console.log("========================================");
  console.log("💰 [PaymentService] createPaymentIntent STARTED");
  console.log("========================================");
  console.log("👤 User ID:", userId);
  console.log("💳 Payment Method:", paymentMethod);
  console.log("🔑 Idempotency Key:", idempotencyKey);

  try {
    // Check for duplicate order using idempotency key
    if (idempotencyKey) {
      const existingOrder = await Order.findOne({
        "metadata.idempotencyKey": idempotencyKey,
      }).session(session);

      if (existingOrder) {
        console.log("⚠️ Duplicate request detected! Returning existing order");
        const existingCheckoutSession = await CheckoutSession.findOne({
          orderId: existingOrder._id,
        }).session(session);

        return {
          order: existingOrder,
          checkoutSession: existingCheckoutSession,
          checkoutSessionId: existingCheckoutSession?.checkoutSessionId,
          orderId: existingOrder.orderId,
          finalAmount: existingOrder.finalAmount,
          expiresAt: existingCheckoutSession?.expiresAt,
          productData: {},
          userDetails: {},
          isDuplicate: true,
          paymentIntentId: existingOrder.paymentIntentId || null,
        };
      }
    }

    // Fetch cart items
    const cartItems = await Cart.find({ userId }).lean();
    if (!cartItems || cartItems.length === 0) {
      throw new Error("Cart is empty");
    }

    const cartItem = cartItems[0];
    const productData = cartItem?.productData || {};
    const calculatedData =
      cartItem?.calculated || cartItem?.calculatedData || {};

    // Get product ID
    const customProductId = getProductId(cartItem, productData);
    if (!customProductId) {
      throw new Error("Product ID missing");
    }

    // Check if order already exists
    const existingActiveOrder = await Order.findOne({
      buyerId: userId,
      "items.productData.productDataId": customProductId,
      status: { $in: ["processing", "captured", "cod_confirmed"] },
    }).session(session);

    if (existingActiveOrder) {
      console.log("⚠️ Active order already exists for this cart");
      throw new Error(
        "An active order already exists for this product. Please complete or cancel existing order.",
      );
    }

    // Check COD availability
    const isCodAvailable = productData?.cashOnDelivery === true;
    if (paymentMethod === "cod" && !isCodAvailable) {
      throw new Error("Cash on Delivery not available");
    }

    // Calculate final amount
    let finalAmount = getFinalAmount(calculatedData);
    if (!finalAmount || finalAmount <= 0) {
      const selectedVariant = cartItem.selectedVariant;
      const quantity = cartItem?.quantity || 1;

      if (selectedVariant?.finalPrice) {
        finalAmount = selectedVariant.finalPrice * quantity;
      } else if (selectedVariant?.price) {
        finalAmount = selectedVariant.price * quantity;
      } else if (productData?.finalPrice) {
        finalAmount = productData.finalPrice * quantity;
      } else if (productData?.price) {
        finalAmount = productData.price * quantity;
      } else {
        finalAmount =
          (selectedVariant?.mrp || productData?.mrp || 0) * quantity;
      }
    }

    if (!finalAmount || finalAmount <= 0) {
      throw new Error(`Invalid final amount: ${finalAmount}`);
    }

    finalAmount = Math.round(finalAmount * 100) / 100;

    // Get user details
    const userDetails = (await User.findById(userId).lean()) as any;
    if (!userDetails) {
      throw new Error("User not found");
    }

    // Get seller/vendor code
    const sellerId = productData?.sellerId || productData?.seller?._id;
    let zeptPayAccountId = null;
    let sellerDetails: any = null;

    if (sellerId) {
      sellerDetails = (await User.findById(sellerId).lean()) as any;
      if (sellerDetails) {
        zeptPayAccountId = sellerDetails?.zeptPayAccountId || null;
        console.log("🔍 Vendor code from seller:", zeptPayAccountId);
      }
    }

    // Generate IDs
    const orderId = generateOrderId();
    const checkoutSessionId = generateCheckoutSessionId();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    // Generate QR Code URL and token
    const { qrCodeUrl, token: shippingToken } = await generateQrCodeDataUrl(
      orderId,
      userId,
      sellerId,
    );

    // ✅ RAZORPAY ORDER CREATE (Only for online payments)
    let razorpayOrderId = null;
    if (paymentMethod !== "cod") {
      try {
        console.log("💰 Creating Razorpay Order...");
        const razorpayOrder = await razorpay.orders.create({
          amount: Math.round(finalAmount * 100), // paise mein
          currency: "INR",
          receipt: `receipt_${Date.now()}`,
          notes: {
            checkoutSessionId: checkoutSessionId,
            orderId: orderId,
            userId: userId,
            productId: customProductId,
          },
        });
        razorpayOrderId = razorpayOrder.id; // ✅ 'order_xxx'
        console.log("✅ Razorpay Order Created:", razorpayOrderId);
      } catch (razorpayError: any) {
        console.error(
          "❌ Razorpay Order Creation Failed:",
          razorpayError.message,
        );
        throw new Error(
          "Failed to create Razorpay order: " + razorpayError.message,
        );
      }
    }

    // Create order
    const order = new Order({
      orderId,
      productId: customProductId,
      buyerId: userId,
      buyerName: userDetails?.name || "Customer",
      sellerId: sellerId || null,
      zeptPayAccountId: zeptPayAccountId,
      items: [
        {
          quantity: cartItem?.quantity || 1,
          selectedVariant: cartItem?.selectedVariant || {},
          productData: {
            productDataId: productData?.productDataId || customProductId,
          },
        },
      ],
      productPrice:
        Number(productData?.price) ||
        Number(productData?.finalPrice) ||
        finalAmount,
      productMrp: calculatedData.mrp || 0,
      productSavedAmount: calculatedData.savedAmount || 0,
      productDiscount: calculatedData.discountPercent || 0,
      productOfferText: `${calculatedData.discountPercent || 0}% OFF`,
      productFinalPrice: calculatedData.finalPrice || 0,
      productGst: calculatedData.gstAmount || 0,
      productGstRate: calculatedData.gstRate || 0,
      deliveryCharge: calculatedData.deliveryCharge || 0,
      distanceKm: calculatedData.distanceKm || 0,
      totalBeforeCoupon: calculatedData.totalBeforeCoupon || 0,
      discountApplied: calculatedData.discountAppliedAmount || 0,
      platformFee: calculatedData.platformFee || 0,
      packagingFee: calculatedData.packagingFee || 0,
      finalAmount,
      status: paymentMethod === "cod" ? "cod_confirmed" : "processing",
      fulfillmentType: productData?.fulfillmentType || "SELLER",
      token: generateToken(),
      buyerAddress: {
        address: address?.address || address?.fullAddress || String(address),
        googlePlaceId: address?.googlePlaceId || "",
        latitude: Number(address?.latitude || 0),
        longitude: Number(address?.longitude || 0),
      },
      sellerAddress: {
        address: calculatedData?.sellerLocation?.address || "Unknown",
        googlePlaceId: calculatedData?.sellerLocation?.googlePlaceId || "",
        latitude: Number(calculatedData?.sellerLocation?.latitude || 0),
        longitude: Number(calculatedData?.sellerLocation?.longitude || 0),
      },
      couponUsed: calculatedData.couponUsed || null,
      couponData: calculatedData.couponData || null,
      coFundApplied: calculatedData.coFundApplied || false,
      fundSplit: calculatedData.fundSplit || { bank: 0, merchant: 0 },
      paymentIntentId: razorpayOrderId, // ✅ Store Razorpay order ID
      shippingLabel: {
        qrCodeUrl: qrCodeUrl,
        qrData: {
          token: shippingToken,
        },
      },
      metadata: {
        idempotencyKey: idempotencyKey || null,
        cartId: cartItem._id,
        createdAt: new Date(),
      },
    });

    await order.save({ session });
    console.log("✅ Order saved:", order._id, "Order ID:", orderId);

    // Create checkout session
    const checkoutSession = new CheckoutSession({
      checkoutSessionId,
      orderId: order._id,
      userId,
      cartSnapshot: {
        items: [
          {
            productId: customProductId,
            quantity: cartItem?.quantity || 1,
            selectedVariant: cartItem?.selectedVariant || {},
            productData: {
              productDataId: productData?.productDataId || customProductId,
              zeptPayAccountId: zeptPayAccountId,
              sellerId: sellerId,
            },
          },
        ],
        calculatedData: {
          totalBeforeCoupon: calculatedData.totalBeforeCoupon || 0,
          discountApplied: calculatedData.discountAppliedAmount || 0,
          deliveryCharge: calculatedData.deliveryCharge || 0,
          gstAmount: calculatedData.gstAmount || 0,
          gstRate: calculatedData.gstRate || 0,
          platformFee: calculatedData.platformFee || 0,
          packagingFee: calculatedData.packagingFee || 0,
          finalAmount,
          distanceKm: calculatedData.distanceKm || 0,
          couponUsed: calculatedData.couponUsed || null,
          couponData: calculatedData.couponData || null,
          coFundApplied: calculatedData.coFundApplied || false,
          fundSplit: calculatedData.fundSplit || { bank: 0, merchant: 0 },
        },
      },
      address: {
        address: address?.address || address?.fullAddress || String(address),
        latitude: Number(address?.latitude || 0),
        longitude: Number(address?.longitude || 0),
        googlePlaceId: address?.googlePlaceId || "",
      },
      paymentMethod,
      status: paymentMethod === "cod" ? "completed" : "pending",
      paymentGateway: paymentMethod === "cod" ? null : "razorpay",
      paymentIntentId: razorpayOrderId, // ✅ Store Razorpay order ID
      qrCodeId: null,
      expiresAt,
    });

    await checkoutSession.save({ session });
    console.log("✅ Checkout session saved");

    // Clear cart
    await Cart.deleteMany({ userId }, { session });
    console.log("🗑️ Cart cleared for", paymentMethod, "order");

    // ✅ Return with paymentIntentId
    return {
      order,
      checkoutSession,
      checkoutSessionId,
      orderId: order.orderId,
      finalAmount,
      expiresAt,
      productData,
      userDetails,
      zeptPayAccountId,
      isDuplicate: false,
      paymentIntentId: razorpayOrderId, // ✅ YAHI - Razorpay order ID
    };
  } catch (error: any) {
    console.error("❌ Payment Service Error:", error.message);
    throw error;
  }
};

export const processPayment = async ({
  checkoutSessionId,
  paymentType,
  userId,
  user,
  transactionId,
  frequency,
  startDate,
  endDate,
  session,
}: ProcessPaymentParams) => {
  // Find checkout session
  const checkoutSession: any = await CheckoutSession.findOne({
    checkoutSessionId,
    userId,
  }).session(session);

  if (!checkoutSession) {
    throw new Error("Checkout session not found");
  }

  // Find order
  const order: any = await Order.findById(checkoutSession.orderId).session(
    session,
  );
  if (!order) {
    throw new Error("Order not found");
  }

  // Prevent duplicate payment
  if (["captured", "authorized"].includes(order.paymentStatus)) {
    throw new Error("Order already paid");
  }

  // Check if session expired
  if (
    checkoutSession.expiresAt &&
    new Date() > new Date(checkoutSession.expiresAt)
  ) {
    checkoutSession.status = "expired";
    order.status = "cancelled";
    order.paymentStatus = "failed";

    await checkoutSession.save({ session });
    await order.save({ session });

    throw new Error("Checkout session expired");
  }

  // Extract data for payment
  const cartSnapshot = checkoutSession.cartSnapshot || {};
  const firstItem = cartSnapshot?.items?.[0] || {};
  const productData = firstItem?.productData || {};
  const calculatedData =
    firstItem?.calculated || cartSnapshot?.calculatedData || {};

  const amount = extractPaymentAmount(calculatedData);
  const accountId = productData?.zeptPayAccountId || order.zeptPayAccountId;
  const appName = productData?.appName || "TizzyGo";

  if (!accountId) {
    throw new Error("Account ID (zeptPayAccountId) missing");
  }

  if (!amount || amount <= 0) {
    throw new Error("Invalid payment amount");
  }

  const userAccount = await User.findById(userId).select("name email");

  if (!userAccount) {
    throw new Error("User not found");
  }

  const payer = {
    userId: user.userId,
    name: userAccount.name || "Customer",
    email: userAccount.email || "",
  };

  // Update statuses
  order.status = "processing";
  order.paymentStatus = "processing";
  checkoutSession.status = "processing";

  // Store which gateway will be used
  const activeGatewayType = PaymentGatewayFactory.getActiveGatewayType();
  checkoutSession.paymentGateway = activeGatewayType;

  await order.save({ session });
  await checkoutSession.save({ session });

  // Get active gateway
  const gateway: IPaymentGateway = PaymentGatewayFactory.getGateway();

  // Prepare payment parameters
  const paymentParams = {
    amount,
    currency: "INR",
    accountId,
    customerId: userId,
    customerName: payer.name,
    customerEmail: payer.email,
    metadata: {
      checkoutSessionId,
      orderId: order.orderId,
      buyerId: userId,
      transactionId,
      appName,
      paymentType,
      frequency,
      startDate,
      endDate,
    },
    idempotencyKey: transactionId || order.orderId,
  };

  let gatewayResponse: any;

  try {
    console.log("========================================");
    console.log("🚀 BEFORE PAYMENT GATEWAY CALL");
    console.log("========================================");
    console.log("Gateway:", gateway.gatewayType);
    console.log("Payment Type:", paymentType);
    console.log("Account ID:", accountId);
    console.log("Amount:", amount);
    console.log("Currency:", "INR");
    console.log("App Name:", appName);
    console.log("Payer:", JSON.stringify(payer, null, 2));

    const sdkStart = Date.now();

    if (paymentType === "normal") {
      console.log("💳 Calling createPaymentIntent()...");
      gatewayResponse = await gateway.createPaymentIntent(paymentParams);
      console.log(
        `✅ createPaymentIntent SUCCESS (${Date.now() - sdkStart}ms)`,
      );
    } else if (paymentType === "qr") {
      console.log("📱 Calling createPaymentIntent with QR...");
      const qrParams = {
        ...paymentParams,
        metadata: {
          ...paymentParams.metadata,
          paymentType: "qr",
        },
      };
      gatewayResponse = await gateway.createPaymentIntent(qrParams);
      console.log(
        `✅ createPaymentIntent QR SUCCESS (${Date.now() - sdkStart}ms)`,
      );
    } else if (paymentType === "autopay") {
      console.log("🔄 Calling createPaymentIntent for autopay...");
      const autopayParams = {
        ...paymentParams,
        metadata: {
          ...paymentParams.metadata,
          paymentType: "autopay",
          frequency: frequency || "monthly",
          startDate: startDate || new Date(),
          endDate: endDate || null,
        },
      };
      gatewayResponse = await gateway.createPaymentIntent(autopayParams);
      console.log(
        `✅ createPaymentIntent Autopay SUCCESS (${Date.now() - sdkStart}ms)`,
      );
    }

    console.log("========================================");
    console.log("📦 GATEWAY RESPONSE");
    console.log("========================================");
    console.log(JSON.stringify(gatewayResponse, null, 2));
  } catch (sdkError: any) {
    console.log("========================================");
    console.log("❌ GATEWAY SDK ERROR");
    console.log("========================================");
    console.log("Message:", sdkError?.message);
    console.log("Stack:", sdkError?.stack);

    order.status = "failed";
    order.paymentStatus = "failed";
    checkoutSession.status = "failed";

    await order.save({ session });
    await checkoutSession.save({ session });

    throw new Error(
      `Payment gateway failed: ${sdkError?.message || "Unknown SDK error"}`,
    );
  }

  // Process response
  const paymentIntentId = gatewayResponse.paymentIntentId;
  const paymentStatus = gatewayResponse.status;

  const paymentAttempt = createPaymentAttempt(
    paymentIntentId,
    paymentType,
    paymentStatus,
    { ...gatewayResponse, transactionId },
  );

  if (!order.paymentAttempts) order.paymentAttempts = [];
  order.paymentAttempts.push(paymentAttempt);

  if (paymentIntentId) {
    order.paymentIntentId = paymentIntentId;
    checkoutSession.paymentIntentId = paymentIntentId;
  }

  if (gatewayResponse.qrCodeId) {
    checkoutSession.qrCodeId = gatewayResponse.qrCodeId;
  }

  // Update status based on payment result
  switch (paymentStatus) {
    case PaymentStatus.CAPTURED:
      order.status = "captured";
      order.paymentStatus = "captured";
      checkoutSession.status = "completed";
      break;
    case PaymentStatus.AUTHORIZED:
      order.status = "authorized";
      order.paymentStatus = "authorized";
      checkoutSession.status = "authorized";
      break;
    case PaymentStatus.FAILED:
      order.status = "failed";
      order.paymentStatus = "failed";
      checkoutSession.status = "failed";
      break;
    case PaymentStatus.CANCELLED:
      order.status = "cancelled";
      order.paymentStatus = "failed";
      checkoutSession.status = "cancelled";
      break;
    default:
      order.status = "processing";
      order.paymentStatus = "processing";
      checkoutSession.status = "processing";
  }

  await order.save({ session });
  await checkoutSession.save({ session });

  // Create transaction record
  const transaction = new Transaction({
    transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    transactionType: "payment",
    status: paymentStatus,
    amount,
    currency: "INR",
    gateway: gateway.gatewayType,
    gatewayTransactionId: paymentIntentId,
    gatewayOrderId: gatewayResponse.orderId,
    gatewayPaymentId: gatewayResponse.paymentIntentId,
    orderId: order._id,
    orderNumber: order.orderId,
    checkoutSessionId: checkoutSession.checkoutSessionId,
    userId,
    payerName: payer.name,
    payerEmail: payer.email,
    receiverName: appName,
    receiverAccountId: accountId,
    metadata: {
      paymentType,
      frequency,
      startDate,
      endDate,
      ...gatewayResponse.metadata,
    },
    rawRequest: paymentParams,
    rawResponse: gatewayResponse,
    completedAt:
      paymentStatus === PaymentStatus.CAPTURED ? new Date() : undefined,
  });

  await transaction.save({ session });
  console.log("✅ Transaction saved:", transaction.transactionId);

  return {
    order,
    checkoutSession,
    zeptpayResponse: gatewayResponse,
    paymentIntentId,
    paymentStatus,
    amount,
    appName,
    payer,
    transaction,
  };
};

export const getOrderStatus = async (orderId: string, userId: string) => {
  const order = await Order.findOne({
    orderId,
    buyerId: userId,
  }).lean();

  if (!order) {
    throw new Error("Order not found");
  }

  return order;
};

// Helper functions
function extractPaymentAmount(calculatedData: any): number {
  return Number(
    calculatedData?.grandTotal ||
      calculatedData?.totalBeforeCoupon ||
      calculatedData?.subtotal ||
      calculatedData?.finalAmount ||
      0,
  );
}

function createPaymentAttempt(
  paymentIntentId: string | null,
  method: string,
  status: PaymentStatus,
  rawResponse: any,
) {
  return {
    paymentIntentId,
    method,
    status,
    rawResponse,
    createdAt: new Date(),
  };
}
