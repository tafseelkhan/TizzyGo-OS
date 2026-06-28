import { bucket } from "../../../firebase/firebase";
import { logger } from "../../../utils/tizzyos/seller/logger";

/**
 * Extract Firebase storage path from URL
 * Example: https://firebasestorage.googleapis.com/v0/b/bucket/o/Products%2Fimage.jpg?alt=media
 * Returns: Products/image.jpg
 */
export const extractFirebasePathFromUrl = (url: string): string => {
  try {
    // Remove query parameters
    const urlWithoutQuery = url.split("?")[0];

    // Find the path after /o/
    const match = urlWithoutQuery.match(/\/o\/(.+)$/);
    if (!match) {
      throw new Error("Invalid Firebase storage URL format");
    }

    // Decode URI component
    const decodedPath = decodeURIComponent(match[1]);
    return decodedPath;
  } catch (error) {
    logger.error("Error extracting Firebase path from URL:", error);
    throw new Error(`Failed to extract path from URL: ${url}`);
  }
};

/**
 * Delete a file from Firebase Storage
 */
export const deleteFirebaseFile = async (
  filePath: string,
): Promise<boolean> => {
  try {
    const file = bucket.file(filePath);
    await file.delete();
    logger.info(`✅ Successfully deleted file from Firebase: ${filePath}`);
    return true;
  } catch (error: any) {
    // Handle case where file doesn't exist
    if (error.code === 404) {
      logger.warn(`File not found in Firebase, skipping: ${filePath}`);
      return true;
    }

    logger.error(`Error deleting file from Firebase: ${filePath}`, error);
    throw error;
  }
};

/**
 * Check if file exists in Firebase Storage
 */
export const checkFirebaseFileExists = async (
  filePath: string,
): Promise<boolean> => {
  try {
    const file = bucket.file(filePath);
    const [exists] = await file.exists();
    return exists;
  } catch (error) {
    logger.error(`Error checking file existence: ${filePath}`, error);
    return false;
  }
};
