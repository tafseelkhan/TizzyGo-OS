// controllers/tizzygo/search/searchController.ts

import { Request, Response } from "express";
import { Product } from "../../../models/tizzyos/seller/AddProducts/Products";
import SearchLog from "../../../models/tizzyos/tizzygo/search/SearchLog";
import mongoose from "mongoose";

interface AuthRequest extends Request {
  user?: {
    id: string;
    _id: string;
    userId?: string;
  };
}

/**
 * 🔎 Search products across all categories
 */
export const searchProducts = async (req: Request, res: Response) => {
  console.log("========================================");
  console.log("🔍 [searchProducts] STARTED");
  console.log("========================================");
  console.log("📅 Timestamp:", new Date().toISOString());
  console.log("📥 Request URL:", req.url);
  console.log("📥 Request Method:", req.method);
  console.log("📥 Query param q:", req.query.q);
  console.log("📥 Headers:", JSON.stringify(req.headers, null, 2));

  try {
    const { q } = req.query;

    if (!q || typeof q !== "string") {
      console.log("❌ [searchProducts] Query is required");
      console.log("========================================");
      return res.status(400).json({
        success: false,
        message: "Query is required",
      });
    }

    const trimmedQuery = q.trim();
    if (trimmedQuery.length === 0) {
      console.log("❌ [searchProducts] Empty query");
      console.log("========================================");
      return res.status(400).json({
        success: false,
        message: "Query cannot be empty",
      });
    }

    console.log("🔍 [searchProducts] Searching for:", trimmedQuery);
    console.log("🔍 [searchProducts] Query length:", trimmedQuery.length);

    const keywords = trimmedQuery.split(" ").filter(Boolean);
    const regex = keywords.map((word) => new RegExp(word, "i"));

    console.log("🔍 [searchProducts] Keywords:", keywords);
    console.log(
      "🔍 [searchProducts] Regex patterns:",
      regex.map((r) => r.source),
    );

    // ✅ Search products with proper fields from Product model
    console.log("🔍 [searchProducts] Building MongoDB query...");

    const searchQuery = {
      $or: [
        { title: { $all: regex } },
        { description: { $all: regex } },
        { category: { $in: keywords.map((k) => new RegExp(k, "i")) } },
        { brand: { $in: keywords.map((k) => new RegExp(k, "i")) } },
        { subcategory: { $in: keywords.map((k) => new RegExp(k, "i")) } },
      ],
    };

    console.log(
      "🔍 [searchProducts] Search query:",
      JSON.stringify(searchQuery, null, 2),
    );

    console.log("🔍 [searchProducts] Executing Product.find()...");
    const products = await Product.find(searchQuery)
      .limit(50)
      .select(
        "title brand description category subcategory productId sellerId " +
          "variantOptions variantValues variants sellerLocation fulfillmentType " +
          "freeDelivery fastDelivery cashOnDelivery verified " +
          "createdAt",
      )
      .lean();

    console.log(
      `📦 [searchProducts] Found ${products.length} products from database`,
    );

    if (products.length > 0) {
      console.log(`📦 [searchProducts] First product:`, {
        _id: products[0]._id,
        title: products[0].title,
        category: products[0].category,
        variantsCount: products[0].variants?.length || 0,
      });
    } else {
      console.log("📦 [searchProducts] No products found");
    }

    // ✅ Transform products for frontend
    console.log("🔄 [searchProducts] Transforming products...");
    const transformedProducts = products.map((product: any, index: number) => {
      // ✅ Get best variant for price/stock info
      const defaultVariant =
        product.variants?.find((v: any) => v.isDefault) ||
        product.variants?.[0];

      // ✅ Get first image from default variant
      const firstImage = defaultVariant?.images?.[0] || "";

      // ✅ Get price from default variant
      const finalPrice = defaultVariant?.finalPrice || 0;
      const mrp = defaultVariant?.mrp || 0;
      const discount = defaultVariant?.discount || 0;
      const inStock = defaultVariant?.inStock || false;
      const quantityAvailable = defaultVariant?.quantityAvailable || 0;

      if (index === 0) {
        console.log("🔄 [searchProducts] First transformed product:", {
          _id: product._id,
          title: product.title,
          finalPrice: finalPrice,
          inStock: inStock,
          imagesCount: defaultVariant?.images?.length || 0,
        });
      }

      return {
        _id: product._id,
        productId: product.productId || product._id,
        title: product.title,
        brand: product.brand,
        description: product.description,
        category: product.category,
        subcategory: product.subcategory,
        sellerId: product.sellerId,
        price: finalPrice,
        mrp: mrp,
        discount: discount,
        finalPrice: finalPrice,
        inStock: inStock,
        quantityAvailable: quantityAvailable,
        images: defaultVariant?.images || [],
        video: defaultVariant?.video || null,
        image: firstImage, // For quick display
        fulfillmentType: product.fulfillmentType || "SELLER",
        freeDelivery: product.freeDelivery || false,
        fastDelivery: product.fastDelivery || false,
        cashOnDelivery: product.cashOnDelivery || false,
        verified: product.verified || false,
        sellerLocation: product.sellerLocation || null,
        variantOptions: product.variantOptions || [],
        variants: product.variants || [],
        createdAt: product.createdAt,
      };
    });

    console.log(
      `✅ [searchProducts] Transformed ${transformedProducts.length} products`,
    );

    // ✅ Group products by category
    console.log("📊 [searchProducts] Grouping by category...");
    const resultsMap = new Map();

    transformedProducts.forEach((product) => {
      const category = product.category || "Uncategorized";
      if (!resultsMap.has(category)) {
        resultsMap.set(category, []);
      }
      resultsMap.get(category).push(product);
    });

    const results = Array.from(resultsMap.entries()).map(
      ([category, products]) => ({
        category,
        products,
      }),
    );

    console.log(
      `📊 [searchProducts] Grouped into ${results.length} categories`,
    );
    results.forEach((cat, idx) => {
      console.log(
        `  📊 [${idx + 1}] ${cat.category}: ${cat.products.length} products`,
      );
    });

    // ✅ Save search query to DB with proper fields
    console.log("💾 [searchProducts] Saving search log...");
    const userId =
      (req as AuthRequest).user?.id || (req as AuthRequest).user?.userId;
    const userAgent = req.headers["user-agent"] || "";
    const ipAddress = req.ip || req.connection?.remoteAddress || "";
    const authHeader = req.headers.authorization || "";

    // ✅ Detect device from user agent
    let device: "android" | "ios" | "web" = "web";
    if (userAgent.toLowerCase().includes("android")) device = "android";
    else if (
      userAgent.toLowerCase().includes("iphone") ||
      userAgent.toLowerCase().includes("ipad")
    )
      device = "ios";

    console.log("👤 User ID:", userId || "Anonymous");
    console.log("📱 Device:", device);
    console.log("🌐 IP:", ipAddress);
    console.log("🔑 Auth Header Present:", !!authHeader);

    // ✅ Save search log with all fields
    const searchLogData: any = {
      query: trimmedQuery,
      normalizedQuery: trimmedQuery.toLowerCase(),
      resultsCount: transformedProducts.length,
      source: "search",
      device: device,
      ipAddress: ipAddress,
      userAgent: userAgent,
    };

    if (userId) {
      searchLogData.userId = new mongoose.Types.ObjectId(userId);
      console.log("👤 User ID added to search log:", userId);
    } else {
      console.log("👤 No user ID, search log without user");
    }

    try {
      await SearchLog.create(searchLogData);
      console.log("✅ [searchProducts] Search log saved successfully");
    } catch (logError: any) {
      console.error(
        "❌ [searchProducts] Failed to save search log:",
        logError.message,
      );
    }

    // ✅ Send response with proper structure
    console.log("✅ [searchProducts] Sending response");
    console.log("📤 Response structure:", {
      success: true,
      query: trimmedQuery,
      dataLength: results.length,
      totalProducts: transformedProducts.length,
    });
    console.log("========================================");

    return res.json({
      success: true, // ✅ YEH IMPORTANT HAI
      query: trimmedQuery,
      data: results,
    });
  } catch (err: any) {
    console.log("========================================");
    console.log("❌ [searchProducts] ERROR OCCURRED");
    console.log("========================================");
    console.error("🔴 Error Name:", err.name);
    console.error("🔴 Error Message:", err.message);
    console.error("🔴 Error Stack:", err.stack);
    console.error("🔴 Error Code:", err.code);
    console.error("🔴 Full Error:", JSON.stringify(err, null, 2));
    console.log("========================================");

    return res.status(500).json({
      success: false,
      error: "Server error",
      message: err.message,
    });
  }
};

/**
 * 📊 Get top 10 most popular search queries
 */
export const getPopularSearches = async (req: Request, res: Response) => {
  console.log("========================================");
  console.log("📊 [getPopularSearches] STARTED");
  console.log("========================================");
  console.log("📅 Timestamp:", new Date().toISOString());
  console.log("📥 Request URL:", req.url);
  console.log("📥 Request Method:", req.method);
  console.log("📥 Headers:", JSON.stringify(req.headers, null, 2));

  try {
    console.log("📊 [getPopularSearches] Running aggregation...");
    const topSearches = await SearchLog.aggregate([
      {
        $group: {
          _id: "$normalizedQuery",
          query: { $first: "$query" },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    console.log(
      `📊 [getPopularSearches] Found ${topSearches.length} popular searches`,
    );
    topSearches.forEach((s, idx) => {
      console.log(`  📊 [${idx + 1}] ${s.query || s._id}: ${s.count} searches`);
    });

    console.log("✅ [getPopularSearches] Sending response");
    console.log("========================================");

    res.json({
      success: true,
      searches: topSearches.map((s) => ({
        query: s.query || s._id,
        count: s.count,
      })),
    });
  } catch (err: any) {
    console.log("========================================");
    console.log("❌ [getPopularSearches] ERROR OCCURRED");
    console.log("========================================");
    console.error("🔴 Error Name:", err.name);
    console.error("🔴 Error Message:", err.message);
    console.error("🔴 Error Stack:", err.stack);
    console.log("========================================");

    res.status(500).json({
      success: false,
      error: "Server error",
      message: err.message,
    });
  }
};

/**
 * 📝 Get recent searches for logged-in user
 */
export const getRecentSearches = async (req: Request, res: Response) => {
  console.log("========================================");
  console.log("📝 [getRecentSearches] STARTED");
  console.log("========================================");
  console.log("📅 Timestamp:", new Date().toISOString());
  console.log("📥 Request URL:", req.url);
  console.log("📥 Request Method:", req.method);
  console.log("📥 Headers:", JSON.stringify(req.headers, null, 2));

  try {
    const userId =
      (req as AuthRequest).user?.id || (req as AuthRequest).user?.userId;

    console.log("👤 User ID:", userId || "Not authenticated");

    if (!userId) {
      console.log("📝 [getRecentSearches] No user, returning empty");
      console.log("========================================");
      return res.json({
        success: true,
        searches: [],
      });
    }

    console.log(
      "📝 [getRecentSearches] Fetching recent searches for user:",
      userId,
    );
    const searches = await SearchLog.find({
      userId: new mongoose.Types.ObjectId(userId),
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    console.log(
      `📝 [getRecentSearches] Found ${searches.length} recent searches`,
    );
    searches.forEach((s, idx) => {
      console.log(`  📝 [${idx + 1}] ${s.query} (${s.createdAt})`);
    });

    console.log("✅ [getRecentSearches] Sending response");
    console.log("========================================");

    res.json({
      success: true,
      searches: searches.map((s) => ({
        id: s._id,
        query: s.query,
        createdAt: s.createdAt,
      })),
    });
  } catch (err: any) {
    console.log("========================================");
    console.log("❌ [getRecentSearches] ERROR OCCURRED");
    console.log("========================================");
    console.error("🔴 Error Name:", err.name);
    console.error("🔴 Error Message:", err.message);
    console.error("🔴 Error Stack:", err.stack);
    console.log("========================================");

    res.status(500).json({
      success: false,
      error: "Server error",
      message: err.message,
    });
  }
};

/**
 * ❌ Delete a single recent search by ID
 */
export const deleteRecentSearch = async (req: Request, res: Response) => {
  console.log("========================================");
  console.log("❌ [deleteRecentSearch] STARTED");
  console.log("========================================");
  console.log("📅 Timestamp:", new Date().toISOString());
  console.log("📥 Request URL:", req.url);
  console.log("📥 Request Method:", req.method);
  console.log("📥 Search ID:", req.params.id);
  console.log("📥 Headers:", JSON.stringify(req.headers, null, 2));

  try {
    const userId =
      (req as AuthRequest).user?.id || (req as AuthRequest).user?.userId;
    const { id } = req.params;

    console.log("👤 User ID:", userId || "Not authenticated");
    console.log("🔍 Search ID to delete:", id);

    if (!userId) {
      console.log("❌ [deleteRecentSearch] Unauthorized");
      console.log("========================================");
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    if (!id) {
      console.log("❌ [deleteRecentSearch] Search ID required");
      console.log("========================================");
      return res.status(400).json({
        success: false,
        message: "Search ID is required",
      });
    }

    console.log("🗑️ [deleteRecentSearch] Deleting search...");
    const deleted = await SearchLog.findOneAndDelete({
      _id: id,
      userId: new mongoose.Types.ObjectId(userId),
    });

    if (!deleted) {
      console.log("❌ [deleteRecentSearch] Search not found for user");
      console.log("========================================");
      return res.status(404).json({
        success: false,
        message: "Search not found",
      });
    }

    console.log("✅ [deleteRecentSearch] Search deleted:", {
      id: deleted._id,
      query: deleted.query,
      userId: deleted.userId,
    });

    console.log("✅ [deleteRecentSearch] Sending response");
    console.log("========================================");

    res.json({
      success: true,
      message: "Search removed",
    });
  } catch (err: any) {
    console.log("========================================");
    console.log("❌ [deleteRecentSearch] ERROR OCCURRED");
    console.log("========================================");
    console.error("🔴 Error Name:", err.name);
    console.error("🔴 Error Message:", err.message);
    console.error("🔴 Error Stack:", err.stack);
    console.log("========================================");

    res.status(500).json({
      success: false,
      error: "Server error",
      message: err.message,
    });
  }
};

/**
 * 🧹 Clear all recent searches of logged-in user
 */
export const clearAllRecentSearches = async (req: Request, res: Response) => {
  console.log("========================================");
  console.log("🧹 [clearAllRecentSearches] STARTED");
  console.log("========================================");
  console.log("📅 Timestamp:", new Date().toISOString());
  console.log("📥 Request URL:", req.url);
  console.log("📥 Request Method:", req.method);
  console.log("📥 Headers:", JSON.stringify(req.headers, null, 2));

  try {
    const userId =
      (req as AuthRequest).user?.id || (req as AuthRequest).user?.userId;

    console.log("👤 User ID:", userId || "Not authenticated");

    if (!userId) {
      console.log("❌ [clearAllRecentSearches] Unauthorized");
      console.log("========================================");
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    console.log(
      "🗑️ [clearAllRecentSearches] Clearing all searches for user:",
      userId,
    );
    const result = await SearchLog.deleteMany({
      userId: new mongoose.Types.ObjectId(userId),
    });

    console.log(
      `🧹 [clearAllRecentSearches] Deleted ${result.deletedCount} searches`,
    );

    console.log("✅ [clearAllRecentSearches] Sending response");
    console.log("========================================");

    res.json({
      success: true,
      message: "All searches cleared",
      deletedCount: result.deletedCount,
    });
  } catch (err: any) {
    console.log("========================================");
    console.log("❌ [clearAllRecentSearches] ERROR OCCURRED");
    console.log("========================================");
    console.error("🔴 Error Name:", err.name);
    console.error("🔴 Error Message:", err.message);
    console.error("🔴 Error Stack:", err.stack);
    console.log("========================================");

    res.status(500).json({
      success: false,
      error: "Server error",
      message: err.message,
    });
  }
};
