import express from "express";
import { getRiderLiveCoordinates } from "../../../controller/tizzyos/shipping/getRiderLocationController";

const router = express.Router();

router.get("/rider-location/:riderId", getRiderLiveCoordinates);

export default router;
