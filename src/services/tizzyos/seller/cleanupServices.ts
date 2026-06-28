import { MediaUploadTracker } from "../../../models/tizzyos/seller/AddProducts/MediaUploadTracker";
import { Product } from "../../../models/tizzyos/seller/AddProducts/Products"; // Your Product model
import {
  deleteFirebaseFile,
  extractFirebasePathFromUrl,
} from "../../../utils/tizzyos/seller/firebasefileUpoader";
import { logger } from "../../../utils/tizzyos/seller/logger";
import mongoose from "mongoose";

export interface CleanupStats {
  processed: number;
  markedUsed: number;
  deleted: number;
  errors: number;
  skipped: number;
}

export class CleanupService {
  private readonly BATCH_SIZE = 500;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000;

  /**
   * Run the cleanup process for orphan media files
   */
  async runCleanup(): Promise<CleanupStats> {
    const stats: CleanupStats = {
      processed: 0,
      markedUsed: 0,
      deleted: 0,
      errors: 0,
      skipped: 0,
    };

    logger.info("🚀 Starting cleanup process...");

    try {
      // Get cutoff time (24 hours ago)
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - 24);

      let hasMore = true;
      let skip = 0;

      while (hasMore) {
        // Fetch pending records older than 24 hours
        const trackers = await MediaUploadTracker.find({
          status: "PENDING",
          deleted: false,
          createdAt: { $lte: cutoffTime },
          checkedCount: { $lt: this.MAX_RETRIES },
        })
          .sort({ createdAt: 1 })
          .limit(this.BATCH_SIZE)
          .lean();

        if (trackers.length === 0) {
          hasMore = false;
          break;
        }

        logger.info(`Processing batch of ${trackers.length} trackers...`);

        // Process each tracker
        for (const tracker of trackers) {
          try {
            await this.processTracker(tracker);
            stats.processed++;
          } catch (error) {
            logger.error(`Error processing tracker ${tracker._id}:`, error);
            stats.errors++;
            await this.handleError(tracker);
          }
        }

        // Update skip for next batch
        skip += trackers.length;

        // Small delay to prevent database overload
        await this.delay(100);
      }

      logger.info("✅ Cleanup completed:", stats);
      return stats;
    } catch (error) {
      logger.error("❌ Cleanup service error:", error);
      throw error;
    }
  }

  /**
   * Process a single media tracker
   */
  private async processTracker(tracker: any): Promise<void> {
    logger.debug(`Processing tracker: ${tracker._id} - ${tracker.fileUrl}`);

    // Check if file is used in any product
    const isUsed = await this.isFileUsedInProducts(tracker.fileUrl);

    if (isUsed) {
      // Mark as used
      await MediaUploadTracker.findByIdAndUpdate(tracker._id, {
        status: "USED",
        usedInProduct: true,
        lastCheckedAt: new Date(),
      });
      logger.debug(`✅ File marked as used: ${tracker.fileUrl}`);
      return;
    }

    // Check if file is older than 24 hours
    const fileAge = Date.now() - new Date(tracker.createdAt).getTime();
    const twentyFourHours = 24 * 60 * 60 * 1000;

    if (fileAge < twentyFourHours) {
      // File is not old enough, skip
      logger.debug(`⏳ File not old enough: ${tracker.fileUrl}`);
      return;
    }

    // File is orphan and old enough - delete it
    await this.deleteMediaFile(tracker);
  }

  /**
   * Check if a file URL is used in any product
   */
  private async isFileUsedInProducts(fileUrl: string): Promise<boolean> {
    try {
      // Optimized query using $elemMatch for arrays
      const result = await Product.exists({
        $or: [{ "variants.images": fileUrl }, { "variants.video": fileUrl }],
      });

      return !!result;
    } catch (error) {
      logger.error(`Error checking product for file ${fileUrl}:`, error);
      return false;
    }
  }

  /**
   * Delete media file from Firebase and update tracker
   */
  private async deleteMediaFile(tracker: any): Promise<void> {
    try {
      // Extract Firebase path from URL
      const firebasePath = extractFirebasePathFromUrl(tracker.fileUrl);

      // Delete from Firebase
      await deleteFirebaseFile(firebasePath);

      // Update tracker
      await MediaUploadTracker.findByIdAndUpdate(tracker._id, {
        status: "DELETED",
        deleted: true,
        lastCheckedAt: new Date(),
      });

      logger.info(`🗑️ Deleted orphan file: ${tracker.fileUrl}`);
    } catch (error) {
      logger.error(`Failed to delete file ${tracker.fileUrl}:`, error);
      throw error;
    }
  }

  /**
   * Handle errors during processing
   */
  private async handleError(tracker: any): Promise<void> {
    try {
      await MediaUploadTracker.findByIdAndUpdate(tracker._id, {
        $inc: { checkedCount: 1 },
        lastCheckedAt: new Date(),
        lastError: "Processing failed",
      });
    } catch (error) {
      logger.error(
        `Failed to update tracker error state: ${tracker._id}`,
        error,
      );
    }
  }

  /**
   * Utility method for adding delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Force clean a specific file (admin utility)
   */
  async forceCleanFile(fileUrl: string): Promise<void> {
    const tracker = await MediaUploadTracker.findOne({ fileUrl });
    if (!tracker) {
      throw new Error("Tracker not found");
    }
    await this.processTracker(tracker);
  }

  /**
   * Get cleanup statistics
   */
  async getStats(): Promise<any> {
    const stats = await MediaUploadTracker.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const total = await MediaUploadTracker.countDocuments();
    const pending24h = await MediaUploadTracker.countDocuments({
      status: "PENDING",
      createdAt: { $lte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    return {
      total,
      stats,
      pending24h,
    };
  }
}

export const cleanupService = new CleanupService();
