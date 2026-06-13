import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Order from '../../../models/tizzyos/shipping/order/order';

/**
 * 🔹 API 1: Get ALL orders of logged-in buyer
 * FULL order document returned
 */
export const getMyOrdersFull = async (req: Request, res: Response) => {
  try {
    console.log('📦 GET MY ORDERS (FULL DATA) - API Called');
    console.log('🕐 Timestamp:', new Date().toISOString());

    const buyerId = (req as any).user?.userId || (req as any).user?.id;
    console.log('👤 Buyer ID from request:', buyerId);
    console.log('🔍 Request Headers:', req.headers);
    console.log('🔍 Request Method:', req.method);
    console.log('🔍 Request URL:', req.originalUrl);

    if (!buyerId) {
      console.log('❌ ERROR: No buyerId found - User not authenticated');
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    console.log('🔍 Searching orders for buyerId:', buyerId);
    console.log('📊 Query: Order.find({ buyerId }).sort({ createdAt: -1 })');

    const orders = await Order.find({ buyerId })
      .sort({ createdAt: -1 })
      .lean();

    console.log('✅ Orders found:', orders.length);
    console.log('📋 Orders data structure:', 
      orders.length > 0 ? 
      `First order keys: ${Object.keys(orders[0])}` : 
      'No orders found'
    );
    
    if (orders.length > 0) {
      console.log('📊 Sample order data:', {
        id: orders[0]._id,
        status: orders[0].status,
        createdAt: orders[0].createdAt,
        itemsCount: orders[0].items?.length || 0
      });
    }

    return res.json({
      success: true,
      count: orders.length,
      orders,
    });

  } catch (err: any) {
    console.error('❌ getMyOrdersFull error:', err.message);
    console.error('🔍 Error stack:', err.stack);
    console.error('🔍 Error full object:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * 🔹 API 2: Get SINGLE order by MongoDB _id
 * Only that order, FULL data
 */
export const getOrderByMongoId = async (req: Request, res: Response) => {
  try {
    console.log('📦 GET ORDER BY MONGO _id - API Called');
    console.log('🕐 Timestamp:', new Date().toISOString());
    
    const buyerId = (req as any).user?.userId || (req as any).user?.id;
    const { orderMongoId } = req.params;
    
    console.log('👤 Buyer ID from request:', buyerId);
    console.log('🔍 Order MongoDB ID from params:', orderMongoId);
    console.log('🔍 Request Parameters:', req.params);
    console.log('🔍 Request Headers:', req.headers);

    if (!buyerId) {
      console.log('❌ ERROR: No buyerId found - User not authenticated');
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    console.log('🔍 Validating MongoDB ObjectId:', orderMongoId);
    const isValidObjectId = mongoose.Types.ObjectId.isValid(orderMongoId);
    console.log('✅ MongoDB ObjectId validation result:', isValidObjectId);

    if (!isValidObjectId) {
      console.log('❌ ERROR: Invalid MongoDB ObjectId format');
      return res.status(400).json({
        success: false,
        message: 'Invalid order id',
      });
    }

    console.log('🔍 Searching for order with query:', {
      _id: orderMongoId,
      buyerId: buyerId
    });

    const order = await Order.findOne({
      _id: orderMongoId,
      buyerId,
    }).lean();

    console.log('✅ Order search completed');
    console.log('🔍 Order found:', order ? 'YES' : 'NO');
    
    if (!order) {
      console.log('❌ ERROR: Order not found for buyerId:', buyerId);
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    console.log('📋 Order data structure - Keys:', Object.keys(order));

    return res.json({
      success: true,
      order,
    });

  } catch (err: any) {
    console.error('❌ getOrderByMongoId error:', err.message);
    console.error('🔍 Error stack:', err.stack);
    console.error('🔍 Error type:', err.name);
    console.error('🔍 Error code:', err.code);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};