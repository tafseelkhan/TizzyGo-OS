// File: controllers/tizzyos/seller/createProduct.ts

import { Request, Response } from "express";
import mongoose from "mongoose";
import { Product } from "../../../../models/tizzyos/seller/AddProducts/Products";
import { generateProductId } from "../../../../utils/tizzyos/seller/generateCustomId";
import User from "../../../../models/tizzyos/auths/User";

const createCombinationKey = (fields: Record<string, string>): string => {
  return Object.entries(fields)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join("|");
};

const validateVariantFields = (
  fields: any,
  variantOptions: string[],
  variantValues: Map<string, string[]>,
) => {
  if (!fields || typeof fields !== "object") {
    return { valid: false, error: "Variant fields must be an object" };
  }

  for (const option of variantOptions) {
    if (!fields[option]) {
      return { valid: false, error: `Missing variant field: ${option}` };
    }
  }

  for (const [key, value] of Object.entries(fields)) {
    const allowedValues = variantValues.get(key);
    if (allowedValues && !allowedValues.includes(value as string)) {
      return {
        valid: false,
        error: `Invalid value "${value}" for ${key}`,
      };
    }
  }

  return { valid: true };
};

const generateSKU = (title: string, variantIndex: number): string => {
  const cleanTitle = title
    .substring(0, 4)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");

  return `TZ-${cleanTitle || "PROD"}-${timestamp}-${random}-${variantIndex + 1}`;
};

export const createProduct = async (req: Request, res: Response) => {
  try {
    console.log("🚀 CREATE PRODUCT API");

    const sellerId = req.user?._id;
    if (!sellerId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    console.log("userId:", sellerId);

    const seller = await User.findById(sellerId).select("vendorCodeUID name");

    if (!seller?.vendorCodeUID) {
      return res.status(400).json({
        success: false,
        message: "vendorCodeUID missing",
      });
    }

    const body = req.body;
    console.log("body:", body);

    // Validate fulfillmentType
    const fulfillmentType = body.fulfillmentType;
    if (!fulfillmentType || !["SELLER", "FWS"].includes(fulfillmentType)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid or missing fulfillmentType. Must be 'SELLER' or 'FWS'",
      });
    }

    // Get seller location from request body
    const sellerLocation = {
      address: body.sellerLocation?.address || "",
      latitude: body.sellerLocation?.latitude || 0,
      longitude: body.sellerLocation?.longitude || 0,
      googlePlaceId: body.sellerLocation?.googlePlaceId || "",
    };

    const variantOptions = body.variantOptions || [];

    const variantValuesMap = new Map<string, string[]>();
    if (body.variantValues) {
      for (const [k, v] of Object.entries(body.variantValues)) {
        if (Array.isArray(v)) variantValuesMap.set(k, v);
      }
    }

    // ✅ FIX 1: REMOVED productGstType - ab har variant ka apna GST type hoga
    // No longer using product level GST type

    // Frontend will send pre-calculated values
    const processedVariants = [];
    const combinationKeys = new Set();
    const skus = new Set();
    let hasDefault = false;

    // ================= VARIANTS LOOP =================
    for (let i = 0; i < body.variants.length; i++) {
      const variant = body.variants[i];

      const fieldsObj = variant.fields || {};
      const validation = validateVariantFields(
        fieldsObj,
        variantOptions,
        variantValuesMap,
      );

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.error,
        });
      }

      const combinationKey = createCombinationKey(fieldsObj);

      if (combinationKeys.has(combinationKey)) {
        return res.status(400).json({
          success: false,
          message: "Duplicate variant combination",
        });
      }

      combinationKeys.add(combinationKey);

      let sku = variant.sku || generateSKU(body.title, i);

      if (skus.has(sku)) {
        return res.status(400).json({
          success: false,
          message: "Duplicate SKU",
        });
      }

      skus.add(sku);

      const images = variant.images || [];

      if (!images.length) {
        return res.status(400).json({
          success: false,
          message: "Images required",
        });
      }

      // Validate and store numeric dimension fields
      const weight = Number(variant.weight || 0);
      const weightUnit = variant.weightUnit || "GRAM";
      if (!["GRAM", "KG"].includes(weightUnit)) {
        return res.status(400).json({
          success: false,
          message: "Invalid weightUnit. Must be 'GRAM' or 'KG'",
        });
      }

      const length = Number(variant.length || 0);
      const width = Number(variant.width || 0);
      const height = Number(variant.height || 0);
      const dimensionUnit = variant.dimensionUnit || "CM";
      if (!["CM", "INCH"].includes(dimensionUnit)) {
        return res.status(400).json({
          success: false,
          message: "Invalid dimensionUnit. Must be 'CM' or 'INCH'",
        });
      }

      // ✅ FIX 2: HAR VARIANT KA APNA GST TYPE USE KARO
      const variantGstType = variant.gstType || "EXCLUSIVE";
      if (!["INCLUSIVE", "EXCLUSIVE"].includes(variantGstType)) {
        return res.status(400).json({
          success: false,
          message: `Invalid gstType for variant ${i + 1}. Must be 'INCLUSIVE' or 'EXCLUSIVE'`,
        });
      }

      console.log(
        `💰 Variant ${i + 1} - GST Type: ${variantGstType}, GST Rate: ${variant.gstRate || 18}%`,
      );

      // FRONTEND SENDS PRE-CALCULATED VALUES (NO CALCULATION HERE)
      const variantData: any = {
        fields: fieldsObj,
        combinationKey,
        sku,

        mrp: variant.mrp,
        price: variant.price,

        // These values come from frontend (calculated via pricing API)
        savedAmount: variant.savedAmount || 0,
        discount: variant.discount || 0,
        finalPrice: variant.finalPrice || variant.price,

        // Dimension fields
        weight,
        weightUnit,
        length,
        width,
        height,
        dimensionUnit,

        // ✅ FIX 3: VARIANT LEVEL GST FIELDS - har variant ka apna
        gstRate: variant.gstRate || 18,
        gstType: variantGstType, // ← YAHAN PEHLE productGstType tha, ab variant ka apna
        gstSource: variant.gstSource || "manual",
        gstAmount: variant.gstAmount || 0, // Always include gstAmount

        inStock: variant.inStock ?? true,
        quantityAvailable: variant.quantityAvailable || 0,
        images,
        video: variant.video || null,

        isDefault: variant.isDefault || (i === 0 && !hasDefault),
      };

      if (variantData.isDefault) hasDefault = true;

      processedVariants.push(variantData);
    }

    if (!hasDefault && processedVariants.length) {
      processedVariants[0].isDefault = true;
    }

    const defaultVariant = processedVariants.find((v) => v.isDefault);

    // Process specs and highlights
    const processedSpecs =
      body.specs && typeof body.specs === "object"
        ? Object.keys(body.specs).reduce(
            (acc, key) => {
              if (body.specs[key] && body.specs[key].trim()) {
                acc[key] = body.specs[key];
              }
              return acc;
            },
            {} as Record<string, string>,
          )
        : {};

    const processedHighlights = Array.isArray(body.highlights)
      ? body.highlights.filter((h: string) => h && h.trim())
      : [];

    // ================= CREATE PRODUCT =================
    const product = new Product({
      sellerId: new mongoose.Types.ObjectId(sellerId),
      vendorCodeUID: seller.vendorCodeUID,
      productId: generateProductId(),

      title: body.title,
      brand: body.brand,
      description: body.description || "",
      category: body.category,
      subcategory: body.subcategory,

      deliveryTime: body.deliveryTime || "",
      warranty: body.warranty || "",
      returnPolicy: body.returnPolicy || "",

      shortDescription: body.shortDescription || "",
      fullDescription: body.fullDescription || "",

      fulfillmentType: fulfillmentType,

      specs: processedSpecs,
      highlights: processedHighlights,

      variants: processedVariants,

      sellerLocation: sellerLocation,

      variantOptions,
      variantValues: variantValuesMap,

      protectPromiseFees: body.protectPromiseFees || false,
      freeDelivery: body.freeDelivery || false,
      fastDelivery: body.fastDelivery || false,
      safety: body.safety || false,
      productQuality: body.productQuality || false,
      paymentOptions: body.paymentOptions || false,
      manufacturer: body.manufacturer || false,
      cashOnDelivery: body.cashOnDelivery || false,
      deliveryVehicleType: body.deliveryVehicleType || false,

      verified: false,
    });

    await product.save();

    console.log(`✅ Product created with ${processedVariants.length} variants`);
    processedVariants.forEach((v, idx) => {
      console.log(
        `   Variant ${idx + 1}: GST Type = ${v.gstType}, GST Rate = ${v.gstRate}%`,
      );
    });

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: product,
    });
  } catch (error: any) {
    console.error("Create product error:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to create product.",
    });
  }
};

// GET all products (public)
export const getAllProducts = async (req: Request, res: Response) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });

    const response = products.map((p) => ({
      productId: p._id, // ID direct naam se
      fullProduct: p, // pura full product object
    }));

    return res.status(200).json({
      products: response,
    });
  } catch (error) {
    console.error("Get all products error:", error);
    return res.status(500).json({ error: "Failed to fetch products" });
  }
};

export const getProductById = async (req: Request, res: Response) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.status(200).json({ success: true, product });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch product" });
  }
};

export const getProductDetailsForBuyNow = async (
  req: Request,
  res: Response,
) => {
  try {
    const { productId, variantId } = req.params;

    console.log("========== BUY NOW API CALLED ==========");
    console.log("📦 Received productId:", productId);
    console.log("🔖 Received variantId:", variantId);

    // ✅ Dono se find karo - _id ya productId
    const product = await Product.findOne({
      $or: [
        { _id: productId }, // MongoDB _id se find
        { productId: productId }, // productId field se find
      ],
    }).lean();

    console.log("🔍 Product found in DB:", product ? "YES" : "NO");

    if (!product) {
      console.log("❌ Product not found for ID:", productId);
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    console.log("📋 Product Title:", product.title);
    console.log("🏷️ Product Brand:", product.brand);
    console.log("📦 Total Variants:", product.variants?.length || 0);

    const selectedVariant =
      product.variants?.find((variant) => variant.variantId === variantId) ||
      null;

    console.log("🎯 Selected Variant found:", selectedVariant ? "YES" : "NO");

    if (!selectedVariant) {
      console.log("❌ Variant not found for variantId:", variantId);
      console.log(
        "Available variantIds:",
        product.variants?.map((v) => v.variantId),
      );
      return res.status(404).json({
        success: false,
        message: "Variant not found",
      });
    }

    console.log("💰 Selected Variant Price:", selectedVariant.price);
    console.log("💵 Selected Variant Final Price:", selectedVariant.finalPrice);
    console.log(
      "📸 Selected Variant Images:",
      selectedVariant.images?.length || 0,
    );

    const productData = {
      _id: product._id,
      productId: product.productId,
      title: product.title,
      brand: product.brand,
      description: product.description,
      category: product.category,
      subcategory: product.subcategory,

      shortDescription: product.shortDescription,
      fullDescription: product.fullDescription,
      highlights: product.highlights,

      sellerId: product.sellerId,
      sellerLocation: product.sellerLocation,

      deliveryTime: product.deliveryTime,
      warranty: product.warranty,
      returnPolicy: product.returnPolicy,

      fulfillmentType: product.fulfillmentType,

      freeDelivery: product.freeDelivery,
      fastDelivery: product.fastDelivery,
      cashOnDelivery: product.cashOnDelivery,

      verified: product.verified,
    };

    console.log("📤 Sending response to frontend...");
    console.log("Response Data:", {
      success: true,
      productId: productData.productId,
      productTitle: productData.title,
      selectedVariantId: selectedVariant.variantId,
      selectedVariantPrice: selectedVariant.price,
    });
    console.log("========== API RESPONSE SENT ==========");
    console.log(
      "📤 Full Response being sent:",
      JSON.stringify(
        {
          success: true,
          product: productData,
          selectedVariant,
        },
        null,
        2,
      ),
    );
    return res.status(200).json({
      success: true,
      product: productData,
      selectedVariant,
    });
  } catch (error) {
    console.error("❌ Get Product Details Error:", error);
    console.error("Error details:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch product details",
    });
  }
};

export const getUserProducts = async (req: Request, res: Response) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    console.log("Fetched products:", products);

    const response = products.map((p) => {
      const v = p.variants?.[0];

      let image = null;

      // CORRECT THE PATH - image is in v.fields.images[0]
      if (v?.fields?.images?.[0]) {
        image = v.fields.images[0];
      }
      // Also check v.images as backup
      else if (v?.images?.[0]) {
        image = v.images[0];
      }

      return {
        id: p._id,
        title: p.title,
        category: p.category,
        price: p.variants[0]?.price,
        image: image, // ← AB SAHI IMAGE AAYEGA!
        variantsCount: p.variants.length,
        createdAt: p.createdAt,
        // Also send variants for frontend compatibility
        variants: p.variants,
      };
    });

    console.log(
      "API Response images:",
      response.map((r) => r.image),
    );
    res.status(200).json({ products: response });
  } catch (error) {
    console.error("Get products error:", error);
    console.error("Get all products error:", error);
    res.status(500).json({ error: "Failed to fetch products" });
    console.error("Get all products error:", error);
  }
};
