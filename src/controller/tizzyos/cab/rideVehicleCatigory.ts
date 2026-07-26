// controllers/rides/getRideVehicleCategories.ts
import { Request, Response } from "express";
import RideVehicleCategory from "../../../models/tizzyos/cab/rideVehicleCatigory";
import RideType from "../../../models/tizzyos/cab/rideType";

export const getRideVehicleCategories = async (req: Request, res: Response) => {
  console.log("=========================================");
  console.log("📌 GET RIDE VEHICLE CATEGORIES API CALLED");
  console.log(`🕐 Timestamp: ${new Date().toISOString()}`);
  console.log(`📋 Request URL: ${req.url}`);
  console.log(`📋 Request Method: ${req.method}`);
  console.log(
    `📋 Full URL: ${req.protocol}://${req.get("host")}${req.originalUrl}`,
  );
  console.log("=========================================");

  try {
    const { rideTypeCode } = req.query;

    console.log(`🔍 Query Parameters:`);
    console.log(`   - rideTypeCode: ${rideTypeCode || "NOT PROVIDED"}`);

    // Agar rideTypeCode nahi hai toh saari categories bhejo
    if (!rideTypeCode) {
      console.log("⚠️ No rideTypeCode provided, fetching all categories...");

      const categories = await RideVehicleCategory.find().sort({ category: 1 });

      console.log(`📊 Total categories found: ${categories.length}`);

      if (!categories || categories.length === 0) {
        console.warn("⚠️ No vehicle categories found in database");
        console.log("=========================================");
        return res.status(404).json({
          success: false,
          message: "Ride vehicle categories not found.",
          data: [],
        });
      }

      console.log("✅ All categories fetched successfully");
      console.log("=========================================");
      return res.status(200).json({
        success: true,
        message: "Ride vehicle categories fetched successfully.",
        data: categories,
      });
    }

    // ✅ Ride Type fetch karo
    console.log(`🔄 Fetching ride type: ${rideTypeCode}...`);
    const rideType = await RideType.findOne({
      code: rideTypeCode.toString().toLowerCase(),
    });

    if (!rideType) {
      console.warn(`⚠️ Ride type '${rideTypeCode}' not found`);
      console.log("=========================================");
      return res.status(404).json({
        success: false,
        message: `Ride type '${rideTypeCode}' not found`,
        data: [],
      });
    }

    console.log(`✅ Ride Type Found:`);
    console.log(`   - Name: ${rideType.name}`);
    console.log(`   - Code: ${rideType.code}`);
    console.log(`   - Vehicle Classes: ${rideType.vehicleClasses.join(", ")}`);

    const allowedClasses = rideType.vehicleClasses;
    console.log(`📊 Allowed Vehicle Classes: ${allowedClasses.join(", ")}`);

    // ✅ Saari categories fetch karo
    console.log("🔄 Fetching all vehicle categories...");
    const allCategories = await RideVehicleCategory.find().sort({
      category: 1,
    });

    console.log(`📊 Total categories found: ${allCategories.length}`);

    // ✅ Filter categories based on allowed classes
    // Helper to safely convert mongoose docs or plain objects
    const toPlain = (doc: any) =>
      doc && typeof doc.toObject === "function" ? doc.toObject() : doc;

    console.log("🔄 Filtering categories based on allowed classes...");

    const filteredCategories = allCategories
      .map((category) => {
        const filteredCompanies = (category.companies || [])
          .map((company: any) => {
            const filteredModels = (company.models || []).filter((model: any) =>
              allowedClasses.includes(model.vehicleClass),
            );
            return {
              ...toPlain(company),
              models: filteredModels,
            };
          })
          .filter((company: any) => company.models.length > 0);

        return {
          ...toPlain(category),
          companies: filteredCompanies,
        };
      })
      .filter((category: any) => category.companies.length > 0);

    console.log(`📊 Filtered categories: ${filteredCategories.length}`);

    if (filteredCategories.length > 0) {
      filteredCategories.forEach((category: any, index: number) => {
        console.log(`   ${index + 1}. ${category.category} (${category.code})`);
        console.log(`      - Companies: ${category.companies.length}`);
        category.companies.forEach((company: any) => {
          console.log(
            `        • ${company.name}: ${company.models.length} models`,
          );
          company.models.forEach((model: any) => {
            console.log(`          - ${model.name} (${model.vehicleClass})`);
          });
        });
      });
    } else {
      console.warn("⚠️ No filtered categories found");
    }

    if (!filteredCategories || filteredCategories.length === 0) {
      console.warn(`⚠️ No vehicles found for ride type '${rideType.name}'`);
      console.log("=========================================");
      return res.status(404).json({
        success: false,
        message: `No vehicles found for ride type '${rideType.name}'`,
        data: [],
      });
    }

    console.log(
      `✅ Vehicle categories fetched successfully for '${rideType.name}'`,
    );
    console.log("=========================================");

    return res.status(200).json({
      success: true,
      message: `Vehicle categories fetched successfully.`,
      data: filteredCategories,
    });
  } catch (error) {
    console.error("❌ Error fetching ride vehicle categories:", error);
    console.error("❌ Error details:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    console.log("=========================================");
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};
