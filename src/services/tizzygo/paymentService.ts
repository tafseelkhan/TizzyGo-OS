import { ZeptPay } from "@flixora/zeptpay-payment-core";
import mongoose from "mongoose";
import Order from "../../models/tizzyos/shipping/order/order";
import CheckoutSession from "../../models/tizzygo/checkout/CheckoutSession";
import Cart from "../../models/tizzygo/cart/Cart";
import User from "../../models/tizzygo/auths/User";
import {
  generateCheckoutSessionId,
  generateOrderId,
  generateToken,
  getProductId,
  getFinalAmount,
  generateQrCodeUrl,
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
  idempotencyKey?: string; // 🔥 ADD THIS
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
    // 🔥 FIX 1: Check for duplicate order using idempotency key
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

    // 🔥 FIX 2: Check if order already exists for this cart (prevent duplicate)
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

    // 🔥 FIX 3: Get user details correctly
    const userDetails = (await User.findById(userId).lean()) as any;
    if (!userDetails) {
      throw new Error("User not found");
    }

    // 🔥 FIX 4: Get seller/vendor code from SELLER (not buyer)
    const sellerId = productData?.sellerId || productData?.seller?._id;
    let vendorCodeUID = null;
    let sellerDetails: any = null;

    if (sellerId) {
      sellerDetails = (await User.findById(sellerId).lean()) as any;
      if (sellerDetails) {
        // Vendor code seller se lena hai, buyer se nahi
        vendorCodeUID = sellerDetails?.vendorCodeUID || null;
        console.log("🔍 Vendor code from seller:", vendorCodeUID);
      }
    }

    // Generate IDs
    const orderId = generateOrderId();
    const checkoutSessionId = generateCheckoutSessionId();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    // Generate QR Code URL for shipping label
    const qrCodeUrl = await generateQrCodeUrl(orderId, userId, sellerId);

    // ✅ CREATE ORDER
    const order = new Order({
      orderId,
      productId: customProductId,
      buyerId: userId,
      buyerName: userDetails?.name || "Customer",
      sellerId: sellerId || null,
      vendorCodeUID: vendorCodeUID, // 🔥 Add vendor code to order
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
      paymentIntentId: null,
      shippingLabel: {
        qrCodeUrl: qrCodeUrl,
        qrData: {
          orderId: orderId,
          sellerId: sellerId || null,
          buyerId: userId,
          generatedAt: new Date(),
        },
      },
      // 🔥 Store idempotency key for duplicate detection
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
              vendorCodeUID: vendorCodeUID, // 🔥 Vendor code in checkout session
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
      paymentGateway: paymentMethod === "cod" ? null : "zeptpay",
      paymentIntentId: null,
      qrCodeId: null,
      expiresAt,
    });

    await checkoutSession.save({ session });
    console.log("✅ Checkout session saved");

    // 🔥 FIX 5: Clear cart for ALL payment methods after successful order
    await Cart.deleteMany({ userId }, { session });
    console.log("🗑️ Cart cleared for", paymentMethod, "order");

    return {
      order,
      checkoutSession,
      checkoutSessionId,
      orderId: order.orderId,
      finalAmount,
      expiresAt,
      productData,
      userDetails,
      vendorCodeUID,
      isDuplicate: false,
    };
  } catch (error: any) {
    console.error("❌ Payment Service Error:", error.message);
    throw error;
  }
};
