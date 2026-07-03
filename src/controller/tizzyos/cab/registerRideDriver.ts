import { Request, Response } from "express";
import RideDriver, {
  IRideDriver,
} from "../../../models/tizzyos/cab/rideDriver";
// Helper function to generate unique driver code
import { customAlphabet } from "nanoid";
import { bucket } from "../../../firebase/firebase";

export const uploadBase64ToFirebase = async (
  base64: string,
  fileName: string,
  folder: string = "profiles",
): Promise<string | null> => {
  if (!base64) return null;

  try {
    // Handle both with and without prefix
    const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");

    // Create unique filename with timestamp
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const firebaseFileName = `${folder}/${timestamp}_${random}_${fileName}`;
    const file = bucket.file(firebaseFileName);

    // Detect content type from base64 or default to jpeg
    let contentType = "image/jpeg";
    if (base64.startsWith("data:image/png")) {
      contentType = "image/png";
    } else if (base64.startsWith("data:image/webp")) {
      contentType = "image/webp";
    }

    await file.save(buffer, {
      contentType,
      public: true,
      metadata: {
        cacheControl: "public, max-age=31536000",
      },
    });

    await file.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${firebaseFileName}`;
    console.log(`✅ Uploaded ${fileName} to Firebase:`, publicUrl);

    return publicUrl;
  } catch (error) {
    console.error(`Error uploading ${fileName} to Firebase:`, error);
    return null;
  }
};

interface RegisterDriverRequest extends Request {
  body: {
    licenceNumber: string;
    licenceExpiryDate: string;
    licenceFront: string;
    licenceBack: string;
    vehicleCategoryCode: string;
    vehicleCompanyCode: string;
    vehicleModelCode: string;
    vehicleNumber: string;
    vehicleColor: string;
    manufacturingYear: string;
    rcFront: string;
    rcBack: string;
    insurance?: string;
    pollutionCertificate?: string;
  };
}

// Required fields for validation
const REQUIRED_FIELDS = [
  "licenceNumber",
  "licenceExpiryDate",
  "licenceFront",
  "licenceBack",
  "vehicleCategoryCode",
  "vehicleCompanyCode",
  "vehicleModelCode",
  "vehicleNumber",
  "vehicleColor",
  "manufacturingYear",
  "rcFront",
  "rcBack",
] as const;

// Helper function to generate unique driver code
const nanoid = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 10);

export const generateDriverCode = async (): Promise<string> => {
  let driverCode = `DRV-${nanoid()}`;

  let exists = await RideDriver.exists({ driverCode });

  while (exists) {
    driverCode = `DRV-${nanoid()}`;
    exists = await RideDriver.exists({ driverCode });
  }

  return driverCode;
};

export const registerRideDriver = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Check if driver already exists
    const existingDriver = await RideDriver.findOne({ userId });
    if (existingDriver) {
      return res.status(409).json({
        success: false,
        message: "Driver already registered.",
      });
    }

    const body = req.body as RegisterDriverRequest["body"];

    // Validate required fields
    const missingFields = REQUIRED_FIELDS.filter(
      (field) =>
        !body[field] ||
        (typeof body[field] === "string" && body[field].trim() === ""),
    );

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    // Validate date
    const expiryDate = new Date(body.licenceExpiryDate);
    if (isNaN(expiryDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid licence expiry date format",
      });
    }

    // Check if licence is already expired
    if (expiryDate < new Date()) {
      return res.status(400).json({
        success: false,
        message: "Licence has already expired",
      });
    }

    // Upload documents in parallel for better performance
    const uploadPromises: Promise<[string, string | null]>[] = [];

    const filesToUpload: Array<{ key: string; data: string }> = [
      { key: "licenceFront", data: body.licenceFront },
      { key: "licenceBack", data: body.licenceBack },
      { key: "rcFront", data: body.rcFront },
      { key: "rcBack", data: body.rcBack },
    ];

    if (body.insurance) {
      filesToUpload.push({ key: "insurance", data: body.insurance });
    }
    if (body.pollutionCertificate) {
      filesToUpload.push({
        key: "pollutionCertificate",
        data: body.pollutionCertificate,
      });
    }

    // Create upload promises with timeout
    const uploadWithTimeout = async (file: { key: string; data: string }) => {
      const timeoutPromise = new Promise<[string, null]>((resolve) => {
        setTimeout(() => resolve([file.key, null]), 30000); // 30 second timeout
      });

      const uploadPromise = uploadBase64ToFirebase(
        file.data,
        file.key,
        "driver-documents",
      ).then((url) => [file.key, url] as [string, string | null]);

      return Promise.race([uploadPromise, timeoutPromise]);
    };

    for (const file of filesToUpload) {
      uploadPromises.push(uploadWithTimeout(file));
    }

    // Wait for all uploads to complete
    const uploadResults = await Promise.all(uploadPromises);
    const uploadedUrls: Record<string, string> = {};

    // Check for upload failures
    let hasUploadError = false;
    for (const [key, url] of uploadResults) {
      if (!url) {
        hasUploadError = true;
        console.error(`❌ Failed to upload ${key}`);
      } else {
        uploadedUrls[key] = url;
      }
    }

    if (hasUploadError) {
      return res.status(500).json({
        success: false,
        message: "Failed to upload some documents. Please try again.",
      });
    }

    // Validate manufacturing year
    const currentYear = new Date().getFullYear();
    const manufacturingYear = parseInt(body.manufacturingYear, 10);
    if (
      isNaN(manufacturingYear) ||
      manufacturingYear < 1900 ||
      manufacturingYear > currentYear
    ) {
      return res.status(400).json({
        success: false,
        message: `Invalid manufacturing year. Must be between 1900 and ${currentYear}`,
      });
    }

    // Generate unique driver code
    const driverCode = await generateDriverCode();

    // Create driver data - Using a plain object without type annotation
    const driverData = {
      userId,
      driverCode,
      licenceNumber: body.licenceNumber.trim().toUpperCase(),
      licenceExpiryDate: expiryDate,
      licenceFront: uploadedUrls.licenceFront,
      licenceBack: uploadedUrls.licenceBack,
      vehicle: {
        categoryCode: body.vehicleCategoryCode.trim().toUpperCase(),
        companyCode: body.vehicleCompanyCode.trim().toUpperCase(),
        modelCode: body.vehicleModelCode.trim().toUpperCase(),
        vehicleNumber: body.vehicleNumber.trim().toUpperCase(),
        vehicleColor: body.vehicleColor.trim(),
        manufacturingYear: manufacturingYear,
      },
      documents: {
        rcFront: uploadedUrls.rcFront,
        rcBack: uploadedUrls.rcBack,
        insurance: uploadedUrls.insurance || "",
        pollutionCertificate: uploadedUrls.pollutionCertificate || "",
      },
      status: "pending",
    };

    // Create and save driver
    const driver = new RideDriver(driverData);
    await driver.save();

    // Return success without sensitive data
    const responseData = {
      id: driver._id,
      userId: driver.userId,
      driverCode: driver.driverCode,
      licenceNumber: driver.licenceNumber,
      vehicleNumber: driver.vehicle?.vehicleNumber,
      status: driver.status,
      createdAt: (driver as any).createdAt,
    };

    return res.status(201).json({
      success: true,
      message: "Driver registered successfully. Awaiting verification.",
      data: responseData,
    });
  } catch (error) {
    console.error("Error in registerRideDriver:", error);

    // Proper error handling for unknown type
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    // Check for duplicate key error
    if (
      error instanceof Error &&
      error.name === "MongoServerError" &&
      (error as any).code === 11000
    ) {
      const field = Object.keys((error as any).keyPattern || {})[0];
      return res.status(409).json({
        success: false,
        message: `Duplicate value for ${field}. Please check your input.`,
      });
    }

    // Check for validation errors
    if (error instanceof Error && error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: (error as any).errors,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error. Please try again later.",
      ...(process.env.NODE_ENV === "development" && { error: errorMessage }),
    });
  }
};

export const getRideDriver = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const driver = await RideDriver.findOne({ userId });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Driver fetched successfully.",
      data: driver,
    });
  } catch (error) {
    console.error("Error in getRideDriver:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};
