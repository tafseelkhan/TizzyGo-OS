// utils/getMediaUrl.ts
export const getMediaUrl = (videoPath: string): string => {
  if (!videoPath) return "";

  const baseUrl = "http://localhost:5000";

  // If it's already a full URL
  if (videoPath.startsWith("http")) return videoPath;

  // Otherwise, prepend base URL
  return `${baseUrl}/${videoPath.replace(/^\/+/, "")}`;
};
