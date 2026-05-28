import { Request, Response } from "express";
import { RatingReview } from "../../../models/tizzygo/social/ratingmodel"; // Remove IReviewImage from import
import { bucket } from "../../../firebase/firebase";
import { v4 as uuid } from "uuid";

// Define the interface locally (since it's not exported from the module)
interface IReviewImage {
  publicId: string;
  url: string;
  // Add other properties that are in the original IReviewImage
  path?: string;
  createdAt?: Date;
}

export const uploadBase64Image = async (
  base64: string,
  productId: string,
  userId: string
): Promise<{ url: string; path: string }> => {
  const buffer = Buffer.from(
    base64.replace(/^data:image\/\w+;base64,/, ""),
    "base64"
  );

  const fileName = `RatingReview/${productId}/${userId}/${uuid()}.jpg`;
  const file = bucket.file(fileName);

  await file.save(buffer, {
    metadata: { contentType: "image/jpeg" },
    public: true,
  });

  return {
    url: `https://storage.googleapis.com/${bucket.name}/${fileName}`,
    path: fileName,
  };
};

export const addOrUpdateRatingReview = async (req: Request, res: Response) => {
  try {
    console.log("📦 Incoming body:", req.body);

    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const body = req.body || {};
    const { productId, rating, review, images = [] } = body;

    if (!productId || rating === undefined)
      return res.status(400).json({ error: "Product ID and rating required" });

    if (rating < 1 || rating > 5)
      return res.status(400).json({ error: "Rating must be between 1 and 5" });

    if (!Array.isArray(images))
      return res.status(400).json({ error: "Images must be an array" });

    if (images.length > 5)
      return res.status(400).json({ error: "Max 5 images allowed" });

    // Upload images
    const uploadResults = await Promise.all(
      images.map((base64: string) =>
        uploadBase64Image(base64, productId, userId.toString())
      )
    );

    console.log("Upload results:", uploadResults);

    // Transform to match what the RatingReview model expects
    // The RatingReview model's images field expects objects with 'publicId' property
    const uploadedImages: IReviewImage[] = uploadResults.map(result => ({
      publicId: result.path, // Use the file path as publicId
      url: result.url,
      path: result.path,
      createdAt: new Date(),
    }));

    let ratingReview = await RatingReview.findOne({ userId, productId });

    if (ratingReview) {
      ratingReview.rating = rating;
      ratingReview.review = review || "";
      ratingReview.images = [
        ...(ratingReview.images || []),
        ...uploadedImages,
      ];
      await ratingReview.save();
    } else {
      ratingReview = await RatingReview.create({
        userId,
        productId,
        rating,
        review: review || "",
        images: uploadedImages,
      });
    }

    await ratingReview.populate({
      path: "userId",
      select: "name image",
    });

    return res.json({
      success: true,
      message: "Rating & review saved successfully",
      data: ratingReview,
    });
  } catch (error: any) {
    console.error("🔥 RatingReview Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ⭐ Get rating stats
export const getRatingStats = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    if (!productId) {
      return res.status(400).json({ error: "Product ID is required" });
    }

    const ratings = await RatingReview.find({ productId });

    const totalRatings = ratings.length;
    const sumRatings = ratings.reduce((sum, r) => sum + (r.rating || 0), 0);
    const avgRating = totalRatings > 0 ? sumRatings / totalRatings : 0;

    const distribution = [0, 0, 0, 0, 0];
    ratings.forEach((r) => {
      if (r.rating >= 1 && r.rating <= 5) {
        distribution[r.rating - 1] += 1;
      }
    });

    res.json({
      success: true,
      data: {
        totalRatings,
        averageRating: Number(avgRating.toFixed(2)),
        percentage: Number(((avgRating / 5) * 100).toFixed(1)),
        distribution,
        totalReviews: ratings.filter(
          (r) => r.review && r.review.trim() !== ""
        ).length,
      },
    });
  } catch (error: any) {
    console.error("Error in getRatingStats:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      details: error.message,
    });
  }
};

// ⭐ Get reviews with user profile
export const getReviews = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    if (!productId) return res.status(400).json({ error: "Product ID is required" });

    const reviews = await RatingReview.find({
      productId,
      review: { $exists: true, $ne: "" },
    })
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .populate({ path: "userId", select: "name image" });

    res.json({ success: true, data: reviews });
  } catch (error: any) {
    console.error("Error in getReviews:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      details: error.message,
    });
  }
};

// ⭐ Delete rating/review
export const deleteRatingReview = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    const { ratingReviewId } = req.params;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const ratingReview = await RatingReview.findOneAndDelete({
      _id: ratingReviewId,
      userId,
    });
    if (!ratingReview) {
      return res.status(404).json({ error: "Rating/review not found" });
    }

    res.json({
      success: true,
      message: "Rating/review deleted successfully",
    });
  } catch (error: any) {
    console.error("Error in deleteRatingReview:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      details: error.message,
    });
  }
};
