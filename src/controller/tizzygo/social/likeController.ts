import { Request, Response } from 'express';
import { ProductLike } from '../../../models/tizzygo/social/likemodel';
import mongoose from 'mongoose';

// Get like status for a product (including user's like status if authenticated)
export const getProductLikes = async (req: Request, res: Response) => {
  const { productId } = req.params;
  const userId = req.user?._id;

  // Validate productId
  if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
    return res.status(400).json({ 
      success: false,
      error: 'Invalid or missing productId' 
    });
  }

  try {
    // Get total like count
    const count = await ProductLike.countDocuments({ productId });
    
    // Check if current user has liked the product
    let liked = false;
    if (userId) {
      const userLike = await ProductLike.findOne({ userId, productId });
      liked = !!userLike;
    }

    return res.json({
      success: true,
      count,
      liked,
      message: 'Like status retrieved successfully'
    });

  } catch (error) {
    console.error('Error fetching product likes:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Server error while fetching likes' 
    });
  }
};

// Toggle like status for a product
export const toggleProductLike = async (req: Request, res: Response) => {
  const userId = req.user?._id;
  const { productId } = req.body;

  // Authentication check
  if (!userId) {
    return res.status(401).json({ 
      success: false,
      error: 'Unauthorized - Please login to like products' 
    });
  }

  // Validate productId
  if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
    return res.status(400).json({ 
      success: false,
      error: 'Invalid or missing productId' 
    });
  }

  try {
    // Check if like already exists
    const existingLike = await ProductLike.findOne({ userId, productId });
    let liked: boolean;

    if (existingLike) {
      // Unlike the product
      await ProductLike.deleteOne({ _id: existingLike._id });
      liked = false;
    } else {
      // Like the product
      await ProductLike.create({ userId, productId });
      liked = true;
    }

    // Get updated count
    const count = await ProductLike.countDocuments({ productId });

    return res.json({
      success: true,
      liked,
      count,
      message: liked ? 'Product liked successfully' : 'Product unliked successfully'
    });

  } catch (error) {
    console.error('Error toggling product like:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Server error while toggling like' 
    });
  }
};