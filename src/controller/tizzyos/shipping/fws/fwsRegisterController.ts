import { Request, Response } from "express";
import Shipping from "../../../../models/tizzyos/shipping/fws/fwsRegistration";
import mongoose from "mongoose";
import { AuthRequest } from "../../../../middleware/tizzygo/authMiddleware";
import { bucket } from "../../../../firebase/firebase"; // upar wala file

/* =========================
   GENERATE SHIPPING ID
========================= */

const generateShippingId = (
  shippingType: string,
  city: string,
  state: string,
) => {
  const prefix = shippingType === "TRUCK" ? "TRK" : "RDR";

  const cityCode = city.replace(/\s+/g, "").substring(0, 3).toUpperCase();

  const stateCode = state.replace(/\s+/g, "").substring(0, 2).toUpperCase();

  const random = Math.floor(1000000000 + Math.random() * 9000000000);

  return `${prefix}-${cityCode}-${stateCode}-${random}`;
};

/* =========================
   FIREBASE UPLOAD HELPER
========================= */
const uploadToFirebase = async (file: string, filename: string) => {
  const buffer = Buffer.from(file, "base64");

  const fileRef = bucket.file(`shipping/${Date.now()}-${filename}`);

  await fileRef.save(buffer, {
    metadata: { contentType: "image/jpeg" },
    public: true,
  });

  return `https://storage.googleapis.com/${bucket.name}/${fileRef.name}`;
};

/* =========================
   SHIPPING REGISTER (PRIVATE)
========================= */
export const registerShipping = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const existing = await Shipping.findOne({
      userId,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Shipping profile already exists",
      });
    }

    const {
      name,
      shippingType,
      city,
      state,

      vehicleCategory,
      vehicleBrand,
      vehicleModel,
      vehicleNumber,
      vehicleImage,

      maxOrdersPerDay,

      kyc,

      agreedToTerms,
      agreedAt,
    } = req.body;

    if (!agreedToTerms || !agreedAt) {
      return res.status(400).json({
        success: false,
        message: "You must agree to terms",
      });
    }

    /* Upload Vehicle Image */

    let vehicleImageUrl = "";

    if (vehicleImage) {
      vehicleImageUrl = await uploadToFirebase(vehicleImage, "vehicle.jpg");
    }

    /* Upload KYC Images */

    const kycData: any = {
      ...kyc,
    };

    if (kyc?.drivingLicenseImage) {
      kycData.drivingLicenseImage = await uploadToFirebase(
        kyc.drivingLicenseImage,
        "driving-license.jpg",
      );
    }

    if (kyc?.identityImage) {
      kycData.identityImage = await uploadToFirebase(
        kyc.identityImage,
        "identity.jpg",
      );
    }

    /* Generate Unique ID */

    const shippingId = generateShippingId(shippingType, city, state);

    /* Save */

    const shipping = await Shipping.create({
      userId,

      shippingId,

      name,

      city,
      state,

      shippingType,

      vehicleCategory,
      vehicleBrand,
      vehicleModel,
      vehicleNumber,

      vehicleImage: vehicleImageUrl,

      maxOrdersPerDay: maxOrdersPerDay || 25,

      isAvailable: true,
      isOnline: false,

      orderStats: {
        assigned: 0,
        delivered: 0,
        remaining: 0,
      },

      kyc: kycData,

      status: "pending",

      agreedToTerms,
      agreedAt,
    });

    return res.status(201).json({
      success: true,
      message: "Shipping registration submitted successfully",

      shipping,
    });
  } catch (err: any) {
    console.error("REGISTER SHIPPING ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
  }
};

/* =========================
   ADMIN: GET PENDING RIDERS
========================= */
export const getPendingShipping = async (req: Request, res: Response) => {
  try {
    const riders = await Shipping.find({ status: "pending" });
    res.status(200).json(riders);
  } catch (err: any) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

/* =========================
   ADMIN: APPROVE / REJECT RIDER
========================= */
export const updateShippingStatus = async (req: Request, res: Response) => {
  try {
    const { riderId } = req.params;
    const { status } = req.body; // "approved" | "decline"

    if (!["approved", "decline"].includes(status)) {
      return res.status(400).json({ message: "Invalid status." });
    }

    const rider = await Shipping.findByIdAndUpdate(
      riderId,
      { status },
      { new: true },
    );

    if (!rider) {
      return res.status(404).json({ message: "Rider not found." });
    }

    res.status(200).json({ message: `Rider ${status} successfully.`, rider });
  } catch (err: any) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

/* =========================
   GET SHIPPING BY ID (PRIVATE)
========================= */
export const getMyShipping = async (req: Request, res: Response) => {
  try {
    console.log("=== GET MY SHIPPING API START ===");

    // Auth middleware se userId lelo
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - User not found",
      });
    }

    console.log("User ID:", userId);

    // Directly userId se search karo
    const shipping = await Shipping.findOne({ userId: userId }).lean();

    if (!shipping) {
      console.log("❌ Shipping not found for user:", userId);
      return res.status(404).json({
        success: false,
        message: "Shipping registration not found for this user",
      });
    }

    console.log("✅ Shipping found:", {
      id: shipping._id,
      shippingId: shipping.shippingId,
      name: shipping.name,
      status: shipping.status,
      kycStatus: shipping.kyc?.status,
    });

    // Status messages logic
    const formStatus = shipping.status;
    const kycStatus = shipping.kyc?.status;

    let infoMessage = "Shipping registration data fetched";

    const statusMessages = {
      pending: "Shipping form is under admin review",
      decline: "Shipping form was rejected by admin",
      approved_pending: "Shipping approved, KYC verification pending",
      approved_rejected: "KYC rejected, please re-upload documents",
      approved_verified: "Shipping fully verified and approved",
    };

    if (formStatus === "pending") {
      infoMessage = statusMessages.pending;
    } else if (formStatus === "decline") {
      infoMessage = statusMessages.decline;
    } else if (formStatus === "approved" && kycStatus === "pending") {
      infoMessage = statusMessages.approved_pending;
    } else if (formStatus === "approved" && kycStatus === "rejected") {
      infoMessage = statusMessages.approved_rejected;
    } else if (formStatus === "approved" && kycStatus === "verified") {
      infoMessage = statusMessages.approved_verified;
    }

    const isApproved = formStatus === "approved";
    const isKycVerified = kycStatus === "verified";

    const responseData = {
      success: true,
      message: infoMessage,
      status: {
        formStatus,
        kycStatus,
        isApproved,
        isKycVerified,
      },
      shipping: {
        _id: shipping._id,
        shippingId: shipping.shippingId,
        name: shipping.name,
        vehicleBrand: shipping.vehicleBrand,
        vehicleModel: shipping.vehicleModel,
        vehicleNumber: shipping.vehicleNumber,
        vehicleCategory: shipping.vehicleCategory,
        maxOrdersPerDay: shipping.maxOrdersPerDay,
        drivingLicenseNumber: shipping.kyc?.drivingLicenseNumber,
        identityType: shipping.kyc?.identityType,
        identityNumber: shipping.kyc?.identityNumber,
        vehicleImage: shipping.vehicleImage,
        drivingLicenseImage: shipping.kyc?.drivingLicenseImage,
        identityImage: shipping.kyc?.identityImage,
        status: shipping.status,
        createdAt: shipping.createdAt,
        updatedAt: shipping.updatedAt,
        userId: shipping.userId,
        isAvailable: shipping.isAvailable,
        isOnline: shipping.isOnline,
        city: shipping.city,
        state: shipping.state,
      },
    };

    console.log("=== GET MY SHIPPING API END ===");
    return res.status(200).json(responseData);
  } catch (err: any) {
    console.error("❌ GET SHIPPING ERROR:", {
      error: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString(),
    });

    return res.status(500).json({
      success: false,
      message: "Server error",
      error:
        process.env.NODE_ENV === "development"
          ? err.message
          : "Internal server error",
    });
  }
};

/* =========================
   CHECK SHIPPING FORM STATUS
   (PRIVATE API)
========================= */
export const checkShippingForm = async (req: AuthRequest, res: Response) => {
  try {
    console.log("🔍 [checkShippingForm] API called");
    console.log("📱 Request Method:", req.method);
    console.log("👤 User from token:", req.user);

    // ✅ Correctly extract user ID from token
    const userId = req.user?._id || req.user?.id;
    console.log("🆔 User ID from token:", userId);

    if (!userId) {
      console.log("❌ No user ID found in token");
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    console.log("🔍 Searching for shipping data with USER ID:", userId);

    // ❌ WRONG: Shipping.findById(riderId)
    // ✅ CORRECT: Find by riderId field
    const shipping = await Shipping.findOne({ riderId: userId }).lean();

    // ✅ Also check with userId field (different schema might use different name)
    if (!shipping) {
      console.log("⚠️ Trying alternative search with userId field...");
      const shippingAlt = await Shipping.findOne({ userId: userId }).lean();
      console.log(
        "📊 Alternative search result:",
        shippingAlt ? "FOUND" : "NOT FOUND",
      );

      if (shippingAlt) {
        console.log("✅ Found shipping data with userId field");
        return processShippingData(shippingAlt, res);
      }
    }

    console.log("📊 Shipping data found:", shipping ? "YES" : "NO");

    if (shipping) {
      console.log("📄 Shipping details:", {
        _id: shipping._id,
        name: shipping.name,
        status: shipping.status,
        kycStatus: shipping.kyc?.status,
        createdAt: shipping.createdAt,
      });
    }

    // ❌ Form not submitted
    if (!shipping) {
      console.log("📭 No shipping form found for this rider");
      return res.status(200).json({
        success: true,
        exists: false, // ✅ Frontend expects 'exists' not 'formSubmitted'
        message: "Shipping form not submitted yet",
      });
    }

    // ✅ Form exists
    return processShippingData(shipping, res);
  } catch (err: any) {
    console.error("❌ [checkShippingForm] ERROR:", {
      message: err.message,
      stack: err.stack,
      name: err.name,
    });

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

// ✅ Helper function to process shipping data
const processShippingData = (shipping: any, res: Response) => {
  const formStatus = shipping.status;
  const kycStatus = shipping.kyc?.status;

  console.log("📊 Status Analysis:", {
    formStatus,
    kycStatus,
  });

  let infoMessage = "Form submitted";
  let statusLevel = "info";

  if (formStatus === "pending") {
    infoMessage = "Form is under admin review";
    statusLevel = "warning";
    console.log("⏳ Form status: PENDING - Under admin review");
  }

  if (formStatus === "decline") {
    infoMessage = "Form rejected by admin";
    statusLevel = "error";
    console.log("❌ Form status: DECLINED - Rejected by admin");
  }

  if (formStatus === "approved" && kycStatus === "pending") {
    infoMessage = "Form approved, KYC pending";
    statusLevel = "success_warning";
    console.log("✅ Form APPROVED, but KYC PENDING");
  }

  if (formStatus === "approved" && kycStatus === "rejected") {
    infoMessage = "KYC rejected, re-upload required";
    statusLevel = "error";
    console.log("❌ Form APPROVED but KYC REJECTED");
  }

  if (formStatus === "approved" && kycStatus === "verified") {
    infoMessage = "Rider fully verified";
    statusLevel = "success";
    console.log("🎉 Form APPROVED and KYC VERIFIED - Fully verified rider");
  }

  console.log("📤 Sending response with status:", {
    exists: true,
    message: infoMessage,
    formStatus,
    kycStatus,
  });

  // ✅ Return format that matches frontend expectations
  return res.status(200).json({
    success: true,
    exists: true, // ✅ Frontend expects 'exists'
    shippingData: {
      // ✅ Frontend expects 'shippingData' object
      _id: shipping._id,
      status: shipping.status,
      name: shipping.name,
      vehicleBrand: shipping.vehicleBrand,
      vehicleModel: shipping.vehicleModel,
      vehicleNumber: shipping.vehicleNumber,
      vehicleCategory: shipping.vehicleCategory,
      createdAt: shipping.createdAt,
      updatedAt: shipping.updatedAt,
      maxOrdersPerDay: shipping.maxOrdersPerDay,
      // Include KYC info if needed
      kyc: shipping.kyc,
    },
    message: infoMessage,
    statusLevel: statusLevel,
    // Optional: Keep these for backward compatibility
    formSubmitted: true,
    status: {
      formStatus,
      kycStatus,
      isApproved: formStatus === "approved",
      isKycVerified: kycStatus === "verified",
    },
  });
};

/* =========================
   GET ALL APPROVED RIDERS
   (RANDOM ORDER)
========================= */
export const getApprovedShippingPartners = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const partners = await Shipping.aggregate([
      {
        $match: {
          status: "approved",
          isAvailable: true,
          shippingType: {
            $in: ["RIDER", "TRUCK"],
          },
        },
      },
      {
        $addFields: {
          randomSort: { $rand: {} },
        },
      },
      {
        $sort: {
          randomSort: 1,
        },
      },
      {
        $project: {
          randomSort: 0,
        },
      },
    ]);
    console.log("partners:", partners);
    return res.status(200).json({
      success: true,
      count: partners.length,
      partners,
    });
  } catch (err: any) {
    console.error("GET APPROVED SHIPPING PARTNERS ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

/* =========================
   RIDER ONLINE / OFFLINE
   (BUTTON BASED)
========================= */
export const setRiderOnlineOffline = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const userId = req.user?.id;
    const { status } = req.body; // "online" | "offline"

    // 🔐 Auth check
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (status !== "online" && status !== "offline") {
      return res.status(400).json({
        success: false,
        message: "Status must be online or offline",
      });
    }

    const updateData =
      status === "online"
        ? {
            isOnline: true,
            lastOnlineAt: new Date(),
          }
        : {
            isOnline: false,
            lastOfflineAt: new Date(),
          };

    const rider = await Shipping.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(userId) },
      { $set: updateData },
      { new: true },
    );

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider not found",
      });
    }

    return res.status(200).json({
      success: true,
      message:
        status === "online" ? "Rider is ONLINE now" : "Rider is OFFLINE now",
      data: {
        isOnline: rider.isOnline,
        lastOnlineAt: rider.lastOnlineAt,
        lastOfflineAt: rider.lastOfflineAt,
      },
    });
  } catch (err: any) {
    console.error("ONLINE/OFFLINE ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};
