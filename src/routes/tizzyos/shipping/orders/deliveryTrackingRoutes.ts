// routes/tracking.routes.ts
import { Router } from "express";
import {
  deliverToFWS,
  sellerAssignShipping,
  verifyQRAndMarkReadyForDispatch,
  fwsAssignShipping,
  acceptAssignment,
  updateHandover,
  getMyAssignedOrders,
  getTrackingDetails,
  getSellerOrders,
  getFWSOrders,
  sellerAcceptOrder,
} from "../../../../controller/tizzyos/shipping/orders/deliveryTrackingController";
import { authMiddleware } from "../../../../middleware/tizzygo/authMiddleware";

const router = Router();

// ==================== SELLER FLOW ====================
// Seller accepts order
// Wrap sellerAcceptOrder to avoid Express/AuthRequest type incompatibility
router.post(
  "/shipping/seller/accept-order",
  authMiddleware,
  (req, res, next) => {
    // cast to any to satisfy overloads; authMiddleware ensures req.user exists
    return (sellerAcceptOrder as any)(req, res, next);
  },
);

// Seller delivers parcel to FWS
// Wrap deliverToFWS to avoid Express/AuthRequest type incompatibility
router.post(
  "/shipping/seller/deliver-to-fws",
  authMiddleware,
  (req, res, next) => {
    // cast to any to satisfy overloads; authMiddleware ensures req.user exists
    return (deliverToFWS as any)(req, res, next);
  },
);

// Seller assigns shipping partner (RIDER/TRUCK) - Auto or Manual
// Wrap sellerAssignShipping to avoid Express/AuthRequest type incompatibility
router.post("/shipping/seller/assign", authMiddleware, (req, res, next) => {
  // cast to any to satisfy overloads; authMiddleware ensures req.user exists
  return (sellerAssignShipping as any)(req, res, next);
});

// ==================== FWS FLOW ====================
// FWS verifies QR and marks ready for dispatch
router.post(
  "/shipping/fws/verify-qr",
  authMiddleware,
  (req, res, next) => {
    // cast to any to satisfy overloads; authMiddleware ensures req.user exists
    return (verifyQRAndMarkReadyForDispatch as any)(req, res, next);
  },
);

// FWS assigns shipping partner (RIDER/TRUCK) - Auto or Manual
router.post("/shipping/fws/assign", authMiddleware, (req, res, next) => {
  // cast to any to satisfy overloads; authMiddleware ensures req.user exists
  return (fwsAssignShipping as any)(req, res, next);
});

// ==================== SHIPPING PARTNER FLOW (RIDER/TRUCK) ====================
// Shipping partner accepts assignment (TRACKING CREATED HERE)
router.post(
  "/shipping/accept-assignment",
  authMiddleware,
  (req, res, next) => {
    // cast to any to satisfy overloads; authMiddleware ensures req.user exists
    return (acceptAssignment as any)(req, res, next);
  },
);

// Update handover status throughout journey
router.put("/shipping/handover", authMiddleware, (req, res, next) => {
  // cast to any to satisfy overloads; authMiddleware ensures req.user exists
  return (updateHandover as any)(req, res, next);
});

// Get my assigned orders (for shipping partners)
// Wrap getMyAssignedOrders to avoid Express/AuthRequest type incompatibility
router.get("/shipping/my-orders", authMiddleware, (req, res, next) => {
  // cast to any to satisfy overloads; authMiddleware ensures req.user exists
  return (getMyAssignedOrders as any)(req, res, next);
});

// ==================== QUERY ENDPOINTS ====================
// Get tracking details by order ID
router.get("/shipping/tracking/:orderId", authMiddleware, (req, res, next) => {
  // cast to any to satisfy overloads; authMiddleware ensures req.user exists
  return (getTrackingDetails as any)(req, res, next);
});

// Get seller's orders
router.get("/shipping/seller/orders", authMiddleware, (req, res, next) => {
  // cast to any to satisfy overloads; authMiddleware ensures req.user exists
  return (getSellerOrders as any)(req, res, next);
});

// Get FWS orders
router.get("/shipping/fws/orders", authMiddleware, (req, res, next) => {
  // cast to any to satisfy overloads; authMiddleware ensures req.user exists
  return (getFWSOrders as any)(req, res, next);
});

export default router;
