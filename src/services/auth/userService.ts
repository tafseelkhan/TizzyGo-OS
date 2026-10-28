import crypto from "crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import twilio from "twilio";
import { parsePhoneNumberFromString } from "libphonenumber-js";

import {
  APP_ROLES,
  type AppName,
  type AppRole,
} from "../../models/auth/user.schema";

import { getQutonConnectModels } from "../../config/tizzygo/qutonConnectDatabase";

import {
  generateAccessToken,
  type UserRole,
} from "../../config/tizzygo/jwt";

interface SignupInput {
  firstName: string;
  lastName?: string;
  username: string;
  password: string;
  confirmPassword: string;
  phone: string;
  termsAccepted: boolean;
  deviceName?: string;
  ipAddress?: string;
  userAgent?: string;
}

interface LoginInput {
  login: string;
  password: string;
  deviceName?: string;
  ipAddress?: string;
  userAgent?: string;
}

interface SessionMetadata {
  deviceName?: string;
  ipAddress?: string;
  userAgent?: string;
}

interface SerializedApp {
  app: AppName;
  roles: AppRole[];
}

interface SessionTokens {
  accessToken: string;
  sessionToken: string;
}

/**
 * Always obtain authentication models from the Quton Connect connection.
 * Never register authentication models on Mongoose's default connection.
 */
function getAuthModels() {
  return getQutonConnectModels();
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function generateConnectAddress(username: string): string {
  return `${username}@quton.com`;
}

function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
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

  if (!sid) {
    throw new Error("Twilio Verify Service SID is not configured");
  }

  return sid;
}

/**
 * Unknown or missing global roles never receive elevated permissions.
 */
function getUserRole(role: unknown): UserRole {
  const allowedRoles: readonly UserRole[] = [
    "super_admin",
    "admin",
    "team",
    "business",
    "user",
  ];

  if (typeof role === "string" && allowedRoles.includes(role as UserRole)) {
    return role as UserRole;
  }

  return "user";
}

function isValidAppRole(app: AppName, role: string): role is AppRole {
  if (app === "TIZZYGO") {
    return (APP_ROLES.TIZZYGO as readonly string[]).includes(role);
  }

  if (app === "TIZZYOS") {
    return (APP_ROLES.TIZZYOS as readonly string[]).includes(role);
  }

  return false;
}

function serializeApps(apps: unknown): SerializedApp[] {
  if (!Array.isArray(apps)) {
    return [];
  }

  const entries = apps as Array<{ app?: unknown; roles?: unknown }>;

  return entries.map((entry) => ({
    app: entry.app as AppName,
    roles: Array.isArray(entry.roles)
      ? ([...entry.roles] as AppRole[])
      : [],
  }));
}

async function createSessionForUser(
  userId: mongoose.Types.ObjectId,
  role: UserRole,
  meta: SessionMetadata,
): Promise<SessionTokens> {
  const { UserSession } = getAuthModels();

  const accessToken = generateAccessToken(userId.toString(), role);
  const sessionToken = generateSessionToken();

  await UserSession.create({
    userId,
    sessionTokenHash: hashSessionToken(sessionToken),
    deviceName: meta.deviceName,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    lastUsedAt: new Date(),
  });

  return { accessToken, sessionToken };
}

/**
 * SIGNUP STEP 1
 * Store temporary signup data and send the Twilio verification SMS.
 */
export async function createUser(input: SignupInput) {
  const { User, VerificationCode } = getAuthModels();

  const firstName =
    typeof input.firstName === "string" ? input.firstName.trim() : "";

  const lastName =
    typeof input.lastName === "string" ? input.lastName.trim() : undefined;

  const username =
    typeof input.username === "string" ? normalizeUsername(input.username) : "";

  if (!firstName) {
    throw new Error("First name is required");
  }

  if (!/^[a-z0-9._-]{3,50}$/.test(username)) {
    throw new Error(
      "Username must be 3-50 characters and use only letters, numbers, dots, underscores or hyphens",
    );
  }

  if (typeof input.password !== "string" || input.password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  if (input.password !== input.confirmPassword) {
    throw new Error("Passwords do not match");
  }

  if (input.termsAccepted !== true) {
    throw new Error("Terms must be accepted");
  }

  const phone = normalizePhone(input.phone);
  const connectAddress = generateConnectAddress(username);

  const [existingUser, existingPhone, existingSignup] = await Promise.all([
    User.findOne({
      $or: [{ username }, { connectAddress }],
    }).lean(),

    User.findOne({ phone }).lean(),

    VerificationCode.findOne({
      purpose: "phone_verification",
      destination: phone,
      expiresAt: { $gt: new Date() },
      verifiedAt: { $exists: false },
    }).lean(),
  ]);

  if (existingUser) {
    throw new Error("Username or Connect address already exists");
  }

  if (existingPhone) {
    throw new Error("This phone number is already registered");
  }

  if (existingSignup) {
    throw new Error(
      "A signup verification is already pending for this phone number. Please try again later.",
    );
  }

  const existingUsernameSignup = await VerificationCode.findOne({
    purpose: "phone_verification",
    expiresAt: { $gt: new Date() },
    verifiedAt: { $exists: false },
    $or: [
      { "signupData.username": username },
      { "signupData.connectAddress": connectAddress },
    ],
  }).lean();

  if (existingUsernameSignup) {
    throw new Error(
      "A signup verification is already pending for this username",
    );
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const termsAcceptedAt = new Date();

  const verification = await VerificationCode.create({
    destination: phone,
    purpose: "phone_verification",
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    attempts: 0,
    signupData: {
      firstName,
      lastName,
      username,
      connectAddress,
      passwordHash,
      termsAccepted: true,
      termsAcceptedAt,
      deviceName: input.deviceName,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
  });

  try {
    await getTwilioClient()
      .verify.v2.services(getVerifyServiceSid())
      .verifications.create({
        to: phone,
        channel: "sms",
      });

    return {
      verificationRequired: true,
      verificationId: verification._id.toString(),
      phone: `${phone.slice(0, 3)}******${phone.slice(-2)}`,
      expiresInSeconds: 600,
      message:
        "OTP sent successfully. Verify your phone to create your account.",
    };
  } catch {
    await VerificationCode.deleteOne({ _id: verification._id });

    throw new Error(
      "Could not send OTP. Check the phone number and Twilio configuration, then try again.",
    );
  }
}

/**
 * SIGNUP STEP 2
 * Verify the OTP and create the permanent Quton Connect account.
 */
export async function verifyPhoneSignup(
  verificationId: string,
  code: string,
) {
  const { User, UserCredentials, UserSession, VerificationCode } =
    getAuthModels();

  if (!mongoose.Types.ObjectId.isValid(verificationId)) {
    throw new Error("Invalid or expired signup verification");
  }

  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    throw new Error("Enter the 6-digit OTP");
  }

  const verification = await VerificationCode.findOne({
    _id: verificationId,
    purpose: "phone_verification",
    verifiedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });

  if (!verification || !verification.signupData) {
    throw new Error("Signup verification expired. Please sign up again.");
  }

  if (verification.attempts >= 5) {
    throw new Error("Too many verification attempts. Please sign up again.");
  }

  verification.attempts += 1;
  await verification.save();

  let approved = false;

  try {
    const result = await getTwilioClient()
      .verify.v2.services(getVerifyServiceSid())
      .verificationChecks.create({
        to: verification.destination,
        code,
      });

    approved = result.status === "approved";
  } catch {
    throw new Error("Invalid or expired OTP");
  }

  if (!approved) {
    throw new Error("Invalid or expired OTP");
  }

  const signup = verification.signupData;

  const [existingUser, existingPhone] = await Promise.all([
    User.findOne({
      $or: [
        { username: signup.username },
        { connectAddress: signup.connectAddress },
      ],
    }).lean(),

    User.findOne({ phone: verification.destination }).lean(),
  ]);

  if (existingUser || existingPhone) {
    await VerificationCode.deleteOne({ _id: verification._id });
    throw new Error(
      "Username, Connect address, or phone is already registered",
    );
  }

  const createdUser = new User({
    firstName: signup.firstName,
    lastName: signup.lastName,
    username: signup.username,
    connectAddress: signup.connectAddress,
    phone: verification.destination,
    phoneVerified: true,
    phoneVerifiedAt: new Date(),
    role: "user",
    status: "pending",
    connectVerified: false,
    recoveryConnectVerified: false,
    termsAccepted: signup.termsAccepted,
    termsAcceptedAt: signup.termsAcceptedAt,
    apps: [],
  });

  try {
    await createdUser.save();

    await UserCredentials.create({
      userId: createdUser._id,
      passwordHash: signup.passwordHash,
      passwordChangedAt: new Date(),
      failedLoginAttempts: 0,
    });

    const role = getUserRole(createdUser.role);

    const tokens = await createSessionForUser(createdUser._id, role, {
      deviceName: signup.deviceName,
      ipAddress: signup.ipAddress,
      userAgent: signup.userAgent,
    });

    await VerificationCode.deleteOne({ _id: verification._id });

    return {
      message:
        "Phone verified. Your account is created and is pending admin approval.",
      verificationRequired: false,
      accessToken: tokens.accessToken,
      sessionToken: tokens.sessionToken,
      user: {
        id: createdUser._id.toString(),
        firstName: createdUser.firstName,
        lastName: createdUser.lastName,
        username: createdUser.username,
        connectAddress: createdUser.connectAddress,
        phone: createdUser.phone,
        phoneVerified: createdUser.phoneVerified,
        connectVerified: createdUser.connectVerified,
        role,
        status: createdUser.status,
        apps: serializeApps(createdUser.apps),
      },
    };
  } catch (error) {
    if (createdUser?._id) {
      await Promise.allSettled([
        UserSession.deleteMany({ userId: createdUser._id }),
        UserCredentials.deleteOne({ userId: createdUser._id }),
        User.deleteOne({ _id: createdUser._id }),
      ]);
    }

    await VerificationCode.deleteOne({ _id: verification._id });
    throw error;
  }
}

/**
 * LOGIN
 */
export async function loginUser(input: LoginInput) {
  const { User, UserCredentials } = getAuthModels();

  if (
    typeof input.login !== "string" ||
    typeof input.password !== "string" ||
    !input.login.trim() ||
    !input.password
  ) {
    throw new Error("Login and password are required");
  }

  const login = input.login.trim().toLowerCase();

  const user = await User.findOne({
    $or: [{ username: login }, { connectAddress: login }],
  });

  if (!user) {
    throw new Error("Invalid login credentials");
  }

  if (user.status === "suspended" || user.status === "disabled") {
    throw new Error("Account is suspended or disabled");
  }

  if (!user.phoneVerified) {
    throw new Error("Phone number is not verified");
  }

  const credentials = await UserCredentials.findOne({
    userId: user._id,
  });

  if (!credentials) {
    throw new Error("Account credentials not found");
  }

  if (
    credentials.lockedUntil &&
    credentials.lockedUntil.getTime() > Date.now()
  ) {
    throw new Error("Account temporarily locked");
  }

  const passwordValid = await bcrypt.compare(
    input.password,
    credentials.passwordHash,
  );

  if (!passwordValid) {
    credentials.failedLoginAttempts += 1;

    if (credentials.failedLoginAttempts >= 5) {
      credentials.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
    }

    await credentials.save();
    throw new Error("Invalid login credentials");
  }

  credentials.failedLoginAttempts = 0;
  credentials.lockedUntil = undefined;
  await credentials.save();

  const role = getUserRole(user.role);

  const { accessToken, sessionToken } = await createSessionForUser(
    user._id,
    role,
    {
      deviceName: input.deviceName,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
  );

  return {
    user: {
      id: user._id.toString(),
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      connectAddress: user.connectAddress,
      displayName: user.displayName,
      profilePhoto: user.profilePhoto,
      phone: user.phone,
      phoneVerified: user.phoneVerified,
      status: user.status,
      connectVerified: user.connectVerified,
      role,
      apps: serializeApps(user.apps),
    },
    accessToken,
    sessionToken,
  };
}

/**
 * SET APP ROLES
 * Trusted backend/admin use only.
 */
export async function setUserAppRoles(
  userId: string,
  app: AppName,
  roles: AppRole[],
) {
  const { User } = getAuthModels();

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
  }

  if (!Array.isArray(roles)) {
    throw new Error("App roles must be an array");
  }

  const uniqueRoles = [...new Set(roles)];

  if (uniqueRoles.length !== roles.length) {
    throw new Error("Duplicate app roles are not allowed");
  }

  for (const role of uniqueRoles) {
    if (!isValidAppRole(app, role)) {
      throw new Error(`Role "${role}" is not valid for ${app}`);
    }
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  const currentApps: SerializedApp[] = serializeApps(user.apps);
  const existingIndex = currentApps.findIndex(
    (entry) => entry.app === app,
  );

  const updatedEntry: SerializedApp = {
    app,
    roles: uniqueRoles,
  };

  if (existingIndex >= 0) {
    currentApps[existingIndex] = updatedEntry;
  } else {
    currentApps.push(updatedEntry);
  }

  user.apps = currentApps;
  await user.save();

  return {
    userId: user._id.toString(),
    apps: serializeApps(user.apps),
  };
}

/**
 * REMOVE AN APP ASSOCIATION
 * Trusted backend/admin use only.
 */
export async function removeUserApp(userId: string, app: AppName) {
  const { User } = getAuthModels();

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  user.apps = serializeApps(user.apps).filter(
    (entry) => entry.app !== app,
  );

  await user.save();

  return {
    userId: user._id.toString(),
    apps: serializeApps(user.apps),
  };
}

/**
 * LOGOUT
 */
export async function logoutUser(
  userId: string,
  sessionTokenHash: string,
) {
  const { UserSession } = getAuthModels();

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
  }

  const session = await UserSession.findOne({
    userId,
    sessionTokenHash,
    revokedAt: { $exists: false },
  });

  if (!session) {
    throw new Error("Session not found");
  }

  session.revokedAt = new Date();
  await session.save();

  return {
    success: true,
    message: "Logged out successfully",
  };
}

/**
 * GET CURRENT USER
 */
export async function getCurrentUser(userId: string) {
  const { User } = getAuthModels();

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
  }

  const user = await User.findById(userId)
    .select(
      [
        "firstName",
        "lastName",
        "username",
        "connectAddress",
        "displayName",
        "profilePhoto",
        "role",
        "status",
        "connectVerified",
        "connectVerifiedAt",
        "phone",
        "phoneVerified",
        "phoneVerifiedAt",
        "recoveryConnect",
        "recoveryConnectVerified",
        "recoveryConnectVerifiedAt",
        "termsAccepted",
        "termsAcceptedAt",
        "apps",
        "createdAt",
        "updatedAt",
      ].join(" "),
    )
    .lean();

  if (!user) {
    throw new Error("User not found");
  }

  return {
    id: user._id.toString(),
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    connectAddress: user.connectAddress,
    displayName: user.displayName,
    profilePhoto: user.profilePhoto,
    role: getUserRole(user.role),
    status: user.status,
    connectVerified: user.connectVerified,
    connectVerifiedAt: user.connectVerifiedAt,
    phone: user.phone,
    phoneVerified: user.phoneVerified,
    phoneVerifiedAt: user.phoneVerifiedAt,
    recoveryConnect: user.recoveryConnect,
    recoveryConnectVerified: user.recoveryConnectVerified,
    recoveryConnectVerifiedAt: user.recoveryConnectVerifiedAt,
    termsAccepted: user.termsAccepted,
    termsAcceptedAt: user.termsAcceptedAt,
    apps: serializeApps(user.apps),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * REFRESH ACCESS TOKEN
 */
export async function refreshAccessToken(sessionToken: string) {
  const { User, UserSession } = getAuthModels();

  if (!sessionToken) {
    throw new Error("Session token is required");
  }

  const sessionTokenHash = hashSessionToken(sessionToken);

  const session = await UserSession.findOne({
    sessionTokenHash,
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });

  if (!session) {
    throw new Error("Session expired or invalid");
  }

  const user = await User.findById(session.userId);

  if (!user) {
    throw new Error("User not found");
  }

  if (
    user.status === "suspended" ||
    user.status === "disabled" ||
    !user.phoneVerified
  ) {
    throw new Error("Account is suspended, disabled, or phone is unverified");
  }

  const role = getUserRole(user.role);
  const accessToken = generateAccessToken(user._id.toString(), role);

  session.lastUsedAt = new Date();
  await session.save();

  return { accessToken };
}
