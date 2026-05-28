// routes/seller/products.ts
import { Request, Response } from "express";
import { Product } from "../../../models/tizzyos/seller/AddProducts/Products";
import { bucket } from "../../../firebase/firebase";

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ error: "Product not found" });

    // Delete all product variants' images & videos from Firebase
    for (const variant of product.variants) {

      // Delete variant images
      if (variant.images?.length) {
        for (const imageUrl of variant.images) {
          const path = decodeURIComponent(
            imageUrl.split("/o/")[1].split("?alt=media")[0]
          );
          await bucket.file(path).delete().catch(() => null);
        }
      }

      // Delete variant video
      if (variant.video) {
        const path = decodeURIComponent(
          variant.video.split("/o/")[1].split("?alt=media")[0]
        );
        await bucket.file(path).delete().catch(() => null);
      }
    }

    // Delete product document
    await product.deleteOne();

    return res.status(200).json({ message: "Product deleted successfully" });

  } catch (error) {
    console.error("DELETE PRODUCT ERROR:", error);
    return res.status(500).json({ error: "Failed to delete product" });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body; // structure like createProduct

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ error: "Product not found" });

    // Handle variants: remove old images/videos if replaced
    if (updateData.variants?.length) {
      for (let i = 0; i < updateData.variants.length; i++) {
        const oldVariant = product.variants[i];
        const newVariant = updateData.variants[i];

        // Images
        if (newVariant.images && oldVariant?.images?.length) {
          const removedImages = oldVariant.images.filter(img => !newVariant.images.includes(img));
          for (const imageUrl of removedImages) {
            const path = decodeURIComponent(imageUrl.split("/o/")[1].split("?alt=media")[0]);
            await bucket.file(path).delete().catch(() => null);
          }
        }

        // Video
        if (newVariant.video && oldVariant.video && newVariant.video !== oldVariant.video) {
          const path = decodeURIComponent(oldVariant.video.split("/o/")[1].split("?alt=media")[0]);
          await bucket.file(path).delete().catch(() => null);
        }
      }
    }

    // Update DB
    for (const key in updateData) {
      if (Object.prototype.hasOwnProperty.call(updateData, key)) {
        (product as any)[key] = updateData[key];
      }
    }

    await product.save();

    return res.status(200).json({ message: "Product updated successfully", product });
  } catch (error) {
    console.error("UPDATE PRODUCT ERROR:", error);
    return res.status(500).json({ error: "Failed to update product" });
  }
};
