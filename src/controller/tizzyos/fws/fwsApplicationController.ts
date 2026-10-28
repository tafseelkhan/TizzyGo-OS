import { Request, Response } from "express";
import mongoose from "mongoose";

import FWSWareHouse from "../../../models/tizzyos/fws/fwsWareHouse";

import { getQutonConnectModels } from "../../../config/tizzygo/qutonConnectDatabase";

/**
 * Derive a full name from the Quton Connect user fields.
 */
function getFullName(user: {
  firstName?: string | null;
  lastName?: string | null;
}): string {
  return [user.firstName, user.lastName]
    .filter((part): part is string => Boolean(part))
    .join(" ");
}

// ✅ FWS Code Generator function
const generateFWSCodeWithTimestamp = async (
  city: string,
  state: string,
  pincode: string,
): Promise<string> => {
  const cityCode = city.substring(0, 3).toUpperCase();
  const stateCode = state.substring(0, 2).toUpperCase();

  // Get last 6 digits of timestamp
  const timestamp = Date.now().toString().slice(-6);

  // Count for sequence (better to count with city filter)
  const count = await FWSWareHouse.countDocuments({
    city: { $regex: new RegExp(`^${city}$`, "i") },
  });

  const sequence = String(count + 1).padStart(3, "0");

  // FWS-UDZ-081-RJ-89102901-123456 (format as per requirement)
  const fwsCode = `FWS-${cityCode}-${sequence}-${stateCode}-${pincode}-${timestamp}`;

  return fwsCode;
};

// ✅ 1. Create New Warehouse
export const createWarehouse = async (req: Request, res: Response) => {
  try {
    const {
      userId,
      name,
      city,
      state,
      pincode,
      address,
      latitude,
      longitude,
      phone,
      email,
      managerName,
      managerPhone,
      fwsType = "LOCAL",
      coverageKm = 50,
      maxDailyOrders = 0,
    } = req.body;

    // Validation
    if (
      !userId ||
      !name ||
      !city ||
      !state ||
      !pincode ||
      !address ||
      !latitude ||
      !longitude
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: userId, name, city, state, pincode, address, latitude, longitude",
      });
    }

    // Check if user exists (Quton Connect connection)
    const { User } = getQutonConnectModels();
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Check if user already has a warehouse
    const existingWarehouse = await FWSWareHouse.findOne({ userId });
    if (existingWarehouse) {
      return res.status(400).json({
        success: false,
        message: "User already has a warehouse registered",
      });
    }

    // Generate FWS Code
    const fwsCode = await generateFWSCodeWithTimestamp(city, state, pincode);

    // TODO(quton-migration): Quton User has no `email` field.
    // Decide the warehouse fallback email source:
    //  - `user.connectAddress` (identity, not guaranteed deliverable)
    //  - "" (preserve key, empty value)
    //  - require `email` from request body for warehouses
    // Currently using "" so no invented data is stored and the field
    // stays a string. Awaiting decision.
    const fallbackEmail = "";

    // `managerName` fallback: derive from Quton firstName + lastName.
    const fallbackManagerName = getFullName(user);

    // Create warehouse
    const warehouse = new FWSWareHouse({
      userId,
      fwsCode,
      name,
      city,
      state,
      pincode,
      address,
      latitude,
      longitude,
      phone: phone || user.phone,
      email: email || fallbackEmail,
      managerName: managerName || fallbackManagerName,
      managerPhone: managerPhone || user.phone,
      fwsType,
      coverageKm,
      maxDailyOrders,
      approvalStatus: "PENDING",
    });
    await warehouse.save();

    res.status(201).json({
      success: true,
      message: "Warehouse created successfully, waiting for admin approval",
      data: warehouse,
    });
  } catch (error: any) {
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Duplicate entry detected. Please try again.",
      });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ 2. CHECK API - Check if user has submitted form or not
export const checkWarehouseStatus = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "UserId is required",
      });
    }

    const { User } = getQutonConnectModels();
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // TODO(quton-migration): `.populate("userId", ...)` CANNOT cross
    // connections (FWSWareHouse = default connection, User = Quton).
    // Also: Quton User has no `name`, `email`, or `profileImage`
    // (it has `profilePhoto`). This populate will return `null` or
    // throw MissingSchemaError at runtime. Pending: manual join OR
    // drop populate. Awaiting decision.
    const warehouse = await FWSWareHouse.findOne({ userId }).populate(
      "userId",
      "name email phone profileImage",
    );

    if (!warehouse) {
      const response = {
        success: true,
        hasSubmitted: false,
        message: "No warehouse form found. Please submit the form.",
        data: null,
      };
      return res.status(200).json(response);
    }

    const responseData = {
      success: true,
      hasSubmitted: true,
      message: "Warehouse form already submitted",
      data: {
        warehouseId: warehouse._id,
        fwsCode: warehouse.fwsCode,
        name: warehouse.name,
        city: warehouse.city,
        state: warehouse.state,
        approvalStatus: warehouse.approvalStatus,
        status: warehouse.status,
        rejectionReason: warehouse.rejectionReason,
        createdAt: warehouse.createdAt,
        approvedAt: warehouse.approvedAt,
        user: warehouse.userId,
        formData: {
          name: warehouse.name,
          city: warehouse.city,
          state: warehouse.state,
          pincode: warehouse.pincode,
          address: warehouse.address,
          phone: warehouse.phone,
          email: warehouse.email,
          managerName: warehouse.managerName,
          managerPhone: warehouse.managerPhone,
          fwsType: warehouse.fwsType,
        },
      },
    };

    return res.status(200).json(responseData);
  } catch (error: any) {
    console.error("❌ Check warehouse status error:", error);
    console.error("❌ Error stack:", error.stack);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ✅ 3. GET API - Get complete warehouse details by userId
export const getWarehouseByUserId = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Validation
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "UserId is required",
      });
    }

    // Check if user exists (Quton Connect connection)
    const { User } = getQutonConnectModels();
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // TODO(quton-migration): same cross-connection populate problem as
    // checkWarehouseStatus. Also `name`, `email`, `profileImage` are
    // wrong paths for the Quton schema. Awaiting decision.
    const warehouse = await FWSWareHouse.findOne({ userId }).populate(
      "userId",
      "name email phone profileImage",
    );

    if (!warehouse) {
      return res.status(404).json({
        success: false,
        message: "No warehouse found for this user",
        hasWarehouse: false,
      });
    }

    // Return complete warehouse data
    return res.status(200).json({
      success: true,
      hasWarehouse: true,
      message: "Warehouse details fetched successfully",
      data: warehouse,
    });
  } catch (error: any) {
    console.error("Get warehouse error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};