import express from "express";
import {
  saveBuyerLocation,
  updateGpsTrackingStatus,
  getBuyerLocation,
} from "../../../controller/tizzygo/locations/locationsController";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";

const router = express.Router();

router.post("/location", authMiddleware, saveBuyerLocation);
router.post("/gps-tracking", authMiddleware, updateGpsTrackingStatus);
router.get("/get-location", authMiddleware, getBuyerLocation);

export default router;
