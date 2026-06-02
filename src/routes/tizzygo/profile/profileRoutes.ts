import express from "express"; 
import { 
  getProfile, 
  updateProfile, 
  getUsersByIds, 
  deleteProfileImage
} from "../../../controller/tizzygo/profile/profileController";
import { authMiddleware } from '../../../middleware/tizzygo/authMiddleware';

const router = express.Router();

// 🔐 Private profile (login user ka profile)
// cast handler to RequestHandler to satisfy Express/TypeScript overloads
router.get("/me", authMiddleware, getProfile as unknown as express.RequestHandler);

// 🔐 Update profile (login user)
router.put(
  "/update", 
  authMiddleware, 
  updateProfile as unknown as express.RequestHandler
);

// 👥 Multiple users by IDs
router.post("/users/batch", getUsersByIds);

// Delete profile image only
router.delete('/delete-image', authMiddleware, deleteProfileImage);

export default router;
