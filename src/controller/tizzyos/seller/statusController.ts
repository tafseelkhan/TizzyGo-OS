import { Request, Response } from "express";
import SellerApplication from "../../../models/tizzyos/seller/SellerApplication";
import { isErrorWithMessage } from "../../../utils/tizzyos/seller/errorUtils";

// ✅ Type define karo lean document ke liye
interface LeanSellerApplication {
  _id: any;
  userId: string;
  status: "pending" | "approved" | "rejected" | "none";
  uniqOsId?: string;
  rejectionReason?: string;
  pendingDetails?: {
    reason: string;
    durationInDays: number;
  };
  createdAt: Date;
  // Other fields jo tumhare model mein hain
  address?: any;
  business?: any;
  fullName?: string;
  email?: string;
  phone?: string;
  documents?: any[];
  optionalDocs?: any[];
  __v: number;
}

export const getSellerApplicationStatus = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    console.log("🔐 Logged-in user ID:", userId);

    // ✅ Get latest seller application for logged-in user
    const application = await SellerApplication.findOne({ userId })
      .sort({ createdAt: -1 })
      .lean() as LeanSellerApplication;  // ✅ TYPE ASSERTION ADD KARO

    if (!application) {
      console.log("📭 No application found for user:", userId);
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    // 🔍 COMPLETE DATABASE DOCUMENT LOG
    console.log("📋 COMPLETE APPLICATION DOCUMENT FROM DB:");
    console.log(JSON.stringify(application, null, 2));
    
    console.log("🔍 INDIVIDUAL FIELD CHECK:");
    console.log("📝 application.status:", application.status);
    console.log("🆔 application.uniqOsId:", application.uniqOsId);
    console.log("❌ application.rejectionReason:", application.rejectionReason);
    console.log("⏳ application.pendingDetails:", application.pendingDetails);
    
    if (application.pendingDetails) {
      console.log("📋 pendingDetails.reason:", application.pendingDetails.reason);
      console.log("⏰ pendingDetails.durationInDays:", application.pendingDetails.durationInDays);
    }

    console.log("✅ Seller application found:", {
      id: application._id,
      status: application.status,
    });

    // ✅ Build structured response for frontend
    const responseData = {
      status: application.status,
      uniqOsId: application.uniqOsId || null,
      rejectionReason: application.rejectionReason || null,
      pendingDetails: application.pendingDetails
        ? {
            reason: application.pendingDetails.reason || null,
            durationInDays: application.pendingDetails.durationInDays || null,
          }
        : null,
      createdAt: application.createdAt,
    };

    // 🔍 FINAL RESPONSE DATA LOG
    console.log("🚀 FINAL RESPONSE DATA BEING SENT TO FRONTEND:");
    console.log(JSON.stringify(responseData, null, 2));

    return res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error("❌ Error fetching seller application status:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: isErrorWithMessage(error) ? error.message : undefined,
    });
  }
};