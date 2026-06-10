import express from "express";
import { calculatePricing } from "../../../../controller/tizzyos/seller/AddProducts/pricingCalculationController";

const router = express.Router(); // ✅ Express router only

router.post("/price-calculation", calculatePricing);

export default router;
