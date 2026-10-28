import { Router } from "express";
import { getRideOptions } from "../../../controller/tizzyos/cab/rideQuoteController";
import { getAirportRideOptions } from "../../../controller/tizzyos/cab/airportQuoteController";
import {
  createBooking,
  getBooking,
  getCustomerBookings,
  getDriverBookings,
  cancelBooking,
  getSearchStatus,
  retrySearch,
  updateBookingStatus,
} from "../../../controller/tizzyos/cab/rideBookingController";
import { authMiddleware } from "../../../middleware/authMiddleware";

const router = Router();

// =====================================================
// RIDE QUOTE APIS
// =====================================================

// =====================================================
// POST /api/ride/options
//
// Purpose:
// Returns all available vehicle options for the selected
// pickup and drop location.
//
// Called By:
// Customer Frontend
//
// Creates Booking?
// NO
//
// Uses Google Routes API?
// YES
//
// Uses Fare Calculation?
// YES
//
// Starts Driver Dispatch?
// NO
// =====================================================
router.post("/options", authMiddleware, getRideOptions);
router.post("/airport/options", authMiddleware, getAirportRideOptions);

// =====================================================
// RIDE BOOKING APIS
// =====================================================

// =====================================================
// POST /api/ride/book
//
// Purpose:
// Creates a booking ONLY after customer presses Book.
// Uses candidateId from quote to map to real driver.
// Locks the fare at quoted price.
// Starts driver dispatch immediately.
//
// Called By:
// Customer Frontend
//
// Creates Booking?
// YES
//
// Starts Driver Dispatch?
// YES
// =====================================================
router.post("/book", authMiddleware, createBooking);

// =====================================================
// GET /api/ride/search-status/:bookingId
//
// Purpose:
// Returns the current search status for a booking.
// Used by frontend to poll search progress.
//
// Called By:
// Customer Frontend (polling)
// =====================================================
router.get("/search-status/:bookingId", authMiddleware, getSearchStatus);

// =====================================================
// POST /api/ride/retry/:bookingId
//
// Purpose:
// Retries driver search with increased fare.
// Continues from current batch (does NOT restart).
//
// Called By:
// Customer Frontend
// =====================================================
router.post("/retry/:bookingId", authMiddleware, retrySearch);

// =====================================================
// POST /api/ride/cancel/:bookingId
//
// Purpose:
// Cancels an ongoing search or active ride.
//
// Called By:
// Customer Frontend, Driver App
// =====================================================
router.post("/cancel/:bookingId", authMiddleware, cancelBooking);

// =====================================================
// GET /api/ride/booking/:bookingId
//
// Purpose:
// Retrieves booking details.
//
// Called By:
// Customer Frontend, Driver App
// =====================================================
router.get("/booking/:bookingId", authMiddleware, getBooking);

// =====================================================
// GET /api/ride/bookings/customer
//
// Purpose:
// Retrieves all bookings for the authenticated customer.
//
// Called By:
// Customer Frontend
// =====================================================
router.get("/bookings/customer", authMiddleware, getCustomerBookings);

// =====================================================
// GET /api/ride/bookings/driver
//
// Purpose:
// Retrieves all bookings for the authenticated driver.
//
// Called By:
// Driver App
// =====================================================
router.get("/bookings/driver", authMiddleware, getDriverBookings);

// =====================================================
// PUT /api/ride/booking/:bookingId/status
//
// Purpose:
// Updates booking status.
//
// Called By:
// Internal services
// =====================================================
router.put(
  "/booking/:bookingId/status",
  authMiddleware,
  updateBookingStatus,
);

export default router;
