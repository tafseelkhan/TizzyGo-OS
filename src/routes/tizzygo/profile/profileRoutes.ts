import express from "express"; 
import { 
  getProfile, 
  getUserProfile, 
  updateProfile, 
  getUsersByIds 
} from "../../../controller/tizzygo/profile/profileController";
import { authMiddleware } from '../../../middleware/tizzygo/authMiddleware';
import { uploadProfilePhoto } from "../../../middleware/tizzygo/upload";

const router = express.Router();

// 🔐 Private profile (login user ka profile)
router.get("/me", authMiddleware, getProfile);

// 🔐 Update profile (login user)
router.put(
  "/me", 
  authMiddleware, 
  uploadProfilePhoto.single("image"), 
  updateProfile
);

// 🌍 Public profile (by Mongo _id)
router.get("/public/:userId", getUserProfile);

// 👥 Multiple users by IDs
router.post("/users/batch", getUsersByIds);

export default router;
