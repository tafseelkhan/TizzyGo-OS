import express from "express";
import {
  searchProducts,
  getPopularSearches,
  getRecentSearches,
  deleteRecentSearch,
  clearAllRecentSearches,
} from "../../../controller/tizzygo/search/searchController";

const router = express.Router();

// Search routes
router.get("/", searchProducts);
router.get("/popular", getPopularSearches);
router.get("/recent", getRecentSearches);
router.delete("/recent/:id", deleteRecentSearch);
router.delete("/recent/clear/all", clearAllRecentSearches);

export default router;