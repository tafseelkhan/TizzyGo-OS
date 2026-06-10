import { Response } from "express";
import axios from "axios";
import { AuthRequest } from "../../../middleware/tizzygo/authMiddleware";
import Order from "../../../models/tizzygo/order/order";
import DeliveryTracking from "../../../models/tizzygo/order/deliveryTracking";

interface DistanceMatrixResponse {
  rows: {
    elements: {
      status: string;
      distance: {
        text: string;
        value: number;
      };
      duration: {
        text: string;
        value: number;
      };
      duration_in_traffic?: {
        text: string;
        value: number;
      };
    }[];
  }[];
}

interface DirectionsResponse {
  routes: {
    overview_polyline: {
      points: string;
    };
    legs: {
      steps: any[];
    }[];
  }[];
}

// ✅ Update rider location
export const updateRiderLocation = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId, latitude, longitude } = req.body;

    if (!orderId || !latitude || !longitude) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing data: orderId, latitude, and longitude are required' 
      });
    }

    await DeliveryTracking.findOneAndUpdate(
      { orderId },
      {
        riderLocation: { latitude, longitude },
        updatedAt: new Date(),
      },
      { upsert: true }
    );

    return res.json({ 
      success: true, 
      message: 'Location updated successfully' 
    });
  } catch (err: any) {
    console.error('❌ Location update error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to update location',
      error: err.message,
    });
  }
};

// ✅ Get live tracking data
export const getLiveTracking = async (req: AuthRequest, res: Response) => {
  const { orderId } = req.params;

  try {
    // 1️⃣ Fetch order with proper user validation
    const userId = req.user?.userId || req.user?.id;
    const order = await Order.findOne({ 
      orderId, 
      buyerId: userId  // Changed from userId to buyerId as per schema
    });
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    const buyer = order.buyerAddress;
    const tracking = await DeliveryTracking.findOne({ orderId });

    // If no rider assigned yet
    if (!tracking?.riderLocation) {
      return res.json({
        success: true,
        status: 'waiting_for_rider',
        message: 'Rider not assigned yet',
      });
    }

    const origin = `${tracking.riderLocation.latitude},${tracking.riderLocation.longitude}`;
    const destination = `${buyer.latitude},${buyer.longitude}`;

    // 2️⃣ Get distance matrix (ETA + distance)
    const matrixRes = await axios.get<DistanceMatrixResponse>(
      'https://maps.googleapis.com/maps/api/distancematrix/json',
      {
        params: {
          origins: origin,
          destinations: destination,
          departure_time: 'now',
          key: process.env.GOOGLE_MAPS_API_KEY,
        },
      }
    );

    const matrixEl = matrixRes.data.rows[0]?.elements[0];
    
    if (!matrixEl || matrixEl.status !== 'OK') {
      return res.status(400).json({
        success: false,
        message: 'Could not calculate distance',
        status: matrixEl?.status,
      });
    }

    const durationMin = Math.ceil(
      (matrixEl.duration_in_traffic?.value || matrixEl.duration.value) / 60
    );

    // 3️⃣ Get directions (route + polyline)
    const directionsRes = await axios.get<DirectionsResponse>(
      'https://maps.googleapis.com/maps/api/directions/json',
      {
        params: {
          origin,
          destination,
          mode: 'driving',
          departure_time: 'now',
          key: process.env.GOOGLE_MAPS_API_KEY,
        },
      }
    );

    const route = directionsRes.data.routes[0];

    if (!route) {
      return res.status(400).json({
        success: false,
        message: 'Could not calculate route',
      });
    }

    return res.json({
      success: true,
      riderLocation: tracking.riderLocation,
      estimate: {
        minutes: durationMin,
        text: `${durationMin}-${durationMin + 10} mins`,
        distance: matrixEl.distance.text,
        distanceValue: matrixEl.distance.value,
      },
      route: {
        polyline: route.overview_polyline.points,
        legs: route.legs[0]?.steps || [],
      },
      order: {
        orderId: order.orderId,
        status: order.status,
        deliveryAddress: {
          address: buyer.address,
          latitude: buyer.latitude,
          longitude: buyer.longitude,
        },
      },
    });
  } catch (err: any) {
    console.error('❌ Live tracking error:', err.message);
    
    // Handle axios errors specially
    if (err.response) {
      console.error('Google API Error:', err.response.data);
      return res.status(502).json({
        success: false,
        message: 'Error fetching data from Google Maps',
        details: err.response.data,
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch live delivery data',
      error: err.message,
    });
  }
};