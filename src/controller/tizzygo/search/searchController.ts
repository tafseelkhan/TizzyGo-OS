import { Request, Response } from "express";
import { Product } from "../../../models/tizzyos/seller/AddProducts/Products";
import SearchLog from "../../../models/tizzyos/tizzygo/search/SearchLog";

interface AuthRequest extends Request {
  user?: {
    id: string;
  };
}

/**
 * 🔎 Search products across all categories
 */
export const searchProducts = async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== "string") {
      return res.status(400).json({ success: false, message: "Query is required" });
    }

    const keywords = q.split(" ").filter(Boolean);
    const regex = keywords.map((word) => new RegExp(word, "i"));

    // Search products
    const products = await Product.find({
      $or: [
        { title: { $all: regex } },
        { description: { $all: regex } },
      ],
    })
      .limit(50)
      .select("title description price category images")
      .lean();

    // Group products by category
    const resultsMap = new Map();
    
    products.forEach(product => {
      const category = product.category;
      if (!resultsMap.has(category)) {
        resultsMap.set(category, []);
      }
      resultsMap.get(category).push(product);
    });

    const results = Array.from(resultsMap.entries()).map(([category, products]) => ({
      category,
      products
    }));

    // Save search query to DB with user ID if available
    const userId = (req as AuthRequest).user?.id;
    if (userId) {
      await SearchLog.create({ 
        query: q,
        userId: userId
      });
    }

    return res.json({
      success: true,
      query: q,
      results,
    });
  } catch (err) {
    console.error("❌ Search error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

/**
 * 📊 Get top 10 most popular search queries
 */
export const getPopularSearches = async (req: Request, res: Response) => {
  try {
    const topSearches = await SearchLog.aggregate([
      { $group: { _id: "$query", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    res.json({
      success: true,
      searches: topSearches.map((s) => ({
        query: s._id,
        count: s.count,
      })),
    });
  } catch (err) {
    console.error("❌ Popular search error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

/**
 * 📝 Get recent searches for logged-in user
 */
export const getRecentSearches = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user?.id;
    
    if (!userId) {
      return res.json({ success: true, searches: [] });
    }

    const searches = await SearchLog.find({ userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json({
      success: true,
      searches: searches.map((s) => ({
        id: s._id,
        query: s.query,
        createdAt: s.createdAt,
      })),
    });
  } catch (err) {
    console.error("❌ Recent search error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

/**
 * ❌ Delete a single recent search by ID
 */
export const deleteRecentSearch = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const deleted = await SearchLog.findOneAndDelete({ _id: id, userId });

    if (!deleted) {
      return res.status(404).json({ success: false, message: "Search not found" });
    }

    res.json({ success: true, message: "Search removed" });
  } catch (err) {
    console.error("❌ Delete recent search error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

/**
 * 🧹 Clear all recent searches of logged-in user
 */
export const clearAllRecentSearches = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const result = await SearchLog.deleteMany({ userId });

    res.json({ 
      success: true, 
      message: "All searches cleared",
      deletedCount: result.deletedCount 
    });
  } catch (err) {
    console.error("❌ Clear searches error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};