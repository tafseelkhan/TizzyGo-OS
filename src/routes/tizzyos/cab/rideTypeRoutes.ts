// routes/rides/rideVehicleCategoryRoutes.ts
import { Router } from "express";
import { getRideTypes } from "../../../controller/tizzyos/cab/rideType";

const router = Router();

router.get("/ride-types", getRideTypes);

export default router;
