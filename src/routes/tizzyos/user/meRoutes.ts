import express, { Request, Response } from 'express';
import User from '../../../models/tizzyos/auths/User';
import { authMiddleware } from '../../../middleware/tizzygo/authMiddleware';

const router = express.Router();

router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user).select(
      'email fullName username bio city state country phone hasSellerID hasRiderID hasRentalID hasShippingID'
    );

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.status(200).json({
      success: true,
      user: {
        email: user.email,
        fullName: user.fullName || '',
        username: user.username || '',
        phone: user.phone || '',
        hasSellerID: user.hasSellerID || false,
        hasRiderID: user.hasRiderID || false,
        hasRentalID: user.hasRentalID || false,
        hasShippingID: user.hasShippingID || false,
      },
    });
  } catch (err) {
    console.error('JWT Decode Error:', err);
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
