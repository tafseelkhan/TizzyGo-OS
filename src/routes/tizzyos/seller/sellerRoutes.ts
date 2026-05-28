import express from "express";
import multer from "multer";
import path from "path";

import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";
import {
  submitApplication,
  getSellerStatus,
  checkFormStatus,
} from "../../../controller/tizzyos/seller/sellerController";
import { generateUniqOsIdAPI } from "../../../controller/tizzyos/seller/uniqosController";

const router = express.Router(); // ✅ Express router only

// ✅ Multer storage setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/seller/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

// ✅ Seller Apply API
router.post(
  "/apply",
  authMiddleware,
  upload.fields([
    { name: "aadhaarFront", maxCount: 1 },
    { name: "aadhaarBack", maxCount: 1 },
    { name: "panFront", maxCount: 1 },
    { name: "panBack", maxCount: 1 },
    { name: "selfieWithDoc", maxCount: 1 },
    { name: "gstCertificate", maxCount: 1 },
  ]),
  submitApplication
);

router.get("/check-form-status", authMiddleware, checkFormStatus);

// ✅ Generate uniqOS ID
router.get("/generate/uniqos-id", generateUniqOsIdAPI);

router.get("/status/:userId", getSellerStatus);

export default router;
