
require("dotenv").config();

const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI;

const TARGET_COLLECTION = "airports";
const STAGING_COLLECTION = "airports_import_staging";

const BATCH_SIZE = 25;

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

function cleanNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function samePosition(a, b) {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a[0] === b[0] &&
    a[1] === b[1]
  );
}

// Validate Polygon coordinates and close rings when necessary.
// GeoJSON coordinates use [longitude, latitude].
function normalizePolygonCoordinates(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    throw new Error("Polygon has no rings");
  }

  return coordinates.map((ring, ringIndex) => {
    if (!Array.isArray(ring) || ring.length < 3) {
      throw new Error(`Ring ${ringIndex} has too few positions`);
    }

    const normalizedRing = ring.map((position, positionIndex) => {
      if (!Array.isArray(position) || position.length < 2) {
        throw new Error(
          `Invalid position at ring ${ringIndex}, position ${positionIndex}`,
        );
      }

      const longitude = Number(position[0]);
      const latitude = Number(position[1]);

      if (
        !Number.isFinite(longitude) ||
        !Number.isFinite(latitude) ||
        longitude < -180 ||
        longitude > 180 ||
        latitude < -90 ||
        latitude > 90
      ) {
        throw new Error(
          `Invalid longitude/latitude at ring ${ringIndex}, position ${positionIndex}`,
        );
      }

      return [longitude, latitude];
    });

    const first = normalizedRing[0];
    const last = normalizedRing[normalizedRing.length - 1];

    // A GeoJSON linear ring must be closed.
    if (!samePosition(first, last)) {
      normalizedRing.push([...first]);
    }

    if (normalizedRing.length < 4) {
      throw new Error(`Ring ${ringIndex} has fewer than 4 positions`);
    }

    return normalizedRing;
  });
}

function buildAirportDocument(feature) {
  if (!feature || !feature.geometry) {
    throw new Error("Geometry is missing");
  }

  if (feature.geometry.type !== "Polygon") {
    throw new Error(
      `Unsupported geometry type: ${feature.geometry.type}`,
    );
  }

  const p = feature.properties || {};
  const airportName = cleanString(p.airport);

  if (!airportName) {
    throw new Error("Airport name is missing");
  }

  const coordinates = normalizePolygonCoordinates(
    feature.geometry.coordinates,
  );

  return {
    airportName,

    // Actual Esri attribute names
    otherName: cleanString(p.other),
    state: cleanString(p.state),
    elevationMeters: cleanNumber(p.amsl),
    runwayDesignation: cleanString(p.rundes),
    runwayDimension: cleanString(p.dim),
    operatorOwner: cleanString(p.opeown),
    schedule: cleanString(p.scdul),
    source: cleanString(p.source),

    boundary: {
      type: "Polygon",
      coordinates,
    },

    sourceObjectId:
      p.objectid !== undefined && p.objectid !== null
        ? p.objectid
        : feature.id ?? null,

    dataSource: "Esri India Living Atlas",
    dataVersion: "India Airport Boundary 2025",

    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// =============================================================
// IMPORT AIRPORT BOUNDARIES
// =============================================================

async function importAirports() {
  let connected = false;
  let stagingCollection = null;

  try {
    console.log("=========================================");
    console.log("🚀 AIRPORT BOUNDARY IMPORT STARTED");
    console.log("=========================================");

    if (!MONGO_URI) {
      throw new Error("MONGO_URI not found in .env");
    }

    // ---------------------------------------------------------
    // CONNECT TO MONGODB
    // ---------------------------------------------------------

    await mongoose.connect(MONGO_URI);
    connected = true;

    console.log("✅ MongoDB connected");

    const db = mongoose.connection.db;

    // ---------------------------------------------------------
    // DOWNLOAD ESRI GEOJSON
    // ---------------------------------------------------------

    console.log("\n🌐 Downloading airport boundaries from Esri...\n");

    const response = await fetch(ESRI_URL);

    if (!response.ok) {
      throw new Error(
        `Esri request failed: ${response.status} ${response.statusText}`,
      );
    }

    const geojson = await response.json();

    if (!geojson || geojson.type !== "FeatureCollection") {
      throw new Error(
        `Expected FeatureCollection; received: ${geojson?.type ?? "empty response"}`,
      );
    }

    if (!Array.isArray(geojson.features)) {
      throw new Error("Esri GeoJSON features array not found");
    }

    console.log(`📦 Esri features received: ${geojson.features.length}`);

    if (geojson.features.length === 0) {
      throw new Error("No airport boundaries received from Esri");
    }

    // ---------------------------------------------------------
    // BUILD AND VALIDATE DOCUMENTS BEFORE WRITING
    // ---------------------------------------------------------

    const airports = [];
    const skippedFeatures = [];

    for (const feature of geojson.features) {
      try {
        airports.push(buildAirportDocument(feature));
      } catch (error) {
        skippedFeatures.push({
          featureId: feature?.id ?? null,
          reason: error.message,
        });
      }
    }

    console.log("\n-----------------------------------------");
    console.log(`✈️ Valid airport polygons: ${airports.length}`);
    console.log(`⚠️ Skipped features: ${skippedFeatures.length}`);
    console.log("-----------------------------------------");

    if (skippedFeatures.length > 0) {
      console.log("\n⚠️ First skipped features:");

      for (const item of skippedFeatures.slice(0, 10)) {
        console.log(
          `Feature ${item.featureId}: ${item.reason}`,
        );
      }
    }

    if (airports.length === 0) {
      throw new Error("No valid airport polygons found");
    }

    console.log("\n📍 Sample airports:");

    airports.slice(0, 10).forEach((airport, index) => {
      console.log(
        `${index + 1}. ${airport.airportName} | ${airport.state ?? "Unknown state"} | Elevation: ${airport.elevationMeters ?? "N/A"} m`,
      );
    });

    // ---------------------------------------------------------
    // PREPARE STAGING COLLECTION
    //
    // Existing "airports" data is NOT deleted at this stage.
    // ---------------------------------------------------------

    console.log("\n🧪 Preparing staging collection...");

    const existingStaging = await db
      .listCollections({ name: STAGING_COLLECTION })
      .hasNext();

    if (existingStaging) {
      await db.collection(STAGING_COLLECTION).drop();
      console.log("🧹 Removed previous staging collection");
    }

    stagingCollection = db.collection(STAGING_COLLECTION);

    // ---------------------------------------------------------
    // INSERT INTO STAGING IN BATCHES
    // ---------------------------------------------------------

    console.log("\n📥 Importing into staging collection...");

    for (let i = 0; i < airports.length; i += BATCH_SIZE) {
      const batch = airports.slice(i, i + BATCH_SIZE);

      await stagingCollection.insertMany(batch, {
        ordered: true,
      });

      console.log(
        `✅ Staged ${Math.min(i + batch.length, airports.length)} / ${airports.length}`,
      );
    }

    // ---------------------------------------------------------
    // CREATE GEO INDEX ON STAGING
    //
    // If MongoDB rejects a polygon, the original collection
    // remains untouched.
    // ---------------------------------------------------------

    console.log("\n🌍 Creating 2dsphere index on staging...");

    await stagingCollection.createIndex(
      { boundary: "2dsphere" },
      { name: "boundary_2dsphere" },
    );

    console.log("✅ Geospatial index validated");

    // ---------------------------------------------------------
    // CREATE OTHER INDEXES
    // ---------------------------------------------------------

    await stagingCollection.createIndex(
      { airportName: 1 },
      { name: "airportName_1" },
    );

    await stagingCollection.createIndex(
      { state: 1 },
      { name: "state_1" },
    );

    await stagingCollection.createIndex(
      { sourceObjectId: 1 },
      { name: "sourceObjectId_1" },
    );

    console.log("✅ All staging indexes created");

    // ---------------------------------------------------------
    // VERIFY STAGING DATA
    // ---------------------------------------------------------

    const stagedCount = await stagingCollection.countDocuments();

    if (stagedCount !== airports.length) {
      throw new Error(
        `Staging verification failed: expected ${airports.length}, found ${stagedCount}`,
      );
    }

    console.log(`✅ Staging verification passed: ${stagedCount} documents`);

    // ---------------------------------------------------------
    // REPLACE TARGET ONLY AFTER SUCCESSFUL VALIDATION
    // ---------------------------------------------------------

    console.log("\n🔄 Publishing imported airport collection...");

    // MongoDB renames the staging collection to "airports".
    // dropTarget replaces the old target collection if it exists.
    await stagingCollection.rename(TARGET_COLLECTION, {
      dropTarget: true,
    });

    stagingCollection = null;

    // ---------------------------------------------------------
    // FINAL VERIFICATION
    // ---------------------------------------------------------

    const targetCollection = db.collection(TARGET_COLLECTION);
    const finalCount = await targetCollection.countDocuments();

    if (finalCount !== airports.length) {
      throw new Error(
        `Final verification mismatch: expected ${airports.length}, found ${finalCount}`,
      );
    }

    console.log("\n=========================================");
    console.log("🎉 AIRPORT IMPORT COMPLETED");
    console.log("=========================================");
    console.log(`🌐 Esri features: ${geojson.features.length}`);
    console.log(`✈️ Valid polygons: ${airports.length}`);
    console.log(`⚠️ Skipped features: ${skippedFeatures.length}`);
    console.log(`🗄️ MongoDB documents: ${finalCount}`);
    console.log("🗺️ Geometry: Polygon");
    console.log("🌍 2dsphere index: YES");
    console.log("📡 Source: Esri India Living Atlas");
    console.log("📅 Version: India Airport Boundary 2025");
    console.log("=========================================");
  } catch (error) {
    console.error("\n=========================================");
    console.error("❌ AIRPORT IMPORT FAILED");
    console.error("=========================================");
    console.error("Error:", error.message);

    if (error.code !== undefined) {
      console.error("MongoDB error code:", error.code);
    }

    if (error.errInfo) {
      console.error(
        "Error details:",
        JSON.stringify(error.errInfo, null, 2),
      );
    }

    if (error.writeErrors) {
      for (const item of error.writeErrors) {
        console.error({
          index: item.index,
          code: item.code,
          message: item.errmsg || item.message,
        });
      }
    }

    console.error("=========================================");

    // Keep the staging collection for diagnosis.
    // The original "airports" collection is not cleared
    // during download, processing, insertion or index failure.
    process.exitCode = 1;
  } finally {
    if (connected) {
      try {
        await mongoose.disconnect();
        console.log("🔌 MongoDB disconnected");
      } catch (disconnectError) {
        console.error(
          "⚠️ MongoDB disconnect error:",
          disconnectError.message,
        );
      }
    }
  }
}

// =============================================================
// START
// =============================================================

importAirports();
