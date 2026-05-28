import generateOTP from "../../utils/generateOTP";
import OTP from "../../models/tizzyos/auths/OTP";
import { sendOTPEmail } from "./mailService";

export const sendOTP = async (identifier: string) => {
  // ✅ Await add karo yahan
  const otp = await generateOTP(identifier);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // ✅ Pehle se existing OTP delete karo (optional, kyunki generateOTP already upsert kar raha hai)
  await OTP.findOneAndDelete({ identifier });

  // ✅ Naya OTP create karo
  await OTP.create({ identifier, code: otp, expiresAt });

  // ✅ Email bhejo
  await sendOTPEmail(identifier, otp);

  return otp;
};

export const verifyOTPCode = async (identifier: string, code: string) => {
  const record = await OTP.findOne({ identifier, code });

  if (!record || record.expiresAt < new Date()) {
    throw new Error("Invalid or expired OTP");
  }

  await OTP.deleteOne({ _id: record._id });

  return true;
};