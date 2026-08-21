// airports.js

require("dotenv").config();

const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI;

const TARGET_COLLECTION = "airports";

const BATCH_SIZE = 25;

// =============================================================
// ESRI AIRPORT BOUNDARY GEOJSON URL
// =============================================================

const ESRI_URL =
  "https://livingatlas.esri.in/server1/rest/services/India/Airport_Boundary/MapServer/0/query" +
  "?where=1%3D1" +
  "&outFields=*" +
  "&returnGeometry=true" +
  "&outSR=4326" +
  "&f=geojson";

// =============================================================
// HELPERS
// =============================================================

function cleanString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const result = String(value)
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();

  return result || null;
}

// =============================================================
// IMPORT AIRPORT BOUNDARIES
// =============================================================

async function importAirports() {
  let connected = false;

  try {
    console.log("=========================================");
    console.log("🚀 AIRPORT BOUNDARY IMPORT STARTED");
    console.log("=========================================");

    // ---------------------------------------------------------
    // CHECK MONGO URI
    // ---------------------------------------------------------

    if (!MONGO_URI) {
      throw new Error("MONGO_URI not found in .env");
    }

    // ---------------------------------------------------------
    // CONNECT MONGODB
    // ---------------------------------------------------------

    await mongoose.connect(MONGO_URI);

    connected = true;

    console.log("✅ MongoDB connected");

    const db = mongoose.connection.db;

    const targetCollection = db.collection(TARGET_COLLECTION);

    // ---------------------------------------------------------
    // DOWNLOAD GEOJSON FROM ESRI
    // ---------------------------------------------------------

    console.log("");
    console.log("🌐 Downloading airport boundaries from Esri...");
    console.log("");

    const response = await fetch(ESRI_URL);

    if (!response.ok) {
      throw new Error(
        `Esri request failed: ${response.status} ${response.statusText}`,
      );
    }

    const geojson = await response.json();

    // ---------------------------------------------------------
    // CHECK GEOJSON
    // ---------------------------------------------------------

    if (!geojson) {
      throw new Error("Esri returned empty response");
    }

    if (geojson.type !== "FeatureCollection") {
      console.log("Esri response:", geojson);

      throw new Error(
        `Expected FeatureCollection but received: ${geojson.type}`,
      );
    }

    if (!Array.isArray(geojson.features)) {
      throw new Error("Esri GeoJSON features array not found");
    }

    console.log(
      `📦 Esri features received: ${geojson.features.length}`,
    );

    if (geojson.features.length === 0) {
      throw new Error("No airport boundaries received from Esri");
    }

    // ---------------------------------------------------------
    // PROCESS FEATURES
    // ---------------------------------------------------------

    const airports = [];

    let skipped = 0;

    for (const feature of geojson.features) {
      try {
        if (!feature.geometry) {
          console.log(
            `⚠️ Geometry missing: ${feature.id}`,
          );

          skipped++;
          continue;
        }

        const geometryType = feature.geometry.type;

        // -----------------------------------------------------
        // POLYGON
        // -----------------------------------------------------

        if (geometryType !== "Polygon") {
          console.log(
            `⚠️ Skipping ${feature.id}: geometry=${geometryType}`,
          );

          skipped++;
          continue;
        }

        // -----------------------------------------------------
        // COORDINATES
        // -----------------------------------------------------

        const coordinates = feature.geometry.coordinates;

        if (
          !Array.isArray(coordinates) ||
          coordinates.length === 0
        ) {
          console.log(
            `⚠️ Coordinates missing: ${feature.id}`,
          );

          skipped++;
          continue;
        }

        // -----------------------------------------------------
        // PROPERTIES
        // -----------------------------------------------------

        const p = feature.properties || {};

        const airportName = cleanString(p.airport_name);

        if (!airportName) {
          console.log(
            `⚠️ Airport name missing: ${feature.id}`,
          );

          skipped++;
          continue;
        }

        // -----------------------------------------------------
        // CREATE FINAL DOCUMENT
        // -----------------------------------------------------

        const airport = {
          airportName,

          otherName: cleanString(p.other_name),

          state: cleanString(p.state),

          elevationMeters:
            typeof p.aerodrome_elevation === "number"
              ? p.aerodrome_elevation
              : null,

          runwayDesignation:
            cleanString(p.runway_designation),

          runwayDimension:
            cleanString(p.runway_dimension),

          operatorOwner:
            cleanString(p.operator_owner),

          schedule:
            cleanString(p.schedule),

          source:
            cleanString(p.source),

          // ===============================================
          // ACTUAL AIRPORT BOUNDARY
          // ===============================================

          boundary: {
            type: "Polygon",
            coordinates,
          },

          // ===============================================
          // SOURCE INFORMATION
          // ===============================================

          sourceObjectId:
            p.objectid !== undefined &&
            p.objectid !== null
              ? p.objectid
              : feature.id || null,

          dataSource:
            "Esri India Living Atlas",

          dataVersion:
            "India Airport Boundary 2025",

          createdAt: new Date(),

          updatedAt: new Date(),
        };

        airports.push(airport);
      } catch (featureError) {
        console.log(
          `⚠️ Feature processing failed: ${feature.id}`,
          featureError.message,
        );

        skipped++;
      }
    }

    // ---------------------------------------------------------
    // VALIDATION
    // ---------------------------------------------------------

    console.log("");
    console.log("-----------------------------------------");
    console.log(
      `✈️ Valid airport polygons: ${airports.length}`,
    );
    console.log(
      `⚠️ Skipped features: ${skipped}`,
    );
    console.log("-----------------------------------------");

    if (airports.length === 0) {
      throw new Error(
        "No valid airport polygons found",
      );
    }

    // ---------------------------------------------------------
    // SHOW SAMPLE DATA
    // ---------------------------------------------------------

    console.log("");
    console.log("📍 Sample airports:");

    airports.slice(0, 10).forEach((airport, index) => {
      console.log(
        `${index + 1}. ${airport.airportName} | ${airport.state}`,
      );
    });

    // ---------------------------------------------------------
    // CLEAR OLD AIRPORT BOUNDARIES
    // ---------------------------------------------------------

    console.log("");
    console.log(
      "🗑️ Removing old airportBoundaries data...",
    );

    const deleteResult =
      await targetCollection.deleteMany({});

    console.log(
      `🗑️ Removed: ${deleteResult.deletedCount}`,
    );

    // ---------------------------------------------------------
    // INSERT DATA IN BATCHES
    // ---------------------------------------------------------

    console.log("");
    console.log("📥 Inserting airport boundaries...");

    for (
      let i = 0;
      i < airports.length;
      i += BATCH_SIZE
    ) {
      const batch = airports.slice(
        i,
        i + BATCH_SIZE,
      );

      await targetCollection.insertMany(batch);

      const inserted = Math.min(
        i + BATCH_SIZE,
        airports.length,
      );

      console.log(
        `✅ Inserted ${inserted} / ${airports.length}`,
      );
    }

    // ---------------------------------------------------------
    // CREATE GEO INDEX
    // ---------------------------------------------------------

    console.log("");
    console.log("🌍 Creating 2dsphere index...");

    await targetCollection.createIndex({
      boundary: "2dsphere",
    });

    console.log("✅ 2dsphere index created");

    // ---------------------------------------------------------
    // OTHER INDEXES
    // ---------------------------------------------------------

    await targetCollection.createIndex({
      airportName: 1,
    });

    await targetCollection.createIndex({
      state: 1,
    });

    await targetCollection.createIndex({
      sourceObjectId: 1,
    });

    console.log("✅ Airport indexes created");

    // ---------------------------------------------------------
    // VERIFY
    // ---------------------------------------------------------

    const finalCount =
      await targetCollection.countDocuments();

    console.log("");
    console.log("=========================================");
    console.log("🎉 AIRPORT IMPORT COMPLETED");
    console.log("=========================================");
    console.log(
      `🌐 Esri features: ${geojson.features.length}`,
    );
    console.log(
      `✈️ Valid polygons: ${airports.length}`,
    );
    console.log(
      `🗄️ MongoDB documents: ${finalCount}`,
    );
    console.log("🗺️ Boundary: Polygon");
    console.log("🌍 2dsphere index: YES");
    console.log(
      "📡 Source: Esri India Living Atlas",
    );
    console.log(
      "📅 Version: India Airport Boundary 2025",
    );
    console.log("=========================================");

    await mongoose.disconnect();

    console.log("🔌 MongoDB disconnected");
  } catch (error) {
    console.log("");
    console.log("=========================================");
    console.log("❌ AIRPORT IMPORT FAILED");
    console.log("=========================================");
    console.error(error);
    console.log("=========================================");

    if (connected) {
      try {
        await mongoose.disconnect();
      } catch {}
    }

    process.exit(1);
  }
}

// =============================================================
// START
// =============================================================

importAirports();