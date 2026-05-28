import express from "express";
import { Router, Request, Response } from "express";
import { applyRider, getRiderStatus, getRiderById, updateRiderById, deleteRiderById, } from "../../../controller/tizzyos/rider/riderController";
import { authMiddleware } from '../../../middleware/tizzygo/authMiddleware';
import Rider from '../../../models/tizzyos/rider/Rider';
import multer from "multer";

const router = express.Router();

router.post("/apply", authMiddleware, applyRider);
router.get("/status/:id", authMiddleware, getRiderStatus);
router.get("/detail/:id", authMiddleware, getRiderById);
// router.put("/detail/:id", upload.fields([
//   { name: "aadhaarFrontImage" },
//   { name: "aadhaarBackImage" },
//   { name: "panFrontImage" },
//   { name: "panBackImage" },
//   { name: "drivingLicensePhoto" },
//   { name: "vehicleInsuranceCopy" },
// ]), updateRiderById);
router.delete("/detail/:id", authMiddleware, deleteRiderById);
router.get("/status/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params; // real ObjectId
    const rider = await Rider.findById(id);

    if (!rider) {
      return res.json({ success: true, submitted: false });
    }

    res.json({
      success: true,
      submitted: true,
      riderId: rider._id.toString(),
      data: rider,
    });
  } catch (err) {
    console.error("Error fetching rider status:", err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;
