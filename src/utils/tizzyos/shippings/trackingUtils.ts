// utils/tracking.utils.ts
import { v4 as uuidv4 } from "uuid";

export const generateTrackingId = (): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TRK-${timestamp}-${random}`;
};

export const generateDispatchId = (): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `DSP-${timestamp}-${random}`;
};

export const addTrackingHistory = (
  currentHistory: any[],
  event: {
    status: string;
    holderType: string;
    holderId?: string;
    holderName?: string;
    note?: string;
    fromLocation?: any;
    toLocation?: any;
  },
) => {
  return [
    ...currentHistory,
    {
      ...event,
      createdAt: new Date(),
    },
  ];
};

export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const isSameCity = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): boolean => {
  // Consider same city if within 50km radius
  const distance = calculateDistance(lat1, lon1, lat2, lon2);
  return distance <= 50;
};
