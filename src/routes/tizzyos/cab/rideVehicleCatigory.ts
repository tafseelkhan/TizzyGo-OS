// routes/rides/rideVehicleCategoryRoutes.ts
import { Router } from "express";
import { getRideVehicleCategories } from "../../../controller/tizzyos/cab/rideVehicleCatigory";

const router = Router();

router.get("/vehicle-categories", getRideVehicleCategories);

export default router;
