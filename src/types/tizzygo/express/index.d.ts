import "express";

declare global {
  namespace Express {
    interface UserPayload {
      _id: string;
      id: string;
      userId: string;
      email?: string;
      name?: string;
      phone?: string;
      image?: string;
      isEmailVerified?: boolean;
      isPhoneVerified?: boolean;
    }

    interface Request {
      user?: UserPayload;
    }
  }
}
