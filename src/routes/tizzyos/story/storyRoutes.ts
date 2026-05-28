// src/routes/storyRoutes.ts
import express from "express";
import { createStory, getStories } from "../../../controller/tizzyos/story/storyController";
import { authMiddleware } from '../../../middleware/tizzygo/authMiddleware';

const router = express.Router();

// ✅ private
router.post("/", authMiddleware, createStory);
// 🌍 public
router.get("/", getStories);

export default router;
