import { Router } from "express";
import {
  acceptRequest,
  rejectRequest,
  getBookingRequests,
  getDriverRequests,
} from "../../../controller/tizzyos/cab/rideRequestController";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";

const router = Router();

router.post("/requests/:requestId/accept", authMiddleware, acceptRequest);
router.post("/requests/:requestId/reject", authMiddleware, rejectRequest);
router.get("/requests/booking/:bookingId", authMiddleware, getBookingRequests);
router.get("/requests/driver/all", authMiddleware, getDriverRequests);

export default router;
