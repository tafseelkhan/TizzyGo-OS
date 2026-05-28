import { Request, Response } from "express";
import { Model } from "mongoose";
import ProductRequest from "../../../models/tizzyos/seller/request/ProductRequest";

// ✅ Import product models
import Products from "../../../models/tizzyos/seller/AddProducts/Products"; // single model now

// ======================= CREATE REQUEST =======================
export const createProtectionRequest = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const { productId, category } = req.body;
    if (!productId || !category) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // ✅ Fetch product from DB
    const product = await Products.findById(productId).lean();
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // ✅ Save new request
    const newRequest = await ProductRequest.create({
      productId,
      userId,
      productData: product,
      status: "pending",
    });

    res.status(201).json({ success: true, data: newRequest });
  } catch (error: any) {
    console.error("Error creating product request:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================= GET ALL REQUESTS =======================
export const getProtectionRequests = async (req: Request, res: Response) => {
  try {
    const requests = await ProductRequest.find().sort({ createdAt: -1 }).lean();
    res.status(200).json({
      success: true,
      count: requests.length,
      data: requests,
    });
  } catch (error: any) {
    console.error("Error fetching product requests:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================= ✅ GET: Check if request already exists for this product & user ========================
export const checkUserRequest = async (req: Request, res: Response) => {
  try {
    const { productId } = req.query;
    const userId = req.user?.id;

    if (!userId || !productId) {
      return res.status(400).json({ message: "Missing userId or productId" });
    }

    const request = await ProductRequest.findOne({ productId, userId });

    if (!request) {
      return res.json({ exists: false });
    }

    res.json({
      exists: true,
      status: request.status,
      rejectReason: request.rejectReason || null,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================= APPROVE REQUEST =======================
export const approveProtectionRequest = async (req: Request, res: Response) => {
  try {
    const { fields } = req.body; // frontend se array of {label, value} aa raha hai

    const request = await ProductRequest.findByIdAndUpdate(
      req.params.id,
      {
        status: "approved",
        customFields: fields || [],   // yaha label + value save hoga
        rejectReason: null,
      },
      { new: true }
    );

    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    res.json({ success: true, data: request });
  } catch (err: any) {
    console.error("Error approving request:", err);
    res.status(500).json({ error: "Failed to approve request" });
  }
};

// ======================= REJECT REQUEST =======================
export const rejectProtectionRequest = async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;

    const request = await ProductRequest.findByIdAndUpdate(
      req.params.id,
      { status: "rejected", rejectReason: reason },
      { new: true }
    );

    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    res.json({ success: true, data: request });
  } catch (err: any) {
    console.error("Error rejecting request:", err);
    res.status(500).json({ error: "Failed to reject request" });
  }
};
