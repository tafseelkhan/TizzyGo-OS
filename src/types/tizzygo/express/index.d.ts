
import "express";
import type { UserRole } from "../config/tizzygo/jwt";

declare global {
  namespace Express {
    interface UserPayload {
      /** Quton Connect user ID or compatible local ID */
      _id?: string;
      id: string;
      userId?: string;

      /** Quton Connect profile */
      firstName?: string;
      lastName?: string;
      username?: string;
      connectAddress?: string;

      /** Authentication and authorization */
      role?: UserRole;
      status?: "pending" | "active" | "suspended" | "disabled";

      /** Contact verification */
      phone?: string;
      phoneVerified?: boolean;
      connectVerified?: boolean;

      /** Backward compatibility with existing services */
      name?: string;
      email?: string;
      image?: string;
      isEmailVerified?: boolean;
      isPhoneVerified?: boolean;
    }

    interface Request {
      user?: UserPayload;
      userId?: string;
      userRole?: UserRole;
    }
  }
}

export {};
