import express from 'express';
import {
  addComment,
  replyToComment,
  toggleCommentLike,
  toggleReplyLike,
  getCommentsByPost,
  deleteComment,
  deleteReply,
  getCommentStats,
  getAllReports,
  getUniqueUserCommentCounts
} from '../../../controller/tizzygo/social/commentController';
import { authMiddleware } from '../../../middleware/tizzygo/authMiddleware';

const router = express.Router();

router.post('/add', authMiddleware, addComment);
router.post('/reply/:commentId', authMiddleware, replyToComment);
router.post('/like/:commentId', authMiddleware, toggleCommentLike);
router.post('/like-reply/:commentId/:replyId', authMiddleware, toggleReplyLike);
router.delete('/delete/:commentId', authMiddleware, deleteComment);
router.delete('/delete-reply/:commentId/:replyId', authMiddleware, deleteReply);
router.get('/post/:postId', authMiddleware, getCommentsByPost);
router.get('/stats', authMiddleware, getCommentStats);
router.get('/reports', authMiddleware, getAllReports);
router.get('/comments/unique-user-count/:postId', getUniqueUserCommentCounts);

export default router;
