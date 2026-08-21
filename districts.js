require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const turf = require("@turf/turf");

const MONGO_URI = process.env.MONGO_URI;

const DB_NAME = "TizzyGo-OS";
const COLLECTION_NAME = "districts";

// =============================================================
// GEOJSON FILES
// =============================================================

const ADM_GEOJSON_FILE = "./IND_ADM2.geojson";
const LGD_GEOJSON_FILE = "./IND_LGD2.geojson";

// =============================================================
// SETTINGS
// =============================================================

const BATCH_SIZE = 500;
const MAX_RETRY_ROUNDS = 5;

// false = existing MongoDB district data will NOT be deleted
const CLEAR_EXISTING_DATA = false;

// false = LGD priority
// true  = ADM priority
const PREFER_ADM = false;

// =============================================================
// REPORT FILES
// =============================================================

const FAILED_JSON_FILE = path.resolve("./failed-districts.json");
const FAILED_TXT_FILE = path.resolve("./failed-districts.txt");

// =============================================================
// ERROR MESSAGE
// =============================================================

function getMongoErrorMessage(error) {
  if (!error) {
    return "Unknown MongoDB error";
  }

  let message =
    error?.errmsg ||
    error?.message ||
    error?.err?.errmsg ||
    error?.err?.message ||
    "Unknown MongoDB error";

  message = String(message);

  const cutMarkers = [
    "geometry:",
    "coordinates:",
    "index:",
    "keyValue:",
    "keyPattern:",
    "writeErrors:",
    "op:",
  ];

  for (const marker of cutMarkers) {
    const index = message.indexOf(marker);

    if (index > 100) {
      message = message.substring(0, index);
    }
  }

  message = message
    .replace(/\s+/g, " ")
    .replace(/\[[^\]]{500,}\]/g, "[large data omitted]")
    .trim();

  if (message.length > 350) {
    message =
      message.substring(0, 350).trim() +
      "... [details omitted]";
  }

  return message || "Unknown MongoDB error";
}

// =============================================================
// FAILED FIELD
// =============================================================

function getFailedField(error) {
  if (!error) {
    return "unknown";
  }

  const message = String(
    error?.errmsg ||
      error?.message ||
      error?.err?.errmsg ||
      error?.err?.message ||
      "",
  ).toLowerCase();

  if (
    error?.code === 11000 ||
    message.includes("duplicate key") ||
    message.includes("e11000")
  ) {
    if (message.includes("shapeid")) {
      return "shapeId";
    }

    return "unique/index field";
  }

  if (
    message.includes("geometry") ||
    message.includes("geo key") ||
    message.includes("self-intersection") ||
    message.includes("intersection") ||
    message.includes("edges") ||
    message.includes("polygon") ||
    message.includes("loop") ||
    message.includes("geojson") ||
    message.includes("2dsphere")
  ) {
    return "geometry";
  }

  if (
    message.includes("shapeid") ||
    message.includes("shape id")
  ) {
    return "shapeId";
  }

  if (message.includes("name")) {
    return "name";
  }

  if (message.includes("shapegroup")) {
    return "shapeGroup";
  }

  if (message.includes("shapetype")) {
    return "shapeType";
  }

  return "unknown";
}

// =============================================================
// NAME NORMALIZATION
// =============================================================

function normalizeDistrictName(name) {
  if (name === null || name === undefined) {
    return "";
  }

  return String(name)
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// =============================================================
// DISPLAY NAME
// =============================================================

function cleanDistrictDisplayName(name) {
  if (name === null || name === undefined) {
    return null;
  }

  const value = String(name)
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();

  return value || null;
}

// =============================================================
// DISTRICT NAME
// =============================================================

function getDistrictName(properties) {
  if (!properties || typeof properties !== "object") {
    return null;
  }

  const possibleFields = [
    "shapeName",
    "district",
    "districtName",
    "district_name",
    "DISTRICT",
    "DISTRICT_NAME",
    "District",
    "District_Name",
    "dtname",
    "DTNAME",
    "dt_name",
    "DT_NAME",
    "name",
    "NAME",
    "NAME_2",
    "NAME2",
    "lgd_name",
    "LGD_NAME",
    "districtname",
    "DISTRICTNAME",
  ];

  for (const field of possibleFields) {
    const value = cleanDistrictDisplayName(
      properties[field],
    );

    if (value) {
      return value;
    }
  }

  return null;
}

// =============================================================
// GET PROPERTY
// =============================================================

function getProperty(properties, fields) {
  if (!properties || typeof properties !== "object") {
    return null;
  }

  for (const field of fields) {
    if (
      properties[field] !== undefined &&
      properties[field] !== null &&
      String(properties[field]).trim() !== ""
    ) {
      return properties[field];
    }
  }

  return null;
}

// =============================================================
// SHAPE ID
// =============================================================

function getShapeId(properties) {
  const value = getProperty(properties, [
    "shapeID",
    "shapeId",
    "shape_id",
    "ShapeID",
    "SHAPEID",
    "id",
    "ID",
    "lgdCode",
    "LGD_CODE",
    "lgd_code",
    "districtCode",
    "DISTRICT_CODE",
    "district_code",
    "code",
    "CODE",
  ]);

  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const stringValue = String(value).trim();

  if (!stringValue) {
    return null;
  }

  return stringValue;
}

// =============================================================
// SHAPE GROUP
// =============================================================

function getShapeGroup(properties) {
  return getProperty(properties, [
    "shapeGroup",
    "shape_group",
    "ShapeGroup",
    "SHAPEGROUP",
    "group",
    "GROUP",
  ]);
}

// =============================================================
// SHAPE TYPE
// =============================================================

function getShapeType(properties) {
  return getProperty(properties, [
    "shapeType",
    "shape_type",
    "ShapeType",
    "SHAPETYPE",
    "type",
    "TYPE",
  ]);
}

// =============================================================
// GEOMETRY SUMMARY
// =============================================================

function getGeometrySummary(geometry) {
  if (!geometry) {
    return {
      type: null,
      coordinateCount: 0,
      firstCoordinate: null,
    };
  }

  let coordinateCount = 0;
  let firstCoordinate = null;

  function walk(value) {
    if (!Array.isArray(value)) {
      return;
    }

    if (
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number"
    ) {
      coordinateCount++;

      if (!firstCoordinate) {
        firstCoordinate = [
          value[0],
          value[1],
        ];
      }

      return;
    }

    for (const child of value) {
      walk(child);
    }
  }

  walk(geometry.coordinates);

  return {
    type: geometry.type || null,
    coordinateCount,
    firstCoordinate,
  };
}

// =============================================================
// COORDINATE
// =============================================================

function sameCoordinate(a, b) {
  if (
    !Array.isArray(a) ||
    !Array.isArray(b)
  ) {
    return false;
  }

  return (
    a.length >= 2 &&
    b.length >= 2 &&
    Number(a[0]) === Number(b[0]) &&
    Number(a[1]) === Number(b[1])
  );
}

// =============================================================
// CLEAN RING
// =============================================================

function cleanRingManually(ring) {
  if (
    !Array.isArray(ring) ||
    ring.length === 0
  ) {
    return null;
  }

  const cleaned = [];

  for (const coordinate of ring) {
    if (
      !Array.isArray(coordinate) ||
      coordinate.length < 2 ||
      typeof coordinate[0] !== "number" ||
      typeof coordinate[1] !== "number"
    ) {
      continue;
    }

    const current = [
      coordinate[0],
      coordinate[1],
      ...(coordinate.length > 2
        ? coordinate.slice(2)
        : []),
    ];

    const previous =
      cleaned[cleaned.length - 1];

    if (
      !previous ||
      !sameCoordinate(previous, current)
    ) {
      cleaned.push(current);
    }
  }

  if (cleaned.length < 3) {
    return null;
  }

  if (
    cleaned.length > 1 &&
    sameCoordinate(
      cleaned[0],
      cleaned[cleaned.length - 1],
    )
  ) {
    cleaned.pop();
  }

  const unique = [];
  const seen = new Set();

  for (const coordinate of cleaned) {
    const key = `${coordinate[0]},${coordinate[1]}`;

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(coordinate);
    }
  }

  if (unique.length < 3) {
    return null;
  }

  unique.push([...unique[0]]);

  return unique;
}

// =============================================================
// CLEAN POLYGON
// =============================================================

function cleanPolygonGeometry(geometry) {
  if (!geometry) {
    return null;
  }

  if (geometry.type === "Polygon") {
    let coordinates =
      geometry.coordinates || [];

    try {
      const cleanedFeature =
        turf.cleanCoords(
          turf.feature(geometry),
        );

      if (
        cleanedFeature?.geometry?.coordinates
      ) {
        coordinates =
          cleanedFeature.geometry.coordinates;
      }
    } catch {
      // Manual cleanup below.
    }

    const cleanedRings = [];

    for (const ring of coordinates) {
      const cleanedRing =
        cleanRingManually(ring);

      if (cleanedRing) {
        cleanedRings.push(cleanedRing);
      }
    }

    if (cleanedRings.length === 0) {
      return null;
    }

    return {
      type: "Polygon",
      coordinates: cleanedRings,
    };
  }

  if (geometry.type === "MultiPolygon") {
    const cleanedPolygons = [];

    for (const polygon of
      geometry.coordinates || []) {
      const cleanedRings = [];

      for (const ring of polygon || []) {
        const cleanedRing =
          cleanRingManually(ring);

        if (cleanedRing) {
          cleanedRings.push(cleanedRing);
        }
      }

      if (cleanedRings.length > 0) {
        cleanedPolygons.push(
          cleanedRings,
        );
      }
    }

    if (cleanedPolygons.length === 0) {
      return null;
    }

    return {
      type: "MultiPolygon",
      coordinates: cleanedPolygons,
    };
  }

  return geometry;
}

// =============================================================
// UNKINK
// =============================================================

function tryUnkinkPolygon(geometry) {
  if (
    !geometry ||
    geometry.type !== "Polygon"
  ) {
    return null;
  }

  try {
    const result =
      turf.unkinkPolygon(
        turf.feature(geometry),
      );

    if (
      !result ||
      !Array.isArray(result.features) ||
      result.features.length === 0
    ) {
      return null;
    }

    const polygons =
      result.features
        .map(
          (feature) =>
            feature?.geometry,
        )
        .filter(
          (geometry) =>
            geometry &&
            geometry.type === "Polygon" &&
            Array.isArray(
              geometry.coordinates,
            ),
        );

    if (polygons.length === 0) {
      return null;
    }

    if (polygons.length === 1) {
      return polygons[0];
    }

    return {
      type: "MultiPolygon",
      coordinates: polygons.map(
        (polygon) =>
          polygon.coordinates,
      ),
    };
  } catch {
    return null;
  }
}

// =============================================================
// BUFFER REPAIR
// =============================================================

function tryBufferRepair(geometry) {
  if (!geometry) {
    return null;
  }

  try {
    const repaired =
      turf.buffer(
        turf.feature(geometry),
        0,
        {
          units: "kilometers",
        },
      );

    if (!repaired?.geometry) {
      return null;
    }

    if (
      repaired.geometry.type !==
        "Polygon" &&
      repaired.geometry.type !==
        "MultiPolygon"
    ) {
      return null;
    }

    return repaired.geometry;
  } catch {
    return null;
  }
}

// =============================================================
// REPAIR GEOMETRY
// =============================================================

function repairGeometry(geometry) {
  if (!geometry) {
    return {
      geometry: null,
      repaired: false,
      repairMethod: null,
      repairParts: 0,
      originalType: null,
    };
  }

  const originalType =
    geometry.type;

  if (
    geometry.type !== "Polygon" &&
    geometry.type !== "MultiPolygon"
  ) {
    return {
      geometry,
      repaired: false,
      repairMethod: null,
      repairParts: 0,
      originalType,
    };
  }

  const cleaned =
    cleanPolygonGeometry(
      geometry,
    );

  if (!cleaned) {
    return {
      geometry: null,
      repaired: false,
      repairMethod: "cleanup failed",
      repairParts: 0,
      originalType,
    };
  }

  const cleanedChanged =
    JSON.stringify(cleaned) !==
    JSON.stringify(geometry);

  if (
    cleaned.type === "MultiPolygon"
  ) {
    return {
      geometry: cleaned,
      repaired: cleanedChanged,
      repairMethod: cleanedChanged
        ? "Turf cleanCoords + duplicate vertex cleanup"
        : null,
      repairParts:
        cleaned.coordinates?.length || 0,
      originalType,
    };
  }

  const unkinked =
    tryUnkinkPolygon(cleaned);

  if (unkinked) {
    const finalGeometry =
      cleanPolygonGeometry(
        unkinked,
      );

    if (finalGeometry) {
      const changed =
        JSON.stringify(
          finalGeometry,
        ) !== JSON.stringify(geometry);

      return {
        geometry: finalGeometry,
        repaired: changed,
        repairMethod: changed
          ? "Turf cleanCoords + duplicate cleanup + unkinkPolygon"
          : null,
        repairParts:
          finalGeometry.type ===
          "MultiPolygon"
            ? finalGeometry.coordinates.length
            : 1,
        originalType,
      };
    }
  }

  const buffered =
    tryBufferRepair(cleaned);

  if (buffered) {
    const finalGeometry =
      cleanPolygonGeometry(
        buffered,
      );

    if (finalGeometry) {
      return {
        geometry: finalGeometry,
        repaired: true,
        repairMethod:
          "Turf cleanCoords + duplicate cleanup + buffer(0)",
        repairParts:
          finalGeometry.type ===
          "MultiPolygon"
            ? finalGeometry.coordinates.length
            : 1,
        originalType,
      };
    }
  }

  return {
    geometry: cleaned,
    repaired: cleanedChanged,
    repairMethod: cleanedChanged
      ? "Turf cleanCoords + duplicate vertex cleanup"
      : null,
    repairParts:
      cleaned.type === "MultiPolygon"
        ? cleaned.coordinates.length
        : 1,
    originalType,
  };
}

// =============================================================
// PREPARE DOCUMENT
// =============================================================

function prepareDocumentFromFeature(
  feature,
  source,
  counters,
) {
  const properties =
    feature.properties || {};

  const districtName =
    getDistrictName(properties);

  if (!districtName) {
    counters.skippedInvalid++;

    console.log(
      `⚠️ ${source}: District name not found.`,
    );

    return null;
  }

  if (!feature.geometry) {
    counters.skippedNoGeometry++;

    console.log(
      `⚠️ ${source}: Missing geometry: ${districtName}`,
    );

    return null;
  }

  const repairResult =
    repairGeometry(
      feature.geometry,
    );

  const geometry =
    repairResult.geometry;

  if (repairResult.repaired) {
    counters.repairedCount++;

    if (
      geometry?.type ===
      "MultiPolygon"
    ) {
      counters.repairedToMultiPolygon++;
    }

    console.log("");
    console.log(
      `🛠️ Geometry repaired: ${districtName}`,
    );
    console.log(
      `   Source: ${source}`,
    );
    console.log(
      `   Method: ${repairResult.repairMethod}`,
    );
    console.log(
      `   Original: ${repairResult.originalType}`,
    );
    console.log(
      `   Result: ${geometry?.type}`,
    );
    console.log(
      `   Parts: ${repairResult.repairParts}`,
    );
  }

  if (!geometry) {
    counters.skippedInvalid++;

    console.log(
      `⚠️ Geometry repair failed: ${districtName}`,
    );

    return null;
  }

  // =========================================================
  // IMPORTANT FIX
  //
  // shapeId null/undefined EMPTY hone par field add hi nahi
  // hogi.
  //
  // Isse MongoDB unique index mein multiple null entries
  // ka problem nahi aayega.
  // =========================================================

  const shapeId =
    getShapeId(properties);

  const document = {
    name: districtName,

    shapeGroup:
      getShapeGroup(properties),

    shapeType:
      getShapeType(properties),

    geometry,

    source,

    createdAt: new Date(),

    updatedAt: new Date(),
  };

  // ONLY add shapeId if valid
  if (shapeId) {
    document.shapeId = shapeId;
  } else {
    counters.missingShapeId++;

    console.log(
      `ℹ️ No shapeId: ${districtName} (${source})`,
    );
  }

  return document;
}

// =============================================================
// BUILD DISTRICT MAP
// =============================================================

function buildDistrictMap(
  admFeatures,
  lgdFeatures,
  counters,
) {
  const districtMap =
    new Map();

  const firstSource =
    PREFER_ADM ? "ADM" : "LGD";

  const secondSource =
    PREFER_ADM ? "LGD" : "ADM";

  const firstFeatures =
    PREFER_ADM
      ? admFeatures
      : lgdFeatures;

  const secondFeatures =
    PREFER_ADM
      ? lgdFeatures
      : admFeatures;

  // =========================================================
  // FIRST SOURCE
  // =========================================================

  console.log("");
  console.log(
    `📥 Processing ${firstSource} first...`,
  );
  console.log("");

  for (const feature of firstFeatures) {
    const document =
      prepareDocumentFromFeature(
        feature,
        firstSource,
        counters,
      );

    if (!document) {
      continue;
    }

    const key =
      normalizeDistrictName(
        document.name,
      );

    if (!key) {
      counters.skippedInvalid++;
      continue;
    }

    if (districtMap.has(key)) {
      counters.duplicateSameSource++;

      const existing =
        districtMap.get(key);

      console.log(
        `⚠️ Duplicate ${firstSource}: ${document.name}`,
      );

      console.log(
        `   Keeping: ${existing.name}`,
      );

      continue;
    }

    districtMap.set(
      key,
      document,
    );
  }

  // =========================================================
  // SECOND SOURCE
  // =========================================================

  console.log("");
  console.log(
    `📥 Processing ${secondSource}...`,
  );
  console.log("");

  for (const feature of secondFeatures) {
    const document =
      prepareDocumentFromFeature(
        feature,
        secondSource,
        counters,
      );

    if (!document) {
      continue;
    }

    const key =
      normalizeDistrictName(
        document.name,
      );

    if (!key) {
      counters.skippedInvalid++;
      continue;
    }

    if (districtMap.has(key)) {
      counters.sameDistrictBothSources++;

      const existing =
        districtMap.get(key);

      console.log(
        `🔄 Same district ADM + LGD: ${document.name}`,
      );

      console.log(
        `   Keeping: ${existing.source}`,
      );

      console.log(
        `   Ignoring: ${document.source}`,
      );

      continue;
    }

    districtMap.set(
      key,
      document,
    );

    counters.onlyInOneSource++;

    console.log(
      `➕ Only in ${document.source}: ${document.name}`,
    );
  }

  return districtMap;
}

// =============================================================
// EXISTING DATABASE MAP
// =============================================================

async function getExistingDistrictMap(
  collection,
) {
  console.log("");
  console.log(
    "🔎 Checking existing MongoDB districts...",
  );
  console.log("");

  const existingDocuments =
    await collection
      .find(
        {},
        {
          projection: {
            _id: 1,
            name: 1,
            shapeId: 1,
          },
        },
      )
      .toArray();

  const existingMap =
    new Map();

  for (const document of existingDocuments) {
    const key =
      normalizeDistrictName(
        document.name,
      );

    if (!key) {
      continue;
    }

    if (!existingMap.has(key)) {
      existingMap.set(
        key,
        document,
      );
    }
  }

  console.log(
    `🗄️ Existing documents: ${existingDocuments.length}`,
  );

  console.log(
    `🗺️ Existing unique names: ${existingMap.size}`,
  );

  return existingMap;
}

// =============================================================
// FILTER EXISTING
// =============================================================

function filterDocumentsAgainstDatabase(
  documents,
  existingDistrictMap,
  counters,
) {
  const filteredDocuments = [];

  for (const document of documents) {
    const key =
      normalizeDistrictName(
        document.name,
      );

    if (
      existingDistrictMap.has(key)
    ) {
      counters.skippedAlreadyInDatabase++;

      const existing =
        existingDistrictMap.get(key);

      console.log(
        `⏭️ Already exists: ${document.name}`,
      );

      console.log(
        `   Existing shapeId: ${
          existing.shapeId ?? "N/A"
        }`,
      );

      continue;
    }

    filteredDocuments.push(
      document,
    );
  }

  return filteredDocuments;
}

// =============================================================
// CHECK DUPLICATE SHAPE IDS
// =============================================================

function checkDuplicateShapeIds(
  documents,
) {
  const shapeIdMap =
    new Map();

  const duplicateShapeIds = [];

  for (const document of documents) {
    // Missing shapeId is completely allowed.
    if (!document.shapeId) {
      continue;
    }

    if (
      shapeIdMap.has(
        document.shapeId,
      )
    ) {
      duplicateShapeIds.push({
        shapeId: document.shapeId,
        districts: [
          shapeIdMap.get(
            document.shapeId,
          ),
          document.name,
        ],
      });
    } else {
      shapeIdMap.set(
        document.shapeId,
        document.name,
      );
    }
  }

  return duplicateShapeIds;
}

// =============================================================
// ENSURE SHAPE ID INDEX
// =============================================================

async function ensureShapeIdIndex(
  collection,
) {
  console.log("");
  console.log(
    "🔐 Preparing shapeId index...",
  );
  console.log("");

  const indexes =
    await collection.indexes();

  const existingShapeIndex =
    indexes.find(
      (index) =>
        index.name === "shapeId_1" ||
        (
          index.key &&
          index.key.shapeId === 1
        ),
    );

  if (existingShapeIndex) {
    console.log(
      "⚠️ Existing shapeId index found:",
    );

    console.log(
      `   Name: ${existingShapeIndex.name}`,
    );

    console.log(
      `   Unique: ${existingShapeIndex.unique ?? false}`,
    );

    console.log(
      `   Sparse: ${existingShapeIndex.sparse ?? false}`,
    );

    console.log(
      "🗑️ Dropping old shapeId index...",
    );

    await collection.dropIndex(
      existingShapeIndex.name,
    );

    console.log(
      "✅ Old shapeId index dropped.",
    );
  }

  // ===========================================================
  // IMPORTANT:
  //
  // partialFilterExpression means:
  //
  // shapeId string => indexed
  // shapeId null   => ignored
  // missing        => ignored
  //
  // This is safer than sparse for this dataset.
  // ===========================================================

  await collection.createIndex(
    {
      shapeId: 1,
    },
    {
      name: "shapeId_1",
      unique: true,
      partialFilterExpression: {
        shapeId: {
          $type: "string",
        },
      },
    },
  );

  console.log(
    "✅ New partial unique shapeId index created.",
  );

  console.log(
    "   ✔ Real shapeId values must be unique",
  );

  console.log(
    "   ✔ null shapeId allowed",
  );

  console.log(
    "   ✔ missing shapeId allowed",
  );
}

// =============================================================
// ENSURE GEOMETRY INDEX
// =============================================================

async function ensureGeometryIndex(
  collection,
) {
  console.log("");
  console.log(
    "🌍 Checking geometry 2dsphere index...",
  );

  const indexes =
    await collection.indexes();

  const geometryIndex =
    indexes.find(
      (index) =>
        index.key &&
        index.key.geometry ===
          "2dsphere",
    );

  if (geometryIndex) {
    console.log(
      `✅ Geometry index already exists: ${geometryIndex.name}`,
    );

    return;
  }

  await collection.createIndex(
    {
      geometry: "2dsphere",
    },
    {
      name: "geometry_2dsphere",
    },
  );

  console.log(
    "✅ geometry 2dsphere index created.",
  );
}

// =============================================================
// FAILURE
// =============================================================

function createFailure(
  error,
  district,
  attempts = 1,
) {
  return {
    name:
      district?.name ||
      "Unknown District",

    shapeId:
      district?.shapeId ?? null,

    shapeGroup:
      district?.shapeGroup ?? null,

    shapeType:
      district?.shapeType ?? null,

    source:
      district?.source ?? null,

    field:
      getFailedField(error),

    code:
      error?.code ?? null,

    error:
      getMongoErrorMessage(error),

    attempts,

    geometry:
      getGeometrySummary(
        district?.geometry,
      ),

    document: district,
  };
}

// =============================================================
// PRINT FAILURE
// =============================================================

function printFailure(
  failure,
) {
  console.log(
    `❌ ${failure.name}`,
  );

  console.log(
    `   Source: ${failure.source || "N/A"}`,
  );

  console.log(
    `   Field: ${failure.field}`,
  );

  console.log(
    `   Error: ${failure.error}`,
  );

  console.log(
    `   Retry attempts: ${failure.attempts}`,
  );
}

// =============================================================
// SAVE JSON
// =============================================================

function saveJsonReport(
  failedDistricts,
) {
  const report = {
    generatedAt:
      new Date().toISOString(),

    totalFailed:
      failedDistricts.length,

    districts:
      failedDistricts,
  };

  fs.writeFileSync(
    FAILED_JSON_FILE,
    JSON.stringify(
      report,
      null,
      2,
    ),
    "utf8",
  );
}

// =============================================================
// SAVE TXT
// =============================================================

function saveTxtReport(
  failedDistricts,
) {
  const lines = [];

  lines.push(
    "========================================",
  );

  lines.push(
    "FAILED DISTRICTS REPORT",
  );

  lines.push(
    "========================================",
  );

  lines.push("");

  lines.push(
    `Generated: ${new Date().toISOString()}`,
  );

  lines.push(
    `Total failed: ${failedDistricts.length}`,
  );

  lines.push("");

  if (
    failedDistricts.length === 0
  ) {
    lines.push(
      "🎉 No failed districts.",
    );
  } else {
    failedDistricts.forEach(
      (failure, index) => {
        lines.push(
          "----------------------------------------",
        );

        lines.push(
          `FAILED DISTRICT #${index + 1}`,
        );

        lines.push(
          "----------------------------------------",
        );

        lines.push(
          `District: ${failure.name}`,
        );

        lines.push(
          `Source: ${failure.source ?? "N/A"}`,
        );

        lines.push(
          `Shape ID: ${failure.shapeId ?? "N/A"}`,
        );

        lines.push(
          `Field: ${failure.field}`,
        );

        lines.push(
          `Error Code: ${failure.code ?? "N/A"}`,
        );

        lines.push(
          `Short Error: ${failure.error}`,
        );

        lines.push(
          `Retry Attempts: ${failure.attempts}`,
        );

        lines.push(
          `Geometry Type: ${
            failure.geometry?.type ??
            "N/A"
          }`,
        );

        lines.push(
          `Coordinate Count: ${
            failure.geometry
              ?.coordinateCount ?? 0
          }`,
        );

        if (
          failure.geometry
            ?.firstCoordinate
        ) {
          lines.push(
            `First Coordinate: ${JSON.stringify(
              failure.geometry
                .firstCoordinate,
            )}`,
          );
        }

        lines.push("");
      },
    );
  }

  lines.push(
    "========================================",
  );

  lines.push(
    "END OF REPORT",
  );

  lines.push(
    "========================================",
  );

  fs.writeFileSync(
    FAILED_TXT_FILE,
    lines.join("\n"),
    "utf8",
  );
}

// =============================================================
// REPORTS
// =============================================================

function saveReports(
  failedDistricts,
) {
  saveJsonReport(
    failedDistricts,
  );

  saveTxtReport(
    failedDistricts,
  );
}

// =============================================================
// READ GEOJSON
// =============================================================

function readGeoJsonFile(
  filePath,
) {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `GeoJSON file not found: ${filePath}`,
    );
  }

  const fileContent =
    fs.readFileSync(
      filePath,
      "utf8",
    );

  const geojson =
    JSON.parse(fileContent);

  if (
    geojson.type !==
      "FeatureCollection" ||
    !Array.isArray(
      geojson.features,
    )
  ) {
    throw new Error(
      `Invalid GeoJSON FeatureCollection: ${filePath}`,
    );
  }

  return {
    geojson,
    fileContent,
  };
}

// =============================================================
// MAIN IMPORT
// =============================================================

async function importDistricts() {
  let mongoConnected = false;

  let insertedCount = 0;

  let failedQueue = [];

  let finalFailedDistricts = [];

  const counters = {
    skippedNoGeometry: 0,
    skippedInvalid: 0,

    repairedCount: 0,
    repairedToMultiPolygon: 0,

    duplicateSameSource: 0,
    sameDistrictBothSources: 0,

    onlyInOneSource: 0,

    skippedAlreadyInDatabase: 0,

    missingShapeId: 0,
  };

  try {
    // =========================================================
    // START
    // =========================================================

    console.log("");
    console.log(
      "🚀 ========================================",
    );
    console.log(
      "🚀 DISTRICT DATA IMPORT STARTED",
    );
    console.log(
      "🚀 ========================================",
    );
    console.log("");

    // =========================================================
    // STEP 1
    // =========================================================

    console.log(
      "🔍 STEP 1: Checking environment...",
    );
    console.log("");

    if (!MONGO_URI) {
      throw new Error(
        "MONGO_URI is not defined in environment variables.",
      );
    }

    console.log(
      "✅ MONGO_URI found.",
    );

    console.log(
      `🗄️ Database: ${DB_NAME}`,
    );

    console.log(
      `📦 Collection: ${COLLECTION_NAME}`,
    );

    console.log(
      `📄 ADM: ${ADM_GEOJSON_FILE}`,
    );

    console.log(
      `📄 LGD: ${LGD_GEOJSON_FILE}`,
    );

    console.log(
      `📦 Batch size: ${BATCH_SIZE}`,
    );

    console.log(
      `🔁 Max retry rounds: ${MAX_RETRY_ROUNDS}`,
    );

    console.log(
      `🏆 Priority: ${
        PREFER_ADM
          ? "ADM"
          : "LGD"
      }`,
    );

    console.log(
      `🗑️ Clear existing DB: ${
        CLEAR_EXISTING_DATA
          ? "YES"
          : "NO"
      }`,
    );

    console.log(
      "🆔 shapeId: NULL/MISSING allowed",
    );

    console.log("");

    // =========================================================
    // STEP 2
    // =========================================================

    console.log(
      "🔌 STEP 2: Connecting MongoDB...",
    );

    await mongoose.connect(
      MONGO_URI,
      {
        dbName: DB_NAME,
      },
    );

    mongoConnected = true;

    console.log(
      "✅ MongoDB connected.",
    );

    const db =
      mongoose.connection.db;

    const collection =
      db.collection(
        COLLECTION_NAME,
      );

    console.log("");

    // =========================================================
    // STEP 3
    // =========================================================

    console.log(
      "🗄️ ========================================",
    );

    console.log(
      "🗄️ STEP 3: EXISTING DATABASE DATA",
    );

    console.log(
      "🗄️ ========================================",
    );

    console.log("");

    if (CLEAR_EXISTING_DATA) {
      const existingCount =
        await collection.countDocuments();

      console.log(
        `📊 Existing documents: ${existingCount}`,
      );

      if (existingCount > 0) {
        const result =
          await collection.deleteMany(
            {},
          );

        console.log(
          `🗑️ Deleted: ${result.deletedCount}`,
        );
      }

      console.log(
        "✅ Collection cleaned.",
      );
    } else {
      console.log(
        "ℹ️ Existing data will be preserved.",
      );
    }

    console.log("");

    // =========================================================
    // STEP 4 - READ ADM
    // =========================================================

    console.log(
      "📖 STEP 4: Reading ADM GeoJSON...",
    );

    const {
      geojson: admGeojson,
      fileContent: admFileContent,
    } = readGeoJsonFile(
      ADM_GEOJSON_FILE,
    );

    console.log(
      "✅ ADM GeoJSON loaded.",
    );

    console.log(
      `📊 ADM features: ${admGeojson.features.length}`,
    );

    console.log(
      `📄 ADM size: ${(
        Buffer.byteLength(
          admFileContent,
        ) /
        1024 /
        1024
      ).toFixed(2)} MB`,
    );

    console.log("");

    // =========================================================
    // STEP 5 - READ LGD
    // =========================================================

    console.log(
      "📖 STEP 5: Reading LGD GeoJSON...",
    );

    const {
      geojson: lgdGeojson,
      fileContent: lgdFileContent,
    } = readGeoJsonFile(
      LGD_GEOJSON_FILE,
    );

    console.log(
      "✅ LGD GeoJSON loaded.",
    );

    console.log(
      `📊 LGD features: ${lgdGeojson.features.length}`,
    );

    console.log(
      `📄 LGD size: ${(
        Buffer.byteLength(
          lgdFileContent,
        ) /
        1024 /
        1024
      ).toFixed(2)} MB`,
    );

    console.log("");

    // =========================================================
    // STEP 6
    // =========================================================

    console.log(
      "🛠️ ========================================",
    );

    console.log(
      "🛠️ STEP 6: PREPARING ADM + LGD",
    );

    console.log(
      "🛠️ ========================================",
    );

    const districtMap =
      buildDistrictMap(
        admGeojson.features,
        lgdGeojson.features,
        counters,
      );

    let documents =
      Array.from(
        districtMap.values(),
      );

    console.log("");

    console.log(
      `📦 Unique districts: ${documents.length}`,
    );

    console.log(
      `🔄 Same in ADM + LGD: ${counters.sameDistrictBothSources}`,
    );

    console.log(
      `➕ Only one source: ${counters.onlyInOneSource}`,
    );

    console.log(
      `⚠️ Duplicate same source: ${counters.duplicateSameSource}`,
    );

    console.log(
      `🆔 Missing shapeId: ${counters.missingShapeId}`,
    );

    console.log(
      `🛠️ Repaired geometries: ${counters.repairedCount}`,
    );

    console.log(
      `⚠️ Missing geometry: ${counters.skippedNoGeometry}`,
    );

    console.log(
      `⚠️ Invalid: ${counters.skippedInvalid}`,
    );

    if (documents.length === 0) {
      throw new Error(
        "No valid districts found.",
      );
    }

    console.log("");

    // =========================================================
    // STEP 7
    // =========================================================

    console.log(
      "🔎 ========================================",
    );

    console.log(
      "🔎 STEP 7: FILTER EXISTING DISTRICTS",
    );

    console.log(
      "🔎 ========================================",
    );

    const existingDistrictMap =
      CLEAR_EXISTING_DATA
        ? new Map()
        : await getExistingDistrictMap(
            collection,
          );

    documents =
      filterDocumentsAgainstDatabase(
        documents,
        existingDistrictMap,
        counters,
      );

    console.log("");

    console.log(
      `📦 New districts: ${documents.length}`,
    );

    console.log(
      `⏭️ Already in DB: ${counters.skippedAlreadyInDatabase}`,
    );

    if (documents.length === 0) {
      console.log("");
      console.log(
        "🎉 No new districts to insert.",
      );

      saveReports([]);

      return;
    }

    // =========================================================
    // STEP 8
    // DUPLICATE SHAPE ID CHECK
    // =========================================================

    console.log("");
    console.log(
      "🔎 Checking duplicate real shapeIds...",
    );

    const duplicateShapeIds =
      checkDuplicateShapeIds(
        documents,
      );

    if (
      duplicateShapeIds.length > 0
    ) {
      console.log(
        `❌ Duplicate shapeIds: ${duplicateShapeIds.length}`,
      );

      for (const duplicate of
        duplicateShapeIds) {
        console.log(
          `   ${duplicate.shapeId}: ${duplicate.districts.join(
            " ↔ ",
          )}`,
        );
      }

      throw new Error(
        "Duplicate real shapeId detected. Import stopped.",
      );
    }

    console.log(
      "✅ No duplicate real shapeIds.",
    );

    console.log(
      `ℹ️ Documents without shapeId: ${
        documents.filter(
          (d) => !d.shapeId,
        ).length
      }`,
    );

    console.log("");

    // =========================================================
    // STEP 9 - INDEXES
    // =========================================================

    console.log(
      "🔐 STEP 9: Preparing indexes...",
    );

    await ensureShapeIdIndex(
      collection,
    );

    await ensureGeometryIndex(
      collection,
    );

    console.log("");

    // =========================================================
    // STEP 10 - INSERT
    // =========================================================

    console.log(
      "💾 ========================================",
    );

    console.log(
      "💾 STEP 10: BATCH INSERT",
    );

    console.log(
      "💾 ========================================",
    );

    const totalBatches =
      Math.ceil(
        documents.length /
          BATCH_SIZE,
      );

    for (
      let i = 0;
      i < documents.length;
      i += BATCH_SIZE
    ) {
      const batch =
        documents.slice(
          i,
          i + BATCH_SIZE,
        );

      const batchNumber =
        Math.floor(
          i / BATCH_SIZE,
        ) + 1;

      console.log("");
      console.log(
        `📦 Batch ${batchNumber}/${totalBatches}`,
      );

      try {
        const result =
          await collection.insertMany(
            batch,
            {
              ordered: false,
            },
          );

        const count =
          result.insertedCount || 0;

        insertedCount += count;

        console.log(
          `   ✅ Inserted: ${count}`,
        );
      } catch (error) {
        if (
          Array.isArray(
            error.writeErrors,
          )
        ) {
          const failedIndexes =
            new Set();

          for (const writeError of
            error.writeErrors) {
            failedIndexes.add(
              writeError.index,
            );
          }

          const batchInserted =
            batch.length -
            failedIndexes.size;

          insertedCount +=
            batchInserted;

          console.log(
            `   ⚠️ Failed: ${failedIndexes.size}`,
          );

          console.log(
            `   ✅ Inserted: ${batchInserted}`,
          );

          for (const writeError of
            error.writeErrors) {
            const index =
              writeError.index;

            const district =
              batch[index];

            if (!district) {
              continue;
            }

            const failure =
              createFailure(
                writeError,
                district,
                1,
              );

            failedQueue.push(
              failure,
            );

            console.log("");

            printFailure(
              failure,
            );
          }
        } else {
          throw error;
        }
      }

      const processed =
        Math.min(
          i + batch.length,
          documents.length,
        );

      console.log(
        `   📈 Progress: ${(
          (processed /
            documents.length) *
          100
        ).toFixed(2)}%`,
      );

      console.log(
        `   📊 Inserted: ${insertedCount}/${documents.length}`,
      );

      console.log(
        `   🔁 Retry queue: ${failedQueue.length}`,
      );
    }

    // =========================================================
    // STEP 11 - RETRIES
    // =========================================================

    console.log("");
    console.log(
      "🔁 ========================================",
    );

    console.log(
      "🔁 STEP 11: RETRY FAILED",
    );

    console.log(
      "🔁 ========================================",
    );

    for (
      let round = 1;
      round <= MAX_RETRY_ROUNDS;
      round++
    ) {
      if (
        failedQueue.length === 0
      ) {
        break;
      }

      console.log("");
      console.log(
        `🔁 RETRY ROUND ${round}/${MAX_RETRY_ROUNDS}`,
      );

      const currentQueue =
        failedQueue;

      failedQueue = [];

      let retrySuccess = 0;

      for (const failure of
        currentQueue) {
        const district =
          failure.document;

        try {
          await collection.insertOne(
            district,
          );

          insertedCount++;
          retrySuccess++;

          console.log(
            `   ✅ Recovered: ${district.name}`,
          );
        } catch (error) {
          const newFailure =
            createFailure(
              error,
              district,
              failure.attempts + 1,
            );

          failedQueue.push(
            newFailure,
          );

          console.log(
            `   ❌ Still failed: ${district.name}`,
          );

          console.log(
            `      Field: ${newFailure.field}`,
          );

          console.log(
            `      Error: ${newFailure.error}`,
          );
        }
      }

      console.log("");
      console.log(
        `   ✅ Recovered: ${retrySuccess}`,
      );

      console.log(
        `   ❌ Remaining: ${failedQueue.length}`,
      );

      console.log(
        `   📊 Inserted: ${insertedCount}/${documents.length}`,
      );
    }

    finalFailedDistricts =
      failedQueue;

    // =========================================================
    // REPORTS
    // =========================================================

    saveReports(
      finalFailedDistricts,
    );

    // =========================================================
    // STEP 12 - VERIFICATION
    // =========================================================

    console.log("");
    console.log(
      "🔎 ========================================",
    );

    console.log(
      "🔎 STEP 12: FINAL VERIFICATION",
    );

    console.log(
      "🔎 ========================================",
    );

    const finalCount =
      await collection.countDocuments();

    console.log("");
    console.log(
      `📦 New districts expected: ${documents.length}`,
    );

    console.log(
      `✅ Successfully inserted: ${insertedCount}`,
    );

    console.log(
      `❌ Permanently failed: ${finalFailedDistricts.length}`,
    );

    console.log(
      `🗄️ Total MongoDB documents: ${finalCount}`,
    );

    console.log("");

    console.log(
      "========================================",
    );

    console.log(
      "📊 FINAL SUMMARY",
    );

    console.log(
      "========================================",
    );

    console.log(
      `📄 ADM features: ${admGeojson.features.length}`,
    );

    console.log(
      `📄 LGD features: ${lgdGeojson.features.length}`,
    );

    console.log(
      `📦 Unique districts: ${districtMap.size}`,
    );

    console.log(
      `🏆 Priority: ${
        PREFER_ADM
          ? "ADM"
          : "LGD"
      }`,
    );

    console.log(
      `🔄 Both sources: ${counters.sameDistrictBothSources}`,
    );

    console.log(
      `➕ One source only: ${counters.onlyInOneSource}`,
    );

    console.log(
      `⏭️ Already in DB: ${counters.skippedAlreadyInDatabase}`,
    );

    console.log(
      `🆔 Missing shapeId: ${counters.missingShapeId}`,
    );

    console.log(
      `🛠️ Repaired: ${counters.repairedCount}`,
    );

    console.log(
      `⚠️ Missing geometry: ${counters.skippedNoGeometry}`,
    );

    console.log(
      `⚠️ Invalid: ${counters.skippedInvalid}`,
    );

    console.log(
      `✅ Inserted: ${insertedCount}`,
    );

    console.log(
      `❌ Failed: ${finalFailedDistricts.length}`,
    );

    console.log(
      `🗄️ MongoDB total: ${finalCount}`,
    );

    console.log("");

    if (
      finalFailedDistricts.length === 0 &&
      insertedCount ===
        documents.length
    ) {
      console.log(
        "🎉 ========================================",
      );

      console.log(
        "🎉 DISTRICT IMPORT COMPLETED SUCCESSFULLY",
      );

      console.log(
        "🎉 ========================================",
      );
    } else {
      console.log(
        "⚠️ ========================================",
      );

      console.log(
        "⚠️ DISTRICT IMPORT COMPLETED WITH FAILURES",
      );

      console.log(
        "⚠️ ========================================",
      );
    }

    console.log("");

    console.log(
      `📄 JSON report: ${FAILED_JSON_FILE}`,
    );

    console.log(
      `📄 TXT report : ${FAILED_TXT_FILE}`,
    );

    if (
      finalFailedDistricts.length >
      0
    ) {
      console.log("");

      console.log(
        "❌ FINAL FAILED DISTRICTS:",
      );

      finalFailedDistricts.forEach(
        (failure, index) => {
          console.log(
            `${index + 1}. ${failure.name}`,
          );

          console.log(
            `   Source: ${failure.source}`,
          );

          console.log(
            `   Field: ${failure.field}`,
          );

          console.log(
            `   Error: ${failure.error}`,
          );

          console.log("");
        },
      );
    }
  } catch (error) {
    console.log("");
    console.log(
      "❌ ========================================",
    );

    console.log(
      "❌ IMPORT FAILED",
    );

    console.log(
      "❌ ========================================",
    );

    console.log("");

    console.error(
      "💥 Error:",
      getMongoErrorMessage(error),
    );

    console.error(
      "🔢 Code:",
      error?.code ?? "N/A",
    );
  } finally {
    if (mongoConnected) {
      console.log("");
      console.log(
        "🔌 Closing MongoDB connection...",
      );

      await mongoose.disconnect();

      console.log(
        "✅ MongoDB connection closed.",
      );
    }

    console.log("");
    console.log(
      "👋 Script finished.",
    );
    console.log("");
  }
}

// =============================================================
// START
// =============================================================

console.log("");
console.log(
  "▶️ Starting import-districts.js...",
);
console.log("");

importDistricts();