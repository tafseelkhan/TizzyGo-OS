// routes/deliveryTrackingRoutes.ts
import { Router } from "express";
import {
  handoverViaQR,
  intransitToFWS,
  sellerAssignShipping,
  verifyQR,
  fwsAssignShipping,
  acceptAssignment,
  getRiderTruckOrders,
  getTrackingDetails,
  getOrderQRCode,
  getSellerOrders,
  getFWSOrders,
  sellerAcceptOrder,
  getOrderById,
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
    return (intransitToFWS as any)(req, res, next);
  },
);

// Seller assigns shipping partner (RIDER/TRUCK) - Auto or Manual
// Wrap sellerAssignShipping to avoid Express/AuthRequest type incompatibility
router.post(
  "/shipping/seller/assign/auto-manual",
  authMiddleware,
  (req, res, next) => {
    // cast to any to satisfy overloads; authMiddleware ensures req.user exists
    return (sellerAssignShipping as any)(req, res, next);
  },
);

// ==================== FWS FLOW ====================
// FWS verifies QR and marks ready for dispatch
router.post("/shipping/fws/verify-qr", authMiddleware, (req, res, next) => {
  // cast to any to satisfy overloads; authMiddleware ensures req.user exists
  return (verifyQR as any)(req, res, next);
});

// FWS assigns shipping partner (RIDER/TRUCK) - Auto or Manual
router.post("/shipping/fws/assign", authMiddleware, (req, res, next) => {
  // cast to any to satisfy overloads; authMiddleware ensures req.user exists
  return (fwsAssignShipping as any)(req, res, next);
});

// ==================== HANDOVER VIA QR CODE ====================
// HandOver for FWS RIDER/TRUCK
router.post("/shipping/handover/via/qr", authMiddleware, (req, res, next) => {
  // cast to any to satisfy overloads; authMiddleware ensures req.user exists
  return (handoverViaQR as any)(req, res, next);
});

// ==================== SHIPPING PARTNER FLOW (RIDER/TRUCK) ====================
// Shipping partner accepts assignment (TRACKING CREATED HERE)
router.post("/shipping/accept-assignment", authMiddleware, (req, res, next) => {
  // cast to any to satisfy overloads; authMiddleware ensures req.user exists
  return (acceptAssignment as any)(req, res, next);
});

router.get("/:orderId/qr", authMiddleware, (req, res, next) => {
  // cast to any to satisfy overloads; authMiddleware ensures req.user exists
  return (getOrderQRCode as any)(req, res, next);
});

// Get my assigned orders (for shipping partners)
// Wrap getRiderTruckOrders to avoid Express/AuthRequest type incompatibility
router.get("/shipping/my-orders", authMiddleware, (req, res, next) => {
  // cast to any to satisfy overloads; authMiddleware ensures req.user exists
  return (getRiderTruckOrders as any)(req, res, next);
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

// Get Order By Id
router.get("/shipping/order/:orderId", authMiddleware, (req, res, next) => {
  // cast to any to satisfy overloads; authMiddleware ensures req.user exists
  return (getOrderById as any)(req, res, next);
});

export default router;
