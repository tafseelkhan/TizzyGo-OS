import { Request, Response } from "express";
import { RideBookingService } from "../../../services/tizzyos/cab/rideBookingService";
import { RideDispatchService } from "../../../services/tizzyos/cab/rideDispatchService";

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

    const bookingService = new RideBookingService();
    const dispatchService = new RideDispatchService();

    const bookingData = {
      ...req.body,
      customerId: userId,
      paymentMethod: req.body.paymentMethod || "ONLINE",
    };

    const booking = await bookingService.createBooking(bookingData);
    await dispatchService.startDispatch(booking.bookingId);

    res.status(201).json({
      success: true,
      data: booking,
      message: "Booking created successfully",
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

export const getBooking = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { bookingId } = req.params;
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

    const updatedBooking = await bookingService.cancelBooking(
      bookingId,
      cancelReason || "No reason provided",
      cancelledBy,
    );

    if (booking.status === "searching") {
      await dispatchService.stopDispatch(bookingId);
    }

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
