// controllers/employee.controller.ts
import { Response } from "express";
import mongoose from "mongoose";

import { Employee } from "../../../models/tizzyos/fws/employee";
import FWSWareHouse from "../../../models/tizzyos/fws/fwsWareHouse";

import { getQutonConnectModels } from "../../../config/tizzygo/qutonConnectDatabase";

import type { AuthRequest } from "../../../middleware/authMiddleware";

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

/**
 * Create Employee and add to FWSWarehouse
 * Employee must enter fwsCode to get added to warehouse
 */
export const createEmployee = async (
  req: AuthRequest,
  res: Response,
) => {
  console.log("🚀 [createEmployee] ====================");
  console.log("🚀 [createEmployee] API called");

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log("📝 [createEmployee] Request body:", req.body);
    console.log("👤 [createEmployee] req.user:", req.user);

    const { name, email, phone, role, fwsCode, address } = req.body;
    const userId = req.userId ?? req.user?.userId;

    console.log("📝 [createEmployee] Parsed data:", {
      userId,
      name,
      email,
      phone,
      role,
      fwsCode,
      address,
    });

    // 1. Validate required fields
    if (!userId || !name || !email || !phone || !role || !fwsCode) {
      console.log(
        "❌ [createEmployee] Validation failed - Missing required fields",
      );
      console.log("📊 [createEmployee] userId:", userId);
      console.log("📊 [createEmployee] name:", name);
      console.log("📊 [createEmployee] email:", email);
      console.log("📊 [createEmployee] phone:", phone);
      console.log("📊 [createEmployee] role:", role);
      console.log("📊 [createEmployee] fwsCode:", fwsCode);

      await session.abortTransaction();
      session.endSession();

      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: userId, name, email, phone, role, fwsCode",
      });
    }

    console.log("✅ [createEmployee] All required fields present");

    // 2. Check if user exists (Quton Connect connection)
    console.log("🔍 [createEmployee] Checking if user exists:", userId);
    const { User } = getQutonConnectModels();
    const user = await User.findById(userId);

    if (!user) {
      console.log("❌ [createEmployee] User not found:", userId);

      await session.abortTransaction();
      session.endSession();

      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Quton User has no `email`; log the derived full name instead.
    console.log("✅ [createEmployee] User found:", getFullName(user));

    // 3. Check if FWSWarehouse exists with given fwsCode
    console.log(
      "🔍 [createEmployee] Checking warehouse with fwsCode:",
      fwsCode,
    );

    const warehouse = await FWSWareHouse.findOne({
      fwsCode: fwsCode,
      status: "ACTIVE",
      approvalStatus: "APPROVED",
    });

    if (!warehouse) {
      console.log(
        "❌ [createEmployee] Warehouse not found or not approved for fwsCode:",
        fwsCode,
      );

      await session.abortTransaction();
      session.endSession();

      return res.status(404).json({
        success: false,
        message: "Invalid FWS Code or warehouse not found/approved",
      });
    }

    console.log("✅ [createEmployee] Warehouse found:", {
      _id: warehouse._id,
      fwsCode: warehouse.fwsCode,
      name: warehouse.name,
      status: warehouse.status,
      approvalStatus: warehouse.approvalStatus,
    });

    // 4. Check if user is already an employee in this warehouse
    console.log(
      "🔍 [createEmployee] Checking existing employee for userId:",
      userId,
    );
    console.log("🔍 [createEmployee] fwsWarehouseId:", warehouse.fwsCode);

    const existingEmployee = await Employee.findOne({
      userId: userId,
      fwsWarehouseId: warehouse.fwsCode,
      isActive: true,
    });

    if (existingEmployee) {
      console.log(
        "❌ [createEmployee] User is already an employee:",
        existingEmployee._id,
      );
      console.log(
        "📊 [createEmployee] Existing employee data:",
        existingEmployee,
      );

      await session.abortTransaction();
      session.endSession();

      return res.status(400).json({
        success: false,
        message: "User is already an employee in this warehouse",
      });
    }

    console.log("✅ [createEmployee] User is not an existing employee");

    // 5. Create Employee
    console.log("📝 [createEmployee] Creating employee with data:");
    const employeeData = {
      userId: userId,
      name: name,
      email: email,
      phone: phone,
      role: role || "SCANNER",
      fwsCode: fwsCode,
      isActive: true,
      joiningDate: new Date(),
      address: address || "",
    };

    console.log("📊 [createEmployee] Employee data:", employeeData);

    const employee = new Employee(employeeData);
    await employee.save({ session });
    console.log(`✅ [createEmployee] Employee created: ${employee._id}`);

    // 6. Add employee to FWSWarehouse employees array
    console.log(
      "📝 [createEmployee] Adding employee to warehouse employees array",
    );
    console.log("📊 [createEmployee] Warehouse ID:", warehouse._id);
    console.log("📊 [createEmployee] Employee ID:", employee._id);

    await FWSWareHouse.findByIdAndUpdate(
      warehouse._id,
      {
        $push: {
          employee: {
            _id: employee._id,
          },
        },
      },
      { session },
    );

    console.log(
      `✅ [createEmployee] Employee ${employee._id} added to warehouse ${warehouse.fwsCode}`,
    );

    // 7. Commit transaction
    console.log("📝 [createEmployee] Committing transaction...");
    await session.commitTransaction();
    session.endSession();
    console.log("✅ [createEmployee] Transaction committed");

    // 8. Fetch complete employee data with populated fields
    console.log("📝 [createEmployee] Fetching populated employee data...");

    // TODO(quton-migration): `.populate("userId", ...)` CANNOT cross
    // connections. `Employee` is on the default (TizzyGo) connection,
    // `User` is on the Quton Connect connection. This call will return
    // `null` (or throw MissingSchemaError) at runtime after migration.
    // Resolution pending: manual join OR drop populate and rely on
    // Employee.name/email/phone OR denormalize. Awaiting sign-off.
    const populatedEmployee = await Employee.findById(employee._id)
      .populate("userId", "firstName lastName phone")
      .lean();

    console.log(
      "✅ [createEmployee] Populated employee data:",
      populatedEmployee,
    );

    console.log("📤 [createEmployee] Sending success response");
    console.log("🚀 [createEmployee] ====================");

    return res.status(201).json({
      success: true,
      message: "Employee created and added to warehouse successfully",
      data: {
        employee: populatedEmployee,
        warehouse: {
          _id: warehouse._id,
          fwsCode: warehouse.fwsCode,
          name: warehouse.name,
        },
      },
    });
  } catch (error: any) {
    console.error(
      "❌ [createEmployee] Error caught, rolling back transaction...",
    );
    await session.abortTransaction();
    session.endSession();
    console.log("✅ [createEmployee] Transaction rolled back");

    console.error("❌ [createEmployee] Error creating employee:", error);
    console.error("❌ [createEmployee] Error stack:", error.stack);

    if (error.code === 11000) {
      console.log(
        "❌ [createEmployee] Duplicate key error (userId or email already exists)",
      );
      console.log("📊 [createEmployee] Duplicate key error details:", error);

      return res.status(400).json({
        success: false,
        message: "Employee with this userId or email already exists",
      });
    }

    console.log("📤 [createEmployee] Sending error response");
    console.log("🚀 [createEmployee] ====================");

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create employee",
    });
  }
};

export const checkEmployeeFormStatus = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const userId = req.userId ?? req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - User not found in token",
      });
    }

    console.log(
      "🔍 [Backend] Checking employee form status for userId:",
      userId,
    );

    const { User } = getQutonConnectModels();
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // TODO(quton-migration): `.populate("userId", ...)` CANNOT cross
    // connections (Employee = default connection, User = Quton).
    // Resolution pending — same decision as createEmployee above.
    const employee = await Employee.findOne({ userId: userId })
      .populate("userId", "firstName lastName phone")
      .lean();

    console.log("📊 [Backend] Employee found:", employee ? "Yes" : "No");

    // TODO(quton-migration): Quton User has no `email`. The `user.email`
    // below must be sourced from a contact-email field or `connectAddress`
    // (not blindly). Awaiting decision — see message.
    const userFullName = getFullName(user);

    if (!employee) {
      return res.status(200).json({
        success: true,
        data: {
          isFormFilled: false,
          status: "NOT_FILLED",
          message: "Employee form has not been filled yet",
          employee: null,
          user: {
            _id: user._id,
            name: userFullName,
            // TODO(quton-migration): `email` source undecided.
            // Using empty string to avoid inventing data.
            email: "",
            phone: user.phone,
          },
        },
      });
    }

    const isFormComplete =
      employee.name &&
      employee.email &&
      employee.phone &&
      employee.role &&
      employee.fwsCode;

    const approvalStatus = employee.approvalStatus || "PENDING";

    return res.status(200).json({
      success: true,
      data: {
        isFormFilled: true,
        isFormComplete: !!isFormComplete,
        status: employee.isActive ? "ACTIVE" : "INACTIVE",
        approvalStatus: approvalStatus,
        message: employee.isActive
          ? "Employee form is filled and active"
          : "Employee form is filled but inactive",
        employee: {
          _id: employee._id,
          name: employee.name,
          email: employee.email,
          phone: employee.phone,
          role: employee.role,
          fwsCode: employee.fwsCode,
          isActive: employee.isActive,
          approvalStatus: approvalStatus,
          joiningDate: employee.joiningDate,
          address: employee.address || "",
          createdAt: employee.createdAt,
          updatedAt: employee.updatedAt,
        },
        user: {
          _id: user._id,
          name: userFullName,
          // TODO(quton-migration): `email` source undecided.
          email: "",
          phone: user.phone,
        },
      },
    });
  } catch (error: any) {
    console.error("❌ [Backend] Error checking employee form status:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to check employee form status",
    });
  }
};

/**
 * Get employees by user ID
 */
export const getEmployeeByNameAndRole = async (
  req: AuthRequest,
  res: Response,
) => {
  console.log("🔍 [getEmployeeByNameAndRole] ====================");
  console.log("🔍 [getEmployeeByNameAndRole] API called");

  try {
    const { name, role } = req.body;
    console.log("📝 [getEmployeeByNameAndRole] Request body:", req.body);
    console.log("📝 [getEmployeeByNameAndRole] Name:", name);
    console.log("📝 [getEmployeeByNameAndRole] Role:", role);

    const userId = req.userId ?? req.user?.userId;
    console.log("👤 [getEmployeeByNameAndRole] User ID from token:", userId);

    if (!userId) {
      console.log(
        "❌ [getEmployeeByNameAndRole] Unauthorized - User ID not found in token",
      );
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User ID not found in token",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.log("❌ [getEmployeeByNameAndRole] Invalid user ID:", userId);
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    console.log("✅ [getEmployeeByNameAndRole] Valid User ID:", userId);

    const query: any = {
      userId: userId,
      isActive: true,
    };

    console.log("🔍 [getEmployeeByNameAndRole] Building query...");
    console.log("📊 [getEmployeeByNameAndRole] Base query:", query);

    if (name) {
      query.name = { $regex: name, $options: "i" };
      console.log(
        "📊 [getEmployeeByNameAndRole] Added name filter:",
        query.name,
      );
    }
    if (role) {
      query.role = role;
      console.log(
        "📊 [getEmployeeByNameAndRole] Added role filter:",
        query.role,
      );
    }

    console.log(
      "📊 [getEmployeeByNameAndRole] Final query:",
      JSON.stringify(query, null, 2),
    );

    console.log(
      "🔍 [getEmployeeByNameAndRole] Fetching employees from database...",
    );

    // TODO(quton-migration): `.populate("userId", ...)` CANNOT cross
    // connections (Employee = default connection, User = Quton).
    // Resolution pending — same decision as createEmployee above.
    const employees = await Employee.find(query)
      .populate("userId", "firstName lastName phone")
      .lean();

    console.log(
      `✅ [getEmployeeByNameAndRole] Found ${employees.length} employees`,
    );

    if (employees.length > 0) {
      console.log(
        "📊 [getEmployeeByNameAndRole] First employee:",
        JSON.stringify(employees[0], null, 2),
      );
    }

    console.log("📤 [getEmployeeByNameAndRole] Sending success response");
    console.log("🔍 [getEmployeeByNameAndRole] ====================");

    return res.status(200).json({
      success: true,
      count: employees.length,
      data: employees,
    });
  } catch (error: any) {
    console.error("❌ [getEmployeeByNameAndRole] Error:", error);
    console.error("❌ [getEmployeeByNameAndRole] Error stack:", error.stack);
    console.log("🔍 [getEmployeeByNameAndRole] ====================");

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch employees",
    });
  }
};

/**
 * ✅ Get all employees - Token se userId lega
 * Sirf userId ke against saare employees fetch karega
 */
export const getAllEmployees = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    console.log("📦 [getAllEmployees] ====================");
    console.log("📦 [getAllEmployees] API called");

    const userId = req.userId ?? req.user?.userId;

    if (!userId) {
      console.log(
        "❌ [getAllEmployees] Unauthorized - User not found in token",
      );
      return res.status(401).json({
        success: false,
        message: "Unauthorized - User not found in token",
      });
    }

    console.log("👤 [getAllEmployees] User ID from token:", userId);

    const { User } = getQutonConnectModels();
    const user = await User.findById(userId);
    if (!user) {
      console.log("❌ [getAllEmployees] User not found:", userId);
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Quton User has no `email`; log the derived full name instead.
    console.log("✅ [getAllEmployees] User found:", getFullName(user));

    // TODO(quton-migration): `.populate("userId", ...)` CANNOT cross
    // connections (Employee = default connection, User = Quton).
    // Resolution pending — same decision as createEmployee above.
    const employees = await Employee.find({
      userId: userId,
      isActive: true,
    })
      .populate("userId", "firstName lastName phone")
      .sort({ createdAt: -1 })
      .lean();

    console.log(`📊 [getAllEmployees] Found ${employees.length} employees`);

    return res.status(200).json({
      success: true,
      message:
        employees.length > 0
          ? "Employees fetched successfully"
          : "No employees found for this user",
      data: employees,
      count: employees.length,
    });
  } catch (error: any) {
    console.error("❌ [getAllEmployees] Error:", error);
    console.error("❌ [getAllEmployees] Error stack:", error.stack);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch employees",
    });
  }
};