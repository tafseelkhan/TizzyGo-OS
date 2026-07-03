// backend/controllers/upload.ts

import { Request, Response } from "express";
import path from "path";

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

// 🔥 Step 1: Service account path
const serviceAccountPath = path.resolve(
  __dirname,
  "../config/tizzygo/serviceAccount.json",
);

// 🔥 Step 2: Initialize Firebase only once
if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccountPath),
    storageBucket: "tizzygo-os.firebasestorage.app",
  });
}

// 🔥 Step 3: Get bucket
const bucket = getStorage().bucket();

// 🔥 Step 4: Controller to generate signed upload URL
export const getUploadUrl = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { fileName, fileType } = req.body;

    if (!fileName || !fileType) {
      res.status(400).json({
        error: "fileName and fileType required",
      });
      return;
    }

    const file = bucket.file(
      `TizzyGo-OS/Products/${Date.now()}-${path.basename(fileName)}`,
    );

    // Signed URL with write permission
    const [uploadUrl] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 10 * 60 * 1000, // 10 minutes
      contentType: fileType,
    });

    res.json({
      uploadUrl,
      filePath: file.name,
    });
  } catch (error) {
    console.error("Error generating upload URL:", error);

    res.status(500).json({
      error: "Failed to generate upload URL",
    });
  }
};

// 🔥 Step 5: Export bucket
export { bucket };
