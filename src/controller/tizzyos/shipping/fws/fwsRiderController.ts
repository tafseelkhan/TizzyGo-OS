import { Request, Response } from "express";
import mongoose, { ClientSession } from "mongoose";
import Shipper from "../../../../models/tizzygo/order/order";
import Register from "../../../../models/tizzyos/shipping/fws/fwsRegistration";
import ShipperRiderLocation from "../../../../models/tizzyos/shipping/fws/fwsRiderLocation";
import { getDistanceAndDuration, geocodeAddress } from "../../../../utils/tizzyos/shippings/googleAPI";
import User from "../../../../models/tizzygo/auths/User";
import Otp from '../../../../models/tizzygo/order/orderOtp';
import { generateOtp } from '../../../../utils/tizzygo/orderOtp';
import { sendSms } from '../../../../utils/tizzygo/twilio';
import { sendEmail } from '../../../../utils/tizzygo/email';

// ========== TYPE DEFINITIONS ==========

interface AuthenticatedUser {
  id: string;
  _id: string;
  userId: string;
  role?: string;
  [key: string]: any;
}

interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

// ========== CONSTANTS & CONFIGURATION ==========

const PROXIMITY_THRESHOLD_METERS = parseInt(process.env.PROXIMITY_THRESHOLD_METERS || "100");
const GEOCODE_DISTANCE_THRESHOLD_METERS = parseInt(process.env.GEOCODE_DISTANCE_THRESHOLD_METERS || "50");
const TOP_CANDIDATES_COUNT = parseInt(process.env.TOP_CANDIDATES_COUNT || "10");
const GOOGLE_API_CANDIDATES_COUNT = parseInt(process.env.GOOGLE_API_CANDIDATES_COUNT || "3");
const LOCATION_UPDATE_DEBOUNCE_MS = parseInt(process.env.LOCATION_UPDATE_DEBOUNCE_MS || "1000");

// ========== AUTO MODE DISTANCE CONSTANTS (FIXED) ==========
const MIN_RIDER_ASSIGNMENT_DISTANCE_KM = 0.001; // 1 meter minimum
const MAX_RIDER_ASSIGNMENT_DISTANCE_KM = 50; // 50 KM maximum as per requirements

// Order DELIVERY status enum
enum OrderDeliveryStatus {
  WAITING_FOR_SELLER = "waiting_for_seller",
  PENDING_RIDER_ACCEPT = "pending_rider_accept",
  ASSIGNED = "assigned",
  WAITING_FOR_RIDER = "waiting_for_rider",
  PICKED_UP = "picked_up",
  DELIVERED = "delivered"
}

// Statuses that should have rider location updates (ONLY AFTER ACCEPTANCE)
const LOCATION_UPDATE_STATUSES = [
  OrderDeliveryStatus.ASSIGNED,
  OrderDeliveryStatus.WAITING_FOR_RIDER,
  OrderDeliveryStatus.PICKED_UP
];

// ========== TYPES ==========

interface Location {
  latitude: number;
  longitude: number;
  address: string;
  googlePlaceId?: string;
  updatedAt: Date;
}

interface RiderCandidate {
  rider: any;
  location: Location;
  haversineDistanceKm: number;
}

interface RiderStats {
  assigned: number;
  delivered: number;
}

interface UpdateRiderStatsResult {
  stats: RiderStats;
  isAvailable: boolean;
  activeOrders: number;
}

// ========== UPDATED HELPER FUNCTIONS ==========

// Keep this function - it correctly gets userId from JWT
function getUserIdFromAuth(req: Request): string {
  const authenticatedReq = req as AuthenticatedRequest;

  if (!authenticatedReq.user?.userId) {
    throw new Error("Invalid token: userId missing");
  }

  return authenticatedReq.user.userId.toString();
}

// NEW: Helper function to get authenticated riderId (Register._id) with lookup
async function getAuthenticatedRiderId(req: Request): Promise<string> {
  // Step 1: Get userId from JWT
  const userId = getUserIdFromAuth(req);
  
  // Step 2: Find rider in Register collection using userId
  const rider = await Register.findOne({ userId }) as { _id: mongoose.Types.ObjectId; kyc?: { status: string } };
  
  if (!rider) {
    throw new Error("Rider not found. Please complete rider registration.");
  }
  
  // Step 3: Validate KYC status
  if (rider.kyc?.status !== "verified") {
    throw new Error("Rider KYC not approved");
  }
  
  // Step 4: Return Register._id as riderId
  return rider._id.toString();
}

/**
 * Calculate Haversine distance between two points in kilometers
 * Uses Earth's radius = 6371 km
 */
function calculateHaversineDistanceInKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = R * c;
  
  return distanceKm;
}

async function getLatestRiderLocation(riderId: string): Promise<Location | null> {
  try {
    console.log(`🔍 getLatestRiderLocation called for riderId (Register._id): ${riderId}`);
    
    const riderLocation = await ShipperRiderLocation.findOne(
      { riderId, isTrackingOn: true }
    ).sort({ "location.updatedAt": -1 });
    
    console.log(`🔍 Found rider location document:`, riderLocation ? "Yes" : "No");
    
    if (!riderLocation?.location) {
      console.log(`❌ No location found for rider ${riderId} or tracking is off`);
      return null;
    }
    
    console.log(`✅ Location found for rider ${riderId}:`, {
      latitude: riderLocation.location.latitude,
      longitude: riderLocation.location.longitude,
      address: riderLocation.location.address?.substring(0, 50) + "..."
    });
    
    return {
      latitude: riderLocation.location.latitude,
      longitude: riderLocation.location.longitude,
      address: riderLocation.location.address || "",
      googlePlaceId: riderLocation.location.googlePlaceId,
      updatedAt: riderLocation.location.updatedAt || new Date()
    };
  } catch (error) {
    console.error(`❌ Error getting latest rider location for ${riderId}:`, error);
    return null;
  }
}

// ========== UPDATED VALIDATION FUNCTIONS ==========

function validateAssignRiderRequest(body: any): { 
  valid: boolean; 
  message?: string; 
  data?: { 
    orderId: string; 
    mode: "auto" | "manual"; 
    riderId?: string;
  } 
} {
  const { orderId, mode } = body;
  
  if (!orderId) {
    return { 
      valid: false, 
      message: "orderId is required" 
    };
  }
  
  if (mode && !['auto', 'manual'].includes(mode)) {
    return { valid: false, message: "Invalid mode. Use 'auto' or 'manual'" };
  }
  
  if (mode === 'manual' && !body.riderId) {
    return { 
      valid: false, 
      message: "riderId is required for manual assignment" 
    };
  }
  
  return {
    valid: true,
    data: {
      orderId,
      mode: mode || 'auto',
      riderId: body.riderId
    }
  };
}

// UPDATED: validateRiderForAssignment now checks isAvailable and kyc.status
async function validateRiderForAssignment(
  riderId: string, // This is Register._id
  session?: ClientSession
): Promise<{ rider: any; location: Location }> {
  const queryOptions = session ? { session } : {};
  
  console.log(`🔍 validateRiderForAssignment called for riderId (Register._id): ${riderId}`);
  
  // Check if rider exists in Register collection using Register._id
  const rider = await Register.findOne({
    _id: riderId, // Use Register._id directly
    "kyc.status": "verified", // KYC must be verified
    isAvailable: true // Rider must be available
  }).select("_id name phone maxOrdersPerDay orderStats isAvailable kyc.status").exec();

  if (!rider) {
    console.error(`❌ Rider not found or not eligible: ${riderId}`);
    throw new Error("Selected rider is not available or not KYC approved");
  }

  console.log(`✅ Rider found: ${rider.name} (${rider._id})`);
  console.log(`✅ KYC status: ${rider.kyc?.status}`);
  console.log(`✅ Is available: ${rider.isAvailable}`);

  // Check rider capacity
  const assigned = rider.orderStats?.assigned || 0;
  const delivered = rider.orderStats?.delivered || 0;
  const maxOrdersPerDay = rider.maxOrdersPerDay || 25;
  
  const activeOrders = assigned - delivered;
  
  if (activeOrders >= maxOrdersPerDay) {
    console.error(`❌ Rider has reached capacity: ${activeOrders}/${maxOrdersPerDay}`);
    throw new Error("Selected rider has reached maximum order capacity");
  }

  console.log(`✅ Rider capacity OK: ${activeOrders}/${maxOrdersPerDay}`);

  // Check location tracking and get latest location
  const riderTracking = await ShipperRiderLocation.findOne({
    riderId: rider._id, // Use Register._id
    isTrackingOn: true
  }, null, queryOptions);

  console.log(`🔍 Rider tracking status:`, riderTracking ? "Tracking ON" : "Tracking OFF or not found");

  if (!riderTracking) {
    throw new Error("Rider does not have location tracking enabled");
  }

  if (!riderTracking.location) {
    throw new Error("Rider location data not available");
  }

  const location: Location = {
    latitude: riderTracking.location.latitude,
    longitude: riderTracking.location.longitude,
    address: riderTracking.location.address || "",
    googlePlaceId: riderTracking.location.googlePlaceId,
    updatedAt: riderTracking.location.updatedAt || new Date()
  };

  console.log(`✅ Rider location available:`, {
    lat: location.latitude,
    lng: location.longitude
  });

  return { rider, location };
}

// ========== FIXED AUTO MODE LOGIC ==========

async function findNearestRiderUsingOptimizedApproach(
  sellerLocation: Location,
  availableRiders: any[]
): Promise<{ rider: any; location: Location } | null> {
  console.log(`🔍 AUTO MODE: Finding nearest rider for seller location:`, {
    lat: sellerLocation.latitude,
    lng: sellerLocation.longitude
  });
  
  console.log(`📏 Distance range: ${MIN_RIDER_ASSIGNMENT_DISTANCE_KM} km to ${MAX_RIDER_ASSIGNMENT_DISTANCE_KM} km`);
  
  if (availableRiders.length === 0) {
    console.log('❌ AUTO MODE: No available riders found');
    return null;
  }

  const riderIds = availableRiders.map(rider => rider._id);
  console.log(`🔍 AUTO MODE: Processing ${riderIds.length} available riders`);
  
  // Get recent rider locations (last 5 minutes)
  const riderLocationsDocs = await ShipperRiderLocation.find({
    riderId: { $in: riderIds },
    isTrackingOn: true,
    "location.updatedAt": { 
      $gte: new Date(Date.now() - 5 * 60 * 1000) // Last 5 minutes
    }
  }).sort({ "location.updatedAt": -1 });

  console.log(`🔍 AUTO MODE: Found ${riderLocationsDocs.length} riders with recent location updates`);

  const riderLocationMap = new Map<string, Location>();
  
  for (const doc of riderLocationsDocs) {
    const riderId = doc.riderId ? doc.riderId.toString() : null;
    if (riderId && !riderLocationMap.has(riderId) && doc.location) {
      riderLocationMap.set(riderId, { 
        latitude: doc.location.latitude,
        longitude: doc.location.longitude,
        address: doc.location.address || "",
        googlePlaceId: doc.location.googlePlaceId,
        updatedAt: doc.location.updatedAt || new Date()
      });
    }
  }

  const trackingEnabledRiderIds = new Set(
    riderLocationsDocs.map(doc => doc.riderId?.toString() ?? "")
  );
  
  const trackingEnabledRiders = availableRiders.filter(rider => 
    trackingEnabledRiderIds.has(rider._id.toString())
  );

  console.log(`🔍 AUTO MODE: ${trackingEnabledRiders.length} riders have tracking enabled`);

  if (trackingEnabledRiders.length === 0) {
    console.log('❌ AUTO MODE: No riders with tracking enabled');
    return null;
  }

  const candidates: RiderCandidate[] = [];
  
  console.log('📏 AUTO MODE: Calculating distances for each rider...');
  
  for (const rider of trackingEnabledRiders) {
    const riderId = (rider._id as mongoose.Types.ObjectId).toString();
    const location = riderLocationMap.get(riderId);
    
    if (location) {
      // Calculate distance in kilometers
      const haversineDistanceKm = calculateHaversineDistanceInKm(
        location.latitude,
        location.longitude,
        sellerLocation.latitude,
        sellerLocation.longitude
      );
      
      console.log(`📏 Rider ${riderId} distance: ${haversineDistanceKm.toFixed(6)} km`);
      
      // FIXED: Apply both min and max distance filters as per requirements
      if (haversineDistanceKm >= MIN_RIDER_ASSIGNMENT_DISTANCE_KM && 
          haversineDistanceKm <= MAX_RIDER_ASSIGNMENT_DISTANCE_KM) {
        
        console.log(`✅ Rider ${riderId} is within range: ${haversineDistanceKm.toFixed(6)} km`);
        candidates.push({
          rider,
          location,
          haversineDistanceKm
        });
      } else {
        if (haversineDistanceKm < MIN_RIDER_ASSIGNMENT_DISTANCE_KM) {
          console.log(`❌ Rider ${riderId} is TOO CLOSE: ${haversineDistanceKm.toFixed(6)} km < ${MIN_RIDER_ASSIGNMENT_DISTANCE_KM} km (minimum)`);
        } else if (haversineDistanceKm > MAX_RIDER_ASSIGNMENT_DISTANCE_KM) {
          console.log(`❌ Rider ${riderId} is TOO FAR: ${haversineDistanceKm.toFixed(6)} km > ${MAX_RIDER_ASSIGNMENT_DISTANCE_KM} km (maximum)`);
        }
      }
    } else {
      console.log(`❌ Rider ${riderId} has no location data`);
    }
  }

  console.log(`🔍 AUTO MODE: ${candidates.length} riders passed distance filter`);
  
  if (candidates.length === 0) {
    console.log('❌ AUTO MODE: No suitable rider found within range');
    return null;
  }

  // Sort by distance (nearest first)
  candidates.sort((a, b) => a.haversineDistanceKm - b.haversineDistanceKm);
  
  console.log('🏆 AUTO MODE: Top candidates by distance:');
  candidates.slice(0, 5).forEach((candidate, index) => {
    console.log(`   ${index + 1}. Rider ${candidate.rider._id}: ${candidate.haversineDistanceKm.toFixed(6)} km`);
  });

  const topCandidates = candidates.slice(0, TOP_CANDIDATES_COUNT);
  
  if (topCandidates.length === 0) {
    console.log('❌ AUTO MODE: No candidates after sorting');
    return null;
  }

  // If we only have 1 candidate or Google API is not needed, return the nearest
  if (topCandidates.length === 1 || GOOGLE_API_CANDIDATES_COUNT <= 0) {
    const nearestRider = topCandidates[0];
    console.log(`✅ AUTO MODE: Selected nearest rider ${nearestRider.rider._id} at ${nearestRider.haversineDistanceKm.toFixed(6)} km`);
    return { rider: nearestRider.rider, location: nearestRider.location };
  }

  // Use Google API to get more accurate duration-based selection
  const googleApiCandidates = topCandidates.slice(0, GOOGLE_API_CANDIDATES_COUNT);
  console.log(`🔍 AUTO MODE: Getting Google API data for ${googleApiCandidates.length} top candidates`);
  
  let bestCandidate = topCandidates[0];
  let bestDurationSec = Infinity;

  for (const candidate of googleApiCandidates) {
    try {
      console.log(`🔍 AUTO MODE: Checking Google API for rider ${candidate.rider._id}`);
      
      const distanceResult = await getDistanceAndDuration(
        { lat: candidate.location.latitude, lng: candidate.location.longitude },
        { latitude: sellerLocation.latitude, longitude: sellerLocation.longitude }
      );

      console.log(`📊 Rider ${candidate.rider._id}: ${distanceResult.durationSec}s duration`);
      
      if (distanceResult.durationSec < bestDurationSec) {
        bestDurationSec = distanceResult.durationSec;
        bestCandidate = candidate;
        console.log(`🏆 New best rider: ${candidate.rider._id} with ${distanceResult.durationSec}s`);
      }
    } catch (error) {
      console.warn(`⚠️ AUTO MODE: Google API failed for rider ${candidate.rider._id}:`, error);
      // Continue with next candidate
    }
  }

  console.log(`✅ AUTO MODE: Final selection - rider ${bestCandidate.rider._id}`);
  console.log(`   Distance: ${bestCandidate.haversineDistanceKm.toFixed(6)} km`);
  console.log(`   Duration: ${bestDurationSec !== Infinity ? bestDurationSec + 's' : 'N/A'}`);
  
  return { rider: bestCandidate.rider, location: bestCandidate.location };
}

async function updateRiderOrderStats(
  riderId: mongoose.Types.ObjectId | string,
  updates: {
    assigned?: number;
    delivered?: number;
  },
  session: ClientSession
): Promise<UpdateRiderStatsResult> {
  const riderObjectId = typeof riderId === 'string' 
    ? new mongoose.Types.ObjectId(riderId) 
    : riderId;

  const updateOps: any = { $inc: {}, $set: {} };
  
  if (updates.assigned !== undefined) {
    updateOps.$inc["orderStats.assigned"] = updates.assigned;
  }
  if (updates.delivered !== undefined) {
    updateOps.$inc["orderStats.delivered"] = updates.delivered;
  }

  updateOps.$set.updatedAt = new Date();

  const currentRider = await Register.findById(riderObjectId).session(session);
  if (!currentRider) {
    throw new Error(`Rider not found: ${riderId}`);
  }

  const currentAssigned = currentRider.orderStats?.assigned || 0;
  const currentDelivered = currentRider.orderStats?.delivered || 0;
  const maxOrdersPerDay = currentRider.maxOrdersPerDay || 25;

  const currentActiveOrders = currentAssigned - currentDelivered;
  const newAssigned = currentAssigned + (updates.assigned || 0);
  const newDelivered = currentDelivered + (updates.delivered || 0);
  const newActiveOrders = newAssigned - newDelivered;
  
  const newIsAvailable = newActiveOrders < maxOrdersPerDay;
  updateOps.$set.isAvailable = newIsAvailable;

  const updatedRider = await Register.findOneAndUpdate(
    { _id: riderObjectId },
    updateOps,
    {
      new: true,
      session,
      runValidators: true
    }
  ).select("orderStats isAvailable maxOrdersPerDay");

  if (!updatedRider) {
    throw new Error(`Failed to update rider stats: ${riderId}`);
  }

  return {
    stats: {
      assigned: updatedRider.orderStats?.assigned || 0,
      delivered: updatedRider.orderStats?.delivered || 0
    },
    isAvailable: updatedRider.isAvailable,
    activeOrders: newActiveOrders
  };
}

// ========== LOCATION PROPAGATION ==========

async function propagateRiderLocationToActiveOrders(riderId: string): Promise<number> {
  try {
    console.log(`🔍 propagateRiderLocationToActiveOrders called for riderId: ${riderId}`);
    
    // Step 1: Get latest location from ShipperRiderLocation
    const latestLocation = await getLatestRiderLocation(riderId);
    if (!latestLocation) {
      console.log(`❌ No location found for rider ${riderId} in ShipperRiderLocation`);
      return 0;
    }

    const locationPayload = {
      latitude: latestLocation.latitude,
      longitude: latestLocation.longitude,
      address: latestLocation.address,
      googlePlaceId: latestLocation.googlePlaceId,
      updatedAt: latestLocation.updatedAt
    };

    console.log(`✅ Propagating location for rider ${riderId}:`, {
      lat: latestLocation.latitude,
      lng: latestLocation.longitude
    });

    // Step 2: Update location only for orders that are accepted or picked up (AFTER ACCEPTANCE)
    const updateResult = await Shipper.updateMany(
      { 
        riderId, 
        deliveryStatus: { $in: LOCATION_UPDATE_STATUSES } 
      },
      { 
        $set: { 
          riderLocation: locationPayload,
          updatedAt: new Date()
        } 
      }
    );
    
    console.log(`✅ Propagated location for rider ${riderId} to ${updateResult.modifiedCount} orders`);
    return updateResult.modifiedCount || 0;
  } catch (error) {
    console.error("❌ Error propagating rider location to orders:", error);
    return 0;
  }
}

// ========== TRANSACTION HELPER ==========

async function executeInTransaction<T>(
  operation: (session: ClientSession) => Promise<T>
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await operation(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
}

// ========== FIXED MAIN CONTROLLERS ==========

export const assignRiderToOrder = async (req: Request, res: Response) => {
  try {
    const assignedBy = getUserIdFromAuth(req);
    
    const validation = validateAssignRiderRequest(req.body);
    if (!validation.valid) {
      return res.status(400).json({ 
        success: false, 
        message: validation.message 
      });
    }

    const { orderId, mode, riderId: manualRiderId } = validation.data!;

    const result = await executeInTransaction(async (session) => {
      const order = await Shipper.findOne({ orderId }).session(session);
      if (!order) {
        throw new Error("Order not found. Please ensure order is created first.");
      }
      
      if (order.deliveryStatus !== OrderDeliveryStatus.WAITING_FOR_SELLER) {
        throw new Error(`Order cannot be assigned. Current status: ${order.deliveryStatus}`);
      }
      
      if (order.riderId) {
        throw new Error("Order already assigned to a rider");
      }
      
      if (!order.sellerAddress || !order.sellerAddress.latitude || !order.sellerAddress.longitude) {
        throw new Error("Seller location data not available in order");
      }

      let assignedRider = null;
      let riderLocation: Location | null = null;

      if (mode === "auto") {
        console.log('🚀 AUTO MODE: Starting automatic rider assignment');
        
        // Get all eligible riders with both "approved" and "verified" KYC status
        const allRiders = await Register.find({
          "kyc.status": { $in: ["approved", "verified"] }, // Both "approved" and "verified" as per requirements
          isAvailable: true,
          isOnline: true
        }).select("_id name phone rating maxOrdersPerDay orderStats isAvailable isOnline kyc.status").session(session);

        console.log(`🔍 AUTO MODE: Found ${allRiders.length} riders with valid KYC and online status`);

        // Filter by capacity
        const availableRiders = allRiders.filter(rider => {
          const assigned = rider.orderStats?.assigned || 0;
          const delivered = rider.orderStats?.delivered || 0;
          const maxOrdersPerDay = rider.maxOrdersPerDay || 25;
          
          const activeOrders = assigned - delivered;
          const hasCapacity = activeOrders < maxOrdersPerDay;
          
          if (!hasCapacity) {
            console.log(`❌ Rider ${rider._id} at capacity: ${activeOrders}/${maxOrdersPerDay}`);
          }
          
          return hasCapacity;
        });

        console.log(`🔍 AUTO MODE: ${availableRiders.length} riders have capacity available`);

        if (availableRiders.length === 0) {
          throw new Error("No available riders found");
        }

        const sellerLoc: Location = {
          latitude: order.sellerAddress.latitude,
          longitude: order.sellerAddress.longitude,
          address: order.sellerAddress.address,
          updatedAt: new Date()
        };

        console.log('📍 AUTO MODE: Seller location:', {
          lat: sellerLoc.latitude,
          lng: sellerLoc.longitude
        });

        const nearestRiderData = await findNearestRiderUsingOptimizedApproach(
          sellerLoc,
          availableRiders
        );
        
        if (!nearestRiderData) {
          console.log('❌ AUTO MODE: No suitable rider found within range');
          throw new Error("No suitable rider found within range");
        }

        assignedRider = nearestRiderData.rider;
        riderLocation = nearestRiderData.location;

        console.log(`✅ AUTO MODE: Selected rider ${assignedRider._id}`);

      } else if (mode === "manual") {
        // MANUAL MODE: Use Register._id from request body
        if (!manualRiderId) {
          throw new Error("riderId is required for manual assignment");
        }

        // Validate rider and get location using Register._id
        const riderData = await validateRiderForAssignment(manualRiderId, session);
        assignedRider = riderData.rider;
        riderLocation = riderData.location;
      }

      if (!assignedRider || !riderLocation) {
        throw new Error("Failed to assign rider or get rider location");
      }

      // Save Register._id as riderId in Order
      order.riderId = assignedRider._id; // This is Register._id
      order.deliveryStatus = OrderDeliveryStatus.PENDING_RIDER_ACCEPT;
      order.updatedAt = new Date();
      order.assignedBy = assignedBy;
      order.assignmentMode = mode;

      await order.save({ session });

      // Update rider stats using Register._id
      const riderStatsUpdate = await updateRiderOrderStats(
        assignedRider._id, // Register._id
        { assigned: 1 },
        session
      );

      console.log(`✅ Rider ${assignedRider._id} stats updated:`, riderStatsUpdate);

      return { 
        order, 
        assignedRider, 
        riderStatsUpdate,
        mode 
      };
    });

    res.status(200).json({
      success: true,
      message: `Rider successfully assigned to order (${result.mode} mode). Rider must accept to start location tracking.`,
      data: {
        orderId: result.order.orderId,
        deliveryStatus: result.order.deliveryStatus,
        rider: {
          riderId: result.assignedRider._id,
          name: result.assignedRider.name,
          phone: result.assignedRider.phone,
        },
        assignment: {
          mode: result.mode,
          assignedBy,
          timestamp: new Date()
        },
        note: "Rider location will be saved only after order acceptance",
        timestamps: {
          createdAt: result.order.createdAt,
          updatedAt: result.order.updatedAt
        }
      }
    });

  } catch (err: any) {
    console.error("❌ assignRiderToOrder error:", err);
    
    const statusCode = err.message.includes("not found") ? 404 : 
                      err.message.includes("already") ? 400 : 500;
    
    res.status(statusCode).json({ 
      success: false, 
      message: err.message || "Server error while assigning rider",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

export const riderAcceptOrder = async (req: Request, res: Response) => {
  try {
    // UPDATED: Get riderId with proper lookup
    const riderId = await getAuthenticatedRiderId(req);
    console.log("✅ riderAcceptOrder - Real riderId (Register._id):", riderId);
    
    const { orderId } = req.body;
    console.log("✅ riderAcceptOrder - Order ID from body:", orderId);

    if (!orderId) {
      return res.status(400).json({ 
        success: false, 
        message: "orderId is required" 
      });
    }

    const result = await executeInTransaction(async (session) => {
      const order = await Shipper.findOne({ orderId }).session(session);
      if (!order) throw new Error("Order not found");
      
      console.log("✅ Order found:", order.orderId);
      console.log("✅ Order riderId:", order.riderId?.toString());
      console.log("✅ Request riderId:", riderId);
      
      if (order.riderId?.toString() !== riderId) {
        throw new Error("This order is not assigned to you");
      }
      
      if (order.deliveryStatus !== OrderDeliveryStatus.PENDING_RIDER_ACCEPT) {
        throw new Error(`Order cannot be accepted. Current status: ${order.deliveryStatus}`);
      }

      // Step 1: Get latest rider location from ShipperRiderLocation
      console.log("🔍 Getting latest rider location from ShipperRiderLocation...");
      const riderLatestLocation = await getLatestRiderLocation(riderId);
      if (!riderLatestLocation) {
        throw new Error("Rider location not available. Please enable location tracking first.");
      }

      console.log("✅ Rider location found:", {
        lat: riderLatestLocation.latitude,
        lng: riderLatestLocation.longitude
      });

      // Step 2: Update order with rider location and set to ASSIGNED
      const updatedOrder = await Shipper.findOneAndUpdate(
        { orderId, riderId, deliveryStatus: OrderDeliveryStatus.PENDING_RIDER_ACCEPT },
        {
          $set: {
            deliveryStatus: OrderDeliveryStatus.ASSIGNED,
            // Save location from ShipperRiderLocation to Order model
            riderLocation: {
              latitude: riderLatestLocation.latitude,
              longitude: riderLatestLocation.longitude,
              address: riderLatestLocation.address,
              googlePlaceId: riderLatestLocation.googlePlaceId,
              updatedAt: riderLatestLocation.updatedAt
            },
            acceptedAt: new Date(),
            updatedAt: new Date()
          }
        },
        { new: true, session }
      );

      if (!updatedOrder) {
        throw new Error("Failed to update order");
      }

      console.log("✅ Order updated with rider location");

      return { updatedOrder, riderLatestLocation };
    });

    // Calculate ETA to seller
    let etaToSeller = null;
    try {
      const distanceResult = await getDistanceAndDuration(
        { lat: result.updatedOrder.riderLocation.latitude, lng: result.updatedOrder.riderLocation.longitude },
        { 
          latitude: result.updatedOrder.sellerAddress.latitude, 
          longitude: result.updatedOrder.sellerAddress.longitude 
        }
      );

      etaToSeller = {
        distanceKm: distanceResult.distanceKm,
        durationMinutes: Math.round(distanceResult.durationSec / 60),
        durationInTrafficMinutes: Math.round(distanceResult.durationInTrafficSec / 60)
      };
    } catch (apiError) {
      console.warn("Google API calculation failed:", apiError);
      etaToSeller = null;
    }

    res.json({
      success: true,
      message: "Order accepted. Heading to seller. Location tracking started.",
      data: {
        orderId: result.updatedOrder.orderId,
        deliveryStatus: result.updatedOrder.deliveryStatus,
        riderLocation: result.updatedOrder.riderLocation,
        note: "Rider location will now update in real-time from ShipperRiderLocation",
        etaToSeller,
        timestamps: {
          createdAt: result.updatedOrder.createdAt,
          updatedAt: result.updatedOrder.updatedAt,
          acceptedAt: result.updatedOrder.acceptedAt
        }
      }
    });

  } catch (err: any) {
    console.error("❌ riderAcceptOrder error:", err);
    
    const statusCode = err.message.includes("not found") ? 404 : 
                      err.message.includes("not assigned") ? 403 : 400;
    
    res.status(statusCode).json({ 
      success: false, 
      message: err.message || "Server error",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

export const riderConfirmPickup = async (req: Request, res: Response) => {
  try {
    // UPDATED: Get riderId with proper lookup
    const riderId = await getAuthenticatedRiderId(req);
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ 
        success: false, 
        message: "orderId is required" 
      });
    }

    const result = await executeInTransaction(async (session) => {
      const order = await Shipper.findOne({ orderId }).session(session);
      if (!order) throw new Error("Order not found");
      
      if (order.riderId?.toString() !== riderId) {
        throw new Error("This order is not assigned to you");
      }
      
      if (![OrderDeliveryStatus.ASSIGNED, OrderDeliveryStatus.WAITING_FOR_RIDER].includes(order.deliveryStatus as OrderDeliveryStatus)) {
        throw new Error("Order not ready for pickup");
      }

      // Get latest rider location from ShipperRiderLocation
      const riderLatestLocation = await getLatestRiderLocation(riderId);
      if (!riderLatestLocation) {
        throw new Error("Rider location not available");
      }

      // Update order with latest location and set to PICKED_UP
      const updatedOrder = await Shipper.findOneAndUpdate(
        { orderId, riderId, deliveryStatus: { $in: [OrderDeliveryStatus.ASSIGNED, OrderDeliveryStatus.WAITING_FOR_RIDER] } },
        {
          $set: {
            deliveryStatus: OrderDeliveryStatus.PICKED_UP,
            pickedUpAt: new Date(),
            // Update location from ShipperRiderLocation
            riderLocation: {
              latitude: riderLatestLocation.latitude,
              longitude: riderLatestLocation.longitude,
              address: riderLatestLocation.address,
              googlePlaceId: riderLatestLocation.googlePlaceId,
              updatedAt: riderLatestLocation.updatedAt
            },
            updatedAt: new Date()
          }
        },
        { new: true, session }
      );

      if (!updatedOrder) {
        throw new Error("Failed to update order");
      }

      return { updatedOrder };
    });

    // Calculate ETA to buyer
    let etaToBuyer = null;
    try {
      const distanceResult = await getDistanceAndDuration(
        { lat: result.updatedOrder.riderLocation.latitude, lng: result.updatedOrder.riderLocation.longitude },
        { 
          latitude: result.updatedOrder.buyerAddress.latitude, 
          longitude: result.updatedOrder.buyerAddress.longitude 
        }
      );

      etaToBuyer = {
        distanceKm: distanceResult.distanceKm,
        durationMinutes: Math.round(distanceResult.durationSec / 60),
        durationInTrafficMinutes: Math.round(distanceResult.durationInTrafficSec / 60)
      };
    } catch (apiError) {
      console.warn("Google API calculation failed:", apiError);
      etaToBuyer = null;
    }

    res.json({
      success: true,
      message: "Order picked up from seller. Heading to buyer.",
      data: {
        orderId: result.updatedOrder.orderId,
        deliveryStatus: result.updatedOrder.deliveryStatus,
        pickedUpAt: result.updatedOrder.pickedUpAt,
        riderLocation: result.updatedOrder.riderLocation,
        note: "Location will continue to update from ShipperRiderLocation",
        etaToBuyer,
        timestamps: {
          createdAt: result.updatedOrder.createdAt,
          updatedAt: result.updatedOrder.updatedAt
        }
      }
    });

  } catch (err: any) {
    console.error("❌ riderConfirmPickup error:", err);
    
    const statusCode = err.message.includes("not found") ? 404 : 
                       err.message.includes("not assigned") ? 403 : 400;
    
    res.status(statusCode).json({ 
      success: false, 
      message: err.message || "Server error",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Fix TypeScript error types
interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

// Helper function to prepare email options with text fallback
const prepareEmailOptions = (options: EmailOptions): { to: string; subject: string; text: string; html?: string } => {
  // If text is provided, use it
  if (options.text) {
    return {
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html
    };
  }
  
  // If html is provided, generate text from html
  if (options.html) {
    const textFromHtml = options.html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gm, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gm, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Return FULL text without truncating
    return {
      to: options.to,
      subject: options.subject,
      text: textFromHtml, // REMOVED: .substring(0, 500) + '...'
      html: options.html
    };
  }
  
  // Fallback
  return {
    to: options.to,
    subject: options.subject,
    text: 'Delivery notification from TizzyGo',
    html: options.html
  };
};

// Brand configuration - IMAGE FIX: Use CDN or base64 encoded logos
const BRANDS = {
  TIZZYGO: {
    name: 'TizzyGo',
    color: '#FF6B35',
    slogan: 'Fastest Delivery at Your Doorstep',
    website: 'https://tizzygo.com',
    supportEmail: 'support@tizzygo.com',
    logo: 'https://via.placeholder.com/150/FF6B35/FFFFFF?text=TizzyGo',
    smallLogo: 'https://via.placeholder.com/60/FF6B35/FFFFFF?text=TG'
  },
  TIZZYOS: {
    name: 'TizzyOS',
    color: '#00A8E8',
    slogan: 'Order Management Excellence',
    website: 'https://tizzyos.com',
    supportEmail: 'support@tizzyos.com',
    logo: 'https://via.placeholder.com/150/00A8E8/FFFFFF?text=TizzyOS',
    smallLogo: 'https://via.placeholder.com/60/00A8E8/FFFFFF?text=TO'
  },
  AIRCLOUD: {
    name: 'AirCloud',
    color: '#8AC926',
    slogan: 'Seamless Delivery Coordination',
    website: 'https://aircloud.io',
    supportEmail: 'support@aircloud.io',
    logo: 'https://via.placeholder.com/150/8AC926/FFFFFF?text=AirCloud',
    smallLogo: 'https://via.placeholder.com/60/8AC926/FFFFFF?text=AC'
  }
};

// Generate branded message with logo placeholders
const generateBrandedMessage = (brand: string, title: string, content: string): string => {
  const brandConfig = BRANDS[brand as keyof typeof BRANDS] || BRANDS.TIZZYGO;
  
  return `
${brandConfig.name.toUpperCase()}

🎉 ${title} 🎉

${content}

📱 For any queries, please contact our customer support
📧 Email: ${brandConfig.supportEmail}
🌐 Website: ${brandConfig.website}
🕒 Operating Hours: 24/7

"${brandConfig.slogan}"

Thank you for choosing ${brandConfig.name}!

Powered by AirCloud Delivery Network
  `.trim();
};

// Generate OTP message with detailed information
const generateOtpMessage = (otp: string, orderId: string, userName: string): string => {
  const brandConfig = BRANDS.TIZZYGO;
  
  const content = `
Dear ${userName},

Your delivery is arriving soon! Here is your One-Time Password (OTP) to complete the delivery:

🔐 OTP CODE: ${otp}

📦 Order ID: ${orderId}
⏱️ OTP Valid For: 5 minutes
📍 Delivery Status: Out for Delivery

IMPORTANT SECURITY NOTES:
• Please DO NOT share this OTP with anyone
• Our delivery executive will NEVER ask for your OTP over phone
• Only provide OTP at the time of delivery
• If you didn't request this OTP, please contact support immediately

Your order is being delivered through our secure network powered by AirCloud technology.

Delivery Executive Details:
• Platform: TizzyGo
• Order Management: TizzyOS
• Delivery Network: AirCloud

We're excited to serve you! Your package is just moments away.
  `;

  return generateBrandedMessage('TIZZYGO', 'DELIVERY OTP VERIFICATION', content);
};

// Generate congratulations message
const generateCongratulationsMessage = (orderId: string, userName: string, deliveryTime: string): string => {
  const brandConfig = BRANDS.TIZZYGO;
  
  const content = `
Congratulations ${userName}! 🎊

Your order has been successfully delivered!

📦 Order ID: ${orderId}
✅ Delivery Status: COMPLETED
🕐 Delivery Time: ${deliveryTime}
📍 Delivery Type: Secure OTP Verified

Your delivery journey:
1️⃣ Order Placed → TizzyOS Platform
2️⃣ Order Processed → AirCloud Network
3️⃣ Delivery Executed → TizzyGo Rider
4️⃣ OTP Verified → Secure Handover

DELIVERY DETAILS:
• Package Status: Delivered Successfully
• Security Level: OTP Verified
• Customer Satisfaction: Priority
• Support Available: 24/7

Thank you for trusting our delivery ecosystem! We're committed to providing you with the best service experience through our integrated platform.

Would you like to share your delivery experience? Rate your delivery executive through our app!
  `;

  return generateBrandedMessage('TIZZYGO', 'DELIVERY SUCCESSFULLY COMPLETED', content);
};

// Generate delivery confirmation message for rider
const generateDeliveryCompletionMessage = (orderId: string, userName: string, riderName: string): string => {
  const content = `
🚚 DELIVERY MISSION ACCOMPLISHED! 🚚

Great job, ${riderName}! You have successfully completed the delivery.

📊 DELIVERY SUMMARY:
• Order ID: ${orderId}
• Customer: ${userName}
• Delivery Method: OTP Verified
• Security Status: Confirmed
• Timestamp: ${new Date().toLocaleString()}

TECHNOLOGY PARTNERS:
TizzyGo: Last-mile delivery execution
TizzyOS: Order management platform
AirCloud: Delivery coordination network

Your commitment to secure and timely delivery is appreciated! This delivery has been logged in our system and will reflect in your performance metrics.

Ready for your next delivery mission?
  `;

  return generateBrandedMessage('TIZZYGO', 'DELIVERY CONFIRMED', content);
};

// SMS Sending function with better error handling
const sendSmsWithRetry = async (phone: string, message: string, maxRetries = 2): Promise<boolean> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await sendSms(phone, message);
      return true;
    } catch (error: any) {
      console.error(`SMS send attempt ${i + 1} failed:`, error.message);
      
      // If it's an authentication error, we should stop retrying
      if (error.status === 401) {
        console.error('Twilio authentication error - check your credentials');
        throw error;
      }
      
      // Wait before retrying
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }
  return false;
};

// Send comprehensive notifications
const sendComprehensiveNotifications = async (user: any, otp: string, orderId: string, type: 'OTP' | 'CONGRATULATIONS' | 'DELIVERY_COMPLETE') => {
  const notifications = [];
  
  if (type === 'OTP') {
    // Send OTP messages
    const otpMessage = generateOtpMessage(otp, orderId, user.name || 'Customer');
    
    // SMS - First message (OTP)
    if (user.phone) {
      try {
        const smsContent = `Your TizzyGo delivery OTP is ${otp} for Order ${orderId}. Valid for 5 minutes. Do not share with anyone. Powered by AirCloud.`;
        const smsSent = await sendSmsWithRetry(user.phone, smsContent);
        if (smsSent) {
          notifications.push({ type: 'SMS_OTP', status: 'sent', to: user.phone });
        } else {
          notifications.push({ type: 'SMS_OTP', status: 'failed', error: 'All retry attempts failed' });
        }
      } catch (error: any) {
        console.error('SMS OTP send failed:', error);
        notifications.push({ type: 'SMS_OTP', status: 'failed', error: error.message });
      }
    }

    // Email - First message (OTP) with CDN logos
    if (user.email) {
      try {
        const emailOptions: EmailOptions = {
          to: user.email,
          subject: `TizzyGo Delivery OTP - Order ${orderId}`,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>TizzyGo Delivery OTP</title>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #ddd; }
                .header { background: ${BRANDS.TIZZYGO.color}; padding: 30px; text-align: center; }
                .header img { height: 60px; display: block; margin: 0 auto; }
                .content { padding: 30px; }
                .otp-box { background: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; margin: 25px 0; border-left: 4px solid ${BRANDS.TIZZYGO.color}; }
                .otp-code { font-size: 32px; font-weight: bold; color: ${BRANDS.TIZZYGO.color}; letter-spacing: 5px; margin: 15px 0; font-family: monospace; }
                .brand-logos { display: flex; justify-content: space-between; margin: 30px 0; padding: 20px; background: #f9f9f9; border-radius: 8px; flex-wrap: wrap; }
                .brand { text-align: center; flex: 1; padding: 10px; min-width: 100px; }
                .brand img { height: 40px; margin-bottom: 10px; width: auto; }
                .security-note { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
                .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #eee; }
                @media (max-width: 600px) {
                  .brand-logos { flex-direction: column; }
                  .brand { margin-bottom: 20px; }
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <div style="font-size: 36px; font-weight: bold; color: white; margin: 0;">TizzyGo</div>
                  <h1 style="color: white; margin: 15px 0 0 0; font-size: 24px;">Delivery OTP Verification</h1>
                </div>
                
                <div class="content">
                  <h2 style="color: ${BRANDS.TIZZYGO.color};">Dear ${user.name},</h2>
                  <p>Your delivery is arriving soon! Here is your One-Time Password (OTP) to complete the delivery:</p>
                  
                  <div class="otp-box">
                    <h3 style="margin: 0 0 10px 0; color: #333;">Your Delivery OTP</h3>
                    <div class="otp-code">${otp}</div>
                    <p style="margin: 5px 0; color: #666;">Valid for 5 minutes</p>
                  </div>
                  
                  <div style="background: #e8f4fd; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <h4 style="margin: 0 0 10px 0; color: ${BRANDS.TIZZYOS.color};">📦 Order Details</h4>
                    <p><strong>Order ID:</strong> ${orderId}</p>
                    <p><strong>Delivery Platform:</strong> TizzyGo</p>
                    <p><strong>Estimated Delivery:</strong> Arriving Soon</p>
                  </div>
                  
                  <div class="security-note">
                    <h4 style="margin: 0 0 10px 0; color: #856404;">⚠️ IMPORTANT SECURITY NOTICE</h4>
                    <p style="margin: 0;">• NEVER share this OTP with anyone</p>
                    <p style="margin: 5px 0;">• Our delivery executive will only ask for it at your doorstep</p>
                    <p style="margin: 0;">• If you didn't request this OTP, contact support immediately</p>
                  </div>
                  
                  <div class="brand-logos">
                    <div class="brand">
                      <div style="background: ${BRANDS.TIZZYGO.color}; color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px; font-weight: bold;">TG</div>
                      <p style="margin: 5px 0; font-weight: bold; color: ${BRANDS.TIZZYGO.color};">TizzyGo</p>
                      <p style="margin: 0; font-size: 11px;">Last-mile Delivery</p>
                    </div>
                    <div class="brand">
                      <div style="background: ${BRANDS.TIZZYOS.color}; color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px; font-weight: bold;">TO</div>
                      <p style="margin: 5px 0; font-weight: bold; color: ${BRANDS.TIZZYOS.color};">TizzyOS</p>
                      <p style="margin: 0; font-size: 11px;">Order Platform</p>
                    </div>
                    <div class="brand">
                      <div style="background: ${BRANDS.AIRCLOUD.color}; color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px; font-weight: bold;">AC</div>
                      <p style="margin: 5px 0; font-weight: bold; color: ${BRANDS.AIRCLOUD.color};">AirCloud</p>
                      <p style="margin: 0; font-size: 11px;">Delivery Network</p>
                    </div>
                  </div>
                  
                  <p style="text-align: center; color: #666; font-size: 14px;">
                    This delivery is powered by our integrated ecosystem ensuring secure and timely delivery.
                  </p>
                </div>
                
                <div class="footer">
                  <p style="margin: 0 0 10px 0;">
                    <div style="display: inline-block; background: ${BRANDS.AIRCLOUD.color}; color: white; width: 20px; height: 20px; border-radius: 50%; text-align: center; line-height: 20px; font-weight: bold; font-size: 12px;">AC</div>
                    <span style="vertical-align: middle; margin-left: 5px;">Powered by AirCloud Delivery Network</span>
                  </p>
                  <p style="margin: 5px 0; font-size: 11px;">
                    © ${new Date().getFullYear()} TizzyGo. All rights reserved.<br>
                    ${BRANDS.TIZZYGO.website} | ${BRANDS.TIZZYGO.supportEmail}
                  </p>
                </div>
              </div>
            </body>
            </html>
          `,
          // UPDATED: Full text content for email
          text: `
TIZZYGO

🎉 DELIVERY OTP VERIFICATION 🎉

Dear ${user.name},

Your delivery is arriving soon! Here is your One-Time Password (OTP) to complete the delivery:

🔐 OTP CODE: ${otp}

📦 Order ID: ${orderId}
⏱️ OTP Valid For: 5 minutes
📍 Delivery Status: Out for Delivery

IMPORTANT SECURITY NOTES:
• Please DO NOT share this OTP with anyone
• Our delivery executive will NEVER ask for your OTP over phone
• Only provide OTP at the time of delivery
• If you didn't request this OTP, please contact support immediately

Your order is being delivered through our secure network powered by AirCloud technology.

Delivery Executive Details:
• Platform: TizzyGo
• Order Management: TizzyOS
• Delivery Network: AirCloud

We're excited to serve you! Your package is just moments away.

📱 For any queries, please contact our customer support
📧 Email: ${BRANDS.TIZZYGO.supportEmail}
🌐 Website: ${BRANDS.TIZZYGO.website}
🕒 Operating Hours: 24/7

"${BRANDS.TIZZYGO.slogan}"

Thank you for choosing ${BRANDS.TIZZYGO.name}!

Powered by AirCloud Delivery Network
          `.trim()
        };

        // Prepare email options and send email
        const preparedOptions = prepareEmailOptions(emailOptions);
        await sendEmail(preparedOptions);
        notifications.push({ type: 'EMAIL_OTP', status: 'sent', to: user.email });
      } catch (error: any) {
        console.error('Email OTP send failed:', error);
        notifications.push({ type: 'EMAIL_OTP', status: 'failed', error: error.message });
      }
    }

    // Second message - Confirmation (SMS only)
    const confirmationMessage = `
TizzyGo Delivery Update

Dear ${user.name},

We've successfully generated your delivery OTP.

📦 Order: ${orderId}
🔐 OTP: ${otp}
⏰ Generated: ${new Date().toLocaleTimeString()}
🚚 Status: Out for Delivery

Your delivery executive is on the way with your package. Please keep your OTP ready for verification.

Powered by TizzyGo, TizzyOS & AirCloud
    `.trim();

    if (user.phone) {
      try {
        await sendSms(user.phone, confirmationMessage.substring(0, 160));
        notifications.push({ type: 'SMS_CONFIRMATION', status: 'sent' });
      } catch (error: any) {
        console.error('Confirmation SMS failed:', error);
      }
    }

  } else if (type === 'CONGRATULATIONS') {
    // Third message - Congratulations
    const congratsMessage = generateCongratulationsMessage(orderId, user.name || 'Customer', new Date().toLocaleString());
    
    // SMS Congratulations
    if (user.phone) {
      try {
        const smsCongrats = `🎉 Congratulations! Your order ${orderId} has been delivered successfully via TizzyGo. Thank you for choosing our service powered by AirCloud! ${BRANDS.TIZZYGO.website}`;
        await sendSms(user.phone, smsCongrats);
        notifications.push({ type: 'SMS_CONGRATULATIONS', status: 'sent' });
      } catch (error: any) {
        console.error('Congratulations SMS failed:', error);
      }
    }

    // Email Congratulations
    if (user.email) {
      try {
        const emailOptions: EmailOptions = {
          to: user.email,
          subject: `🎉 Delivery Successful - Order ${orderId}`,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Delivery Successful - TizzyGo</title>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
                .header { background: linear-gradient(135deg, ${BRANDS.TIZZYGO.color}, ${BRANDS.AIRCLOUD.color}); padding: 40px; text-align: center; color: white; }
                .header img { height: 70px; display: block; margin: 0 auto 20px; }
                .content { padding: 40px; }
                .success-icon { font-size: 48px; margin: 20px 0; text-align: center; }
                .delivery-details { background: #f8f9fa; border-radius: 8px; padding: 25px; margin: 25px 0; }
                .brands-section { display: flex; justify-content: space-between; margin: 40px 0; flex-wrap: wrap; }
                .brand-card { text-align: center; padding: 20px; border: 1px solid #eee; border-radius: 8px; background: white; flex: 1; margin: 0 10px; min-width: 150px; }
                .brand-card img { height: 50px; margin-bottom: 15px; width: auto; }
                .cta-button { display: inline-block; background: ${BRANDS.TIZZYGO.color}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
                .footer { background: #f8f9fa; padding: 25px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #eee; }
                @media (max-width: 600px) {
                  .brands-section { flex-direction: column; }
                  .brand-card { margin: 10px 0; }
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <div style="font-size: 42px; font-weight: bold; color: white; margin: 0 0 10px 0;">TizzyGo</div>
                  <h1 style="margin: 0 0 10px 0; font-size: 32px;">🎉 Delivery Successful!</h1>
                  <p style="margin: 0; font-size: 18px; opacity: 0.9;">Your order has been delivered</p>
                </div>
                
                <div class="content">
                  <div style="text-align: center;">
                    <div class="success-icon">✅</div>
                    <h2 style="color: ${BRANDS.TIZZYGO.color}; margin: 10px 0;">Congratulations ${user.name}!</h2>
                    <p>Your delivery has been successfully completed and verified through our secure OTP system.</p>
                  </div>
                  
                  <div class="delivery-details">
                    <h3 style="color: ${BRANDS.TIZZYGO.color}; margin-top: 0;">📋 Delivery Summary</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Order ID:</strong></td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${orderId}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Delivery Status:</strong></td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; color: #28a745;">✅ Delivered & Verified</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Delivery Time:</strong></td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${new Date().toLocaleString()}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;"><strong>Security Method:</strong></td>
                        <td style="padding: 8px 0; text-align: right;">🔐 OTP Verified</td>
                      </tr>
                    </table>
                  </div>
                  
                  <div style="text-align: center; margin: 30px 0;">
                    <h3 style="color: ${BRANDS.TIZZYOS.color};">Your Delivery Journey</h3>
                    <p>From order placement to successful delivery, powered by our integrated ecosystem:</p>
                  </div>
                  
                  <div class="brands-section">
                    <div class="brand-card">
                      <div style="background: ${BRANDS.TIZZYOS.color}; color: white; width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px; font-weight: bold; font-size: 18px;">TO</div>
                      <h4 style="margin: 10px 0; color: ${BRANDS.TIZZYOS.color};">${BRANDS.TIZZYOS.name}</h4>
                      <p style="font-size: 13px; color: #666; margin: 0;">Order Placement & Management Platform</p>
                      <div style="margin-top: 15px; font-size: 12px; color: ${BRANDS.TIZZYOS.color};">📍 Step 1: Order Placed</div>
                    </div>
                    
                    <div class="brand-card">
                      <div style="background: ${BRANDS.AIRCLOUD.color}; color: white; width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px; font-weight: bold; font-size: 18px;">AC</div>
                      <h4 style="margin: 10px 0; color: ${BRANDS.AIRCLOUD.color};">${BRANDS.AIRCLOUD.name}</h4>
                      <p style="font-size: 13px; color: #666; margin: 0;">Delivery Coordination Network</p>
                      <div style="margin-top: 15px; font-size: 12px; color: ${BRANDS.AIRCLOUD.color};">📍 Step 2: Order Processed</div>
                    </div>
                    
                    <div class="brand-card">
                      <div style="background: ${BRANDS.TIZZYGO.color}; color: white; width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px; font-weight: bold; font-size: 18px;">TG</div>
                      <h4 style="margin: 10px 0; color: ${BRANDS.TIZZYGO.color};">${BRANDS.TIZZYGO.name}</h4>
                      <p style="font-size: 13px; color: #666; margin: 0;">Last-mile Delivery Execution</p>
                      <div style="margin-top: 15px; font-size: 12px; color: ${BRANDS.TIZZYGO.color};">📍 Step 3: Delivered</div>
                    </div>
                  </div>
                  
                  <div style="text-align: center; margin-top: 40px;">
                    <p style="color: #666; margin-bottom: 20px;">Share your delivery experience with us</p>
                    <a href="${BRANDS.TIZZYGO.website}/rate-delivery" class="cta-button" style="color: white; text-decoration: none;">Rate Your Delivery</a>
                  </div>
                </div>
                
                <div class="footer">
                  <div style="margin-bottom: 15px;">
                    <div style="display: inline-block; background: ${BRANDS.TIZZYGO.color}; color: white; width: 20px; height: 20px; border-radius: 50%; text-align: center; line-height: 20px; font-weight: bold; margin: 0 5px;">TG</div>
                    <div style="display: inline-block; background: ${BRANDS.TIZZYOS.color}; color: white; width: 20px; height: 20px; border-radius: 50%; text-align: center; line-height: 20px; font-weight: bold; margin: 0 5px;">TO</div>
                    <div style="display: inline-block; background: ${BRANDS.AIRCLOUD.color}; color: white; width: 20px; height: 20px; border-radius: 50%; text-align: center; line-height: 20px; font-weight: bold; margin: 0 5px;">AC</div>
                  </div>
                  <p style="margin: 10px 0;">
                    Thank you for trusting our delivery ecosystem!<br>
                    We look forward to serving you again.
                  </p>
                  <p style="margin: 5px 0; font-size: 11px;">
                    © ${new Date().getFullYear()} TizzyGo Delivery Network. All rights reserved.<br>
                    ${BRANDS.TIZZYGO.website} | ${BRANDS.TIZZYGO.supportEmail}
                  </p>
                </div>
              </div>
            </body>
            </html>
          `,
          // UPDATED: Full text content for congratulations email
          text: `
TIZZYGO

🎉 DELIVERY SUCCESSFULLY COMPLETED 🎉

Congratulations ${user.name}! 🎊

Your order has been successfully delivered!

📦 Order ID: ${orderId}
✅ Delivery Status: COMPLETED
🕐 Delivery Time: ${new Date().toLocaleString()}
📍 Delivery Type: Secure OTP Verified

Your delivery journey:
1️⃣ Order Placed → TizzyOS Platform
2️⃣ Order Processed → AirCloud Network
3️⃣ Delivery Executed → TizzyGo Rider
4️⃣ OTP Verified → Secure Handover

DELIVERY DETAILS:
• Package Status: Delivered Successfully
• Security Level: OTP Verified
• Customer Satisfaction: Priority
• Support Available: 24/7

Thank you for trusting our delivery ecosystem! We're committed to providing you with the best service experience through our integrated platform.

Would you like to share your delivery experience? Rate your delivery executive through our app!

📱 For any queries, please contact our customer support
📧 Email: ${BRANDS.TIZZYGO.supportEmail}
🌐 Website: ${BRANDS.TIZZYGO.website}
🕒 Operating Hours: 24/7

"${BRANDS.TIZZYGO.slogan}"

Thank you for choosing ${BRANDS.TIZZYGO.name}!

Powered by AirCloud Delivery Network
          `.trim()
        };

        // Prepare email options and send email
        const preparedOptions = prepareEmailOptions(emailOptions);
        await sendEmail(preparedOptions);
        notifications.push({ type: 'EMAIL_CONGRATULATIONS', status: 'sent' });
      } catch (error: any) {
        console.error('Congratulations email failed:', error);
      }
    }
  }

  return notifications;
};

export const riderConfirmDelivery = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  console.log('🚀 [DELIVERY] riderConfirmDelivery STARTED ======================');
  console.log('📦 Request body:', req.body);
  console.log('🏪 Platform: TizzyOS | Delivery: TizzyGo | Network: AirCloud');
  
  try {
    const riderId = await getAuthenticatedRiderId(req);
    console.log('👤 Authenticated Rider ID:', riderId);
    
    const { orderId, otp } = req.body;

    if (!orderId) {
      console.error('❌ [VALIDATION] orderId is required');
      throw new Error('orderId is required');
    }

    console.log('🔍 Searching for order:', orderId);
    const order = await Shipper.findOne({ orderId }).session(session);
    if (!order) {
      console.error('❌ [ORDER] Order not found with ID:', orderId);
      throw new Error('Order not found');
    }

    console.log('📊 Order found:', {
      orderId: order.orderId,
      riderId: order.riderId,
      deliveryStatus: order.deliveryStatus,
      buyerId: order.buyerId
    });

    if (order.riderId?.toString() !== riderId) {
      console.error('❌ [AUTH] Rider mismatch:', {
        orderRiderId: order.riderId,
        authenticatedRiderId: riderId
      });
      throw new Error('This order is not assigned to you');
    }

    if (order.deliveryStatus !== OrderDeliveryStatus.PICKED_UP) {
      console.error('❌ [STATUS] Order not ready for delivery:', {
        currentStatus: order.deliveryStatus,
        requiredStatus: OrderDeliveryStatus.PICKED_UP
      });
      throw new Error('Order not ready for delivery');
    }

    console.log('👤 Searching for buyer/user:', order.buyerId);
    const user = await User.findById(order.buyerId).session(session);
    if (!user) {
      console.error('❌ [USER] User not found with ID:', order.buyerId);
      throw new Error('User not found');
    }

    console.log('👤 User found:', {
      userId: user._id,
      name: user.name,
      phone: user.phone,
      email: user.email
    });

    /* ================= OTP SEND ================= */
    if (!otp) {
      console.log('📲 [OTP] No OTP provided, generating new OTP...');
      const generatedOtp = generateOtp();
      console.log('🔐 Generated OTP:', generatedOtp);

      console.log('🧹 Cleaning up old OTPs for order:', orderId);
      await Otp.deleteMany({ orderId }).session(session);

      console.log('💾 Creating new OTP document...');
      const otpDoc = await Otp.create(
        [
          {
            orderId,
            userId: user._id,
            otp: generatedOtp,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
            metadata: {
              platform: BRANDS.TIZZYOS.name,
              deliveryService: BRANDS.TIZZYGO.name,
              network: BRANDS.AIRCLOUD.name,
              platformLogo: BRANDS.TIZZYOS,
              deliveryLogo: BRANDS.TIZZYGO,
              networkLogo: BRANDS.AIRCLOUD,
              generatedAt: new Date()
            }
          },
        ],
        { session }
      );

      console.log('⏰ OTP expiry time:', otpDoc[0].expiresAt);

      // Send comprehensive notifications
      console.log('📨 Sending comprehensive notifications...');
      const notifications = await sendComprehensiveNotifications(user, generatedOtp, orderId, 'OTP');
      console.log('📊 Notifications sent:', notifications);

      console.log('✅ [OTP SEND] Committing transaction...');
      await session.commitTransaction();
      session.endSession();

      console.log('🎉 [OTP SEND] Success - Multiple messages sent to user');
      console.log('🏪 Brands Involved:', {
        Platform: BRANDS.TIZZYOS.name,
        Delivery: BRANDS.TIZZYGO.name,
        Network: BRANDS.AIRCLOUD.name,
        PlatformLogo: BRANDS.TIZZYOS,
        DeliveryLogo: BRANDS.TIZZYGO,
        NetworkLogo: BRANDS.AIRCLOUD
      });

      return res.json({
        success: true,
        message: 'OTP sent successfully via multiple channels',
        data: {
          otpGenerated: true,
          notificationsSent: notifications.filter(n => n.status === 'sent').length,
          totalNotifications: notifications.length,
          brands: {
            platform: BRANDS.TIZZYOS,
            delivery: BRANDS.TIZZYGO,
            network: BRANDS.AIRCLOUD
          },
          logos: {
            platform: BRANDS.TIZZYOS,
            delivery: BRANDS.TIZZYGO,
            network: BRANDS.AIRCLOUD
          }
        },
      });
    }

    /* ================= OTP VERIFY ================= */
    console.log('🔐 [OTP VERIFY] OTP provided for verification:', otp);
    console.log('🔍 Searching for valid OTP document...');
    
    const otpDoc = await Otp.findOne({
      orderId,
      userId: user._id,
      otp,
      expiresAt: { $gt: new Date() },
    }).session(session);

    if (!otpDoc) {
      console.error('❌ [OTP] Invalid or expired OTP:', {
        orderId,
        userId: user._id,
        providedOtp: otp,
        currentTime: new Date()
      });
      throw new Error('Invalid or expired OTP');
    }

    console.log('✅ [OTP] OTP verified successfully:', {
      otpId: otpDoc._id,
      expiresAt: otpDoc.expiresAt
    });

    console.log('📍 Getting latest rider location...');
    const riderLatestLocation = await getLatestRiderLocation(riderId);
    console.log('📍 Rider location:', riderLatestLocation);

    console.log('📝 Updating order status to DELIVERED...');
    await Shipper.updateOne(
      { orderId },
      {
        $set: {
          deliveryStatus: OrderDeliveryStatus.DELIVERED,
          deliveredAt: new Date(),
          riderLocation: riderLatestLocation,
          deliveryMetadata: {
            platform: BRANDS.TIZZYOS.name,
            deliveryService: BRANDS.TIZZYGO.name,
            network: BRANDS.AIRCLOUD.name,
            platformLogo: BRANDS.TIZZYOS,
            deliveryLogo: BRANDS.TIZZYGO,
            networkLogo: BRANDS.AIRCLOUD,
            otpVerified: true,
            verificationTime: new Date()
          }
        },
      },
      { session }
    );

    console.log('📊 Updating rider order stats...');
    await updateRiderOrderStats(
      riderId,
      { delivered: 1 },
      session
    );
    console.log('✅ Rider stats updated');

    // Send congratulations notifications
    console.log('🎉 Sending congratulations notifications...');
    const congratsNotifications = await sendComprehensiveNotifications(user, otp, orderId, 'CONGRATULATIONS');
    console.log('📊 Congratulations notifications sent:', congratsNotifications);

    console.log('🧹 Cleaning up OTP documents...');
    await Otp.deleteMany({ orderId }).session(session);
    console.log('✅ OTP documents deleted');

    console.log('✅ [DELIVERY] Committing final transaction...');
    await session.commitTransaction();
    session.endSession();

    // Generate delivery completion message for logs
    const deliveryCompletionMessage = generateDeliveryCompletionMessage(orderId, user.name, 'Rider');
    console.log('📋 Delivery Completion Summary:');
    console.log(deliveryCompletionMessage);

    console.log('🎉 [DELIVERY] Delivery confirmed successfully!');
    console.log('📦 Order ID:', orderId);
    console.log('👤 Customer:', user.name);
    console.log('🏪 Ecosystem:', {
      Platform: BRANDS.TIZZYOS.name,
      PlatformLogo: BRANDS.TIZZYOS,
      Delivery: BRANDS.TIZZYGO.name,
      DeliveryLogo: BRANDS.TIZZYGO,
      Network: BRANDS.AIRCLOUD.name,
      NetworkLogo: BRANDS.AIRCLOUD
    });
    
    return res.json({
      success: true,
      message: 'Delivery confirmed successfully via secure OTP verification',
      data: {
        orderId,
        deliveryTime: new Date().toISOString(),
        user: {
          name: user.name,
          image: user.image,
        },
        ecosystem: {
          platform: BRANDS.TIZZYOS,
          delivery: BRANDS.TIZZYGO,
          network: BRANDS.AIRCLOUD
        },
        logos: {
          platform: BRANDS.TIZZYOS,
          delivery: BRANDS.TIZZYGO,
          network: BRANDS.AIRCLOUD
        },
        security: {
          otpVerified: true,
          method: 'One-Time Password',
          verificationTime: new Date()
        },
        notifications: {
          sent: true,
          types: ['OTP', 'Confirmation', 'Congratulations']
        }
      },
    });

  } catch (err: any) {
    console.error('❌ [ERROR] riderConfirmDelivery failed:', err);
    console.error('📝 Error details:', {
      message: err.message,
      stack: err.stack,
      name: err.name
    });
    
    console.log('🔄 Aborting transaction due to error...');
    await session.abortTransaction();
    session.endSession();
    
    console.log('📤 Sending error response to client...');
    return res.status(400).json({
      success: false,
      message: err.message,
      ecosystem: {
        platform: BRANDS.TIZZYOS.name,
        platformLogo: BRANDS.TIZZYOS,
        delivery: BRANDS.TIZZYGO.name,
        deliveryLogo: BRANDS.TIZZYGO,
        network: BRANDS.AIRCLOUD.name,
        networkLogo: BRANDS.AIRCLOUD
      }
    });
  }
};

// ========== COMPLETELY UPDATED riderLocationController ==========

export const riderLocationController = async (req: Request, res: Response) => {
  try {
    console.log("🚀 ========== riderLocationController START ==========");
    
    // IMPORTANT: Extract userId from JWT (not riderId)
    const userId = getUserIdFromAuth(req);
    console.log("✅ Extracted userId from token:", userId);
    
    // Step 1: Find rider in Register collection using userId
    console.log("🔍 Looking up rider in Register collection with userId:", userId);
    const rider = await Register.findOne({ userId }) as { _id: mongoose.Types.ObjectId; kyc?: { status: string }; isAvailable?: boolean };
    
    if (!rider) {
      return res.status(404).json({ 
        success: false, 
        message: "Rider not found. Please complete rider registration." 
      });
    }
    
    // Step 2: Validate KYC status
    if (rider.kyc?.status !== "verified") {
      return res.status(403).json({ 
        success: false, 
        message: "KYC not approved. Please complete KYC verification." 
      });
    }
    
    // Step 3: This is the REAL riderId to use everywhere (Register._id)
    const riderId = rider._id.toString();
    console.log("✅ Found rider in Register. Real riderId (Register._id):", riderId);
    console.log("✅ KYC status:", rider.kyc?.status);
    console.log("✅ Is available:", rider.isAvailable);
    
    const { action, latitude, longitude } = req.body;
    console.log("✅ Action from body:", action);
    
    // 🔥 FRONTEND LOCATION RECEIVED LOG 🔥
    if (action === "update" && latitude && longitude) {
      console.log("📍📍📍 FRONTEND SE LOCATION RECEIVED 📍📍📍");
      console.log(`📍 Coordinates: ${latitude}, ${longitude}`);
      console.log(`📍 Rider ID (Register._id): ${riderId}`);
      console.log(`📍 Timestamp: ${new Date().toISOString()}`);
      console.log("📍📍📍 LOCATION SAVING STARTING 📍📍📍");
    }
    
    if (!action) {
      return res.status(400).json({ 
        success: false, 
        message: "action is required" 
      });
    }

    if (action === "start") {
      console.log("🔄 Action: START location tracking");
      
      // Start location tracking - Save to ShipperRiderLocation using rider._id
      const result = await ShipperRiderLocation.findOneAndUpdate(
        { riderId }, // Use Register._id here
        { 
          $set: { 
            riderId: riderId,
            isTrackingOn: true,
            updatedAt: new Date()
          },
          $setOnInsert: {
            createdAt: new Date()
          }
        },
        { upsert: true, new: true }
      );
      
      console.log("✅ ShipperRiderLocation update result:", result);

      await Register.updateOne(
        { _id: riderId }, // Use Register._id here
        { 
          $set: { 
            isLocationTracking: true,
            updatedAt: new Date()
          } 
        }
      );

      return res.json({ 
        success: true, 
        message: "Rider location tracking started",
        data: {
          riderId: riderId,
          documentId: result?._id,
          isTrackingOn: true
        }
      });
    }

    if (action === "stop") {
      console.log("🔄 Action: STOP location tracking");
      
      // Stop location tracking
      await Promise.all([
        ShipperRiderLocation.updateOne(
          { riderId }, // Use Register._id here
          { 
            $set: { 
              isTrackingOn: false,
              updatedAt: new Date()
            } 
          }
        ),
        Register.updateOne(
          { _id: riderId }, // Use Register._id here
          { 
            $set: { 
              isLocationTracking: false,
              updatedAt: new Date()
            } 
          }
        )
      ]);

      return res.json({ 
        success: true, 
        message: "Rider location tracking stopped" 
      });
    }

    if (action === "update") {
      console.log("🔄 Action: UPDATE location");
      
      // Update rider location
      if (!latitude || !longitude) {
        return res.status(400).json({ 
          success: false, 
          message: "latitude and longitude are required" 
        });
      }

      console.log("🔍 Checking if tracking document exists...");
      let riderTracking = await ShipperRiderLocation.findOne({ riderId }); // Use Register._id here
      
      // Create document if doesn't exist
      if (!riderTracking) {
        console.log("⚠️ No tracking document found, creating one automatically...");
        
        riderTracking = await ShipperRiderLocation.findOneAndUpdate(
          { riderId }, // Use Register._id here
          {
            $set: {
              riderId: riderId,
              isTrackingOn: true,
              updatedAt: new Date()
            },
            $setOnInsert: {
              createdAt: new Date()
            }
          },
          { upsert: true, new: true }
        );
        
        console.log("✅ Created new tracking document:", riderTracking?._id);
        
        await Register.updateOne(
          { _id: riderId }, // Use Register._id here
          { 
            $set: { 
              isLocationTracking: true,
              updatedAt: new Date()
            } 
          }
        );
      }
      
      console.log("✅ Found/created riderTracking document:", riderTracking?._id);
      
      // Auto-enable tracking if it's off
      if (!riderTracking?.isTrackingOn) {
        console.log("⚠️ Tracking is OFF, auto-enabling it...");
        
        await ShipperRiderLocation.updateOne(
          { riderId }, // Use Register._id here
          { 
            $set: { 
              isTrackingOn: true,
              updatedAt: new Date()
            } 
          }
        );
        
        await Register.updateOne(
          { _id: riderId }, // Use Register._id here
          { 
            $set: { 
              isLocationTracking: true,
              updatedAt: new Date()
            } 
          }
        );
      }

      // Smart geocoding
      let address = "Unknown Location";
      let placeId: string | undefined = undefined;

      console.log("🔍 Starting smart geocoding...");
      try {
        const lastLocation = await ShipperRiderLocation.findOne(
          { riderId }, // Use Register._id here
          { "location.latitude": 1, "location.longitude": 1, "location.address": 1, "location.googlePlaceId": 1 }
        );
        
        if (lastLocation?.location?.latitude && lastLocation.location.longitude) {
          console.log("✅ Found previous location in DB");
          const distanceMoved = calculateHaversineDistanceInKm(
            latitude,
            longitude,
            lastLocation.location.latitude,
            lastLocation.location.longitude
          ) * 1000;
          
          console.log(`📏 Distance moved: ${distanceMoved.toFixed(2)} meters`);
          console.log(`📏 Threshold: ${GEOCODE_DISTANCE_THRESHOLD_METERS} meters`);
          
          if (distanceMoved < GEOCODE_DISTANCE_THRESHOLD_METERS && lastLocation.location.address) {
            console.log("✅ Using cached address (within threshold)");
            address = lastLocation.location.address;
            placeId = lastLocation.location.googlePlaceId;
          } else {
            console.log("📍 Getting new geocode from Google API...");
            const geocodeResult = await geocodeAddress(latitude, longitude);
            address = geocodeResult.address;
            placeId = geocodeResult.placeId;
          }
        } else {
          console.log("📍 No previous location, getting new geocode...");
          const geocodeResult = await geocodeAddress(latitude, longitude);
          address = geocodeResult.address;
          placeId = geocodeResult.placeId;
        }
      } catch (err: any) {
        console.warn(`⚠️ Smart geocoding failed:`, err.message || err);
        address = `Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      }

      const locationPayload = {
        address,
        latitude,
        longitude,
        googlePlaceId: placeId,
        updatedAt: new Date(),
      };

      console.log("💾 Saving location to ShipperRiderLocation...");
      
      // Save location to ShipperRiderLocation using Register._id
      const updateResult = await ShipperRiderLocation.updateOne(
        { riderId }, // Use Register._id here
        { 
          $set: { 
            riderId: riderId,
            location: locationPayload, 
            updatedAt: new Date() 
          } 
        }
      );
      
      console.log("✅ ShipperRiderLocation update result:", updateResult);

      // Verify the document was saved
      const savedDoc = await ShipperRiderLocation.findOne({ riderId });
      console.log("✅ Saved document verification:", {
        hasDoc: savedDoc ? "YES" : "NO",
        riderIdInDoc: savedDoc?.riderId,
        hasLocation: savedDoc?.location ? "YES" : "NO"
      });

      // Propagate location to active orders
      console.log("🔄 Propagating location to active orders...");
      const propagatedCount = await propagateRiderLocationToActiveOrders(riderId);

      const activeOrders = await Shipper.find({
        riderId, // Use Register._id here
        deliveryStatus: { $in: LOCATION_UPDATE_STATUSES }
      }).select("orderId deliveryStatus riderLocation");

      console.log("✅ Active orders count:", activeOrders.length);
      
      // 🔥 FRONTEND LOCATION SAVED LOG 🔥
      if (action === "update" && latitude && longitude) {
        console.log("📍📍📍 LOCATION SUCCESSFULLY SAVED 📍📍📍");
        console.log(`📍 Saved to database: ${latitude}, ${longitude}`);
        console.log(`📍 Rider ID (Register._id): ${riderId}`);
        console.log(`📍 Time: ${new Date().toISOString()}`);
        console.log(`📍 Address: ${address.substring(0, 50)}...`);
        console.log(`📍 Orders updated: ${propagatedCount}`);
        console.log("📍📍📍 LOCATION UPDATE COMPLETED 📍📍📍");
      }

      return res.json({
        success: true,
        message: "Location updated successfully",
        data: {
          riderId: riderId,
          riderLocation: locationPayload,
          ordersUpdated: propagatedCount,
          activeOrdersCount: activeOrders.length,
          activeOrders: activeOrders.map(order => ({
            orderId: order.orderId,
            deliveryStatus: order.deliveryStatus,
            riderLocation: order.riderLocation
          })),
          note: "Location saved in ShipperRiderLocation using Register._id"
        }
      });
    }

    if (action === "get") {
      console.log("🔄 Action: GET location");
      
      // Get current location from ShipperRiderLocation using Register._id
      const riderTracking = await ShipperRiderLocation.findOne({ riderId }); // Use Register._id here
      
      if (!riderTracking) {
        const newDoc = await ShipperRiderLocation.create({
          riderId: riderId,
          isTrackingOn: false,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        return res.json({
          success: true,
          message: "No tracking data found",
          data: {
            riderId: newDoc.riderId,
            isTrackingOn: newDoc.isTrackingOn,
            location: null,
            lastUpdated: null
          }
        });
      }

      return res.json({
        success: true,
        data: {
          riderId: riderTracking.riderId,
          isTrackingOn: riderTracking.isTrackingOn,
          location: riderTracking.location,
          lastUpdated: riderTracking.location?.updatedAt
        }
      });
    }

    return res.status(400).json({ 
      success: false, 
      message: "Invalid action. Use 'start', 'stop', 'update', or 'get'" 
    });
  } catch (err: any) {
    console.error("❌ riderLocationController error:", err);
    
    if (err.message.includes("Authentication") || err.message.includes("Access denied")) {
      return res.status(401).json({ 
        success: false, 
        message: err.message 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// ========== UPDATED SUPPORTING CONTROLLERS ==========

export const getRiderPendingOrders = async (req: Request, res: Response) => {
  console.log('🚀 [getRiderPendingOrders] Function started');
  
  try {
    console.log('🔍 [getRiderPendingOrders] Getting authenticated rider ID...');
    
    // Get riderId with proper lookup
    const riderId = await getAuthenticatedRiderId(req);
    console.log(`✅ [getRiderPendingOrders] Rider ID obtained: ${riderId}`);
    
    console.log(`📋 [getRiderPendingOrders] Finding orders for rider: ${riderId}`);
    
    // ✅ UPDATED: Get ALL orders except waiting_for_seller
    const orders = await Shipper.find({
      riderId,
      // ✅ Show all status except waiting_for_seller
      deliveryStatus: { $ne: 'waiting_for_seller' }
    })
      .sort({ createdAt: -1 })
      .select("orderId sellerAddress buyerAddress deliveryStatus createdAt riderLocation isCOD amount");
    
    console.log(`📦 [getRiderPendingOrders] Orders found: ${orders.length}`);
    
    if (orders.length > 0) {
      console.log('📄 [getRiderPendingOrders] Orders status breakdown:');
      orders.forEach(order => {
        console.log(`   - Order ${order.orderId}: ${order.deliveryStatus}`);
      });
    }
    
    const formattedOrders = orders.map(order => ({
      orderId: order.orderId,
      sellerLocation: order.sellerAddress,
      buyerLocation: order.buyerAddress,
      riderLocation: order.riderLocation,
      deliveryStatus: order.deliveryStatus,
      note: order.riderLocation ? "Location available" : "Location will be added after acceptance",
      createdAt: order.createdAt,
      isCOD: order.isCOD || false,
      amount: order.amount || 0
    }));
    
    console.log('✅ [getRiderPendingOrders] Successfully processed orders');
    console.log('📤 [getRiderPendingOrders] Sending response...');
    
    return res.json({
      success: true,
      data: {
        count: orders.length,
        orders: formattedOrders
      }
    });
    
  } catch (err: any) {
    console.error("❌ [getRiderPendingOrders] Error occurred:", err);
    console.error(`🔍 [getRiderPendingOrders] Error details:`, {
      message: err.message,
      stack: err.stack,
      name: err.name
    });
    
    if (err.message.includes("Authentication") || err.message.includes("Access denied")) {
      console.log('⚠️ [getRiderPendingOrders] Authentication error detected');
      return res.status(401).json({ 
        success: false, 
        message: err.message 
      });
    }
    
    console.error('💥 [getRiderPendingOrders] Internal server error');
    return res.status(500).json({ 
      success: false, 
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  } finally {
    console.log('🏁 [getRiderPendingOrders] Function execution completed');
  }
};

export const getRiderActiveOrders = async (req: Request, res: Response) => {
  try {
    // UPDATED: Get riderId with proper lookup
    const riderId = await getAuthenticatedRiderId(req);

    const activeOrders = await Shipper.find({
      riderId,
      deliveryStatus: { $in: LOCATION_UPDATE_STATUSES }
    })
      .sort({ createdAt: -1 })
      .select("orderId sellerAddress buyerAddress deliveryStatus riderLocation createdAt");

    return res.json({
      success: true,
      data: {
        count: activeOrders.length,
        orders: activeOrders.map(order => ({
          orderId: order.orderId,
          sellerLocation: order.sellerAddress,
          buyerLocation: order.buyerAddress,
          riderLocation: order.riderLocation,
          deliveryStatus: order.deliveryStatus,
          note: "Location updates in real-time from ShipperRiderLocation",
          createdAt: order.createdAt
        }))
      }
    });
  } catch (err: any) {
    console.error("❌ getRiderActiveOrders error:", err);
    
    if (err.message.includes("Authentication") || err.message.includes("Access denied")) {
      return res.status(401).json({ 
        success: false, 
        message: err.message 
      });
    }
    
    return res.status(500).json({ 
      success: false, 
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};