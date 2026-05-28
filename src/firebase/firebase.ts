// backend/controllers/upload.ts
import { Request, Response } from "express";
import admin from "firebase-admin";
import path from "path";

// 🔥 Step 1: Service account path
const serviceAccountPath = path.resolve(__dirname, "../config/tizzygo/serviceAccount.json");

// 🔥 Step 2: Initialize Firebase only once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath),
    storageBucket: "tizzygo-os.firebasestorage.app", // ✅ Correct bucket name
  });
}

// 🔥 Step 3: Get bucket
const bucket = admin.storage().bucket();

// 🔥 Step 4: Controller to generate signed upload URL
export const getUploadUrl = async (req: Request, res: Response) => {
  try {
    const { fileName, fileType } = req.body;
    if (!fileName || !fileType)
      return res.status(400).json({ error: "fileName and fileType required" });

    const file = bucket.file(`TizzyGo-OS/Products/${Date.now()}-${path.basename(fileName)}`);

    // Signed URL with write permission
    const [uploadUrl] = await file.getSignedUrl({
      action: "write",
      expires: Date.now() + 10 * 60 * 1000, // 10 minutes
      contentType: fileType,
    });

    res.json({ uploadUrl, filePath: file.name });
  } catch (err) {
    console.error("Error generating upload URL:", err);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
};

// 🔥 Step 5: Export bucket if needed elsewhere
export { bucket };
