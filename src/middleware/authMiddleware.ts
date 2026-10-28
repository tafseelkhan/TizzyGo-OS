
import { NextFunction, Request, Response } from "express";
import {
  verifyAccessToken,
  type UserRole,
} from "../config/tizzygo/jwt";

/**
 * Backward compatibility:
 * Existing services can continue importing AuthRequest.
 */
export interface AuthRequest extends Request {
  userId?: string;
  userRole?: UserRole;
}

/**
 * Keep the newer interface name compatible too.
 */
export interface AuthenticatedRequest extends AuthRequest {}

/**
 * Verify the Quton Connect access token and attach
 * the authenticated user's ID and available token data.
 */
export function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const authorization = req.headers.authorization;

    if (!authorization) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const parts = authorization.trim().split(/\s+/);

    if (
      parts.length !== 2 ||
      parts[0].toLowerCase() !== "bearer" ||
      !parts[1]
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid authorization header",
      });
    }

    const payload = verifyAccessToken(parts[1]);
    const userId = payload.sub;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid access token payload",
      });
    }

    // Existing services using req.userId / req.userRole
    req.userId = userId;
    req.userRole = payload.role;

    // Services using req.user.userId / req.user.id / req.user._id
    req.user = {
      id: userId,
      _id: userId,
      userId,
      role: payload.role,
    };

    return next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired access token",
    });
  }
}

/**
 * Always use authMiddleware before authorize().
 */
export function authorize(...allowedRoles: UserRole[]) {
  return (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ) => {
    if (!req.userId || !req.userRole) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!allowedRoles.includes(req.userRole)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource",
      });
    }

    return next();
  };
}
