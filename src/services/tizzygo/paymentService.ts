import mongoose from "mongoose";
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
  generateQrCodeDataUrl,
} from "../../utils/tizzygo/paymentHelpers";
import Razorpay from "razorpay";

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
  isBuyNow?: boolean;
  productId?: string;
  variantId?: string;
  quantity?: number;
  sellerId?: string;
  productDataId?: string;
}

/**
 * ✅ createPaymentIntent - Creates CheckoutSession, Orders, Transaction, AND Razorpay Order
 *
 * CORRECT FLOW:
 * 1. Validate request
 * 2. Create CheckoutSession with snapshot
 * 3. Create Order(s) from snapshot (PENDING status)
 * 4. Create ONE Transaction (PENDING status)
 * 5. Link everything together
 * 6. Create Razorpay Order
 * 7. Save Razorpay Order ID in CheckoutSession
 * 8. Return response to frontend
 *
 * CRITICAL: Orders exist BEFORE frontend receives response
 * CRITICAL: ONE Transaction per payment
 */
export const createPaymentIntent = async ({
  userId,
  address,
  paymentMethod,
  session,
  idempotencyKey,
  isBuyNow = false,
  productId,
  variantId,
  quantity = 1,
  sellerId,
  productDataId,
}: CreatePaymentIntentParams) => {
  console.log("========================================");
  console.log("💰 [PaymentService] createPaymentIntent STARTED");
  console.log("========================================");
  console.log(`👤 User ID: ${userId}`);
  console.log(`💳 Payment Method: ${paymentMethod}`);
  console.log(`🛒 Is Buy Now: ${isBuyNow}`);
  console.log(`📦 Product ID: ${productId || "Cart Checkout"}`);

  // ✅ Check for duplicate request using idempotency key
  if (idempotencyKey) {
    console.log(
      "🔍 Checking for existing checkout session with idempotency key...",
    );

    const existingCheckoutSession = await CheckoutSession.findOne({
      "metadata.idempotencyKey": idempotencyKey,
    }).session(session);

    if (existingCheckoutSession) {
      console.log(
        "⚠️ Duplicate request detected! Returning existing checkout session",
      );

      let existingOrders: any[] = [];
      if (
        existingCheckoutSession.orderIds &&
        existingCheckoutSession.orderIds.length > 0
      ) {
        existingOrders = await Order.find({
          _id: { $in: existingCheckoutSession.orderIds },
        }).session(session);
      } else if (existingCheckoutSession.orderId) {
        const order = await Order.findById(
          existingCheckoutSession.orderId,
        ).session(session);
        if (order) existingOrders = [order];
      }

      let existingTransaction = null;
      if (existingCheckoutSession.transactionId) {
        existingTransaction = await Transaction.findById(
          existingCheckoutSession.transactionId,
        ).session(session);
      }

      return {
        checkoutSession: existingCheckoutSession,
        checkoutSessionId: existingCheckoutSession.checkoutSessionId,
        paymentIntentId: existingCheckoutSession.paymentIntentId || null,
        finalAmount:
          existingCheckoutSession.cartSnapshot?.calculatedData?.finalAmount ||
          0,
        expiresAt: existingCheckoutSession.expiresAt,
        productData: {},
        userDetails: {},
        isDuplicate: true,
        orders: existingOrders,
        transaction: existingTransaction,
        isCartCheckout:
          existingCheckoutSession.orderIds &&
          existingCheckoutSession.orderIds.length > 1,
      };
    }
  }

  // ✅ CRITICAL: Separate Buy Now from Cart
  if (isBuyNow) {
    console.log("🔄 Using BUY NOW checkout flow");
    if (!productId)
      throw new Error("Product ID is required for Buy Now checkout");
    if (!sellerId)
      throw new Error("Seller ID is required for Buy Now checkout");
    if (!productDataId)
      throw new Error("Product Data ID is required for Buy Now checkout");

    return await createBuyNowCheckout({
      userId,
      address,
      paymentMethod,
      session,
      idempotencyKey,
      productId,
      variantId,
      quantity,
      sellerId,
      productDataId,
    });
  }

  // ✅ Cart Checkout flow
  console.log("🔄 Using CART checkout flow");
  const cartItems = await Cart.find({ userId }).session(session).lean();
  console.log(`📦 Found ${cartItems.length} items in cart`);

  if (!cartItems || cartItems.length === 0) {
    throw new Error("Cart is empty");
  }

  // ✅ Validate all cart items have calculated data
  let hasValidAmount = false;
  let totalGrandTotal = 0;

  for (const item of cartItems) {
    const calculated = item?.calculated || {};
    const grandTotal = calculated?.grandTotal || calculated?.finalAmount || 0;
    console.log(`📦 Item ${item.productId}: grandTotal = ${grandTotal}`);

    if (grandTotal > 0) {
      hasValidAmount = true;
      totalGrandTotal += grandTotal;
    }
  }

  console.log(`💰 Total grandTotal from all cart items: ${totalGrandTotal}`);

  if (!hasValidAmount || totalGrandTotal <= 0) {
    console.error("❌ Cart items missing calculated data!");
    throw new Error(
      "Cart items missing calculated data. Please run checkout first. " +
        "Make sure each item has calculated.grandTotal > 0",
    );
  }

  return await createCartCheckout({
    userId,
    address,
    paymentMethod,
    session,
    idempotencyKey,
    cartItems,
  });
};

/**
 * ✅ BUY NOW CHECKOUT - Creates Orders BEFORE Payment
 */
async function createBuyNowCheckout({
  userId,
  address,
  paymentMethod,
  session,
  idempotencyKey,
  productId,
  variantId,
  quantity = 1,
  sellerId,
  productDataId,
}: any) {
  console.log("💰 [BuyNow] Creating buy now checkout with Orders...");

  const { Product } =
    await import("../../models/tizzyos/seller/AddProducts/Products");
  const product = await Product.findOne({
    productId: productDataId,
    sellerId,
  }).lean();

  if (!product) {
    throw new Error("Product not found");
  }

  let activeVariant = product.variants?.find(
    (v: any) => v.variantId === variantId,
  );
  if (!activeVariant) {
    activeVariant = product.variants?.[0] || product;
  }

  const cartItem = await Cart.findOne({
    userId,
    productId: productId,
  })
    .session(session)
    .lean();

  if (!cartItem) {
    throw new Error("Buy Now cart item not found. Please run checkout first.");
  }

  const productData = cartItem?.productData || {};
  const calculatedData = cartItem?.calculated || {};

  const finalAmount =
    calculatedData?.grandTotal || calculatedData?.finalAmount || 0;

  if (!finalAmount || finalAmount <= 0) {
    throw new Error(
      `Invalid final amount: ${finalAmount}. Please run checkout again.`,
    );
  }

  const customProductId = getProductId(cartItem, productData);
  if (!customProductId) {
    throw new Error("Product ID missing");
  }

  const isCodAvailable = product?.cashOnDelivery === true;

  console.log("Product COD:", product?.cashOnDelivery);

  if (paymentMethod === "cod" && !isCodAvailable) {
    throw new Error("Cash on Delivery not available");
  }

  const roundedFinalAmount = Math.round(finalAmount * 100) / 100;

  const userDetails = (await User.findById(userId).lean()) as any;
  if (!userDetails) {
    throw new Error("User not found");
  }

  let zeptPayAccountId = null;
  if (sellerId) {
    const sellerDetails = (await User.findById(sellerId).lean()) as any;
    if (sellerDetails) {
      zeptPayAccountId = sellerDetails?.zeptPayAccountId || null;
    }
  }

  const checkoutSessionId = generateCheckoutSessionId();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  // ✅ CREATE ORDER
  const orderId = generateOrderId();
  const { qrCodeUrl, token: shippingToken } = await generateQrCodeDataUrl(
    orderId,
    userId,
    sellerId,
  );

  const order = new Order({
    orderId,
    productId: customProductId,
    buyerId: userId,
    buyerName: userDetails?.name || "Customer",
    sellerId: sellerId,
    zeptPayAccountId: zeptPayAccountId,
    productTitle: productData.title || product.title || "Product",
    items: [
      {
        quantity: quantity || 1,
        selectedVariant: cartItem?.selectedVariant || {},
        productData: {
          productDataId: productData?.productDataId || customProductId,
        },
      },
    ],
    productPrice: Number(productData.price) || 0,
    productMrp: Number(productData.mrp) || 0,
    productSavedAmount: calculatedData.savedAmount || 0,
    productDiscount: calculatedData.discountPercent || 0,
    productOfferText: `${calculatedData.discountPercent || 0}% OFF`,
    productFinalPrice: Number(productData.finalPrice) || 0,
    productGst: calculatedData.gstAmount || 0,
    productGstRate: calculatedData.gstRate || 0,
    deliveryCharge: calculatedData.deliveryCharge || 0,
    distanceKm: calculatedData.distanceKm || 0,
    totalBeforeCoupon: calculatedData.totalBeforeCoupon || 0,
    discountApplied: calculatedData.discountAppliedAmount || 0,
    platformFee: calculatedData.platformFee || 0,
    packagingFee: calculatedData.packagingFee || 0,
    finalAmount: roundedFinalAmount,
    status: "pending",
    paymentStatus: "pending",
    fulfillmentType: productData.fulfillmentType || "SELLER",
    token: generateToken(),
    buyerAddress: {
      address: address?.address || "",
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
    shippingLabel: {
      qrCodeUrl: qrCodeUrl,
      qrData: { token: shippingToken },
    },
    checkoutSessionId: checkoutSessionId,
    metadata: {
      checkoutSessionId: checkoutSessionId,
      cartCheckout: false,
      dataSource: "checkout_session_snapshot",
      isBuyNow: true,
      createdAt: new Date(),
    },
  });

  await order.save({ session });
  console.log(
    `✅ Order created: ${orderId} - ₹${roundedFinalAmount} (PENDING)`,
  );

  // ✅ ✅ ✅ CREATE ONE TRANSACTION ✅ ✅ ✅
  const transaction = new Transaction({
    transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    transactionType: "payment",
    status: "pending",
    amount: roundedFinalAmount,
    currency: "INR",
    gateway: "razorpay",
    orderId: order._id,
    orderIds: [order._id],
    orderNumber: orderId,
    checkoutSessionId: checkoutSessionId,
    userId: userId,
    payerName: userDetails?.name || "Customer",
    payerEmail: userDetails?.email || "",
    receiverName: productData.appName || "TizzyGo",
    receiverAccountId: zeptPayAccountId,
    metadata: {
      paymentType: paymentMethod,
      isBuyNow: true,
      orderCount: 1,
    },
    createdAt: new Date(),
  });

  await transaction.save({ session });
  console.log(`✅ Transaction created: ${transaction.transactionId} (PENDING)`);

  // ✅ Link transaction to order
  order.transactionId = transaction._id;
  await order.save({ session });

  // ✅ Create Razorpay Order
  let razorpayOrderId = null;
  if (paymentMethod !== "cod") {
    try {
      console.log(
        `💰 Creating Razorpay Order for amount: ${roundedFinalAmount}`,
      );
      const razorpayOrder = await razorpay.orders.create({
        amount: Math.round(roundedFinalAmount * 100),
        currency: "INR",
        receipt: `receipt_${Date.now()}`,
        notes: {
          checkoutSessionId: checkoutSessionId,
          userId: userId,
          productId: customProductId,
          isBuyNow: "true",
          orderId: orderId,
          transactionId: transaction.transactionId,
          grandTotal: roundedFinalAmount,
        },
      });
      razorpayOrderId = razorpayOrder.id;
      console.log(`✅ Razorpay Order Created: ${razorpayOrderId}`);
    } catch (razorpayError: any) {
      console.error(
        "❌ Razorpay Order Creation Failed:",
        razorpayError.message,
      );
      await Order.deleteOne({ _id: order._id }).session(session);
      await Transaction.deleteOne({ _id: transaction._id }).session(session);
      throw new Error(
        "Failed to create Razorpay order: " + razorpayError.message,
      );
    }
  }

  // ✅ Create Checkout Session
  const checkoutSession = new CheckoutSession({
    checkoutSessionId,
    userId,
    cartSnapshot: {
      items: [
        {
          productId: customProductId,
          quantity: quantity || 1,
          selectedVariant: cartItem?.selectedVariant || {},
          productData: {
            productDataId: productData?.productDataId || customProductId,
            title: productData?.title || product.title || "Product",
            price: productData?.price || 0,
            finalPrice: productData?.finalPrice || 0,
            mrp: productData?.mrp || 0,
            discount: productData?.discount || 0,
            discountPercent: productData?.discountPercent || 0,
            offerText: productData?.offerText || "",
            gstRate: productData?.gstRate || 0,
            gstAmount: productData?.gstAmount || 0,
            sellerId: sellerId,
            zeptPayAccountId: zeptPayAccountId,
            fulfillmentType: productData?.fulfillmentType || "SELLER",
            cashOnDelivery: productData?.cashOnDelivery || false,
            appName: productData?.appName || "TizzyGo",
            productImage: productData?.productImage || "",
            sellerLocation: {
              address: calculatedData?.sellerLocation?.address || "Unknown",
              latitude: calculatedData?.sellerLocation?.latitude || 0,
              longitude: calculatedData?.sellerLocation?.longitude || 0,
              googlePlaceId:
                calculatedData?.sellerLocation?.googlePlaceId || "",
            },
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
        finalAmount: roundedFinalAmount,
        distanceKm: calculatedData.distanceKm || 0,
        couponUsed: calculatedData.couponUsed || null,
        couponData: calculatedData.couponData || null,
        coFundApplied: calculatedData.coFundApplied || false,
        fundSplit: calculatedData.fundSplit || { bank: 0, merchant: 0 },
        mrp: calculatedData.mrp || 0,
        savedAmount: calculatedData.savedAmount || 0,
        discountPercent: calculatedData.discountPercent || 0,
        finalPrice: calculatedData.finalPrice || 0,
        subtotal: calculatedData.subtotal || 0,
      },
    },
    address: {
      address: address?.address || address?.fullAddress || String(address),
      latitude: Number(address?.latitude || 0),
      longitude: Number(address?.longitude || 0),
      googlePlaceId: address?.googlePlaceId || "",
    },
    paymentMethod,
    status: "pending",
    paymentGateway: paymentMethod === "cod" ? null : "razorpay",
    paymentIntentId: razorpayOrderId,
    qrCodeId: null,
    expiresAt,
    orderId: order._id,
    orderIds: [order._id],
    transactionId: transaction._id,
    metadata: {
      idempotencyKey: idempotencyKey || null,
      cartId: cartItem?._id || null,
      cartCheckout: false,
      checkoutType: "buy_now",
      isBuyNow: true,
      productId: productId,
      variantId: variantId,
      quantity: quantity || 1,
      grandTotal: roundedFinalAmount,
      productTotal: calculatedData?.finalPrice || 0,
      deliveryCharge: calculatedData.deliveryCharge || 0,
      platformFee: calculatedData.platformFee || 0,
      packagingFee: calculatedData.packagingFee || 0,
      discount: calculatedData.discountAppliedAmount || 0,
      couponCode: calculatedData.couponUsed || null,
      currency: "INR",
      createdAt: new Date(),
      razorpayOrderId: razorpayOrderId,
      orderIds: [order._id],
      transactionId: transaction._id,
    },
  });

  await checkoutSession.save({ session });
  console.log(
    `✅ Checkout session saved: ${checkoutSessionId} - ₹${roundedFinalAmount}`,
  );

  return {
    checkoutSession,
    checkoutSessionId: checkoutSession.checkoutSessionId,
    paymentIntentId: razorpayOrderId,
    finalAmount: roundedFinalAmount,
    expiresAt: expiresAt,
    productData: productData,
    userDetails: userDetails,
    zeptPayAccountId: zeptPayAccountId,
    isDuplicate: false,
    isCartCheckout: false,
    order: order,
    orders: [order],
    transaction: transaction,
  };
}

/**
 * ✅ CART CHECKOUT - Creates Orders BEFORE Payment
 */
async function createCartCheckout({
  userId,
  address,
  paymentMethod,
  session,
  idempotencyKey,
  cartItems,
}: any) {
  console.log(
    "💰 [CartCheckout] Creating multi-product cart checkout with Orders...",
  );

  const userDetails = (await User.findById(userId).lean()) as any;
  if (!userDetails) {
    throw new Error("User not found");
  }

  if (paymentMethod === "cod") {
    const { Product } =
      await import("../../models/tizzyos/seller/AddProducts/Products");

    for (const cartItem of cartItems) {
      const product = await Product.findOne({
        productId: cartItem.productData.productDataId,
        sellerId: cartItem.productData.sellerId,
      })
        .select("cashOnDelivery")
        .lean();

      if (!product?.cashOnDelivery) {
        throw new Error(
          "Cash on Delivery not available for one or more products",
        );
      }
    }
  }

  const checkoutSessionId = generateCheckoutSessionId();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  let totalGrandTotal = 0;
  let totalProductTotal = 0;
  let totalDeliveryCharge = 0;
  let totalPlatformFee = 0;
  let totalPackagingFee = 0;
  let totalDiscount = 0;
  const snapshotItems: any[] = [];
  const sellerIds: string[] = [];

  for (const cartItem of cartItems) {
    console.log(`📦 Processing cart item: ${cartItem.productId}`);

    const productData = cartItem?.productData || {};
    const calculatedData = cartItem?.calculated || {};
    const customProductId = getProductId(cartItem, productData);

    if (!customProductId) {
      console.log(`⚠️ Skipping item without productId: ${cartItem._id}`);
      continue;
    }

    const sellerId = productData?.sellerId;
    let zeptPayAccountId = null;
    if (sellerId) {
      const sellerDetails = (await User.findById(sellerId).lean()) as any;
      if (sellerDetails) {
        zeptPayAccountId = sellerDetails?.zeptPayAccountId || null;
      }
      if (!sellerIds.includes(sellerId)) {
        sellerIds.push(sellerId);
      }
    }

    const itemGrandTotal =
      calculatedData?.grandTotal || calculatedData?.finalAmount || 0;
    const itemProductTotal = calculatedData?.finalPrice || 0;
    const itemDeliveryCharge = calculatedData?.deliveryCharge || 0;
    const itemPlatformFee = calculatedData?.platformFee || 0;
    const itemPackagingFee = calculatedData?.packagingFee || 0;
    const itemDiscount = calculatedData?.discountAppliedAmount || 0;

    console.log(
      `💰 Item ${cartItem.productId}: grandTotal = ${itemGrandTotal}`,
    );

    if (itemGrandTotal <= 0) {
      console.error(
        `❌ Item ${cartItem.productId} has invalid grandTotal: ${itemGrandTotal}`,
      );
      throw new Error(
        `Item ${cartItem.productId} has invalid amount. Please run checkout again.`,
      );
    }

    totalGrandTotal += itemGrandTotal;
    totalProductTotal += itemProductTotal;
    totalDeliveryCharge += itemDeliveryCharge;
    totalPlatformFee += itemPlatformFee;
    totalPackagingFee += itemPackagingFee;
    totalDiscount += itemDiscount;

    snapshotItems.push({
      productId: customProductId,
      quantity: cartItem?.quantity || 1,
      selectedVariant: cartItem?.selectedVariant || {},
      productData: {
        productDataId: productData?.productDataId || customProductId,
        title: productData?.title || "Product",
        price: productData?.price || 0,
        finalPrice: productData?.finalPrice || 0,
        mrp: productData?.mrp || 0,
        discount: productData?.discount || 0,
        discountPercent: productData?.discountPercent || 0,
        offerText: productData?.offerText || "",
        gstRate: productData?.gstRate || 0,
        gstAmount: productData?.gstAmount || 0,
        sellerId: sellerId,
        zeptPayAccountId: zeptPayAccountId,
        fulfillmentType: productData?.fulfillmentType || "SELLER",
        cashOnDelivery: productData?.cashOnDelivery || false,
        appName: productData?.appName || "TizzyGo",
        productImage: productData?.productImage || "",
        sellerLocation: {
          address: calculatedData?.sellerLocation?.address || "Unknown",
          latitude: calculatedData?.sellerLocation?.latitude || 0,
          longitude: calculatedData?.sellerLocation?.longitude || 0,
          googlePlaceId: calculatedData?.sellerLocation?.googlePlaceId || "",
        },
      },
      calculatedData: {
        totalBeforeCoupon: calculatedData.totalBeforeCoupon || 0,
        discountApplied: calculatedData.discountAppliedAmount || 0,
        deliveryCharge: calculatedData.deliveryCharge || 0,
        gstAmount: calculatedData.gstAmount || 0,
        gstRate: calculatedData.gstRate || 0,
        platformFee: calculatedData.platformFee || 0,
        packagingFee: calculatedData.packagingFee || 0,
        finalAmount: itemGrandTotal,
        distanceKm: calculatedData.distanceKm || 0,
        couponUsed: calculatedData.couponUsed || null,
        couponData: calculatedData.couponData || null,
        coFundApplied: calculatedData.coFundApplied || false,
        fundSplit: calculatedData.fundSplit || { bank: 0, merchant: 0 },
        mrp: calculatedData.mrp || 0,
        savedAmount: calculatedData.savedAmount || 0,
        discountPercent: calculatedData.discountPercent || 0,
        finalPrice: calculatedData.finalPrice || 0,
        subtotal: calculatedData.subtotal || 0,
      },
      cartItemId: cartItem._id,
    });
  }

  if (snapshotItems.length === 0) {
    throw new Error("No valid items in cart");
  }

  console.log(`💰 Total grandTotal: ${totalGrandTotal}`);
  if (totalGrandTotal <= 0) {
    throw new Error(
      `Invalid total amount: ${totalGrandTotal}. Please run checkout again.`,
    );
  }

  // ✅ ✅ ✅ CREATE ORDERS ✅ ✅ ✅
  const createdOrders: any[] = [];
  const orderIds: mongoose.Types.ObjectId[] = [];

  for (const item of snapshotItems) {
    const itemProductData = item?.productData || {};
    const itemCalculated = item?.calculatedData || {};
    const sellerId = itemProductData?.sellerId;

    const orderId = generateOrderId();
    const { qrCodeUrl, token: shippingToken } = await generateQrCodeDataUrl(
      orderId,
      userId,
      sellerId,
    );

    const finalAmount =
      itemCalculated.finalAmount || itemCalculated.grandTotal || 0;

    const order = new Order({
      orderId,
      productId: item.productId,
      buyerId: userId,
      buyerName: userDetails?.name || "Customer",
      sellerId: sellerId || null,
      zeptPayAccountId: itemProductData.zeptPayAccountId || null,
      productTitle: itemProductData.title || "Product",
      items: [
        {
          quantity: item.quantity || 1,
          selectedVariant: item.selectedVariant || {},
          productData: {
            productDataId: itemProductData.productDataId || item.productId,
          },
        },
      ],
      productPrice: Number(itemProductData.price) || 0,
      productMrp: Number(itemProductData.mrp) || 0,
      productSavedAmount: itemCalculated.savedAmount || 0,
      productDiscount: itemCalculated.discountPercent || 0,
      productOfferText: `${itemCalculated.discountPercent || 0}% OFF`,
      productFinalPrice: Number(itemProductData.finalPrice) || 0,
      productGst: itemCalculated.gstAmount || 0,
      productGstRate: itemCalculated.gstRate || 0,
      deliveryCharge: itemCalculated.deliveryCharge || 0,
      distanceKm: itemCalculated.distanceKm || 0,
      totalBeforeCoupon: itemCalculated.totalBeforeCoupon || 0,
      discountApplied: itemCalculated.discountApplied || 0,
      platformFee: itemCalculated.platformFee || 0,
      packagingFee: itemCalculated.packagingFee || 0,
      finalAmount: finalAmount,
      status: "pending",
      paymentStatus: "pending",
      fulfillmentType: itemProductData.fulfillmentType || "SELLER",
      token: generateToken(),
      buyerAddress: {
        address: address?.address || "",
        googlePlaceId: address?.googlePlaceId || "",
        latitude: Number(address?.latitude || 0),
        longitude: Number(address?.longitude || 0),
      },
      sellerAddress: {
        address: itemProductData.sellerLocation?.address || "Unknown",
        googlePlaceId: itemProductData.sellerLocation?.googlePlaceId || "",
        latitude: Number(itemProductData.sellerLocation?.latitude || 0),
        longitude: Number(itemProductData.sellerLocation?.longitude || 0),
      },
      couponUsed: itemCalculated.couponUsed || null,
      couponData: itemCalculated.couponData || null,
      coFundApplied: itemCalculated.coFundApplied || false,
      fundSplit: itemCalculated.fundSplit || { bank: 0, merchant: 0 },
      shippingLabel: {
        qrCodeUrl: qrCodeUrl,
        qrData: { token: shippingToken },
      },
      checkoutSessionId: checkoutSessionId,
      metadata: {
        checkoutSessionId: checkoutSessionId,
        cartCheckout: true,
        dataSource: "checkout_session_snapshot",
        isBuyNow: false,
        createdAt: new Date(),
      },
    });

    await order.save({ session });
    createdOrders.push(order);
    orderIds.push(order._id);
    console.log(`✅ Order created: ${orderId} - ₹${finalAmount} (PENDING)`);
  }

  // ✅ ✅ ✅ CREATE ONE TRANSACTION FOR ALL ORDERS ✅ ✅ ✅
  const totalAmount = createdOrders.reduce(
    (sum, order) => sum + order.finalAmount,
    0,
  );

  const transaction = new Transaction({
    transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    transactionType: "payment",
    status: "pending",
    amount: totalAmount,
    currency: "INR",
    gateway: "razorpay",
    orderId: orderIds[0],
    orderIds: orderIds,
    orderNumber: createdOrders.map((o) => o.orderId).join(","),
    checkoutSessionId: checkoutSessionId,
    userId: userId,
    payerName: userDetails?.name || "Customer",
    payerEmail: userDetails?.email || "",
    receiverName: "TizzyGo",
    receiverAccountId: null,
    metadata: {
      paymentType: paymentMethod,
      isBuyNow: false,
      orderCount: createdOrders.length,
      orderIds: orderIds.map((id) => id.toString()),
    },
    createdAt: new Date(),
  });

  await transaction.save({ session });
  console.log(
    `✅ ONE Transaction created: ${transaction.transactionId} (PENDING)`,
  );
  console.log(`   Linked ${createdOrders.length} order(s)`);

  // ✅ Link transaction to all orders
  for (const order of createdOrders) {
    order.transactionId = transaction._id;
    await order.save({ session });
  }

  // ✅ Create Razorpay Order
  let razorpayOrderId = null;
  if (paymentMethod !== "cod") {
    try {
      console.log(
        `💰 Creating Razorpay Order for total grandTotal: ${totalGrandTotal}`,
      );
      const razorpayOrder = await razorpay.orders.create({
        amount: Math.round(totalGrandTotal * 100),
        currency: "INR",
        receipt: `receipt_${Date.now()}`,
        notes: {
          checkoutSessionId: checkoutSessionId,
          userId: userId,
          isCartCheckout: "true",
          itemCount: snapshotItems.length,
          productTotal: totalProductTotal,
          grandTotal: totalGrandTotal,
          deliveryCharge: totalDeliveryCharge,
          platformFee: totalPlatformFee,
          packagingFee: totalPackagingFee,
          discount: totalDiscount,
          orderIds: JSON.stringify(orderIds.map((id) => id.toString())),
          transactionId: transaction.transactionId,
        },
      });
      razorpayOrderId = razorpayOrder.id;
      console.log(`✅ Razorpay Order Created: ${razorpayOrderId}`);
    } catch (razorpayError: any) {
      console.error(
        "❌ Razorpay Order Creation Failed:",
        razorpayError.message,
      );
      for (const order of createdOrders) {
        await Order.deleteOne({ _id: order._id }).session(session);
      }
      await Transaction.deleteOne({ _id: transaction._id }).session(session);
      throw new Error(
        "Failed to create Razorpay order: " + razorpayError.message,
      );
    }
  }

  // ✅ Create checkout session
  const checkoutSession = new CheckoutSession({
    checkoutSessionId,
    userId,
    cartSnapshot: {
      items: snapshotItems,
      calculatedData: {
        totalBeforeCoupon: totalGrandTotal,
        discountApplied: totalDiscount,
        deliveryCharge: totalDeliveryCharge,
        gstAmount: 0,
        gstRate: 0,
        platformFee: totalPlatformFee,
        packagingFee: totalPackagingFee,
        finalAmount: totalGrandTotal,
        distanceKm: 0,
        couponUsed: null,
        couponData: null,
        coFundApplied: false,
        fundSplit: { bank: 0, merchant: 0 },
      },
    },
    address: {
      address: address?.address || String(address),
      latitude: Number(address?.latitude || 0),
      longitude: Number(address?.longitude || 0),
      googlePlaceId: address?.googlePlaceId || "",
    },
    paymentMethod,
    status: "pending",
    paymentGateway: paymentMethod === "cod" ? null : "razorpay",
    paymentIntentId: razorpayOrderId,
    qrCodeId: null,
    expiresAt,
    orderIds: orderIds,
    transactionId: transaction._id,
    metadata: {
      idempotencyKey: idempotencyKey || null,
      cartCheckout: true,
      checkoutType: "cart",
      itemCount: snapshotItems.length,
      sellerIds: sellerIds,
      isBuyNow: false,
      grandTotal: totalGrandTotal,
      productTotal: totalProductTotal,
      deliveryCharge: totalDeliveryCharge,
      platformFee: totalPlatformFee,
      packagingFee: totalPackagingFee,
      discount: totalDiscount,
      currency: "INR",
      createdAt: new Date(),
      razorpayOrderId: razorpayOrderId,
      orderIds: orderIds,
      transactionId: transaction._id,
    },
  });

  await checkoutSession.save({ session });
  console.log(
    `✅ Checkout session saved with ${snapshotItems.length} items - ₹${totalGrandTotal}`,
  );
  console.log(`✅ Linked ${orderIds.length} order(s)`);
  console.log(`✅ Linked ONE transaction: ${transaction.transactionId}`);

  return {
    checkoutSession,
    checkoutSessionId: checkoutSession.checkoutSessionId,
    paymentIntentId: razorpayOrderId,
    finalAmount: totalGrandTotal,
    expiresAt: expiresAt,
    productData: cartItems[0]?.productData || {},
    userDetails: userDetails,
    zeptPayAccountId: null,
    isDuplicate: false,
    isCartCheckout: true,
    order: null,
    orders: createdOrders,
    transaction: transaction,
    itemCount: snapshotItems.length,
  };
}

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
