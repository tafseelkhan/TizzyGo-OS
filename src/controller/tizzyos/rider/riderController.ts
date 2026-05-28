import { Request, Response } from 'express';
import Rider from '../../../models/tizzyos/rider/Rider';
import { upload } from '../../../utils/tizzyos/rider/multerConfig';
import { sendEmail } from '../../../utils/tizzyos/rider/sendEmail';
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

export const applyRider = [
  upload.fields([
    { name: "aadhaarFrontImage", maxCount: 1 },
    { name: "aadhaarBackImage", maxCount: 1 },
    { name: "panFrontImage", maxCount: 1 },
    { name: "panBackImage", maxCount: 1 },
    { name: "drivingLicensePhoto", maxCount: 1 },
    { name: "vehicleInsuranceCopy", maxCount: 1 },
  ]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      // 🔑 Get userId from JWT (safe way)
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) {
        res.status(401).json({ error: "No token provided" });
        return;
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET!
      ) as { userId: string };

      const userId = decoded.userId; // ✅ yahi correct source hai

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      const riderData = {
        userId, // 👈 ab safe hai
        ...req.body,
        dateOfBirth: new Date(req.body.dateOfBirth),
        licenseExpiryDate: new Date(req.body.licenseExpiryDate),
        aadhaarFrontImage: files.aadhaarFrontImage?.[0]?.path,
        aadhaarBackImage: files.aadhaarBackImage?.[0]?.path,
        panFrontImage: files.panFrontImage?.[0]?.path,
        panBackImage: files.panBackImage?.[0]?.path,
        drivingLicensePhoto: files.drivingLicensePhoto?.[0]?.path,
        vehicleInsuranceCopy: files.vehicleInsuranceCopy?.[0]?.path,
        status: "Pending",
      };

      const rider = new Rider(riderData);
      await rider.save();

      await sendEmail(
        rider.email,
        "Application Submitted",
        "Your rider application is pending review."
      );

      res.status(201).json({
        message: "Application submitted successfully",
        riderId: rider._id,
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },
];

// 📌 Get Rider full status (with image and all details)
export const getRiderStatus = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { userId } = req.user!; // JWT se populate
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, error: "Invalid user ID" });
    }

    const rider = await Rider.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!rider) {
      return res.status(404).json({ success: false, error: "Rider not found" });
    }

    return res.json({ success: true, data: rider.toObject() });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
};

// 📌 Get Rider by _id
export const getRiderById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rider = await Rider.findById(id);
    if (!rider) return res.status(404).json({ success: false, error: "Rider not found" });
    res.json({ success: true, data: rider });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

// 📌 Update Rider by _id
// ✅ Update rider by ID (text + images)
export const updateRiderById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, error: "Rider ID missing" });

    const updateData: any = { ...req.body };

    // Handle uploaded files (multer multiple fields mode)
    if (req.files) {
      // req.files is an object: { fieldname: [file] }
      const filesObj = req.files as { [fieldname: string]: Express.Multer.File[] };
      for (const field in filesObj) {
        if (filesObj[field] && filesObj[field][0]) {
          updateData[field] = filesObj[field][0].path; // map directly to DB field
        }
      }
    }

    const updatedRider = await Rider.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updatedRider)
      return res.status(404).json({ success: false, error: "Rider not found" });

    res.json({ success: true, message: "Rider updated successfully", data: updatedRider });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

// 📌 Delete Rider by _id
export const deleteRiderById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rider = await Rider.findByIdAndDelete(id);
    if (!rider) return res.status(404).json({ success: false, error: "Rider not found" });
    res.json({ success: true, message: "Rider deleted", data: rider });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};