import { Request, Response } from 'express';
import Register from '../../../../models/tizzyos/shipping/fws/fwsRegistration'; // rider model
import jwt from 'jsonwebtoken';

export const getRiderIdFromToken = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided',
        timestamp: new Date().toISOString()
      });
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token',
        timestamp: new Date().toISOString()
      });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret');
    } catch (jwtError: any) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          success: false, 
          message: 'Token expired', 
          expiredAt: jwtError.expiredAt,
          timestamp: new Date().toISOString()
        });
      } else if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid token',
          error: jwtError.message,
          timestamp: new Date().toISOString()
        });
      }
      
      return res.status(401).json({ 
        success: false, 
        message: 'Token verification failed',
        error: jwtError.message,
        timestamp: new Date().toISOString()
      });
    }

    const userId = decoded.id || decoded.userId || decoded._id;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid token payload',
        decodedPayload: decoded,
        timestamp: new Date().toISOString()
      });
    }

    const rider = await Register.findOne({ userId });
    
    if (!rider) {
      return res.status(404).json({ 
        success: false, 
        message: 'Rider not found',
        userId: userId,
        timestamp: new Date().toISOString()
      });
    }

    const response = { 
      success: true, 
      riderId: rider._id,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (err: any) {
    if (err.name === 'MongoNetworkError') {
      return res.status(503).json({ 
        success: false, 
        message: 'Database connection error',
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
    
    return res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
};
