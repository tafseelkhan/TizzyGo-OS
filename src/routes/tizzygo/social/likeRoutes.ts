import express from 'express';
import { toggleProductLike, getProductLikes } from '../../../controller/tizzygo/social/likeController';
import { authMiddleware } from '../../../middleware/tizzygo/authMiddleware';

const router = express.Router();

router.post('/',  authMiddleware, toggleProductLike);
router.get('/:productId',  authMiddleware, getProductLikes);

export default router;
