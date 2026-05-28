import express from "express";
import { getUploadUrl } from "../../../../controller/tizzyos/seller/AddProducts/uploadController";

const router = express.Router();

// 🔹 Direct POST to get upload URL
router.post("/get-upload-url", getUploadUrl);

export default router;
