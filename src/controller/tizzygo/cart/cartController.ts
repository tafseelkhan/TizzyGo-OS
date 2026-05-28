import { Response } from "express";
import { AuthRequest } from "../../../middleware/tizzygo/authMiddleware";
import {
  addToCart,
  updateCartQuantity,
  removeFromCart,
  checkProductInCart,
  getUserCart,
  createBuyNowCartItem,
  getBuyNowItem,
  clearBuyNowItem,
  getCartCount,
} from "../../../services/tizzygo/cartService";
import {
  formatCartItem,
  calculateCartSummary,
  getBuyNowCheckoutSummary,
} from "../../../utils/tizzygo/cartHelpers";

// ✅ ADD TO CART
export const addToCartHandler = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?._id;
    const { productId, quantity = 1, productData, selectedVariant } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized", success: false });
    }

    if (!productId || !productData) {
      return res.status(400).json({
        message: "productId or productData missing",
        success: false,
      });
    }

    if (quantity <= 0 || isNaN(quantity)) {
      return res.status(400).json({
        message: "Invalid quantity",
        success: false,
      });
    }

    const { cartItem, isNew } = await addToCart({
      userId,
      productId,
      quantity,
      productData,
      selectedVariant,
    });

    return res.status(isNew ? 201 : 200).json({
      success: true,
      message: isNew ? "Item added to cart" : "Cart item updated",
      item: cartItem,
    });
  } catch (err: any) {
    console.error("❌ Add to cart error:", err.message);
    
    if (err.message.includes("Variant selection")) {
      return res.status(400).json({
        success: false,
        message: err.message,
        requiresVariant: true,
      });
    }
    
    if (err.message.includes("Only")) {
      return res.status(400).json({
        success: false,
        message: err.message,
        maxQuantity: parseInt(err.message.match(/\d+/)?.[0] || "0"),
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

// ✅ UPDATE QUANTITY
export const updateQuantityHandler = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?._id;
    const { productId, quantity, selectedVariant } = req.body;

    if (!productId || typeof quantity !== "number" || quantity < 1) {
      return res.status(400).json({
        success: false,
        message: "Valid productId and quantity required",
      });
    }

    const item = await updateCartQuantity({ userId, productId, quantity, selectedVariant });

    res.json({
      success: true,
      message: "Quantity updated",
      item,
    });
  } catch (err: any) {
    console.error("❌ Update quantity error:", err.message);
    
    if (err.message === "Cart item not found") {
      return res.status(404).json({ success: false, message: err.message });
    }
    
    if (err.message.includes("Only") || err.message.includes("out of stock")) {
      return res.status(400).json({ success: false, message: err.message });
    }
    
    res.status(500).json({
      success: false,
      message: "Update failed",
      error: err.message,
    });
  }
};

// ✅ REMOVE FROM CART
export const removeFromCartHandler = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?._id;
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "productId missing",
      });
    }

    await removeFromCart(userId, productId);

    res.json({
      success: true,
      message: "Item removed from cart",
    });
  } catch (err: any) {
    console.error("❌ Remove error:", err.message);
    
    if (err.message === "Item not found") {
      return res.status(404).json({ success: false, message: err.message });
    }
    
    res.status(500).json({
      success: false,
      message: "Remove failed",
      error: err.message,
    });
  }
};

// ✅ CHECK PRODUCT IN CART
export const checkProductInCartHandler = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?._id;
    const productId = req.query.productId as string;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "productId required",
      });
    }

    const result = await checkProductInCart(userId, productId);

    res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error("❌ Check error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

// ✅ GET USER CART
export const getUserCartHandler = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?._id;

    const items = await getUserCart(userId);
    const formattedItems = items.map(formatCartItem);
    const summary = calculateCartSummary(formattedItems);

    res.json({
      success: true,
      cart: formattedItems,
      summary,
    });
  } catch (err: any) {
    console.error("❌ Get cart error:", err.message);
    res.status(500).json({
      success: false,
      message: "Error fetching cart",
      error: err.message,
    });
  }
};

// ✅ BUY NOW
export const buyNowHandler = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?._id;
    const { productData, selectedVariant, quantity = 1 } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    if (!productData || !productData._id) {
      return res.status(400).json({
        success: false,
        error: "Product data missing",
      });
    }

    const { cartItem, variantToSave, minimalProductData } = await createBuyNowCartItem(
      userId,
      productData,
      selectedVariant,
      quantity
    );

    const activeVariant = variantToSave || minimalProductData;
    const checkoutSummary = getBuyNowCheckoutSummary(activeVariant, quantity, productData);

    return res.json({
      success: true,
      message: "Product ready for checkout",
      cartItemId: cartItem._id,
      productId: minimalProductData.productDataId,
      checkoutSummary,
      hasSelectedVariant: !!variantToSave,
    });
  } catch (err: any) {
    console.error("💥 Buy Now Error:", err.message);
    
    if (err.message.includes("Variant selection")) {
      return res.status(400).json({
        success: false,
        error: err.message,
        requiresVariant: true,
      });
    }
    
    return res.status(500).json({
      success: false,
      error: "Server error",
      details: err.message,
    });
  }
};

// ✅ GET SAVED BUY NOW ITEM
export const getBuyNowItemHandler = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?._id;
    const { productId } = req.query;

    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    if (!productId || typeof productId !== "string") {
      return res.status(400).json({
        success: false,
        error: "Valid productId required",
      });
    }

    const cartItem = await getBuyNowItem(userId, productId);
    const responseItem = cartItem.toObject();
    const activeVariant = responseItem.selectedVariant || responseItem.productData;
    const mrp = activeVariant?.mrp || activeVariant?.price || 0;
    const finalPrice = activeVariant?.finalPrice || activeVariant?.price || 0;
    const discountPercent = mrp > 0 ? ((mrp - finalPrice) / mrp) * 100 : 0;

    return res.json({
      success: true,
      message: "Saved BuyNow item found",
      cartItem: responseItem,
      selectedVariant: responseItem.selectedVariant || null,
      pricing: {
        mrp,
        finalPrice,
        savedAmount: mrp - finalPrice,
        discountPercent,
        totalPrice: finalPrice * (responseItem.quantity || 1),
      },
      hasSavedItem: true,
    });
  } catch (err: any) {
    console.error("💥 Get BuyNow item error:", err.message);
    
    if (err.message === "No saved BuyNow item found") {
      return res.status(404).json({ success: false, error: err.message });
    }
    
    res.status(500).json({
      success: false,
      error: "Server error",
      details: err.message,
    });
  }
};

// ✅ CLEAR BUY NOW CART ITEM
export const clearBuyNowHandler = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?._id;
    const { productId } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: "Product ID missing",
      });
    }

    await clearBuyNowItem(userId, productId);

    return res.json({
      success: true,
      message: "BuyNow cart item cleared successfully",
    });
  } catch (err: any) {
    console.error("💥 Clear BuyNow error:", err.message);
    
    if (err.message === "No BuyNow item found to delete") {
      return res.status(404).json({ success: false, message: err.message });
    }
    
    res.status(500).json({
      success: false,
      error: "Server error",
      details: err.message,
    });
  }
};

// ✅ CART COUNT
export const cartCountHandler = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?._id;
    const count = await getCartCount(userId);
    
    res.json({
      success: true,
      count,
    });
  } catch (err: any) {
    console.error("❌ Count error:", err.message);
    res.status(500).json({
      success: false,
      message: "Count failed",
      error: err.message,
    });
  }
};