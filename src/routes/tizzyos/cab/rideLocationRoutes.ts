import { Router } from "express";
import {
  updateDriverLocation,
  getDriverLocation,
  getNearbyDrivers,
} from "../../../controller/tizzyos/cab/rideLocationController";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";

const router = Router();

router.post("/driver/locations", authMiddleware, updateDriverLocation);
router.get("/locations/driver/:driverId", authMiddleware, getDriverLocation);
router.get("/locations/nearby", authMiddleware, getNearbyDrivers);

export default router;
