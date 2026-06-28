import { Request, Response } from "express";
import SellerApplication from "../../../models/tizzyos/seller/SellerApplication";

export const submitApplication = async (req: Request, res: Response) => {
  try {
    const files = req.files as {
      [fieldname: string]: Express.Multer.File[];
    };

    const {
      fullName,
      email,
      phone,
      address,
      pincode,
      shopName,
      category,
      gstNumber,
    } = req.body;

    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    if (
      !fullName ||
      !email ||
      !phone ||
      !address ||
      !pincode ||
      !shopName ||
      !category
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const existingApplication = await SellerApplication.findOne({
      userId,
    });

    if (existingApplication) {
      return res.status(400).json({
        success: false,
        message: "Seller application already submitted",
      });
    }

    const documents: {
      type: string;
      url: string;
    }[] = [];

    const pushDoc = (type: string, fileKey: string) => {
      if (files?.[fileKey]?.[0]) {
        documents.push({
          type,
          url: files[fileKey][0].path,
        });
      }
    };

    pushDoc("aadhaarFront", "aadhaarFront");
    pushDoc("aadhaarBack", "aadhaarBack");
    pushDoc("panFront", "panFront");
    pushDoc("panBack", "panBack");
    pushDoc("selfie", "selfieWithDoc");
    pushDoc("gst", "gstCertificate");

    const application = await SellerApplication.create({
      userId,

      fullName,
      email,
      phone,

      address,
      pincode,

      shopName,
      category,
      gstNumber,

      documents,

      status: "pending",
    });

    return res.status(201).json({
      success: true,
      message: "Seller application submitted successfully",
      applicationId: application._id,
      status: application.status,
    });
  } catch (error: any) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to submit seller application",
      error: error.message,
    });
  }
};

export const getSellerStatus = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const seller = await SellerApplication.findOne({
      userId,
    });

    if (!seller) {
      return res.status(200).json({
        success: true,
        status: "none",
      });
    }

    return res.status(200).json({
      success: true,
      status: seller.status,
      uniqOsId: seller.uniqOsId || null,
      approvedAt: seller.approvedAt || null,
      rejectionReason: seller.rejectionReason || null,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to get seller status",
    });
  }
};

export const checkFormStatus = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    const existingApplication = await SellerApplication.findOne({
      userId,
    });

    if (!existingApplication) {
      return res.status(200).json({
        success: true,
        canSubmit: true,
        status: "none",
      });
    }

    return res.status(200).json({
      success: true,
      canSubmit: false,
      status: existingApplication.status,
      uniqOsId: existingApplication.uniqOsId || null,
    });
  } catch (error: any) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to check form status",
      error: error.message,
    });
  }
};
