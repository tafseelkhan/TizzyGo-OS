import { v4 as uuidv4 } from "uuid";

export function generateBookingId(): string {
  const timestamp = new Date().getTime().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `CAB-${timestamp}-${random}`;
}

export function generateRideCode(): string {
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `RIDE-${random}`;
}

export function generateTrackingId(): string {
  const timestamp = new Date().getTime().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TRK-${timestamp}-${random}`;
}

export function generateRequestId(): string {
  const timestamp = new Date().getTime().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 4).toUpperCase();
  return `REQ-${timestamp}-${random}`;
}

export function generateTransactionId(): string {
  const timestamp = new Date().getTime().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TXN-${timestamp}-${random}`;
}

export function generateDriverCode(): string {
  const timestamp = new Date().getTime().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `DRV-${timestamp}-${random}`;
}
