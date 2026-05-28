import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../../../middleware/tizzygo/authMiddleware";
import Order from "../../../models/tizzygo/order/order";

export const getOrderById = async (req: AuthRequest, res: Response) => {
  try {
    console.log('📦 ========== ORDER FETCH STARTED ==========');

    // Auth merged hai → userId ya id dono handle
    const buyerId = req.user?.userId || req.user?.id;
    console.log('👤 Buyer ID from token:', buyerId);

    if (!buyerId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    const { orderId } = req.params;
    console.log('🔍 Requested orderId:', orderId);

    const startTime = Date.now();

    // Safe + Correct query
    const query: any = {
      buyerId: buyerId,
      $or: [],
    };

    // Agar Mongo ObjectId hai
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      query.$or.push({ _id: orderId });
    }

    // Custom orderId string
    query.$or.push({ orderId });

    const order = await Order.findOne(query);

    console.log(`⏱️ DB query time: ${Date.now() - startTime}ms`);

    if (!order) {
      console.log('❌ Order not found for this buyer');

      return res.status(404).json({
        success: false,
        message: 'Order not found for this user',
      });
    }

    console.log('✅ Order found successfully');
    console.log('📊 Order snapshot:', {
      _id: order._id,
      orderId: order.orderId,
      buyerId: order.buyerId,
      status: order.status,
      finalAmount: order.finalAmount,
      items: order.items?.length || 0,
    });

    console.log('🏁 ========== ORDER FETCH COMPLETED ==========');

    return res.json({
      success: true,
      order: {
        ...order.toObject(),
        orderId: order.orderId || order._id,
        finalAmount: order.finalAmount || order.totalAmount,
      },
    });

  } catch (err: any) {
    console.error('❌ ========== ORDER FETCH ERROR ==========');
    console.error('Error:', err.message);

    if (err.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID format',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};