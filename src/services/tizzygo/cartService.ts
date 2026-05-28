import mongoose from "mongoose";
import Cart from "../../models/tizzygo/cart/Cart";
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
      throw new Error(`Selected variant not found in product data. ID: ${variantId}`);
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
  const stockAvailable = activeItem?.quantityAvailable || activeItem?.stock || 999;
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
  quantity: number
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

  // Delete any existing cart item to avoid validation issues
  await Cart.deleteOne({ userId, productId: mongoProductId });

  // Create new cart item
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