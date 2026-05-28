import { Request } from "express";

// This extends Express' Request type to include userId
export interface AuthRequest extends Request {
  userId?: string;
}
