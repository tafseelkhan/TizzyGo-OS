import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../../../../middleware/tizzygo/authMiddleware";
import { validateCheckoutSession, createCODOrder } from "../../../../services/tizzygo/orderService";

export const confirmCOD = async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log("🎯 /confirm-cod called");
    
    const user = req.user;
    const { checkoutSessionId } = req.body;

    if (!user) {
      return res.status(401).json({ 
        success: false,
        error: "Unauthorized: User missing" 
      });
    }
    
    if (!checkoutSessionId) {
      return res.status(400).json({ 
        success: false,
        error: "checkoutSessionId is required" 
      });
    }

    // Validate checkout session
    const checkoutSession = await validateCheckoutSession(checkoutSessionId, user.userId);
    
    // Create order
    const { order } = await createCODOrder({ checkoutSession, user, session });
    
    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    console.log("✅ COD order created successfully");
    
    const firstItem = checkoutSession.cartSnapshot.items[0];
    
    return res.json({
      success: true,
      message: "COD order confirmed successfully",
      order: {
        _id: order._id,
        orderId: order.orderId,
        status: order.status,
        finalAmount: order.finalAmount,
        paymentMethod: order.paymentMethod,
        productName: firstItem.productData.title || "Product",
        buyerAddress: order.buyerAddress,
        sellerAddress: order.sellerAddress,
        createdAt: order.createdAt,
        buyerId: order.buyerId,
        buyerName: order.buyerName,
        sellerId: order.sellerId,
      }
    });

  } catch (err: any) {
    await session.abortTransaction();
    session.endSession();
    
    console.error("💥 Error in /confirm-cod:", err.message);
    
    // Handle specific error messages
    let errorMessage = err.message;
    let statusCode = 500;
    
    if (errorMessage.includes("Checkout session not found")) {
      statusCode = 404;
    } else if (errorMessage.includes("Invalid payment method")) {
      statusCode = 400;
    }
    
    res.status(statusCode).json({ 
      success: false,
      error: errorMessage,
      message: err.message || "Unknown error",
    });
  }
};