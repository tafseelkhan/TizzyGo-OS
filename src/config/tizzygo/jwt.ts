import jwt, { Secret, SignOptions } from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

interface TokenPayload {
  userId: string;
  email: string;
}

export const generateToken = (userId: string, email: string): string => {
  const secret: Secret =
    process.env.JWT_SECRET ||
    "23ebd585-0ff0-4750-8fd7-76bd88b57dbf8bf28ac1-a29a-43ad-b481-2c20ae04b455"; // 🧩 fallback for local testing

  const expiresIn: SignOptions["expiresIn"] =
    (process.env.JWT_EXPIRES_IN as SignOptions["expiresIn"]) || "90d";

  const payload: TokenPayload = { userId, email };

  return jwt.sign(payload, secret, { expiresIn });
};
