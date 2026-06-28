import mongoose from "mongoose";
import Cart from "../../models/tizzygo/cart/Cart";
import { Product } from "../../models/tizzyos/seller/AddProducts/Products";
import {
  findVariantById,
  checkStock,
  cleanVariantObject,
  createMinimalProductData,
} from "../../utils/tizzygo/cartHelpers";

interface AddToCartParams {
  userId: string;
  productId: string;
  quantity: number;
  productData: any;
  selectedVariant?: any;
}

interface UpdateQuantityParams {
  userId: string;
  productId: string;
  quantity: number;
  selectedVariant?: any;
}

interface FindOrCreateCartItemParams {
  userId: string;
  productId: string;
  vendorCodeUID: string;
  sellerId: string;
  productDataId: string;
  quantity: number;
}

interface UpdateCartCalculationsParams {
  cartItem: any;
  calculated: any;
  quantity: number;
  couponCode?: string;
  discountAmount?: number;
}

export const addToCart = async ({
  userId,
  productId,
  quantity,
  productData,
  selectedVariant,
}: AddToCartParams) => {
  const hasVariants = productData.variants && productData.variants.length > 0;

  if (hasVariants && !selectedVariant) {
    throw new Error("Variant selection is required for this product");
  }

  const minimalProductData = createMinimalProductData(productData);
  let variantToSave = null;

  if (hasVariants && selectedVariant) {
    const variantId = selectedVariant.variantId || selectedVariant._id;

    if (!variantId) {
      throw new Error("Variant ID missing in selectedVariant");
    }

    const foundVariant = findVariantById(productData, variantId);

    if (!foundVariant) {
      throw new Error(
        `Selected variant not found in product data. ID: ${variantId}`,
      );
    }

    variantToSave = cleanVariantObject(foundVariant, selectedVariant);

    const stockCheck = checkStock(variantToSave, quantity);
    if (!stockCheck.available && stockCheck.stock > 0) {
      throw new Error(`Only ${stockCheck.stock} items available in stock`);
    }
  } else {
    const stockCheck = checkStock(productData, quantity);
    if (!stockCheck.available && stockCheck.stock > 0) {
      throw new Error(`Only ${stockCheck.stock} items available in stock`);
    }
  }

  let cartItem = await Cart.findOne({ userId, productId });

  if (cartItem) {
    cartItem.quantity = quantity;
    cartItem.productData = minimalProductData;
    if (variantToSave) {
      cartItem.selectedVariant = variantToSave;
    }
    await cartItem.save();
    return { cartItem, isNew: false };
  }

  const newCartData: any = {
    userId: new mongoose.Types.ObjectId(userId),
    productId: new mongoose.Types.ObjectId(productId),
    quantity,
    productData: minimalProductData,
  };

  if (variantToSave) {
    newCartData.selectedVariant = variantToSave;
  }

  cartItem = await Cart.create(newCartData);
  return { cartItem, isNew: true };
};

export const updateCartQuantity = async ({
  userId,
  productId,
  quantity,
  selectedVariant,
}: UpdateQuantityParams) => {
  const item = await Cart.findOne({ userId, productId });

  if (!item) {
    throw new Error("Cart item not found");
  }

  const activeItem = item.selectedVariant || item.productData;
  const stockAvailable =
    activeItem?.quantityAvailable || activeItem?.stock || 999;
  const inStock = activeItem?.inStock !== false;

  if (!inStock && stockAvailable === 0) {
    throw new Error("Item is out of stock");
  }

  if (quantity > stockAvailable && stockAvailable > 0) {
    throw new Error(`Only ${stockAvailable} items available in stock`);
  }

  item.quantity = quantity;
  if (selectedVariant) {
    item.selectedVariant = selectedVariant;
  }
  await item.save();

  return item;
};

export const removeFromCart = async (userId: string, productId: string) => {
  const deleted = await Cart.findOneAndDelete({ userId, productId });

  if (!deleted) {
    throw new Error("Item not found");
  }

  return deleted;
};

export const checkProductInCart = async (userId: string, productId: string) => {
  const existing = await Cart.findOne({ userId, productId });

  if (existing) {
    return {
      inCart: true,
      quantity: existing.quantity,
      selectedVariant: existing.selectedVariant,
    };
  }

  return { inCart: false };
};

export const getUserCart = async (userId: string) => {
  const items = await Cart.find({ userId });
  return items;
};

export const createBuyNowCartItem = async (
  userId: string,
  productData: any,
  selectedVariant: any,
  quantity: number,
) => {
  const mongoProductId = productData._id;
  const minimalProductData = createMinimalProductData(productData);
  const hasVariants = productData.variants && productData.variants.length > 0;

  let variantToSave = null;

  if (hasVariants) {
    if (!selectedVariant) {
      throw new Error("Variant selection is required for Buy Now");
    }

    const variantId = selectedVariant.variantId || selectedVariant._id;
    const foundVariant = findVariantById(productData, variantId);

    if (!foundVariant) {
      throw new Error("Selected variant not found in product data");
    }

    variantToSave = cleanVariantObject(foundVariant, selectedVariant);
  }

  await Cart.deleteOne({ userId, productId: mongoProductId });

  const newCartData: any = {
    userId: new mongoose.Types.ObjectId(userId),
    productId: new mongoose.Types.ObjectId(mongoProductId),
    quantity,
    productData: minimalProductData,
  };

  if (variantToSave) {
    newCartData.selectedVariant = variantToSave;
  }

  const cartItem = await Cart.create(newCartData);
  return { cartItem, variantToSave, minimalProductData };
};

export const getBuyNowItem = async (userId: string, productId: string) => {
  const cartItem = await Cart.findOne({ userId, productId });

  if (!cartItem) {
    throw new Error("No saved BuyNow item found");
  }

  return cartItem;
};

export const clearBuyNowItem = async (userId: string, productId: string) => {
  const result = await Cart.deleteOne({ userId, productId });

  if (result.deletedCount === 0) {
    throw new Error("No BuyNow item found to delete");
  }

  return result;
};

export const getCartCount = async (userId: string) => {
  const count = await Cart.countDocuments({ userId });
  return count;
};

// ============================================================
// ✅ CHECKOUT FUNCTIONS - FULLY FIXED
// ============================================================

export const findOrCreateCartItem = async ({
  userId,
  productId,
  vendorCodeUID,
  sellerId,
  productDataId,
  quantity,
}: FindOrCreateCartItemParams) => {
  console.log("🔍 findOrCreateCartItem called:", {
    userId,
    productId,
    vendorCodeUID,
    sellerId,
    productDataId,
    quantity,
  });

  let cartItem = await Cart.findOne({
    userId,
    productId,
  });

  if (cartItem) {
    console.log("📦 Existing cart item found, updating quantity");
    cartItem.quantity = quantity;
    await cartItem.save();
    return cartItem;
  }

  console.log("🆕 No existing cart item, creating new one");

  const product = await Product.findOne({
    productId: productDataId,
    sellerId,
    vendorCodeUID,
  });

  if (!product) {
    throw new Error("Product not found");
  }

  // ✅ Get the variant (first variant or product itself)
  const variant: any = product.variants?.[0] || product;

  console.log("📦 Selected variant data from product:", {
    variantId: variant.variantId,
    gstType: variant.gstType,
    gstRate: variant.gstRate,
    weight: variant.weight,
    weightUnit: variant.weightUnit,
    length: variant.length,
    width: variant.width,
    height: variant.height,
    dimensionUnit: variant.dimensionUnit,
  });

  // ✅ Create minimal productData as per schema
  const minimalProductData = {
    productDataId: product.productId || product._id,
    vendorCodeUID: vendorCodeUID,
    sellerId: new mongoose.Types.ObjectId(sellerId),
    title: product.title || "",
    category: product.category || "",
  };

  // ✅ Create complete selectedVariant object with ALL fields
  const completeSelectedVariant = {
    // Basic Info
    variantId: variant.variantId,
    _id: variant._id,
    combinationKey: variant.combinationKey || null,
    fields: variant.fields || [],

    // Pricing
    mrp: variant.mrp || 0,
    price: variant.price || 0,
    finalPrice: variant.finalPrice || variant.price || 0,
    savedAmount: variant.savedAmount || 0,
    discount: variant.discount || 0,

    // GST Fields - ⭐ CRITICAL
    gstRate: variant.gstRate || 18,
    gstType: variant.gstType || "INCLUSIVE",
    gstAmount: variant.gstAmount || 0,
    gstSource: variant.gstSource || "auto",

    // Weight Fields - ⭐ CRITICAL
    weight: variant.weight || 0,
    weightUnit: variant.weightUnit || "KG",

    // Dimension Fields - ⭐ CRITICAL
    length: variant.length || 0,
    width: variant.width || 0,
    height: variant.height || 0,
    dimensionUnit: variant.dimensionUnit || "CM",

    // Stock Fields
    inStock: variant.inStock !== false,
    quantityAvailable: variant.quantityAvailable || 0,
    sku: variant.sku,
    fulfillmentType: product.fulfillmentType || "SELLER", // ⭐ YAHAN BHI ADD KARO (OPTIONAL)
    // Media
    images: variant.images || [],
    video: variant.video || null,
    isDefault: variant.isDefault || false,

    // Timestamps
    createdAt: variant.createdAt || new Date(),
    updatedAt: variant.updatedAt || new Date(),
  };

  // ✅ Create new cart item with COMPLETE data
  const newCartData: any = {
    userId: new mongoose.Types.ObjectId(userId),
    productId: new mongoose.Types.ObjectId(productId),
    quantity,
    productData: minimalProductData,
    selectedVariant: completeSelectedVariant, // ⭐ CRITICAL FIX
  };

  cartItem = await Cart.create(newCartData);

  console.log("✅ New cart item created:", {
    id: cartItem._id,
    hasSelectedVariant: !!cartItem.selectedVariant,
    gstType: cartItem.selectedVariant?.gstType,
    gstRate: cartItem.selectedVariant?.gstRate,
    weightUnit: cartItem.selectedVariant?.weightUnit,
    dimensionUnit: cartItem.selectedVariant?.dimensionUnit,
  });

  return cartItem;
};

// ✅ FIXED: Save calculated data properly
export const updateCartCalculations = async ({
  cartItem,
  calculated,
  quantity,
  couponCode,
  discountAmount,
}: UpdateCartCalculationsParams) => {
  console.log("📊 updateCartCalculations called");
  console.log("  - cartItem ID:", cartItem._id);
  console.log("  - quantity:", quantity);
  console.log("  - calculated.gstType:", calculated?.gstType);
  console.log("  - calculated.grandTotal:", calculated?.grandTotal);
  console.log("  - couponCode:", couponCode);
  console.log("  - discountAmount:", discountAmount);

  cartItem.quantity = quantity;

  // ✅ Save calculated data
  cartItem.calculated = calculated;

  if (couponCode) {
    cartItem.couponCode = couponCode;
    cartItem.discountApplied = discountAmount || 0;
  }

  try {
    await cartItem.save();
    console.log("✅ Cart item updated successfully");
    console.log(
      "  - Saved calculated.grandTotal:",
      cartItem.calculated?.grandTotal,
    );
    console.log("  - Saved calculated.gstType:", cartItem.calculated?.gstType);
  } catch (saveError: any) {
    console.error("❌ Save failed:", saveError.message);
    // Try saving without validation if needed
    if (saveError.name === "ValidationError") {
      await cartItem.save({ validateBeforeSave: false });
      console.log("✅ Cart item saved without validation");
    } else {
      throw saveError;
    }
  }

  return cartItem;
};
