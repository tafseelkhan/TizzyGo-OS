import express from 'express';
import { 
  addOrUpdateRatingReview,
  getRatingStats,
  getReviews,
  deleteRatingReview,
} from '../../../controller/tizzygo/social/ratingController';
import { authMiddleware } from '../../../middleware/tizzygo/authMiddleware';

const router = express.Router();

// Submit/update rating and review
router.post(
  "/rating",
  authMiddleware,
  addOrUpdateRatingReview
);

// Get rating statistics
router.get('/rating/stats/:productId', getRatingStats);

// Get all reviews with pagination
router.get('/rating/reviews/:productId', getReviews);

// Delete rating/review
router.delete('/:ratingReviewId', authMiddleware, deleteRatingReview);

export default router;
