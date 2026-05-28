import { Request, Response } from "express";
import SellerApplication from "../../../models/tizzyos/seller/SellerApplication";

export const submitApplication = async (req: Request, res: Response) => {
  console.log("🔥 [API HIT] Seller Application Submit API triggered!");
  console.log("📩 Raw Body Received:", req.body);
  console.log("📂 Raw Files Received:", req.files);

  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const {
      fullName,
      email,
      phone,
      fullAddress,
      city,
      state,
      country,
      pincode,
      shopName,
      gstNumber,
      category,
    } = req.body;

    console.log("🧾 Extracted Form Fields:", {
      fullName,
      email,
      phone,
      fullAddress,
      city,
      state,
      country,
      pincode,
      shopName,
      gstNumber,
      category,
    });

    // ✅ Validation
    if (
      !fullName ||
      !email ||
      !phone ||
      !city ||
      !state ||
      !country ||
      !pincode ||
      !shopName ||
      !fullAddress
    ) {
      console.warn("⚠️ Missing required fields in application!");
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // ✅ Auth user check
    const userId = req.user?.id;
    console.log("👤 Authenticated userId:", userId);

    if (!userId) {
      console.warn("🚫 Unauthorized access attempt detected!");
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    // 🧩 Preparing document structure
    const documents: {
      type: string;
      pages: { url: string; side?: "front" | "back" }[];
    }[] = [];

    const pushDoc = (
      type: string,
      fileKey: string,
      side?: "front" | "back"
    ) => {
      if (files[fileKey]?.[0]) {
        const filePath = files[fileKey][0].path;
        console.log(`📸 Added Document: ${type} (${fileKey}) →`, filePath);
        documents.push({
          type,
          pages: [{ url: filePath, side }],
        });
      } else {
        console.log(`🕳️ No file found for: ${fileKey}`);
      }
    };

    // 📎 Collect all possible docs
    pushDoc("aadhaar", "aadhaarFront", "front");
    pushDoc("aadhaar", "aadhaarBack", "back");
    pushDoc("pan", "panFront", "front");
    pushDoc("pan", "panBack", "back");
    pushDoc("selfie", "selfieWithDoc");
    pushDoc("gst", "gstCertificate");

    console.log("📄 Final Documents Array:", documents);

    // ⚙️ Optional Docs
    const optionalDocs: { name: string; url: string }[] = [];
    if (files["businessDocument"]?.[0]) {
      optionalDocs.push({
        name: "Business Document",
        url: files["businessDocument"][0].path,
      });
    }

    console.log("📎 Optional Docs:", optionalDocs);

    // 🏗️ Create new seller application
    const application = new SellerApplication({
      userId,
      modelType: "seller",
      fullName,
      email,
      phone,
      address: {
        full: fullAddress,
        city,
        state,
        country,
        pincode,
      },
      documents,
      business: {
        name: shopName,
        gst: gstNumber,
        category,
      },
      optionalDocs,
      status: "pending",
      createdAt: new Date(),
    });

    console.log("💾 Attempting to save new SellerApplication...");
    await application.save();

    console.log("✅ Application saved successfully:", application._id);

    return res.status(201).json({
      success: true,
      message: "Seller application submitted successfully.",
      status: application.status,
    });
  } catch (error: any) {
    console.error("❌ Submit error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to submit seller application",
      error: error.message,
    });
  }
};

// ✅ Get Seller Status by userId
export const getSellerStatus = async (req: Request, res: Response) => {
  const { userId } = req.params;

  try {
    const latest = await SellerApplication.findOne({
      userId,
      modelType: "seller",
    }).sort({ createdAt: -1 });
    if (!latest) {
      return res.status(200).json({ status: "none" });
    }

    return res
      .status(200)
      .json({ status: latest.status, uniqOsId: latest.uniqOsId || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error" });
  }
};

// ✅ Check if user already submitted application
export const checkFormStatus = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    console.log("🔍 [CHECK FORM STATUS] userId:", userId);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    // 🔎 Find latest application by user
    const existingApp = await SellerApplication.findOne({
      userId,
      modelType: "seller",
    }).sort({ createdAt: -1 });

    // ✅ If no application found
    if (!existingApp) {
      return res.status(200).json({
        success: true,
        canSubmit: true,
        status: "none",
        message: "User has not submitted any seller application yet.",
      });
    }

    // ✅ If found and still pending or approved/rejected — user can't submit again
    return res.status(200).json({
      success: true,
      canSubmit: false,
      status: existingApp.status,
      message: `User already submitted a seller application. Current status: ${existingApp.status}`,
    });
  } catch (error: any) {
    console.error("❌ Error checking form status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to check seller form status",
      error: error.message,
    });
  }
};