// utils/tizzyos/cab/idGenerator.ts

import { v4 as uuidv4 } from "uuid";

// =====================================================
// COMMON IDs
// =====================================================

export function generateBookingId(): string {
  const timestamp = new Date().getTime().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `BK${timestamp}${random}`;
}

export function generateRideCode(): string {
  const timestamp = new Date().getTime().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `RIDE${timestamp}${random}`;
}

export function generateTrackingId(): string {
  const timestamp = new Date().getTime().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TRK${timestamp}${random}`;
}

// =====================================================
// QUOTE IDs
// =====================================================

export function generateLocalRideQuoteId(): string {
  const timestamp = new Date().getTime().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `LQ${timestamp}${random}`;
}

export function generateAirportQuoteId(): string {
  const timestamp = new Date().getTime().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `AQ${timestamp}${random}`;
}

// Backward compatibility
export function generateQuoteCode(): string {
  return generateLocalRideQuoteId();
}

// =====================================================
// FWS IDs (Service-Specific)
// =====================================================

export function generateLocalRideFwsId(): string {
  const timestamp = new Date().getTime().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `FWS-LOCAL-${timestamp}-${random}`;
}

export function generateAirportFwsId(): string {
  const timestamp = new Date().getTime().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `FWS-AIRPORT-${timestamp}-${random}`;
}

// =====================================================
// OTHER IDs
// =====================================================

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
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `DRV-${timestamp}-${random}`;
}