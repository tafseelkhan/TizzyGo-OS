import { Request, Response } from "express";
import { bucket } from "../../../../firebase/firebase";

/**
 * POST /api/upload/get-upload-url
 * Body: { fileName: string, fileType: string }
 * Returns: { uploadUrl, filePath }
 */
export const getUploadUrl = async (req: Request, res: Response) => {
  try {
    const { fileName, fileType } = req.body;

    console.log("📥 Upload URL request:", req.body);

    if (!fileName || !fileType) {
      return res.status(400).json({
        success: false,
        message: "fileName & fileType required",
      });
    }

    // 🔥 IMPORTANT: fileName already includes "Products/..."
    const file = bucket.file(fileName);

    const expiresAt = Date.now() + 15 * 60 * 1000;

    const [uploadUrl] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: expiresAt,
      contentType: fileType,
    });

    // ✅ PUBLIC URL (THIS WAS MISSING / WRONG)
    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
      fileName
    )}?alt=media`;

    console.log("✅ Upload URL generated");
    console.log("🔗 Public URL:", publicUrl);

    return res.json({
      uploadUrl,
      filePath: publicUrl, // 🔥 frontend ko yahi chahiye
    });
  } catch (error) {
    console.error("❌ getUploadUrl error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate upload URL",
    });
  }
};