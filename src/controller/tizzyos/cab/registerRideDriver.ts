// controllers/rides/registerRideDriver.ts
import { Request, Response } from "express";
import RideDriver from "../../../models/tizzyos/cab/rideDriver";
import RideVehicleCategory from "../../../models/tizzyos/cab/rideVehicleCatigory";
import RideType from "../../../models/tizzyos/cab/rideType";
import { bucket } from "../../../firebase/firebase";
import { generateDriverCode } from "../../../utils/tizzyos/cab/idGenerator";

export const uploadBase64ToFirebase = async (
  base64: string,
  fileName: string,
  folder: string = "profiles",
): Promise<string | null> => {
  if (!base64) return null;

  try {
    const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const firebaseFileName = `${folder}/${timestamp}_${random}_${fileName}`;
    const file = bucket.file(firebaseFileName);

    let contentType = "image/jpeg";
    if (base64.startsWith("data:image/png")) contentType = "image/png";
    else if (base64.startsWith("data:image/webp")) contentType = "image/webp";

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
    rideTypeCode: string;
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

const REQUIRED_FIELDS = [
  "rideTypeCode",
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

export const registerRideDriver = async (req: Request, res: Response) => {
  console.log("=========================================");
  console.log("📌 REGISTER RIDE DRIVER API CALLED");
  console.log(`🕐 Timestamp: ${new Date().toISOString()}`);
  console.log("=========================================");

  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Check existing driver
    const existingDriver = await RideDriver.findOne({ userId });
    if (existingDriver) {
      return res.status(409).json({
        success: false,
        message: "Driver already registered.",
      });
    }

    const body = req.body as RegisterDriverRequest["body"];

    // ✅ Validate required fields
    const missingFields = REQUIRED_FIELDS.filter(
      (field) =>
        !body[field] ||
        (typeof body[field] === "string" && !body[field].trim()),
    );

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    // ✅ VALIDATE RIDE TYPE
    const rideType = await RideType.findOne({
      code: body.rideTypeCode.toLowerCase(),
    });

    if (!rideType) {
      return res.status(400).json({
        success: false,
        message: `Invalid ride type: ${body.rideTypeCode}`,
      });
    }

    // ✅ GET MODEL DETAILS
    let selectedModel: any = null;
    let selectedCategory: any = null;
    let selectedCompany: any = null;

    const categories = await RideVehicleCategory.find();
    for (const category of categories) {
      for (const company of category.companies) {
        const model = company.models.find(
          (m) => m.code.toLowerCase() === body.vehicleModelCode.toLowerCase(),
        );
        if (model) {
          selectedModel = model;
          selectedCompany = company;
          selectedCategory = category;
          break;
        }
      }
      if (selectedModel) break;
    }

    if (!selectedModel) {
      return res.status(400).json({
        success: false,
        message: `Model '${body.vehicleModelCode}' not found`,
      });
    }

    // ✅ VERIFY CLASS COMPATIBILITY
    if (!rideType.vehicleClasses.includes(selectedModel.vehicleClass)) {
      return res.status(400).json({
        success: false,
        message: `Model '${selectedModel.name}' (${selectedModel.vehicleClass}) is not allowed for '${rideType.name}' ride type. Allowed: ${rideType.vehicleClasses.join(", ")}`,
      });
    }

    // ✅ VALIDATE LICENCE EXPIRY
    const expiryDate = new Date(body.licenceExpiryDate);
    if (isNaN(expiryDate.getTime()) || expiryDate < new Date()) {
      return res.status(400).json({
        success: false,
        message:
          expiryDate < new Date()
            ? "Licence has already expired"
            : "Invalid licence expiry date",
      });
    }

    // ✅ UPLOAD DOCUMENTS
    const filesToUpload = [
      { key: "licenceFront", data: body.licenceFront },
      { key: "licenceBack", data: body.licenceBack },
      { key: "rcFront", data: body.rcFront },
      { key: "rcBack", data: body.rcBack },
    ];

    if (body.insurance)
      filesToUpload.push({ key: "insurance", data: body.insurance });
    if (body.pollutionCertificate)
      filesToUpload.push({
        key: "pollutionCertificate",
        data: body.pollutionCertificate,
      });

    const uploadPromises = filesToUpload.map(async (file) => {
      const url = await uploadBase64ToFirebase(
        file.data,
        file.key,
        "driver-documents",
      );
      return [file.key, url] as [string, string | null];
    });

    const uploadResults = await Promise.all(uploadPromises);
    const uploadedUrls: Record<string, string> = {};

    for (const [key, url] of uploadResults) {
      if (!url) {
        return res.status(500).json({
          success: false,
          message: `Failed to upload ${key}`,
        });
      }
      uploadedUrls[key] = url;
    }

    // ✅ VALIDATE MANUFACTURING YEAR
    const currentYear = new Date().getFullYear();
    const manufacturingYear = parseInt(body.manufacturingYear);
    if (
      isNaN(manufacturingYear) ||
      manufacturingYear < 1900 ||
      manufacturingYear > currentYear + 1
    ) {
      return res.status(400).json({
        success: false,
        message: `Invalid manufacturing year. Must be between 1900 and ${currentYear}`,
      });
    }

    // ✅ GENERATE DRIVER CODE
    const driverCode = await generateDriverCode();

    // ✅ 👇👇👇 IMPORTANT: ADD RIDE TYPES ARRAY
    // Get all ride types that support this vehicle class
    const allRideTypes = await RideType.find({});
    const supportedRideTypes = allRideTypes
      .filter((rt) => rt.vehicleClasses.includes(selectedModel.vehicleClass))
      .map((rt) => rt.code);

    console.log(
      `📋 Supported ride types for ${selectedModel.vehicleClass}: ${supportedRideTypes.join(", ")}`,
    );

    // ✅ CREATE DRIVER
    const driverData = {
      userId,
      driverCode,
      rideTypeCode: body.rideTypeCode.toLowerCase(),
      licenceNumber: body.licenceNumber.trim().toUpperCase(),
      licenceExpiryDate: expiryDate,
      licenceFront: uploadedUrls.licenceFront,
      licenceBack: uploadedUrls.licenceBack,
      vehicle: {
        categoryCode: body.vehicleCategoryCode.trim().toUpperCase(),
        companyCode: body.vehicleCompanyCode.trim().toUpperCase(),
        modelCode: body.vehicleModelCode.trim().toUpperCase(),
        vehicleNumber: body.vehicleNumber.trim().toUpperCase(),
        vehicleColor: body.vehicleColor.trim().toLowerCase(),
        manufacturingYear,
        vehicleType: selectedModel.vehicleType,
        vehicleClass: selectedModel.vehicleClass,
        baseFare: selectedModel.baseFare,
        classFare: selectedModel.classFare,
        maxPassengers: selectedModel.maxPassengers,
        hasAC: selectedModel.hasAC,
        luggageCapacity: selectedModel.luggageCapacity,
        handBagCapacity: selectedModel.handBagCapacity,
        seatCapacity: selectedModel.seatCapacity,
        passengerCapacity: selectedModel.passengerCapacity,
      },
      documents: {
        rcFront: uploadedUrls.rcFront,
        rcBack: uploadedUrls.rcBack,
        insurance: uploadedUrls.insurance || "",
        pollutionCertificate: uploadedUrls.pollutionCertificate || "",
      },
      status: "pending" as const,
    };

    const driver = new RideDriver(driverData);
    await driver.save();

    console.log(
      `✅ Driver saved with rideTypes: ${supportedRideTypes.join(", ")}`,
    );

    return res.status(201).json({
      success: true,
      message: "Driver registered successfully. Awaiting verification.",
      data: {
        id: driver._id,
        driverCode: driver.driverCode,
        status: driver.status,
        rideType: rideType.name,
        rideTypes: supportedRideTypes,
        vehicle: {
          name: selectedModel.name,
          type: selectedModel.vehicleType,
          class: selectedModel.vehicleClass,
        },
      },
    });
  } catch (error: any) {
    console.error("❌ Error in registerRideDriver:", error);
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Duplicate entry detected.",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

export const getRideDriver = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const driver = await RideDriver.findOne({ userId });
    if (!driver) {
      return res.status(404).json({ 
        success: false, 
        message: "Driver not found." 
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
      message: "Internal server error." 
    });
  }
};