import express from "express";
import {
  getRiderDetails,
  getRidersList,
  approveRider,
  rejectRider,
  pendingRider,
} from "../../../controller/tizzyos/rider/adminController";

const router = express.Router();

router.get("/rider/:id", getRiderDetails);
router.get("/riders", getRidersList);
router.post("/rider/:id/approve", approveRider);
router.post("/rider/:id/reject", rejectRider);
router.post("/rider/:id/pending", pendingRider);

export default router;
