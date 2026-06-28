import express from "express";
import {
  saveSellerLocation,
  updateGpsTrackingStatus,
  getSellerLocation,
} from "../../../../controller/tizzyos/seller/locations/locationsController";
import { authMiddleware } from "../../../../middleware/tizzygo/authMiddleware";

const router = express.Router();

router.post("/location", authMiddleware, saveSellerLocation);
router.post("/gps-tracking", authMiddleware, updateGpsTrackingStatus);
router.get("/get-location", authMiddleware, getSellerLocation);

export default router;
