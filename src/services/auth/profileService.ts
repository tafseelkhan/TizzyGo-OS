// services/auth/profileService.ts

import crypto from "crypto";
import mongoose from "mongoose";
import twilio from "twilio";
import { parsePhoneNumberFromString } from "libphonenumber-js";

import {
  APP_ROLES,
  type AppName,
  type AppRole,
} from "../../models/auth/user.schema";

import { getQutonConnectModels } from "../../config/tizzygo/qutonConnectDatabase";

// ============================================================
// CONSTANTS
// ============================================================

const OTP_EXPIRY_MS = 4 * 60 * 1000;
const OTP_EXPIRY_SECONDS = 240;
const MAX_OTP_ATTEMPTS = 5;

/**
 * Roles that a user is allowed to self-assign via the app-role API.
 */
const SELF_SELECTABLE_ROLES: Record<AppName, readonly AppRole[]> = {
  TIZZYGO: ["USER"],
  TIZZYOS: ["SELLER", "FWS", "SHIPPING", "CAB", "RENT"],
  LINKEDROP: ["USER"],
};

const ALLOWED_THEMES = ["light", "dark", "system"] as const;
type AllowedTheme = (typeof ALLOWED_THEMES)[number];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getAuthModels() {
  return getQutonConnectModels();
}

function normalizePhone(phone: string): string {
  if (typeof phone !== "string" || !phone.trim()) {
    throw new Error("Phone number is required");
  }
  const parsed = parsePhoneNumberFromString(phone.trim());
  if (!parsed || !parsed.isValid()) {
    throw new Error(
      "Enter a valid phone number with international country code, e.g. +919876543210",
    );
  }
  return parsed.number;
}

function maskPhone(phone: string): string {
  if (!phone || phone.length < 6) return "******";
  return `${phone.slice(0, 3)}******${phone.slice(-2)}`;
}

function getTwilioClient(): ReturnType<typeof twilio> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || !process.env.TWILIO_VERIFY_SERVICE_SID) {
    throw new Error("Twilio Verify environment variables are not configured");
  }
  return twilio(sid, token);
}

function getVerifyServiceSid(): string {
  const sid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!sid) throw new Error("Twilio Verify Service SID is not configured");
  return sid;
}

async function sendTwilioVerification(phone: string): Promise<void> {
  try {
    await getTwilioClient()
      .verify.v2.services(getVerifyServiceSid())
      .verifications.create({ to: phone, channel: "sms" });
  } catch (error: unknown) {
    console.error("[TWILIO VERIFY SEND ERROR]", {
      message: error instanceof Error ? error.message : String(error),
      phone: maskPhone(phone),
    });
    throw new Error(
      "Could not send OTP. Please try again later or contact support.",
    );
  }
}

async function checkTwilioVerification(
  phone: string,
  code: string,
): Promise<boolean> {
  try {
    const result = await getTwilioClient()
      .verify.v2.services(getVerifyServiceSid())
      .verificationChecks.create({ to: phone, code });
    return result.status === "approved";
  } catch (error: unknown) {
    console.error("[TWILIO VERIFY CHECK ERROR]", {
      message: error instanceof Error ? error.message : String(error),
      phone: maskPhone(phone),
    });
    return false;
  }
}

function serializeApps(
  apps: unknown,
): Array<{ app: AppName; roles: AppRole[] }> {
  if (!Array.isArray(apps)) return [];
  return (apps as Array<{ app?: unknown; roles?: unknown }>).map((entry) => ({
    app: entry.app as AppName,
    roles: Array.isArray(entry.roles) ? ([...entry.roles] as AppRole[]) : [],
  }));
}

// ============================================================
// 1. UPDATE BASIC PROFILE
// ============================================================

interface UpdateBasicProfileInput {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  profilePhoto?: string;
  dateOfBirth?: string | Date;
  theme?: string;
  color?: string;
}

export async function updateBasicProfile(
  userId: string,
  input: UpdateBasicProfileInput,
) {
  const { User } = getAuthModels();

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
  }

  const update: Record<string, unknown> = {};

  if (input.firstName !== undefined) {
    if (typeof input.firstName !== "string" || !input.firstName.trim()) {
      throw new Error("First name cannot be empty");
    }
    if (input.firstName.trim().length > 100) {
      throw new Error("First name cannot exceed 100 characters");
    }
    update.firstName = input.firstName.trim();
  }

  if (input.lastName !== undefined) {
    if (typeof input.lastName !== "string") {
      throw new Error("Last name must be a string");
    }
    if (input.lastName.trim().length > 100) {
      throw new Error("Last name cannot exceed 100 characters");
    }
    update.lastName = input.lastName.trim();
  }

  if (input.displayName !== undefined) {
    if (typeof input.displayName !== "string") {
      throw new Error("Display name must be a string");
    }
    if (input.displayName.trim().length > 200) {
      throw new Error("Display name cannot exceed 200 characters");
    }
    update.displayName = input.displayName.trim();
  }

  if (input.profilePhoto !== undefined) {
    if (typeof input.profilePhoto !== "string") {
      throw new Error("Profile photo must be a string URL");
    }
    update.profilePhoto = input.profilePhoto.trim();
  }

  if (input.dateOfBirth !== undefined) {
    const dob = new Date(input.dateOfBirth);
    if (isNaN(dob.getTime())) {
      throw new Error("Invalid date of birth");
    }
    const age =
      (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (age < 13) {
      throw new Error("User must be at least 13 years old");
    }
    if (age > 120) {
      throw new Error("Invalid date of birth");
    }
    update.dateOfBirth = dob;
  }

  if (input.theme !== undefined) {
    if (!ALLOWED_THEMES.includes(input.theme as AllowedTheme)) {
      throw new Error(`Theme must be one of: ${ALLOWED_THEMES.join(", ")}`);
    }
    update.theme = input.theme;
  }

  if (input.color !== undefined) {
    if (typeof input.color !== "string" || !input.color.trim()) {
      throw new Error("Color must be a non-empty string");
    }
    if (input.color.trim().length > 32) {
      throw new Error("Color value is too long");
    }
    update.color = input.color.trim();
  }

  if (Object.keys(update).length === 0) {
    throw new Error("No valid fields provided for update");
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: update },
    { new: true, runValidators: true },
  )
    .select(
      "firstName lastName displayName profilePhoto dateOfBirth theme color apps role status phone phoneVerified connectAddress username createdAt updatedAt",
    )
    .lean();

  if (!user) {
    throw new Error("User not found");
  }

  return {
    id: user._id.toString(),
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    profilePhoto: user.profilePhoto,
    dateOfBirth: user.dateOfBirth,
    theme: user.theme,
    color: user.color,
    phone: user.phone,
    phoneVerified: user.phoneVerified,
    username: user.username,
    connectAddress: user.connectAddress,
    role: user.role,
    status: user.status,
    apps: serializeApps(user.apps),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// ============================================================
// 2. UPDATE APP-SPECIFIC ROLE
// ============================================================

export async function updateAppRole(
  userId: string,
  app: string,
  role: string,
) {
  const { User } = getAuthModels();

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
  }

  if (app !== "TIZZYGO" && app !== "TIZZYOS" && app !== "LINKEDROP") {
    throw new Error("App must be TIZZYGO, TIZZYOS or LINKEDROP");
  }

  const appName = app as AppName;

  const allowedRoles = APP_ROLES[appName] as readonly string[];
  if (!allowedRoles.includes(role)) {
    throw new Error(`Role "${role}" is not valid for ${appName}`);
  }

  const selfSelectable = SELF_SELECTABLE_ROLES[appName];
  if (!selfSelectable || !selfSelectable.includes(role as AppRole)) {
    throw new Error(
      `Role "${role}" cannot be self-assigned. Contact support if you need this role.`,
    );
  }

  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const apps = serializeApps(user.apps);
  const existingIndex = apps.findIndex((entry) => entry.app === appName);

  if (existingIndex >= 0) {
    apps[existingIndex] = { app: appName, roles: [role as AppRole] };
  } else {
    apps.push({ app: appName, roles: [role as AppRole] });
  }

  user.apps = apps;
  user.markModified("apps");
  await user.save();

  return {
    apps: serializeApps(user.apps),
    activeApp: appName,
    activeRole: role,
    message: `${appName} role updated to ${role}. Effective immediately.`,
  };
}

// ============================================================
// 3. UPDATE RECOVERY CONNECT — REQUEST OTP
//    Purpose: "recovery_verification" ✅ (existing in model)
// ============================================================

export async function requestRecoveryConnectUpdate(
  userId: string,
  recoveryConnect: string,
) {
  const { User, VerificationCode } = getAuthModels();

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
  }

  if (typeof recoveryConnect !== "string" || !recoveryConnect.trim()) {
    throw new Error("Recovery connect value is required");
  }

  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const normalized = normalizePhone(recoveryConnect);

  if (user.phone === normalized) {
    throw new Error("Recovery phone must be different from primary phone");
  }

  const existing = await User.findOne({
    recoveryConnect: normalized,
    _id: { $ne: user._id },
  }).lean();
  if (existing) {
    throw new Error("This recovery number is already in use");
  }

  // Invalidate previous active recovery_verification records for this user
  await VerificationCode.updateMany(
    {
      purpose: "recovery_verification",
      userId: user._id,
      verifiedAt: { $exists: false },
      consumedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    },
    { $set: { consumedAt: new Date() } },
  );

  const verification = await VerificationCode.create({
    userId: user._id,
    destination: normalized,
    purpose: "recovery_verification",
    expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
    attempts: 0,
    resendCount: 0,
  });

  try {
    await sendTwilioVerification(normalized);
    return {
      verificationRequired: true,
      verificationId: verification._id.toString(),
      recoveryConnect: maskPhone(normalized),
      expiresInSeconds: OTP_EXPIRY_SECONDS,
      message: "OTP sent to recovery number. Verify to activate.",
    };
  } catch (error) {
    await VerificationCode.deleteOne({ _id: verification._id });
    throw error;
  }
}

// ============================================================
// 3b. VERIFY RECOVERY CONNECT OTP
// ============================================================

export async function verifyRecoveryConnectUpdate(
  userId: string,
  verificationId: string,
  code: string,
) {
  const { User, VerificationCode } = getAuthModels();

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
  }
  if (!mongoose.Types.ObjectId.isValid(verificationId)) {
    throw new Error("Invalid verification");
  }
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    throw new Error("Enter the 6-digit OTP");
  }

  const verification = await VerificationCode.findOne({
    _id: verificationId,
    purpose: "recovery_verification",
    userId: new mongoose.Types.ObjectId(userId),
    verifiedAt: { $exists: false },
    consumedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });

  if (!verification) {
    throw new Error("Invalid or expired verification");
  }

  if (verification.attempts >= MAX_OTP_ATTEMPTS) {
    throw new Error("Too many attempts. Please request a new OTP.");
  }

  verification.attempts += 1;
  await verification.save();

  const approved = await checkTwilioVerification(
    verification.destination,
    code,
  );

  if (!approved) {
    throw new Error("Invalid or expired OTP");
  }

  const existing = await User.findOne({
    recoveryConnect: verification.destination,
    _id: { $ne: userId },
  }).lean();
  if (existing) {
    throw new Error("This recovery number is already in use");
  }

  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        recoveryConnect: verification.destination,
        recoveryConnectVerified: true,
        recoveryConnectVerifiedAt: new Date(),
      },
    },
    { new: true },
  );

  if (!user) throw new Error("User not found");

  verification.verifiedAt = new Date();
  verification.consumedAt = new Date();
  await verification.save();

  return {
    recoveryConnect: user.recoveryConnect,
    recoveryConnectVerified: user.recoveryConnectVerified,
    recoveryConnectVerifiedAt: user.recoveryConnectVerifiedAt,
    message: "Recovery connect updated successfully",
  };
}

// ============================================================
// 4. REQUEST OTP FOR PHONE CHANGE
//
// ✅ Uses "phone_verification" (existing purpose)
// ✅ Distinguishes from SIGNUP by requiring `userId`
//    (signup's phone_verification has no userId)
// ============================================================

export async function requestPhoneChangeOTP(
  userId: string,
  newPhone: string,
) {
  const { User, VerificationCode } = getAuthModels();

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
  }

  const normalized = normalizePhone(newPhone);

  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  if (user.phone === normalized) {
    throw new Error("New phone number must be different from current phone");
  }

  const existing = await User.findOne({
    phone: normalized,
    _id: { $ne: user._id },
  }).lean();
  if (existing) {
    throw new Error("This phone number is already registered");
  }

  // Invalidate previous active phone_verification records
  // that belong to THIS user (phone change in progress)
  await VerificationCode.updateMany(
    {
      purpose: "phone_verification",
      userId: user._id, // ← only phone-change records (signup has no userId)
      verifiedAt: { $exists: false },
      consumedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    },
    { $set: { consumedAt: new Date() } },
  );

  // Create verification with userId set — distinguishes from signup
  const verification = await VerificationCode.create({
    userId: user._id, // ← KEY: signup's phone_verification has no userId
    destination: normalized,
    purpose: "phone_verification",
    expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
    attempts: 0,
    resendCount: 0,
  });

  try {
    await sendTwilioVerification(normalized);
    return {
      verificationRequired: true,
      verificationId: verification._id.toString(),
      phone: maskPhone(normalized),
      expiresInSeconds: OTP_EXPIRY_SECONDS,
      message: "OTP sent to new phone number. Verify to complete change.",
    };
  } catch (error) {
    await VerificationCode.deleteOne({ _id: verification._id });
    throw error;
  }
}

// ============================================================
// 5. VERIFY OTP AND UPDATE PHONE
//
// ✅ Uses "phone_verification" + userId filter
// ✅ Never touches signup records (they have no userId)
// ============================================================

export async function verifyPhoneChangeOTP(
  userId: string,
  newPhone: string,
  verificationId: string,
  code: string,
) {
  const { User, VerificationCode } = getAuthModels();

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
  }
  if (!mongoose.Types.ObjectId.isValid(verificationId)) {
    throw new Error("Invalid verification");
  }

  const normalized = normalizePhone(newPhone);

  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    throw new Error("Enter the 6-digit OTP");
  }

  // Find the verification — must have userId (phone change, not signup)
  const verification = await VerificationCode.findOne({
    _id: verificationId,
    purpose: "phone_verification",
    userId: new mongoose.Types.ObjectId(userId), // ← phone change only
    destination: normalized,
    verifiedAt: { $exists: false },
    consumedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });

  if (!verification) {
    throw new Error("Invalid or expired verification");
  }

  if (verification.attempts >= MAX_OTP_ATTEMPTS) {
    throw new Error("Too many attempts. Please request a new OTP.");
  }

  verification.attempts += 1;
  await verification.save();

  const approved = await checkTwilioVerification(normalized, code);
  if (!approved) {
    throw new Error("Invalid or expired OTP");
  }

  const existing = await User.findOne({
    phone: normalized,
    _id: { $ne: userId },
  }).lean();
  if (existing) {
    throw new Error("This phone number is already registered");
  }

  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        phone: normalized,
        phoneVerified: true,
        phoneVerifiedAt: new Date(),
      },
    },
    { new: true },
  );

  if (!user) throw new Error("User not found");

  verification.verifiedAt = new Date();
  verification.consumedAt = new Date();
  await verification.save();

  return {
    phone: user.phone,
    phoneVerified: user.phoneVerified,
    phoneVerifiedAt: user.phoneVerifiedAt,
    message: "Phone number updated successfully",
  };
}