import { cleanupService } from "../services/tizzyos/seller/cleanupServices";
import { logger } from "../utils/tizzyos/seller/logger";

/**
 * Cleanup cron job - Runs every 24 hours
 */
export const runCleanupJob = async (): Promise<void> => {
  try {
    logger.info("🕐 Starting scheduled cleanup job...");

    const startTime = Date.now();
    const stats = await cleanupService.runCleanup();
    const duration = Date.now() - startTime;

    logger.info(`✅ Cleanup job completed in ${duration}ms`, stats);

    // Alert if errors exceed threshold
    if (stats.errors > 10) {
      logger.error(
        `⚠️ High error count in cleanup job: ${stats.errors} errors`,
      );
      // You can add alert notification here (email, Slack, etc.)
    }
  } catch (error) {
    logger.error("❌ Cleanup job failed:", error);
    throw error;
  }
};

// For testing purposes
if (require.main === module) {
  runCleanupJob()
    .then(() => {
      logger.info("Cleanup job executed successfully");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("Cleanup job execution failed:", error);
      process.exit(1);
    });
}
