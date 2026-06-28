// routes/employee.routes.ts
import express from "express";
import {
  createEmployee,
  checkEmployeeFormStatus,
  getAllEmployees,
  getEmployeeByNameAndRole,
} from "../../../controller/tizzyos/fws/employeeController";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";

const router = express.Router();

// ✅ Create employee (requires fwsCode)
router.post("/create", authMiddleware, createEmployee);

// ✅ Check employee form status (GET with query params)
router.get("/check-status", authMiddleware, checkEmployeeFormStatus);

// ✅ Get employees by user ID
router.post("/", authMiddleware, getEmployeeByNameAndRole);

// ✅ Get all employees (token se userId)
router.get("/all", authMiddleware, getAllEmployees);

export default router;
