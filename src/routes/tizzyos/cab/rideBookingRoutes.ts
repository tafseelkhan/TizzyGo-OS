import { Router } from "express";
import {
  createBooking,
  getBooking,
  getCustomerBookings,
  getDriverBookings,
  cancelBooking,
} from "../../../controller/tizzyos/cab/rideBookingController";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";

const router = Router();

router.post("/bookings", authMiddleware, createBooking);
router.get("/bookings/:bookingId", authMiddleware, getBooking);
router.get("/bookings/customer/all", authMiddleware, getCustomerBookings);
router.get("/bookings/driver/all", authMiddleware, getDriverBookings);
router.put("/bookings/:bookingId/cancel", authMiddleware, cancelBooking);

export default router;
