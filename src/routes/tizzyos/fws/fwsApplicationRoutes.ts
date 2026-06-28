import express, { RequestHandler } from "express";
import * as warehouseController from "../../../controller/tizzyos/fws/fwsApplicationController"; // Apne controller ki path daal dena
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";
import { ParamsDictionary } from "express-serve-static-core";
import { ParsedQs } from "qs";

const router = express.Router();

// ==================== CHECK & STATUS APIs ====================
// ✅ Check if user has submitted warehouse form
router.get(
  "/check/:userId",
  authMiddleware,
  warehouseController.checkWarehouseStatus,
);

// ✅ Get warehouse by userId (complete details)
router.get(
  "/user/:userId",
  authMiddleware,
  warehouseController.getWarehouseByUserId,
);

// ==================== CREATE & UPDATE APIs ====================
// ✅ Create new warehouse
router.post("/create", authMiddleware, warehouseController.createWarehouse);

export default router;
