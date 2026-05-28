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

    const { cartItem, variantToSave, minimalProductData } =
      await createBuyNowCartItem(
        userId,
        productData,
        selectedVariant,
        quantity,
      );

    const activeVariant = variantToSave || minimalProductData;
    const checkoutSummary = getBuyNowCheckoutSummary(
      activeVariant,
      quantity,
      productData,
    );

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
    const activeVariant =
      responseItem.selectedVariant || responseItem.productData;
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
