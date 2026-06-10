import express from "express";
import { getRiderLiveCoordinates } from "../../../../controller/tizzyos/shipping/fws/fwsRiderLocationController";

const router = express.Router();

router.get("/rider-location/:riderId", getRiderLiveCoordinates);

export default router;
