import { Request, Response } from "express";
import { generateUniqOsId } from "../../../utils/tizzyos/seller/uniqosGenerator";

export const generateUniqOsIdAPI = async (req: Request, res: Response) => {
  console.log("🚀 generateUniqOsId route hit");

  try {
    const uniqOsId = await generateUniqOsId(); // ✅ Await in case it's async
    console.log("🧾 Generated ID:", uniqOsId);

    // ✅ Standard API response with "success" flag and "uniqOsId"
    return res.status(200).json({
      success: true,
      uniqOsId,
    });
  } catch (err) {
    console.error("❌ Error generating ID:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to generate UniqOS ID",
    });
  }
};
