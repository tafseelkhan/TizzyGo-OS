import express from 'express';
import { authMiddleware, AuthRequest } from '../../../middleware/tizzygo/authMiddleware'; // <- make sure AuthRequest defines user
import User from '../../../models/tizzygo/auths/User';

export const router = express.Router();

// ✅ Update theme
router.post('/theme', authMiddleware, async (req: AuthRequest, res) => {
  const { theme } = req.body;

  if (!['light', 'dark', 'system'].includes(theme)) {
    return res.status(400).json({ success: false, message: 'Invalid theme' });
  }

  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  await User.findByIdAndUpdate(req.user.userId, { theme });

  return res.json({
    success: true,
    message: 'Theme updated successfully',
    theme,
  });
});

// ✅ Get theme
router.get('/theme', authMiddleware, async (req: AuthRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const user = await User.findById(req.user.userId).select('theme');

  return res.json({
    success: true,
    theme: user?.theme || 'system',
  });
});

export default router;