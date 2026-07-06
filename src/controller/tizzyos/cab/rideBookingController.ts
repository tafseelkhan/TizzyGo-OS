// controllers/tizzyos/cab/rideBookingController.ts

import { Request, Response } from "express";
import { RideBookingService } from "../../../services/tizzyos/cab/rideBookingService";
import { RideDispatchService } from "../../../services/tizzyos/cab/rideDispatchService";

// =====================================================
// POST /api/ride/book
//
// Purpose:
// Creates a booking ONLY after customer presses Book.
// Uses quoteId from frontend (NOT candidateId).
// Backend fetches quote from database.
// Locks the fare at quoted price.
// Starts driver dispatch immediately.
//
// Called By:
// Customer Frontend
//
// Creates Booking?
// YES
//
// Uses Google Routes API?
// NO (uses stored route data from quote)
//
// Starts Driver Dispatch?
// YES
// =====================================================

export const createBooking = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { quoteId, paymentMethod } = req.body;

    // Validate required fields
    if (!quoteId) {
      res.status(400).json({
        success: false,
        message: "Missing required field: quoteId",
      });
      return;
    }

    const bookingService = new RideBookingService();
    const dispatchService = new RideDispatchService();

    const bookingData = {
      customerId: userId,
      quoteId: quoteId,
      paymentMethod: paymentMethod || "COC",
    };

    const booking = await bookingService.createBooking(bookingData);

    // Start dispatch immediately
    await dispatchService.startDispatch(booking.bookingId);

    res.status(201).json({
      success: true,
      data: {
        bookingId: booking.bookingId,
        status: booking.status,
        fare: booking.fare?.totalFare,
        pickup: booking.pickup,
        destination: booking.destination,
        vehicle: booking.vehicle,
        estimatedDuration: booking.duration,
        polyline: booking.encodedPolyline,
      },
      message: "Booking created successfully. Searching for drivers...",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to create booking";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

// =====================================================
// GET /api/ride/search-status/:bookingId
//
// Purpose:
// Returns the current search status for a booking.
// Used primarily for reconnect scenarios (not for polling).
//
// Called By:
// Customer Frontend (reconnect)
// =====================================================

export const getSearchStatus = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const bookingService = new RideBookingService();
    const status = await bookingService.getBookingStatus(bookingId);

    res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to get search status";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

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

export const retrySearch = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const dispatchService = new RideDispatchService();

    const bookingService = new RideBookingService();
    const booking = await bookingService.getBooking(bookingId);

    if (booking.customerId.toString() !== userId) {
      res.status(403).json({
        success: false,
        message: "Not authorized for this booking",
      });
      return;
    }

    if (booking.status !== "no_driver_found") {
      res.status(400).json({
        success: false,
        message: `Cannot retry: booking is in ${booking.status} state`,
      });
      return;
    }

    await dispatchService.retryDispatch(bookingId);

    res.status(200).json({
      success: true,
      message: "Retry started with increased fare",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to retry search";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

// =====================================================
// POST /api/ride/cancel/:bookingId
//
// Purpose:
// Cancels an ongoing search or active ride.
//
// Called By:
// Customer Frontend, Driver App
// =====================================================

export const cancelBooking = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const { cancelReason } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const bookingService = new RideBookingService();
    const dispatchService = new RideDispatchService();

    const booking = await bookingService.getBooking(bookingId);

    if (
      booking.customerId.toString() !== userId &&
      booking.driverId?.toString() !== userId
    ) {
      res.status(403).json({
        success: false,
        message: "Not authorized to cancel this booking",
      });
      return;
    }

    const cancelledBy =
      booking.customerId.toString() === userId ? "customer" : "driver";

    if (
      booking.status === "searching" ||
      booking.status === "no_driver_found"
    ) {
      await dispatchService.stopDispatch(bookingId);
    }

    const updatedBooking = await bookingService.cancelBooking(
      bookingId,
      cancelReason || "No reason provided",
      cancelledBy,
    );

    res.status(200).json({
      success: true,
      data: updatedBooking,
      message: "Booking cancelled successfully",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to cancel booking";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

// =====================================================
// GET /api/ride/booking/:bookingId
//
// Purpose:
// Retrieves booking details.
//
// Called By:
// Customer Frontend, Driver App
// =====================================================

export const getBooking = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const bookingService = new RideBookingService();
    const booking = await bookingService.getBooking(bookingId);

    res.status(200).json({
      success: true,
      data: booking,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to get booking";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const getCustomerBookings = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const bookingService = new RideBookingService();
    const bookings = await bookingService.getBookingsByCustomer(userId);

    res.status(200).json({
      success: true,
      data: bookings,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to get bookings";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const getDriverBookings = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const bookingService = new RideBookingService();
    const bookings = await bookingService.getBookingsByDriver(userId);

    res.status(200).json({
      success: true,
      data: bookings,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to get bookings";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

// =====================================================
// PUT /api/ride/booking/:bookingId/status
//
// Purpose:
// Updates booking status.
// NOTE: This is kept for admin/internal use.
// For driver status updates, use /tracking/:trackingId/status
// =====================================================

export const updateBookingStatus = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const { status } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const bookingService = new RideBookingService();
    const booking = await bookingService.updateBookingStatus(bookingId, status);

    res.status(200).json({
      success: true,
      data: booking,
      message: "Booking status updated successfully",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to update booking status";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};
