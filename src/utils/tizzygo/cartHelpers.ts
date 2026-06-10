import mongoose from "mongoose";

// Find variant - works with both variantId and _id
export function findVariantById(
  productData: any,
  variantId: string,
): any | null {
  if (!productData?.variants?.length || !variantId) return null;

  return productData.variants.find(
    (v: any) =>
      String(v.variantId) === String(variantId) ||
      String(v._id) === String(variantId),
  );
}

// Simple stock check
export function checkStock(
  item: any,
  requestedQty: number,
): { available: boolean; stock: number } {
  const stock = item?.quantityAvailable || item?.stock || 0;
  const inStock = item?.inStock !== false;
  return {
    available: inStock && (stock >= requestedQty || stock === 0),
    stock: stock,
  };
}

// Clean variant object for saving - FIXED with all fields
export function cleanVariantObject(
  variant: any,
  selectedVariantFromBody: any,
): any {
  return {
    // Basic Info
    variantId: variant.variantId || variant._id,
    _id: variant._id || variant.variantId,
    combinationKey: variant.combinationKey || null,
    fields: variant.fields || [],

    // Pricing
    mrp: variant.mrp || variant.price || 0,
    price: variant.price || 0,
    finalPrice: variant.finalPrice || variant.price || 0,
    savedAmount: variant.savedAmount || 0,
    discount: variant.discount || 0,

    // GST Fields - ⭐ IMPORTANT
    gstRate: variant.gstRate || 18,
    gstType: variant.gstType || "INCLUSIVE",
    gstAmount: variant.gstAmount || 0,
    gstSource: variant.gstSource || "auto",

    // Weight Fields - ⭐ IMPORTANT
    weight: variant.weight || 0,
    weightUnit: variant.weightUnit || "KG",

    // Dimension Fields - ⭐ IMPORTANT
    length: variant.length || 0,
    width: variant.width || 0,
    height: variant.height || 0,
    dimensionUnit: variant.dimensionUnit || "CM",

    // Stock Fields
    inStock: variant.inStock !== false,
    quantityAvailable: variant.quantityAvailable || 0,
    sku: variant.sku || selectedVariantFromBody?.variantSku,

    // Media
    images: variant.images || [],
    video: variant.video || null,
    isDefault: variant.isDefault || false,

    // Timestamps
    createdAt: variant.createdAt || new Date(),
    updatedAt: variant.updatedAt || new Date(),
  };
}

// Create minimal productData for cart - FIXED
export function createMinimalProductData(productData: any): any {
  return {
    productDataId: productData.productId || productData._id,
    vendorCodeUID: productData.vendorCodeUID || "",
    sellerId: productData.sellerId || "",
    title: productData.title || "",
    category: productData.category || "",
    subcategory: productData.subcategory || "",
  };
}

// Format cart item for response
export function formatCartItem(item: any): any {
  const activeVariant = item.selectedVariant || item.productData;
  const mrp = activeVariant?.mrp || activeVariant?.price || 0;
  const finalPrice = activeVariant?.finalPrice || activeVariant?.price || 0;

  return {
    _id: item._id,
    productId: item.productId,
    quantity: item.quantity,
    selectedVariant: item.selectedVariant,
    product: item.productData,
    pricing: {
      mrp,
      finalPrice,
      savedAmount: mrp - finalPrice,
      discountPercent:
        mrp > 0 ? (((mrp - finalPrice) / mrp) * 100).toFixed(2) : 0,
      totalPrice: finalPrice * item.quantity,
    },
  };
}

// Calculate cart summary
export function calculateCartSummary(items: any[]): any {
  const totalItems = items.length;
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = items.reduce(
    (sum, item) => sum + (item.pricing.totalPrice || 0),
    0,
  );

  return {
    totalItems,
    totalQuantity,
    cartTotal,
    gst: cartTotal * 0.18,
    grandTotal: cartTotal * 1.18,
  };
}

// Get checkout summary for buy now
export function getBuyNowCheckoutSummary(
  variant: any,
  quantity: number,
  productData: any,
): any {
  const mrp = variant?.mrp || variant?.price || productData?.price || 0;
  const finalPrice =
    variant?.finalPrice || variant?.price || productData?.price || 0;
  const savedAmount = mrp - finalPrice;
  const discountPercent = mrp > 0 ? (savedAmount / mrp) * 100 : 0;

  return {
    mrp,
    finalPrice,
    savedAmount,
    discountPercent: parseFloat(discountPercent.toFixed(2)),
    quantity,
    totalAmount: finalPrice * quantity,
  };
}
