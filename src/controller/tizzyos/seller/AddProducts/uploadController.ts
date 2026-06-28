import { Request, Response } from "express";
import mongoose from "mongoose";
import { bucket } from "../../../../firebase/firebase";
import { MediaUploadTracker } from "../../../../models/tizzyos/seller/AddProducts/MediaUploadTracker";
import { logger } from "../../../../utils/tizzyos/seller/logger";

/**
 * POST /api/upload/get-upload-url
 * Body: { fileName: string, fileType: string }
 * Returns: { uploadUrl, filePath }
 */
export const getUploadUrl = async (req: Request, res: Response) => {
  try {
    const { fileName, fileType } = req.body;

    logger.info("📥 Upload URL request:", { fileName, fileType });

    if (!fileName || !fileType) {
      return res.status(400).json({
        success: false,
        message: "fileName & fileType required",
      });
    }

    // Validate file type
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/webm",
    ];
    if (!allowedTypes.includes(fileType)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid file type. Allowed: images (jpeg, png, webp) and videos (mp4, webm)",
      });
    }

    const file = bucket.file(fileName);

    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

    const [uploadUrl] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: expiresAt,
      contentType: fileType,
    });

    // Generate public URL
    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
      fileName,
    )}?alt=media`;

    // Create tracker entry
    const tracker = await MediaUploadTracker.create({
      fileUrl: publicUrl,
      filePath: fileName,
      uploadedBy: req.user?.id || new mongoose.Types.ObjectId(), // Assuming user is authenticated
      status: "PENDING",
      createdAt: new Date(),
      lastCheckedAt: new Date(),
      usedInProduct: false,
      deleted: false,
      checkedCount: 0,
    });

    logger.info(
      `📝 Media tracker created: ${tracker._id} for file: ${fileName}`,
    );

    return res.json({
      uploadUrl,
      filePath: publicUrl, // 🔥 frontend ko yahi chahiye
      trackerId: tracker._id,
    });
  } catch (error) {
    logger.error("❌ getUploadUrl error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate upload URL",
    });
  }
};
