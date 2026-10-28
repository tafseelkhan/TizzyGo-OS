import "dotenv/config";
import jwt, { SignOptions } from "jsonwebtoken";

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

if (!JWT_ACCESS_SECRET) {
  throw new Error("JWT_ACCESS_SECRET is not defined in .env");
}

const JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || "15m";

export const USER_ROLES = [
  "super_admin",
  "admin",
  "team",
  "business",
  "user",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface AccessTokenPayload {
  sub: string;
  type: "access";
  role: UserRole;
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && USER_ROLES.includes(value as UserRole);
}

export function generateAccessToken(userId: string, role: UserRole): string {
  if (!userId || !isUserRole(role)) {
    throw new Error("Invalid user ID or role");
  }

  const payload: AccessTokenPayload = {
    sub: userId,
    type: "access",
    role,
  };

  return jwt.sign(payload, JWT_ACCESS_SECRET!, {
    expiresIn: JWT_ACCESS_EXPIRES_IN as SignOptions["expiresIn"],
    algorithm: "HS256",
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, JWT_ACCESS_SECRET!, {
    algorithms: ["HS256"],
  });

  if (typeof decoded !== "object" || decoded === null) {
    throw new Error("Invalid JWT payload");
  }

  if (decoded.type !== "access") {
    throw new Error("Invalid token type");
  }

  if (typeof decoded.sub !== "string" || !decoded.sub) {
    throw new Error("Invalid user ID in token");
  }

  if (!isUserRole(decoded.role)) {
    throw new Error("Invalid user role in token");
  }

  return {
    sub: decoded.sub,
    type: "access",
    role: decoded.role,
  };
}
