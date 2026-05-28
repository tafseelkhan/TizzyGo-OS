import express from "express";
import { getAllCategories } from "../../controller/tizzyos/category";

const router = express.Router();

// GET all categories
router.get("/", getAllCategories);

export default router;
