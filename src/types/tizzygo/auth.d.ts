import { Request } from "express";

export interface ITizzyGoUser {
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

export interface AuthRequest extends Request {
  user?: ITizzyGoUser;
}
