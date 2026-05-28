import { Request, Response } from "express";
import mongoose from "mongoose";
import { Product } from "../../../../models/tizzyos/seller/AddProducts/Products";
import { generateProductId } from "../../../../utils/tizzyos/seller/generateCustomId";
import User from "../../../../models/tizzyos/auths/User";
import { GST_RATES } from "../../../../config/tizzygo/gstRates";

// ================= GST HELPER =================
const getGSTRate = (category: string, subcategory: string): number => {
  const cat = GST_RATES.find((c) => c.category === category);
  if (!cat) return 18;

  return cat.subcategories?.[subcategory] ?? cat.defaultRate ?? 18;
};

// ================= PRICE CALCULATION =================
const calculatePricing = (mrp: number, price: number) => {
  if (!mrp || !price) {
    return {
      savedAmount: 0,
      discount: 0,
      finalPrice: price || 0,
    };
  }

  const savedAmount = mrp - price;
  const discount = (savedAmount / mrp) * 100;

  return {
    savedAmount: Number(savedAmount.toFixed(2)),
    discount: Number(discount.toFixed(2)),
    finalPrice: Number(price.toFixed(2)),
  };
};

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

// ================= MAIN CONTROLLER =================
export const createProduct = async (req: Request, res: Response) => {
  try {
    console.log("🚀 CREATE PRODUCT API");

    const sellerId = (req as any).seller?._id;
    if (!sellerId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const seller = await User.findById(sellerId).select("vendorCodeUID name");

    if (!seller?.vendorCodeUID) {
      return res.status(400).json({
        success: false,
        message: "vendorCodeUID missing",
      });
    }

    const body = req.body;

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

      // ================= PRICE AUTO CALC =================
      const pricing = calculatePricing(variant.mrp, variant.price);

      const variantData = {
        fields: fieldsObj,
        combinationKey,
        sku,

        mrp: variant.mrp,
        price: variant.price,

        savedAmount: pricing.savedAmount,
        discount: pricing.discount,
        finalPrice: pricing.finalPrice,

        // ✅ FIX: Store dimensions properly
        weight: variant.weight || "",
        height: variant.height || "",
        width: variant.width || "",
        length: variant.length || "",

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

    // ================= GST AUTO CALC =================
    const gstRate = getGSTRate(body.category, body.subcategory);

    // ✅ FIX: Process specs and highlights properly
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

    // ================= PRODUCT =================
    const product = new Product({
      sellerId: new mongoose.Types.ObjectId(sellerId),
      vendorCodeUID: seller.vendorCodeUID,
      productId: generateProductId(),

      title: body.title,
      brand: body.brand,
      category: body.category,
      subcategory: body.subcategory,

      // ✅ FIX: Save specs and highlights
      specs: processedSpecs,
      highlights: processedHighlights,

      variants: processedVariants,

      // PRODUCT LEVEL PRICING (from default variant)
      mrp: defaultVariant?.mrp || 0,
      price: defaultVariant?.price || 0,
      savedAmount: defaultVariant?.savedAmount || 0,
      discount: defaultVariant?.discount || 0,
      finalPrice: defaultVariant?.finalPrice || 0,

      sellerLocation: sellerLocation,

      gstRate,
      gstSource: "auto",

      inStock: defaultVariant?.inStock || false,
      quantityAvailable: defaultVariant?.quantityAvailable || 0,

      variantOptions,
      variantValues: variantValuesMap,

      verified: false,
    });

    await product.save();

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: product,
    });
  } catch (error: any) {
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
