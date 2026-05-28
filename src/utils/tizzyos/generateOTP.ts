import Otp from '../../models/tizzyos/auths/OTP';

/**
 * Generates a 6-digit OTP and stores it in the DB with a 5-minute expiry.
 * If an OTP already exists for the same identifier, it will be updated.
 */
const generateOTP = async (identifier: string): Promise<string> => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins from now

  try {
    const savedOtp = await Otp.findOneAndUpdate(
      { identifier },
      { otp, expiresAt },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log("✅ OTP generated:", otp);
    console.log("🕒 Expires at:", expiresAt.toISOString());
    console.log("💾 Saved OTP record:", savedOtp);
    return otp;
  } catch (err) {
    console.error("❌ OTP Save Error:", err);
    throw new Error("Failed to save OTP");
  }
};

export default generateOTP;
