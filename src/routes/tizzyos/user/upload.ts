import express from 'express';
import { getUploadUrl } from "../../../firebase/firebase";

const router = express.Router();

// POST request: frontend se fileName & fileType bhejne ke liye
router.post("/get-upload-url", getUploadUrl);

export default router;
