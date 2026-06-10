import { Request, Response } from "express";
import Shipping from "../../../models/tizzyos/shipping/fws/register";
import mongoose from "mongoose";
import { AuthRequest } from "../../../../middleware/tizzygo/authMiddleware";
import { bucket } from "../../../../firebase/firebase"; // upar wala file

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
    const userId = req.user?.id; // 🔐 token se userId

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const {
      name,
      vehicleCategory,
      vehicleBrand,
      vehicleModel,
      vehicleNumber,
      vehicleImage, // base64
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

    /* 🚗 Upload vehicle image */
    const vehicleImageUrl = vehicleImage
      ? await uploadToFirebase(vehicleImage, "vehicle.jpg")
      : "";

    /* 🪪 Upload KYC images */
    const kycData: any = { ...kyc };

    if (kyc?.drivingLicenseImage) {
      kycData.drivingLicenseImage = await uploadToFirebase(
        kyc.drivingLicenseImage,
        "driving_license.jpg"
      );
    }

    if (kyc?.identityImage) {
      kycData.identityImage = await uploadToFirebase(
        kyc.identityImage,
        "identity.jpg"
      );
    }

    /* ✅ Save shipping form */
    const shipping = await Shipping.create({
      userId: new mongoose.Types.ObjectId(userId), // 🔥 ObjectId format
      name,
      vehicleCategory,
      vehicleBrand,
      vehicleModel,
      vehicleNumber,
      vehicleImage: vehicleImageUrl,
      maxOrdersPerDay: maxOrdersPerDay || 25,
      isAvailable: true,
      isOnline: false,
      kyc: kycData,
      status: "pending",
      agreedToTerms,
      agreedAt,
    });

    return res.status(201).json({
      success: true,
      message: "Shipping form submitted successfully",
      shipping,
    });
  } catch (err: any) {
    console.error("REGISTER SHIPPING ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
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
      { new: true }
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

export const getShippingById = async (req: Request, res: Response) => {
  try {
    console.log('=== GET SHIPPING BY ID API START ===');
    console.log('Received params:', req.params);
    
    // FIX: Use correct parameter name (riderId or shippingId)
    const { shippingId } = req.params; // Changed from riderId to shippingId
    console.log('Shipping ID received:', shippingId);
    
    if (!shippingId) {
      console.log('❌ No shippingId found in params');
      return res.status(400).json({
        success: false,
        message: "Shipping ID is required",
      });
    }

    // 1️⃣ Validate ObjectId
    console.log('🔍 Step 1: Validating ObjectId...');
    if (!mongoose.Types.ObjectId.isValid(shippingId)) {
      console.log('❌ Invalid ObjectId:', shippingId);
      return res.status(400).json({
        success: false,
        message: "Invalid shipping id",
      });
    }
    console.log('✅ ObjectId is valid');

    // 2️⃣ Find shipping
    console.log('🔍 Step 2: Finding shipping in database...');
    const shipping = await Shipping.findById(shippingId).lean();
    
    if (!shipping) {
      console.log('❌ Shipping not found with ID:', shippingId);
      return res.status(404).json({
        success: false,
        message: "Shipping registration not found",
      });
    }
    console.log('✅ Shipping found:', {
      id: shipping._id,
      name: shipping.name,
      status: shipping.status,
      kycStatus: shipping.kyc?.status
    });

    // 3️⃣ Extract statuses
    console.log('🔍 Step 3: Extracting statuses...');
    const formStatus = shipping.status; // pending | approved | decline
    const kycStatus = shipping.kyc?.status; // pending | verified | rejected
    console.log('Form Status:', formStatus);
    console.log('KYC Status:', kycStatus);

    // 4️⃣ Status-based response
    console.log('🔍 Step 4: Determining info message based on status...');
    let infoMessage = "Shipping registration data fetched";
    
    // Status combinations and messages
    const statusMessages = {
      'pending': "Shipping form is under admin review",
      'decline': "Shipping form was rejected by admin",
      'approved_pending': "Shipping approved, KYC verification pending",
      'approved_rejected': "KYC rejected, please re-upload documents",
      'approved_verified': "Shipping fully verified and approved"
    };

    if (formStatus === "pending") {
      infoMessage = statusMessages.pending;
      console.log('📝 Status: Form pending -', infoMessage);
    } else if (formStatus === "decline") {
      infoMessage = statusMessages.decline;
      console.log('📝 Status: Form declined -', infoMessage);
    } else if (formStatus === "approved" && kycStatus === "pending") {
      infoMessage = statusMessages.approved_pending;
      console.log('📝 Status: Approved, KYC pending -', infoMessage);
    } else if (formStatus === "approved" && kycStatus === "rejected") {
      infoMessage = statusMessages.approved_rejected;
      console.log('📝 Status: Approved, KYC rejected -', infoMessage);
    } else if (formStatus === "approved" && kycStatus === "verified") {
      infoMessage = statusMessages.approved_verified;
      console.log('📝 Status: Approved, KYC verified -', infoMessage);
    } else {
      console.log('📝 Status: Default case -', infoMessage);
    }

    // 5️⃣ Calculate flags
    console.log('🔍 Step 5: Calculating status flags...');
    const isApproved = formStatus === "approved";
    const isKycVerified = kycStatus === "verified";
    console.log('Is Approved:', isApproved);
    console.log('Is KYC Verified:', isKycVerified);

    // 6️⃣ Prepare response data
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
      }
    };

    console.log('📊 Response data prepared:', {
      success: responseData.success,
      message: responseData.message,
      status: responseData.status
    });

    console.log('=== GET SHIPPING BY ID API END ===');

    // 7️⃣ Final response
    return res.status(200).json(responseData);

  } catch (err: any) {
    console.error("❌ GET SHIPPING ERROR:", {
      error: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString()
    });
    
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    });
  }
};

/* =========================
   CHECK SHIPPING FORM STATUS
   (PRIVATE API)
========================= */
export const checkShippingForm = async (req: AuthRequest, res: Response) => {
  try {
    console.log('🔍 [checkShippingForm] API called');
    console.log('📱 Request Method:', req.method);
    console.log('👤 User from token:', req.user);
    
    // ✅ Correctly extract user ID from token
    const userId = req.user?._id || req.user?.id;
    console.log('🆔 User ID from token:', userId);

    if (!userId) {
      console.log('❌ No user ID found in token');
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    console.log('🔍 Searching for shipping data with USER ID:', userId);
    
    // ❌ WRONG: Shipping.findById(riderId) 
    // ✅ CORRECT: Find by riderId field
    const shipping = await Shipping.findOne({ riderId: userId }).lean();
    
    // ✅ Also check with userId field (different schema might use different name)
    if (!shipping) {
      console.log('⚠️ Trying alternative search with userId field...');
      const shippingAlt = await Shipping.findOne({ userId: userId }).lean();
      console.log('📊 Alternative search result:', shippingAlt ? 'FOUND' : 'NOT FOUND');
      
      if (shippingAlt) {
        console.log('✅ Found shipping data with userId field');
        return processShippingData(shippingAlt, res);
      }
    }
    
    console.log('📊 Shipping data found:', shipping ? 'YES' : 'NO');
    
    if (shipping) {
      console.log('📄 Shipping details:', {
        _id: shipping._id,
        name: shipping.name,
        status: shipping.status,
        kycStatus: shipping.kyc?.status,
        createdAt: shipping.createdAt,
      });
    }

    // ❌ Form not submitted
    if (!shipping) {
      console.log('📭 No shipping form found for this rider');
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
  
  console.log('📊 Status Analysis:', {
    formStatus,
    kycStatus,
  });

  let infoMessage = "Form submitted";
  let statusLevel = "info";

  if (formStatus === "pending") {
    infoMessage = "Form is under admin review";
    statusLevel = "warning";
    console.log('⏳ Form status: PENDING - Under admin review');
  }

  if (formStatus === "decline") {
    infoMessage = "Form rejected by admin";
    statusLevel = "error";
    console.log('❌ Form status: DECLINED - Rejected by admin');
  }

  if (formStatus === "approved" && kycStatus === "pending") {
    infoMessage = "Form approved, KYC pending";
    statusLevel = "success_warning";
    console.log('✅ Form APPROVED, but KYC PENDING');
  }

  if (formStatus === "approved" && kycStatus === "rejected") {
    infoMessage = "KYC rejected, re-upload required";
    statusLevel = "error";
    console.log('❌ Form APPROVED but KYC REJECTED');
  }

  if (formStatus === "approved" && kycStatus === "verified") {
    infoMessage = "Rider fully verified";
    statusLevel = "success";
    console.log('🎉 Form APPROVED and KYC VERIFIED - Fully verified rider');
  }

  console.log('📤 Sending response with status:', {
    exists: true,
    message: infoMessage,
    formStatus,
    kycStatus,
  });

  // ✅ Return format that matches frontend expectations
  return res.status(200).json({
    success: true,
    exists: true, // ✅ Frontend expects 'exists'
    shippingData: { // ✅ Frontend expects 'shippingData' object
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
export const getApprovedShippingRiders = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const riders = await Shipping.aggregate([
      {
        $match: {
          status: "approved",
          isAvailable: true,
        },
      },
      {
        $addFields: {
          randomSort: { $rand: {} }, // 🎲 random shuffle
        },
      },
      {
        $sort: { randomSort: 1 }, // 🔀 random order
        // NOTE: no $project => full document goes to frontend
      },
      {
        $project: {
          randomSort: 0, // internal field remove
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      count: riders.length,
      riders, // 🔥 FULL rider data
    });
  } catch (err: any) {
    console.error("GET APPROVED RIDERS ERROR:", err);
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
  res: Response
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
      { new: true }
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
        status === "online"
          ? "Rider is ONLINE now"
          : "Rider is OFFLINE now",
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