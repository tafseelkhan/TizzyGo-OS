import express from "express";
import {
  saveUserColor, // POST - Save color
  getUserColor, // GET - Get color
  updateUserColor, // PUT - Update color (new API)
} from "../../../controller/tizzygo/auths/colorController";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";

const router = express.Router();

// ==================== COLOR MANAGEMENT APIs ====================

/**
 * @route   POST /api/private/color/save
 * @desc    Save user's favorite color (first time)
 * @access  Private
 * @body    { userId, color }
 */
router.post("/color/save", authMiddleware, saveUserColor);

/**
 * @route   GET /api/private/color/:userId
 * @desc    Get user's favorite color
 * @access  Private
 * @param   userId
 */
router.get("/color", authMiddleware, getUserColor);

/**
 * @route   PUT /api/private/color/update/:userId
 * @desc    Update user's favorite color
 * @access  Private
 * @param   userId
 * @body    { color }
 */
router.put("/color/update", authMiddleware, updateUserColor);

export default router;
