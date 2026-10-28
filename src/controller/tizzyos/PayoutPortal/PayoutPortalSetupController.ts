import { Response } from "express";
import axios from "axios";
import mongoose from "mongoose";
import crypto, { randomInt } from "crypto";

import { getQutonConnectModels } from "../../../config/tizzygo/qutonConnectDatabase";
import type { AuthRequest } from "../../../middleware/authMiddleware";

import GatewayAccountModel from "../../../models/tizzyos/PayOutPortal/GatewayAccount";
import SellerEarning from "../../../models/tizzyos/PayOutPortal/sellerEarnings";
import DeliveryChargeEarningModel from "../../../models/tizzyos/PayOutPortal/deliveryChargeEarnings";

// ======================================================
// CONSTANTS
// ======================================================

const LOG_PREFIX = "[RAZORPAYX PAYOUT]";

const RAZORPAY_BASE_URL = "https://api.razorpay.com/v1";

// TIZZYGO BUSINESS RULES
const MIN_WITHDRAWAL_AMOUNT = 100;
const MAX_WITHDRAWAL_AMOUNT = 50000;

const AMAZON_PAY_MAX_PAYOUT = 10000;

const MAX_SELECTED_EARNINGS = 100;

// ======================================================
// ENV
// ======================================================

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID?.trim();
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET?.trim();
const RAZORPAYX_ACCOUNT_NUMBER =
  process.env.RAZORPAYX_ACCOUNT_NUMBER?.trim();
const RAZORPAY_WEBHOOK_SECRET =
  process.env.RAZORPAY_WEBHOOK_SECRET?.trim();

// ======================================================
// TYPES
// ======================================================

type ContactType =
  | "vendor"
  | "customer"
  | "employee"
  | "self";

type FundAccountType =
  | "bank_account"
  | "vpa"
  | "wallet";

type PayoutMode =
  | "NEFT"
  | "RTGS"
  | "IMPS"
  | "UPI"
  | "amazonpay";

type EarningType =
  | "SELLER"
  | "DELIVERY";

type RazorpayPayoutStatus =
  | "pending"
  | "queued"
  | "processing"
  | "processed"
  | "rejected"
  | "failed"
  | "reversed"
  | "cancelled";

interface CreatePayoutRequestBody {
  fundAccountId?: string;
  payoutIds?: string[];
  amount?: string | number;
  purpose?: string;
  referenceId?: string;
  narration?: string;
  queueIfLowBalance?: boolean;
}

interface RazorpayPayoutEntity {
  id: string;
  fund_account_id?: string;
  amount: number;
  currency?: string;
  status?: RazorpayPayoutStatus;
  mode?: string;
  purpose?: string;
  reference_id?: string | null;
  narration?: string | null;
  utr?: string | null;
  fees?: number;
  tax?: number;
  failure_reason?: string | null;
  status_details?: unknown;
  created_at?: number;
}

interface RazorpayPayoutCollection {
  entity?: string;
  count?: number;
  items?: RazorpayPayoutEntity[];
}

interface RazorpayWebhookBody {
  entity?: string;
  event?: string;
  account_id?: string;
  created_at?: number;

  payload?: {
    payout?: {
      entity?: RazorpayPayoutEntity;
    };
  };
}

interface SelectedEarning {
  _id: mongoose.Types.ObjectId;
  payoutId: string;
  earningType: EarningType;
  amount: number;
  raw: any;
}

interface SelectedEarningsResult {
  earnings: SelectedEarning[];
  total: number;
  earningType: EarningType;
}

// ======================================================
// LOG HELPERS
// ======================================================

const logSection = (title: string) => {
  console.log("");
  console.log("=".repeat(70));
  console.log(`${LOG_PREFIX} ${title}`);
  console.log("=".repeat(70));
};

const logDuration = (
  label: string,
  startTime: number,
) => {
  console.log(
    `${LOG_PREFIX} ${label}: ${Date.now() - startTime}ms`,
  );
};

// ======================================================
// MASK
// ======================================================

const mask = (
  value: unknown,
  visibleStart = 2,
  visibleEnd = 2,
): string => {
  if (value === undefined || value === null) {
    return "***";
  }

  const str = String(value);

  if (str.length <= visibleStart + visibleEnd) {
    return "***";
  }

  return (
    str.slice(0, visibleStart) +
    "*".repeat(
      Math.max(
        3,
        str.length - visibleStart - visibleEnd,
      ),
    ) +
    str.slice(-visibleEnd)
  );
};

const maskEmail = (email?: string): string => {
  if (!email) {
    return "***";
  }

  const parts = email.split("@");

  if (parts.length !== 2) {
    return mask(email);
  }

  const name = parts[0];
  const domain = parts[1];

  if (name.length <= 2) {
    return `**@${domain}`;
  }

  return `${name.slice(0, 2)}***@${domain}`;
};

// ======================================================
// SAFE ERROR
// ======================================================

const safeError = (error: any) => {
  return {
    message: error?.message,
    name: error?.name,
    code: error?.code,
    status: error?.response?.status,
    statusText: error?.response?.statusText,
    responseData: error?.response?.data,
    responseHeaders: error?.response?.headers,
  };
};

// ======================================================
// RAZORPAY CLIENT
// ======================================================

const razorpayApi = axios.create({
  baseURL: RAZORPAY_BASE_URL,
  auth: {
    username: RAZORPAY_KEY_ID || "",
    password: RAZORPAY_KEY_SECRET || "",
  },
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  timeout: 30000,
});

// ======================================================
// REQUEST LOGGER
// ======================================================

razorpayApi.interceptors.request.use(
  (config) => {
    console.log("");
    console.log(`${LOG_PREFIX} 🌐 REQUEST`);
    console.log(
      `${LOG_PREFIX} METHOD:`,
      config.method?.toUpperCase(),
    );

    console.log(
      `${LOG_PREFIX} URL:`,
      `${config.baseURL || ""}${config.url || ""}`,
    );

    if (config.data) {
      const safeData = JSON.parse(
        JSON.stringify(config.data),
      );

      if (safeData?.account_number) {
        safeData.account_number = mask(
          safeData.account_number,
          3,
          3,
        );
      }

      if (safeData?.bank_account?.account_number) {
        safeData.bank_account.account_number = mask(
          safeData.bank_account.account_number,
          2,
          2,
        );
      }

      if (safeData?.wallet?.phone) {
        safeData.wallet.phone = mask(
          safeData.wallet.phone,
          2,
          2,
        );
      }

      if (safeData?.wallet?.email) {
        safeData.wallet.email = maskEmail(
          safeData.wallet.email,
        );
      }

      console.log(
        `${LOG_PREFIX} BODY:`,
        JSON.stringify(safeData, null, 2),
      );
    }

    return config;
  },
  (error) => {
    console.error(
      `${LOG_PREFIX} REQUEST ERROR`,
      safeError(error),
    );

    return Promise.reject(error);
  },
);

// ======================================================
// RESPONSE LOGGER
// ======================================================

razorpayApi.interceptors.response.use(
  (response) => {
    console.log("");
    console.log(`${LOG_PREFIX} 🌐 RESPONSE`);
    console.log(
      `${LOG_PREFIX} STATUS:`,
      response.status,
    );

    console.log(
      `${LOG_PREFIX} DATA:`,
      JSON.stringify(response.data, null, 2),
    );

    return response;
  },
  (error) => {
    console.error("");
    console.error(
      `${LOG_PREFIX} ❌ RESPONSE ERROR`,
    );

    console.error(
      `${LOG_PREFIX} STATUS:`,
      error?.response?.status,
    );

    console.error(
      `${LOG_PREFIX} DATA:`,
      JSON.stringify(
        error?.response?.data,
        null,
        2,
      ),
    );

    return Promise.reject(error);
  },
);

// ======================================================
// RAZORPAY ERROR
// ======================================================

const getRazorpayErrorMessage = (
  error: any,
  fallback: string,
): string => {
  const razorpayError =
    error?.response?.data?.error;

  if (razorpayError?.description) {
    return razorpayError.description;
  }

  if (
    razorpayError?.field &&
    razorpayError?.reason
  ) {
    return `${razorpayError.field}: ${razorpayError.reason}`;
  }

  if (razorpayError?.reason) {
    return razorpayError.reason;
  }

  if (razorpayError?.code) {
    return `Razorpay error: ${razorpayError.code}`;
  }

  return error?.message || fallback;
};

// ======================================================
// ENV VALIDATION
// ======================================================

const validateApiEnvironment = () => {
  if (
    !RAZORPAY_KEY_ID ||
    !RAZORPAY_KEY_SECRET
  ) {
    throw new Error(
      "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required",
    );
  }

  if (!RAZORPAYX_ACCOUNT_NUMBER) {
    throw new Error(
      "RAZORPAYX_ACCOUNT_NUMBER is required",
    );
  }
};

const validateWebhookEnvironment = () => {
  if (!RAZORPAY_WEBHOOK_SECRET) {
    throw new Error(
      "RAZORPAY_WEBHOOK_SECRET is required",
    );
  }
};

// ======================================================
// AUTH
// ======================================================

const getAuthenticatedUserId = (
  req: AuthRequest,
): string | null => {
  // `authMiddleware` sets both `req.userId` and `req.user.userId`
  // (and `req.user.id` / `req.user._id`) to the JWT `sub`. Prefer
  // the canonical `req.userId` and keep a defensive fallback.
  const id =
    req.userId ??
    req.user?.userId ??
    req.user?._id ??
    req.user?.id;

  return id ? id.toString() : null;
};

const ensureUserAccess = (
  req: AuthRequest,
  userId: string,
): boolean => {
  const authUserId =
    getAuthenticatedUserId(req);

  if (!authUserId) {
    return false;
  }

  return authUserId === userId.toString();
};

// ======================================================
// REFERENCE ID
// ======================================================

const generateRandomReference = (
  prefix: string,
  length = 18,
): string => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  let generated = "";

  for (let i = 0; i < length; i++) {
    generated += chars[
      randomInt(0, chars.length)
    ];
  }

  return `${prefix}${generated}`;
};

const generateRouteReferenceId = (): string => {
  return generateRandomReference(
    "qn_tg-os_",
    18,
  );
};

const generateWithdrawalReferenceId = (): string => {
  return generateRandomReference(
    "qn_tg-os_WPP",
    18,
  );
};

// ======================================================
// OBJECT ID
// ======================================================

const isValidObjectId = (
  value: string,
): boolean => {
  return mongoose.Types.ObjectId.isValid(value);
};

// ======================================================
// PAYOUT PREFIX
// ======================================================

const PAYOUT_ID_PREFIX = {
  SELLER: "spp_",
  DELIVERY: "dcpp_",
  COMPANY: "cpp_",
} as const;

const detectPayoutIdType = (
  payoutId: string,
): EarningType | "COMPANY" | null => {
  if (
    payoutId.startsWith(
      PAYOUT_ID_PREFIX.SELLER,
    )
  ) {
    return "SELLER";
  }

  if (
    payoutId.startsWith(
      PAYOUT_ID_PREFIX.DELIVERY,
    )
  ) {
    return "DELIVERY";
  }

  if (
    payoutId.startsWith(
      PAYOUT_ID_PREFIX.COMPANY,
    )
  ) {
    return "COMPANY";
  }

  return null;
};

// ======================================================
// API 1
// CREATE RAZORPAYX CONTACT
// ======================================================

export const createPayoutAccount = async (
  req: AuthRequest,
  res: Response,
) => {
  const startTime = Date.now();

  logSection(
    "CREATE RAZORPAYX CONTACT START",
  );

  try {
    validateApiEnvironment();

    const {
      userId,
      name,
      email,
      phone,
      contactType = "vendor",
    } = req.body || {};

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    if (
      !isValidObjectId(String(userId))
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid userId",
      });
    }

    if (
      !ensureUserAccess(
        req,
        String(userId),
      )
    ) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "name is required",
      });
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "email is required",
      });
    }

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "phone is required",
      });
    }

    const normalizedName =
      String(name).trim();

    const normalizedEmail =
      String(email)
        .trim()
        .toLowerCase();

    const normalizedPhone =
      String(phone).trim();

    const normalizedType =
      String(contactType)
        .trim()
        .toLowerCase() as ContactType;

    const validTypes: ContactType[] = [
      "vendor",
      "customer",
      "employee",
      "self",
    ];

    if (
      !validTypes.includes(
        normalizedType,
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid contactType",
      });
    }

    if (
      normalizedName.length < 3 ||
      normalizedName.length > 120
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Name must be between 3 and 120 characters",
      });
    }

    // Quton Connect User lookup — the only Quton User read in this file.
    // `User` is used only to verify existence and to obtain `_id`.
    // No `name` / `email` / `phone` reads here; those come from the
    // request body (Razorpay contact input).
    const { User } = getQutonConnectModels();
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const existing =
      await GatewayAccountModel.findOne({
        userId: user._id,
        gateway: "RAZORPAY",
      });

    if (existing) {
      return res.status(200).json({
        success: true,
        exists: true,
        message:
          "RazorpayX Contact already exists",
        data: {
          gatewayAccountId: existing._id,
          referenceId:
            existing.referenceId,
          gateway: existing.gateway,
          contactId: existing.contactId,
          contactType:
            existing.contactType,
          name: existing.name,
          email: existing.email,
          phone: existing.phone,
          fundAccounts:
            existing.fundAccounts,
          status: existing.status,
          createdAt:
            existing.createdAt,
          updatedAt:
            existing.updatedAt,
        },
      });
    }

    const referenceId =
      generateRouteReferenceId();

    const contactPayload = {
      name: normalizedName,
      email: normalizedEmail,
      contact: normalizedPhone,
      type: normalizedType,
      reference_id: referenceId,
      notes: {
        user_id:
          user._id.toString(),
        platform: "TIZZYGO",
      },
    };

    const response =
      await razorpayApi.post(
        "/contacts",
        contactPayload,
      );

    const contact = response.data;

    if (!contact?.id) {
      throw new Error(
        "Razorpay did not return Contact ID",
      );
    }

    const gatewayAccount =
      await GatewayAccountModel.create({
        userId: user._id,
        gateway: "RAZORPAY",
        referenceId,
        contactId: contact.id,
        contactType: normalizedType,
        name: normalizedName,
        email: normalizedEmail,
        phone: normalizedPhone,
        fundAccounts: [],
        status:
          contact.active === false
            ? "INACTIVE"
            : "ACTIVE",
      });

    logDuration(
      "CONTACT CREATION",
      startTime,
    );

    return res.status(201).json({
      success: true,
      exists: false,
      message:
        "RazorpayX Contact created successfully",
      data: {
        gatewayAccountId:
          gatewayAccount._id,
        referenceId,
        contactId: contact.id,
        contactType: normalizedType,
        name: normalizedName,
        email: normalizedEmail,
        phone: normalizedPhone,
        active:
          contact.active !== false,
        fundAccounts: [],
      },
    });
  } catch (error: any) {
    console.error(
      `${LOG_PREFIX} CONTACT ERROR`,
      safeError(error),
    );

    return res
      .status(
        error?.response?.status || 500,
      )
      .json({
        success: false,
        message:
          getRazorpayErrorMessage(
            error,
            "RazorpayX Contact creation failed",
          ),
        razorpayError:
          error?.response?.data || null,
      });
  }
};

// ======================================================
// INTERNAL
// SAVE FUND ACCOUNT
// ======================================================

const saveFundAccount = async ({
  gatewayAccount,
  fundAccount,
}: {
  gatewayAccount: any;
  fundAccount: any;
}) => {
  const fundAccountId =
    String(fundAccount.id);

  const accountType =
    fundAccount.account_type as FundAccountType;

  const existingIndex =
    gatewayAccount.fundAccounts.findIndex(
      (item: any) =>
        item.fundAccountId ===
        fundAccountId,
    );

  const isNewDefault =
    gatewayAccount.fundAccounts.length ===
      0 ||
    gatewayAccount.fundAccounts.every(
      (item: any) =>
        item.isDefault !== true,
    );

  const local: any = {
    fundAccountId,
    accountType,
    status:
      fundAccount.active === false
        ? "inactive"
        : "active",
    isDefault:
      existingIndex >= 0
        ? gatewayAccount
            .fundAccounts[
            existingIndex
          ].isDefault
        : isNewDefault,
  };

  if (
    accountType === "bank_account"
  ) {
    local.bankAccountName =
      fundAccount.bank_account?.name;

    local.bankAccountNumber =
      fundAccount.bank_account?.account_number;

    local.bankIfsc =
      fundAccount.bank_account?.ifsc;
  }

  if (accountType === "vpa") {
    local.vpaAddress =
      fundAccount.vpa?.address;
  }

  if (accountType === "wallet") {
    local.wallet = {
      provider:
        fundAccount.wallet?.provider,
      phone:
        fundAccount.wallet?.phone,
      email:
        fundAccount.wallet?.email,
      name:
        fundAccount.wallet?.name,
    };
  }

  if (existingIndex >= 0) {
    gatewayAccount.fundAccounts[
      existingIndex
    ] = local;
  } else {
    gatewayAccount.fundAccounts.push(
      local,
    );
  }

  if (local.isDefault) {
    gatewayAccount.fundAccounts.forEach(
      (item: any) => {
        item.isDefault =
          item.fundAccountId ===
          fundAccountId;
      },
    );
  }

  gatewayAccount.markModified(
    "fundAccounts",
  );

  await gatewayAccount.save();

  return local;
};

// ======================================================
// API 2
// CREATE BANK FUND ACCOUNT
// ======================================================

export const addBankFundAccount = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    validateApiEnvironment();

    const {
      userId,
      accountNumber,
      ifsc,
      name,
    } = req.body || {};

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    if (
      !ensureUserAccess(
        req,
        String(userId),
      )
    ) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    if (
      !accountNumber ||
      !ifsc ||
      !name
    ) {
      return res.status(400).json({
        success: false,
        message:
          "accountNumber, ifsc and name are required",
      });
    }

    const accountNumberNormalized =
      String(accountNumber).trim();

    const ifscNormalized =
      String(ifsc)
        .trim()
        .toUpperCase();

    const nameNormalized =
      String(name).trim();

    if (
      !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(
        ifscNormalized,
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid IFSC code",
      });
    }

    if (
      accountNumberNormalized.length <
        5 ||
      accountNumberNormalized.length >
        30
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid bank account number",
      });
    }

    const gatewayAccount =
      await GatewayAccountModel.findOne({
        userId,
        gateway: "RAZORPAY",
      });

    if (!gatewayAccount) {
      return res.status(404).json({
        success: false,
        message:
          "RazorpayX Contact not found. Create contact first.",
      });
    }

    const payload = {
      contact_id:
        gatewayAccount.contactId,
      account_type: "bank_account",
      bank_account: {
        name: nameNormalized,
        ifsc: ifscNormalized,
        account_number:
          accountNumberNormalized,
      },
    };

    const response =
      await razorpayApi.post(
        "/fund_accounts",
        payload,
      );

    const fundAccount =
      response.data;

    if (!fundAccount?.id) {
      throw new Error(
        "Razorpay did not return Fund Account ID",
      );
    }

    const local =
      await saveFundAccount({
        gatewayAccount,
        fundAccount,
      });

    return res.status(201).json({
      success: true,
      message:
        "Bank Fund Account created successfully",
      data: {
        fundAccountId:
          fundAccount.id,
        accountType:
          "bank_account",
        active:
          fundAccount.active !== false,
        bankAccountName:
          nameNormalized,
        bankIfsc:
          ifscNormalized,
        bankAccountNumber:
          mask(
            accountNumberNormalized,
            2,
            2,
          ),
        isDefault:
          local.isDefault,
      },
    });
  } catch (error: any) {
    console.error(
      `${LOG_PREFIX} BANK FUND ACCOUNT ERROR`,
      safeError(error),
    );

    return res
      .status(
        error?.response?.status || 500,
      )
      .json({
        success: false,
        message:
          getRazorpayErrorMessage(
            error,
            "Bank Fund Account creation failed",
          ),
        razorpayError:
          error?.response?.data || null,
      });
  }
};

// ======================================================
// API 3
// CREATE UPI FUND ACCOUNT
// ======================================================

export const addVpaFundAccount = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    validateApiEnvironment();

    const {
      userId,
      vpa,
    } = req.body || {};

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    if (
      !ensureUserAccess(
        req,
        String(userId),
      )
    ) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    if (!vpa) {
      return res.status(400).json({
        success: false,
        message: "vpa is required",
      });
    }

    const vpaNormalized =
      String(vpa)
        .trim()
        .toLowerCase();

    if (
      !/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/.test(
        vpaNormalized,
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid UPI VPA",
      });
    }

    const gatewayAccount =
      await GatewayAccountModel.findOne({
        userId,
        gateway: "RAZORPAY",
      });

    if (!gatewayAccount) {
      return res.status(404).json({
        success: false,
        message:
          "RazorpayX Contact not found. Create contact first.",
      });
    }

    const payload = {
      contact_id:
        gatewayAccount.contactId,
      account_type: "vpa",
      vpa: {
        address: vpaNormalized,
      },
    };

    const response =
      await razorpayApi.post(
        "/fund_accounts",
        payload,
      );

    const fundAccount =
      response.data;

    if (!fundAccount?.id) {
      throw new Error(
        "Razorpay did not return VPA Fund Account ID",
      );
    }

    const local =
      await saveFundAccount({
        gatewayAccount,
        fundAccount,
      });

    return res.status(201).json({
      success: true,
      message:
        "UPI Fund Account created successfully",
      data: {
        fundAccountId:
          fundAccount.id,
        accountType: "vpa",
        active:
          fundAccount.active !== false,
        vpaAddress:
          vpaNormalized,
        isDefault:
          local.isDefault,
      },
    });
  } catch (error: any) {
    console.error(
      `${LOG_PREFIX} VPA FUND ACCOUNT ERROR`,
      safeError(error),
    );

    return res
      .status(
        error?.response?.status || 500,
      )
      .json({
        success: false,
        message:
          getRazorpayErrorMessage(
            error,
            "UPI Fund Account creation failed",
          ),
        razorpayError:
          error?.response?.data || null,
      });
  }
};

// ======================================================
// API 4
// CREATE AMAZON PAY WALLET FUND ACCOUNT
// ======================================================

export const addWalletFundAccount =
  async (
    req: AuthRequest,
    res: Response,
  ) => {
    try {
      validateApiEnvironment();

      const {
        userId,
        provider,
        phone,
        email,
        name,
      } = req.body || {};

      if (!userId) {
        return res.status(400).json({
          success: false,
          message:
            "userId is required",
        });
      }

      if (
        !ensureUserAccess(
          req,
          String(userId),
        )
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Unauthorized access",
        });
      }

      const providerNormalized =
        String(provider || "")
          .trim()
          .toLowerCase();

      if (
        providerNormalized !==
        "amazonpay"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Currently supported wallet provider is amazonpay",
        });
      }

      if (!phone) {
        return res.status(400).json({
          success: false,
          message:
            "phone is required",
        });
      }

      const phoneNormalized =
        String(phone).trim();

      const emailNormalized =
        email
          ? String(email)
              .trim()
              .toLowerCase()
          : undefined;

      const nameNormalized =
        name
          ? String(name).trim()
          : undefined;

      const gatewayAccount =
        await GatewayAccountModel.findOne({
          userId,
          gateway: "RAZORPAY",
        });

      if (!gatewayAccount) {
        return res.status(404).json({
          success: false,
          message:
            "RazorpayX Contact not found. Create contact first.",
        });
      }

      const walletPayload: any = {
        contact_id:
          gatewayAccount.contactId,
        account_type: "wallet",
        wallet: {
          provider: "amazonpay",
          phone:
            phoneNormalized,
        },
      };

      if (emailNormalized) {
        walletPayload.wallet.email =
          emailNormalized;
      }

      if (nameNormalized) {
        walletPayload.wallet.name =
          nameNormalized;
      }

      const response =
        await razorpayApi.post(
          "/fund_accounts",
          walletPayload,
        );

      const fundAccount =
        response.data;

      if (!fundAccount?.id) {
        throw new Error(
          "Razorpay did not return Wallet Fund Account ID",
        );
      }

      const local =
        await saveFundAccount({
          gatewayAccount,
          fundAccount,
        });

      return res.status(201).json({
        success: true,
        message:
          "Amazon Pay Wallet Fund Account created successfully",
        data: {
          fundAccountId:
            fundAccount.id,
          accountType: "wallet",
          provider:
            "amazonpay",
          active:
            fundAccount.active !== false,
          phone: mask(
            phoneNormalized,
            2,
            2,
          ),
          email: emailNormalized
            ? maskEmail(
                emailNormalized,
              )
            : undefined,
          isDefault:
            local.isDefault,
        },
      });
    } catch (error: any) {
      console.error(
        `${LOG_PREFIX} WALLET FUND ACCOUNT ERROR`,
        safeError(error),
      );

      return res
        .status(
          error?.response?.status ||
            500,
        )
        .json({
          success: false,
          message:
            getRazorpayErrorMessage(
              error,
              "Wallet Fund Account creation failed",
            ),
          razorpayError:
            error?.response?.data ||
            null,
        });
    }
  };

// ======================================================
// API 5
// GET GATEWAY ACCOUNT
// ======================================================

export const getGatewayAccountByUserId =
  async (
    req: AuthRequest,
    res: Response,
  ) => {
    try {
      const rawUserId =
        req.params.userId;

      const userId = Array.isArray(
        rawUserId,
      )
        ? rawUserId[0]
        : rawUserId;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message:
            "userId is required",
        });
      }

      if (
        !ensureUserAccess(
          req,
          userId,
        )
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Unauthorized access",
        });
      }

      const gatewayAccount =
        await GatewayAccountModel.findOne(
          {
            userId,
            gateway: "RAZORPAY",
          },
        ).lean();

      if (!gatewayAccount) {
        return res.status(200).json({
          success: true,
          exists: false,
          message:
            "RazorpayX account has not been created yet",
          data: null,
        });
      }

      return res.status(200).json({
        success: true,
        exists: true,
        data: {
          _id: gatewayAccount._id,
          userId:
            gatewayAccount.userId,
          gateway:
            gatewayAccount.gateway,
          referenceId:
            gatewayAccount.referenceId,
          contactId:
            gatewayAccount.contactId,
          contactType:
            gatewayAccount.contactType,
          name:
            gatewayAccount.name,
          email:
            gatewayAccount.email,
          phone:
            gatewayAccount.phone,
          status:
            gatewayAccount.status,

          fundAccounts:
            (
              gatewayAccount.fundAccounts ||
              []
            ).map((item: any) => ({
              fundAccountId:
                item.fundAccountId,
              accountType:
                item.accountType,
              status:
                item.status,

              bankAccountName:
                item.bankAccountName,

              bankAccountNumber:
                item.bankAccountNumber
                  ? mask(
                      item.bankAccountNumber,
                      2,
                      2,
                    )
                  : undefined,

              bankIfsc:
                item.bankIfsc,

              vpaAddress:
                item.vpaAddress,

              wallet:
                item.wallet
                  ? {
                      provider:
                        item.wallet
                          .provider,

                      phone: mask(
                        item.wallet
                          .phone,
                        2,
                        2,
                      ),

                      email:
                        item.wallet
                          .email
                          ? maskEmail(
                              item.wallet
                                .email,
                            )
                          : undefined,

                      name:
                        item.wallet.name,
                    }
                  : undefined,

              isDefault:
                item.isDefault,

              createdAt:
                item.createdAt,

              updatedAt:
                item.updatedAt,
            })),

          createdAt:
            gatewayAccount.createdAt,

          updatedAt:
            gatewayAccount.updatedAt,
        },
      });
    } catch (error: any) {
      console.error(
        `${LOG_PREFIX} GET ACCOUNT ERROR`,
        safeError(error),
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch RazorpayX account",
      });
    }
  };

// ======================================================
// INTERNAL
// SELECT EXACT EARNINGS
// ======================================================

const selectExactEarningsForWithdrawal =
  async ({
    userId,
    payoutIds,
  }: {
    userId: string;
    payoutIds: string[];
  }): Promise<SelectedEarningsResult> => {
    if (
      !Array.isArray(payoutIds) ||
      payoutIds.length === 0
    ) {
      throw new Error(
        "payoutIds array is required and cannot be empty",
      );
    }

    const normalized =
      Array.from(
        new Set(
          payoutIds
            .map((id) =>
              typeof id === "string"
                ? id.trim()
                : "",
            )
            .filter(
              (id) => id.length > 0,
            ),
        ),
      );

    if (normalized.length === 0) {
      throw new Error(
        "payoutIds array is required and cannot be empty",
      );
    }

    if (
      normalized.length >
      MAX_SELECTED_EARNINGS
    ) {
      throw new Error(
        `A maximum of ${MAX_SELECTED_EARNINGS} earnings can be withdrawn at once`,
      );
    }

    let detectedType:
      | EarningType
      | null = null;

    const sellerPayoutIds: string[] =
      [];

    const deliveryPayoutIds: string[] =
      [];

    for (const payoutId of normalized) {
      const type =
        detectPayoutIdType(
          payoutId,
        );

      if (type === null) {
        throw new Error(
          `Unknown payoutId prefix: ${payoutId}`,
        );
      }

      if (type === "COMPANY") {
        throw new Error(
          `Company earnings cannot be withdrawn (payoutId: ${payoutId})`,
        );
      }

      if (detectedType === null) {
        detectedType = type;
      } else if (
        detectedType !== type
      ) {
        throw new Error(
          "Cannot mix seller and delivery earnings in a single withdrawal",
        );
      }

      if (type === "SELLER") {
        sellerPayoutIds.push(
          payoutId,
        );
      } else {
        deliveryPayoutIds.push(
          payoutId,
        );
      }
    }

    const earnings: SelectedEarning[] =
      [];

    // ==================================================
    // SELLER
    // ==================================================

    if (detectedType === "SELLER") {
      const records =
        await SellerEarning.find({
          payoutId: {
            $in: sellerPayoutIds,
          },
          sellerId: userId,
          status:
            "WALLET_AVAILABLE",
        }).lean();

      if (
        records.length !==
        sellerPayoutIds.length
      ) {
        const foundSet =
          new Set(
            records.map(
              (r: any) =>
                r.payoutId,
            ),
          );

        const missing =
          sellerPayoutIds.filter(
            (id) =>
              !foundSet.has(id),
          );

        throw new Error(
          `One or more seller earnings are invalid, not owned by you, or not WALLET_AVAILABLE: ${missing.join(
            ", ",
          )}`,
        );
      }

      const byPayoutId =
        new Map<string, any>();

      for (const record of records) {
        byPayoutId.set(
          record.payoutId,
          record,
        );
      }

      for (
        const payoutId of sellerPayoutIds
      ) {
        const record =
          byPayoutId.get(
            payoutId,
          );

        if (!record) {
          throw new Error(
            `Seller earning not found: ${payoutId}`,
          );
        }

        const amount =
          Number(
            record.sellerEarning ||
              0,
          );

        if (
          !Number.isFinite(
            amount,
          ) ||
          amount <= 0
        ) {
          throw new Error(
            `Invalid seller earning amount for ${payoutId}`,
          );
        }

        earnings.push({
          _id:
            record._id as mongoose.Types.ObjectId,

          payoutId:
            record.payoutId,

          earningType:
            "SELLER",

          amount:
            Number(
              amount.toFixed(2),
            ),

          raw: record,
        });
      }
    }

    // ==================================================
    // DELIVERY
    // ==================================================

    if (
      detectedType === "DELIVERY"
    ) {
      const records =
        await DeliveryChargeEarningModel.find(
          {
            payoutId: {
              $in: deliveryPayoutIds,
            },

            deliveryPartnerId:
              userId,

            status:
              "WALLET_AVAILABLE",
          },
        ).lean();

      if (
        records.length !==
        deliveryPayoutIds.length
      ) {
        const foundSet =
          new Set(
            records.map(
              (r: any) =>
                r.payoutId,
            ),
          );

        const missing =
          deliveryPayoutIds.filter(
            (id) =>
              !foundSet.has(id),
          );

        throw new Error(
          `One or more delivery earnings are invalid, not owned by you, or not WALLET_AVAILABLE: ${missing.join(
            ", ",
          )}`,
        );
      }

      const byPayoutId =
        new Map<string, any>();

      for (const record of records) {
        byPayoutId.set(
          record.payoutId,
          record,
        );
      }

      for (
        const payoutId of deliveryPayoutIds
      ) {
        const record =
          byPayoutId.get(
            payoutId,
          );

        if (!record) {
          throw new Error(
            `Delivery earning not found: ${payoutId}`,
          );
        }

        const amount =
          Number(
            record.deliveryEarning ||
              0,
          );

        if (
          !Number.isFinite(
            amount,
          ) ||
          amount <= 0
        ) {
          throw new Error(
            `Invalid delivery earning amount for ${payoutId}`,
          );
        }

        earnings.push({
          _id:
            record._id as mongoose.Types.ObjectId,

          payoutId:
            record.payoutId,

          earningType:
            "DELIVERY",

          amount:
            Number(
              amount.toFixed(2),
            ),

          raw: record,
        });
      }
    }

    if (
      !detectedType ||
      earnings.length === 0
    ) {
      throw new Error(
        "No valid earnings selected for withdrawal",
      );
    }

    const total =
      Number(
        earnings
          .reduce(
            (sum, e) =>
              sum + e.amount,
            0,
          )
          .toFixed(2),
      );

    return {
      earnings,
      total,
      earningType:
        detectedType,
    };
  };

// ======================================================
// INTERNAL
// RESERVE EXACT EARNINGS
// ======================================================

const reserveExactEarnings =
  async ({
    userId,
    selectedEarnings,
    withdrawalId,
  }: {
    userId: string;
    selectedEarnings: SelectedEarning[];
    withdrawalId: string;
  }) => {
    if (
      selectedEarnings.length === 0
    ) {
      throw new Error(
        "No earnings to reserve",
      );
    }

    const earningType =
      selectedEarnings[0]
        .earningType;

    const ids =
      selectedEarnings.map(
        (e) => e._id,
      );

    const payoutIds =
      selectedEarnings.map(
        (e) => e.payoutId,
      );

    const session =
      await mongoose.startSession();

    try {
      await session.withTransaction(
        async () => {
          if (
            earningType === "SELLER"
          ) {
            const updated =
              await SellerEarning.updateMany(
                {
                  _id: {
                    $in: ids,
                  },

                  payoutId: {
                    $in: payoutIds,
                  },

                  sellerId: userId,

                  status:
                    "WALLET_AVAILABLE",
                },
                {
                  $set: {
                    status:
                      "WITHDRAWAL_PENDING",

                    withdrawalId,
                  },
                },
                {
                  session,
                },
              );

            if (
              updated.modifiedCount !==
              selectedEarnings.length
            ) {
              throw new Error(
                "One or more seller earnings are no longer available for withdrawal",
              );
            }
          } else {
            const updated =
              await DeliveryChargeEarningModel.updateMany(
                {
                  _id: {
                    $in: ids,
                  },

                  payoutId: {
                    $in: payoutIds,
                  },

                  deliveryPartnerId:
                    userId,

                  status:
                    "WALLET_AVAILABLE",
                },
                {
                  $set: {
                    status:
                      "WITHDRAWAL_PENDING",

                    withdrawalId,
                  },
                },
                {
                  session,
                },
              );

            if (
              updated.modifiedCount !==
              selectedEarnings.length
            ) {
              throw new Error(
                "One or more delivery earnings are no longer available for withdrawal",
              );
            }
          }
        },
      );
    } finally {
      await session.endSession();
    }
  };

// ======================================================
// INTERNAL
// RELEASE EARNINGS
// ======================================================

const releaseWithdrawalEarnings =
  async ({
    userId,
    withdrawalId,
    earningType,
    reason,
  }: {
    userId: string;
    withdrawalId: string;
    earningType: EarningType;
    reason?: string;
  }) => {
    const update = {
      $set: {
        status:
          "WALLET_AVAILABLE" as const,
      },

      $unset: {
        withdrawalId: 1,
        razorpayPayoutId: 1,
        paidAt: 1,
      },
    };

    if (
      earningType === "SELLER"
    ) {
      await SellerEarning.updateMany(
        {
          sellerId: userId,
          withdrawalId,
          status:
            "WITHDRAWAL_PENDING",
        },
        update,
      );
    } else {
      await DeliveryChargeEarningModel.updateMany(
        {
          deliveryPartnerId:
            userId,

          withdrawalId,

          status:
            "WITHDRAWAL_PENDING",
        },
        update,
      );
    }

    console.log(
      `${LOG_PREFIX} Earnings released`,
      {
        userId,
        withdrawalId,
        earningType,
        reason,
      },
    );
  };

// ======================================================
// INTERNAL
// SAVE RAZORPAY PAYOUT ID
// ======================================================

const saveRazorpayPayoutId = async ({
  userId,
  withdrawalId,
  earningType,
  razorpayPayoutId,
}: {
  userId: string;
  withdrawalId: string;
  earningType: EarningType;
  razorpayPayoutId: string;
}) => {
  const update = {
    $set: {
      razorpayPayoutId,
    },
  };

  if (
    earningType === "SELLER"
  ) {
    return SellerEarning.updateMany(
      {
        sellerId: userId,
        withdrawalId,
        status:
          "WITHDRAWAL_PENDING",
      },
      update,
    );
  }

  return DeliveryChargeEarningModel.updateMany(
    {
      deliveryPartnerId:
        userId,

      withdrawalId,

      status:
        "WITHDRAWAL_PENDING",
    },
    update,
  );
};

// ======================================================
// API 7
// CREATE PAYOUT
// ======================================================

export const createPayout = async (
  req: AuthRequest & {
    body: CreatePayoutRequestBody;
  },
  res: Response,
) => {
  const startTime =
    Date.now();

  logSection(
    "CREATE RAZORPAYX PAYOUT START",
  );

  let reservedWithdrawalId:
    | string
    | null = null;

  let reservedEarningType:
    | EarningType
    | null = null;

  let reservedUserId:
    | string
    | null = null;

  try {
    validateApiEnvironment();

    const {
      fundAccountId,
      payoutIds,
      amount,
      purpose = "payout",
      referenceId,
      narration,
      queueIfLowBalance = false,
    } = req.body || {};

    const userId =
      getAuthenticatedUserId(
        req,
      );

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          "Unauthorized access",
      });
    }

    if (
      !fundAccountId ||
      typeof fundAccountId !==
        "string"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "fundAccountId is required",
      });
    }

    if (
      !Array.isArray(
        payoutIds,
      ) ||
      payoutIds.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "payoutIds array is required and cannot be empty",
      });
    }

    // ==================================================
    // GATEWAY ACCOUNT
    // ==================================================

    const gatewayAccount =
      await GatewayAccountModel.findOne(
        {
          userId,
          gateway: "RAZORPAY",
        },
      );

    if (!gatewayAccount) {
      return res.status(404).json({
        success: false,
        message:
          "RazorpayX Contact not found",
      });
    }

    // ==================================================
    // FUND ACCOUNT OWNERSHIP
    // ==================================================

    const fundAccount =
      gatewayAccount.fundAccounts.find(
        (item: any) =>
          item.fundAccountId ===
          fundAccountId,
      );

    if (!fundAccount) {
      return res.status(404).json({
        success: false,
        message:
          "Fund Account not found for this user",
      });
    }

    if (
      fundAccount.status !==
      "active"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Selected Fund Account is not active",
      });
    }

    // ==================================================
    // PAYOUT MODE
    // ==================================================

    let normalizedMode:
      PayoutMode;

    if (
      fundAccount.accountType ===
      "bank_account"
    ) {
      normalizedMode = "IMPS";
    } else if (
      fundAccount.accountType ===
      "vpa"
    ) {
      normalizedMode = "UPI";
    } else if (
      fundAccount.accountType ===
      "wallet"
    ) {
      const provider =
        fundAccount.wallet?.provider?.toLowerCase();

      if (
        provider !==
        "amazonpay"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Unsupported wallet provider",
        });
      }

      normalizedMode =
        "amazonpay";
    } else {
      return res.status(400).json({
        success: false,
        message:
          "Unsupported payout account type",
      });
    }

    // ==================================================
    // SELECT EXACT EARNINGS
    // ==================================================

    let selection:
      SelectedEarningsResult;

    try {
      selection =
        await selectExactEarningsForWithdrawal(
          {
            userId,
            payoutIds,
          },
        );
    } catch (
      selectionError: any
    ) {
      return res.status(400).json({
        success: false,
        message:
          selectionError?.message ||
          "Selected earnings are not valid for withdrawal",
      });
    }

    const payoutAmount =
      Number(
        selection.total.toFixed(2),
      );

    // ==================================================
    // TIZZYGO MINIMUM
    // ==================================================

    if (
      payoutAmount <
      MIN_WITHDRAWAL_AMOUNT
    ) {
      return res.status(400).json({
        success: false,
        message: `Minimum withdrawal amount is ₹${MIN_WITHDRAWAL_AMOUNT}`,
        minimumWithdrawal:
          MIN_WITHDRAWAL_AMOUNT,
        requestedAmount:
          payoutAmount,
      });
    }

    // ==================================================
    // TIZZYGO MAXIMUM
    // ==================================================

    if (
      payoutAmount >
      MAX_WITHDRAWAL_AMOUNT
    ) {
      return res.status(400).json({
        success: false,
        message: `Maximum withdrawal amount is ₹${MAX_WITHDRAWAL_AMOUNT} per withdrawal`,
        maximumWithdrawal:
          MAX_WITHDRAWAL_AMOUNT,
        requestedAmount:
          payoutAmount,
      });
    }

    // ==================================================
    // FRONTEND AMOUNT CHECK
    // ==================================================

    if (
      amount !== undefined &&
      amount !== null &&
      amount !== ""
    ) {
      const requestedAmount =
        Number(amount);

      if (
        !Number.isFinite(
          requestedAmount,
        ) ||
        requestedAmount <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Valid amount is required",
        });
      }

      const normalizedRequested =
        Number(
          requestedAmount.toFixed(2),
        );

      if (
        normalizedRequested !==
        payoutAmount
      ) {
        return res.status(400).json({
          success: false,
          message: `Amount mismatch. Backend calculated ₹${payoutAmount} from selected earnings.`,
        });
      }
    }

    // ==================================================
    // AMAZON PAY LIMIT
    // ==================================================

    if (
      fundAccount.accountType ===
        "wallet" &&
      payoutAmount >
        AMAZON_PAY_MAX_PAYOUT
    ) {
      return res.status(400).json({
        success: false,
        message: `Amazon Pay wallet payout cannot exceed ₹${AMAZON_PAY_MAX_PAYOUT} per payout`,
        maximumWithdrawal:
          AMAZON_PAY_MAX_PAYOUT,
        requestedAmount:
          payoutAmount,
      });
    }

    // ==================================================
    // PURPOSE
    // ==================================================

    const normalizedPurpose =
      String(purpose || "payout")
        .trim()
        .slice(0, 40);

    if (!normalizedPurpose) {
      return res.status(400).json({
        success: false,
        message:
          "Payout purpose is required",
      });
    }

    // ==================================================
    // WITHDRAWAL ID
    // ==================================================

    const withdrawalId =
      generateWithdrawalReferenceId();

    reservedWithdrawalId =
      withdrawalId;

    reservedEarningType =
      selection.earningType;

    reservedUserId =
      userId;

    // ==================================================
    // RESERVE
    // ==================================================

    await reserveExactEarnings({
      userId,
      selectedEarnings:
        selection.earnings,
      withdrawalId,
    });

    // ==================================================
    // PAYOUT REFERENCE
    // ==================================================

    const payoutReferenceId =
      String(
        referenceId ||
          withdrawalId,
      )
        .trim()
        .slice(0, 40);

    if (!payoutReferenceId) {
      throw new Error(
        "Invalid payout reference ID",
      );
    }

    // ==================================================
    // AMOUNT
    // ==================================================

    const amountInPaise =
      Math.round(
        payoutAmount * 100,
      );

    if (
      amountInPaise < 100
    ) {
      throw new Error(
        "Payout amount must be at least ₹1",
      );
    }

    // ==================================================
    // PAYLOAD
    // ==================================================

    const payoutPayload: any = {
      account_number:
        RAZORPAYX_ACCOUNT_NUMBER,

      fund_account_id:
        fundAccountId,

      amount:
        amountInPaise,

      currency: "INR",

      mode:
        normalizedMode,

      purpose:
        normalizedPurpose,

      queue_if_low_balance:
        Boolean(
          queueIfLowBalance,
        ),

      reference_id:
        payoutReferenceId,

      notes: {
        platform:
          "TIZZYGO",

        user_id:
          String(userId),

        withdrawal_id:
          withdrawalId,
      },
    };

    // Amazon Pay does not allow custom narration.
    if (
      normalizedMode !==
        "amazonpay" &&
      narration
    ) {
      const cleanNarration =
        String(narration)
          .trim()
          .replace(
            /[^a-zA-Z0-9 ]/g,
            "",
          )
          .slice(0, 30);

      if (cleanNarration) {
        payoutPayload.narration =
          cleanNarration;
      }
    }

    // ==================================================
    // IDEMPOTENCY
    // ==================================================

    const idempotencyKey =
      crypto
        .createHash("sha256")
        .update(
          `TIZZYGO:${withdrawalId}`,
        )
        .digest("hex")
        .slice(0, 36);

    // ==================================================
    // CREATE RAZORPAY PAYOUT
    // ==================================================

    let response;

    try {
      response =
        await razorpayApi.post(
          "/payouts",
          payoutPayload,
          {
            headers: {
              "X-Payout-Idempotency":
                idempotencyKey,
            },
          },
        );
    } catch (error: any) {
      // IMPORTANT:
      // No HTTP response means Razorpay status
      // is uncertain.
      //
      // DO NOT release earnings.
      // DO NOT create another payout.
      //
      // They remain WITHDRAWAL_PENDING.
      if (!error?.response) {
        console.error(
          `${LOG_PREFIX} PAYOUT NETWORK ERROR - earnings remain WITHDRAWAL_PENDING`,
        );

        return res.status(503).json({
          success: false,
          message:
            "Payout request status is uncertain. Earnings remain pending for reconciliation.",
          withdrawalId,
          referenceId:
            payoutReferenceId,
          retryRequired:
            false,
          reconciliationRequired:
            true,
        });
      }

      throw error;
    }

    const payout =
      response.data as RazorpayPayoutEntity;

    if (!payout?.id) {
      throw new Error(
        "Razorpay did not return payout ID",
      );
    }

    // ==================================================
    // SAVE RAZORPAY PAYOUT ID
    //
    // NEVER overwrite payoutId.
    // ==================================================

    const updateResult =
      await saveRazorpayPayoutId({
        userId,
        withdrawalId,
        earningType:
          selection.earningType,
        razorpayPayoutId:
          payout.id,
      });

    if (
      updateResult.modifiedCount !==
      selection.earnings.length
    ) {
      throw new Error(
        "Razorpay payout was created but payout ID could not be linked to all selected earnings",
      );
    }

    reservedWithdrawalId =
      null;

    reservedEarningType =
      null;

    reservedUserId =
      null;

    logDuration(
      "TOTAL PAYOUT TIME",
      startTime,
    );

    return res.status(201).json({
      success: true,

      message:
        "Payout created successfully. Final payment status will be confirmed by Razorpay webhook.",

      data: {
        withdrawalId,

        razorpayPayoutId:
          payout.id,

        userId:
          String(userId),

        amount:
          payoutAmount,

        amountInPaise,

        earningCount:
          selection.earnings.length,

        payoutIds:
          selection.earnings.map(
            (e) =>
              e.payoutId,
          ),

        earningIds:
          selection.earnings.map(
            (e) =>
              e._id,
          ),

        earnings:
          selection.earnings.map(
            (e) => ({
              earningId:
                e._id,

              payoutId:
                e.payoutId,

              earningType:
                e.earningType,

              amount:
                e.amount,
            }),
          ),

        fundAccountId,

        mode:
          payout.mode ||
          normalizedMode,

        status:
          payout.status ||
          "queued",

        referenceId:
          payout.reference_id ||
          payoutReferenceId,

        utr:
          payout.utr ||
          null,
      },
    });
  } catch (error: any) {
    console.error(
      `${LOG_PREFIX} CREATE PAYOUT ERROR`,
      safeError(error),
    );

    // Release ONLY when Razorpay clearly
    // rejected the request.
    //
    // No-response/network errors are NOT released.
    if (
      reservedWithdrawalId &&
      reservedEarningType &&
      reservedUserId &&
      error?.response
    ) {
      try {
        await releaseWithdrawalEarnings(
          {
            userId:
              reservedUserId,

            withdrawalId:
              reservedWithdrawalId,

            earningType:
              reservedEarningType,

            reason:
              getRazorpayErrorMessage(
                error,
                "Razorpay rejected payout",
              ),
          },
        );
      } catch (
        releaseError
      ) {
        console.error(
          `${LOG_PREFIX} RELEASE ERROR`,
          safeError(
            releaseError,
          ),
        );
      }

      reservedWithdrawalId =
        null;

      reservedEarningType =
        null;

      reservedUserId =
        null;
    }

    return res
      .status(
        error?.response?.status ||
          500,
      )
      .json({
        success: false,

        message:
          getRazorpayErrorMessage(
            error,
            "RazorpayX payout creation failed",
          ),

        razorpayError:
          error?.response?.data ||
          null,
      });
  }
};

// ======================================================
// API 8
// GET PAYOUT BY RAZORPAY PAYOUT ID
// ======================================================

export const getPayout = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    validateApiEnvironment();

    const userId =
      getAuthenticatedUserId(
        req,
      );

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          "Unauthorized access",
      });
    }

    const rawPayoutId =
      req.params.payoutId;

    const payoutId =
      Array.isArray(
        rawPayoutId,
      )
        ? rawPayoutId[0]
        : rawPayoutId;

    if (!payoutId) {
      return res.status(400).json({
        success: false,
        message:
          "payoutId is required",
      });
    }

    const [
      sellerRecord,
      deliveryRecord,
    ] = await Promise.all([
      SellerEarning.findOne({
        sellerId: userId,
        razorpayPayoutId:
          payoutId,
      })
        .select("_id")
        .lean(),

      DeliveryChargeEarningModel.findOne(
        {
          deliveryPartnerId:
            userId,

          razorpayPayoutId:
            payoutId,
        },
      )
        .select("_id")
        .lean(),
    ]);

    if (
      !sellerRecord &&
      !deliveryRecord
    ) {
      return res.status(404).json({
        success: false,
        message:
          "Payout not found for this user",
      });
    }

    const response =
      await razorpayApi.get(
        `/payouts/${payoutId}`,
      );

    return res.status(200).json({
      success: true,
      data: response.data,
    });
  } catch (error: any) {
    console.error(
      `${LOG_PREFIX} GET PAYOUT ERROR`,
      safeError(error),
    );

    return res
      .status(
        error?.response?.status ||
          500,
      )
      .json({
        success: false,
        message:
          getRazorpayErrorMessage(
            error,
            "Failed to fetch payout",
          ),
        razorpayError:
          error?.response?.data ||
          null,
      });
  }
};

// ======================================================
// API 9
// GET FUND ACCOUNT
// ======================================================

export const getFundAccount = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    validateApiEnvironment();

    const userId =
      getAuthenticatedUserId(
        req,
      );

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          "Unauthorized access",
      });
    }

    const rawFundAccountId =
      req.params.fundAccountId;

    const fundAccountId =
      Array.isArray(
        rawFundAccountId,
      )
        ? rawFundAccountId[0]
        : rawFundAccountId;

    if (!fundAccountId) {
      return res.status(400).json({
        success: false,
        message:
          "fundAccountId is required",
      });
    }

    const gatewayAccount =
      await GatewayAccountModel.findOne(
        {
          userId,
          gateway: "RAZORPAY",
          "fundAccounts.fundAccountId":
            fundAccountId,
        },
      )
        .select("_id")
        .lean();

    if (!gatewayAccount) {
      return res.status(404).json({
        success: false,
        message:
          "Fund Account not found for this user",
      });
    }

    const response =
      await razorpayApi.get(
        `/fund_accounts/${fundAccountId}`,
      );

    return res.status(200).json({
      success: true,
      data: response.data,
    });
  } catch (error: any) {
    console.error(
      `${LOG_PREFIX} GET FUND ACCOUNT ERROR`,
      safeError(error),
    );

    return res
      .status(
        error?.response?.status ||
          500,
      )
      .json({
        success: false,
        message:
          getRazorpayErrorMessage(
            error,
            "Failed to fetch Fund Account",
          ),
        razorpayError:
          error?.response?.data ||
          null,
      });
  }
};

// ======================================================
// API 10
// RECONCILE UNCERTAIN PAYOUT
// ======================================================
//
// Used when createPayout gets a network timeout.
//
// We search Razorpay using our unique
// reference_id / withdrawalId.
//
// Razorpay supports filtering payouts by
// reference_id on Fetch All Payouts API.
// ======================================================

export const reconcilePayout = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    validateApiEnvironment();

    const userId =
      getAuthenticatedUserId(
        req,
      );

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          "Unauthorized access",
      });
    }

    const rawWithdrawalId =
      req.params.withdrawalId;

    const withdrawalId =
      Array.isArray(
        rawWithdrawalId,
      )
        ? rawWithdrawalId[0]
        : rawWithdrawalId;

    if (!withdrawalId) {
      return res.status(400).json({
        success: false,
        message:
          "withdrawalId is required",
      });
    }

    // ------------------------------------------
    // FIND LOCAL EARNINGS
    // ------------------------------------------

    const [
      sellerRecords,
      deliveryRecords,
    ] = await Promise.all([
      SellerEarning.find({
        sellerId: userId,
        withdrawalId,
        status:
          "WITHDRAWAL_PENDING",
      }).lean(),

      DeliveryChargeEarningModel.find(
        {
          deliveryPartnerId:
            userId,

          withdrawalId,

          status:
            "WITHDRAWAL_PENDING",
        },
      ).lean(),
    ]);

    const allRecords = [
      ...sellerRecords,
      ...deliveryRecords,
    ];

    if (allRecords.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "No pending withdrawal found for this user",
      });
    }

    const existingRazorpayPayoutId =
      allRecords.find(
        (record: any) =>
          record.razorpayPayoutId,
      )?.razorpayPayoutId;

    if (existingRazorpayPayoutId) {
      return res.status(200).json({
        success: true,
        message:
          "Payout is already linked",
        data: {
          withdrawalId,
          razorpayPayoutId:
            existingRazorpayPayoutId,
          alreadyLinked: true,
        },
      });
    }

    // ------------------------------------------
    // ASK RAZORPAY
    // ------------------------------------------

    const response =
      await razorpayApi.get(
        "/payouts",
        {
          params: {
            account_number:
              RAZORPAYX_ACCOUNT_NUMBER,

            reference_id:
              withdrawalId,

            count: 100,
          },
        },
      );

    const collection =
      response.data as RazorpayPayoutCollection;

    const payouts =
      Array.isArray(
        collection.items,
      )
        ? collection.items
        : [];

    if (payouts.length === 0) {
      return res.status(200).json({
        success: true,
        message:
          "Razorpay has not returned a payout for this withdrawal yet",
        data: {
          withdrawalId,
          razorpayPayoutId:
            null,
          reconciled: false,
        },
      });
    }

    // Our withdrawal reference should be unique.
    const matchingPayout =
      payouts.find(
        (payout) =>
          payout.reference_id ===
          withdrawalId,
      );

    if (!matchingPayout?.id) {
      return res.status(200).json({
        success: true,
        message:
          "No matching Razorpay payout found",
        data: {
          withdrawalId,
          razorpayPayoutId:
            null,
          reconciled: false,
        },
      });
    }

    // ------------------------------------------
    // DETERMINE TYPE
    // ------------------------------------------

    const earningType: EarningType =
      sellerRecords.length > 0
        ? "SELLER"
        : "DELIVERY";

    // ------------------------------------------
    // SAVE RAZORPAY PAYOUT ID
    // ------------------------------------------

    const updateResult =
      await saveRazorpayPayoutId({
        userId,
        withdrawalId,
        earningType,
        razorpayPayoutId:
          matchingPayout.id,
      });

    return res.status(200).json({
      success: true,
      message:
        "Payout reconciled successfully",
      data: {
        withdrawalId,
        razorpayPayoutId:
          matchingPayout.id,
        status:
          matchingPayout.status ||
          null,
        utr:
          matchingPayout.utr ||
          null,
        referenceId:
          matchingPayout.reference_id ||
          withdrawalId,
        modified:
          updateResult.modifiedCount,
        reconciled: true,
      },
    });
  } catch (error: any) {
    console.error(
      `${LOG_PREFIX} RECONCILE PAYOUT ERROR`,
      safeError(error),
    );

    return res
      .status(
        error?.response?.status ||
          500,
      )
      .json({
        success: false,
        message:
          getRazorpayErrorMessage(
            error,
            "Failed to reconcile payout",
          ),
        razorpayError:
          error?.response?.data ||
          null,
      });
  }
};

// ======================================================
// API 11
// RAZORPAYX PAYOUT WEBHOOK
// ======================================================

export const razorpayXPayoutWebhook =
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      validateWebhookEnvironment();

      const signature: string | null = req.headers.get(
        "x-razorpay-signature",
      );

      if (
        !signature ||
        typeof signature !==
          "string"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Missing Razorpay webhook signature",
        });
      }

      // IMPORTANT:
      // This endpoint MUST receive the raw body.
      const rawBody =
        Buffer.isBuffer(req.body)
          ? req.body
          : Buffer.from(
              typeof req.body ===
                "string"
                ? req.body
                : JSON.stringify(
                    req.body,
                  ),
            );

      const expectedSignature =
        crypto
          .createHmac(
            "sha256",
            RAZORPAY_WEBHOOK_SECRET!,
          )
          .update(rawBody)
          .digest("hex");

      const signatureBuffer =
        Buffer.from(
          signature,
          "utf8",
        );

      const expectedBuffer =
        Buffer.from(
          expectedSignature,
          "utf8",
        );

      if (
        signatureBuffer.length !==
          expectedBuffer.length ||
        !crypto.timingSafeEqual(
          signatureBuffer,
          expectedBuffer,
        )
      ) {
        console.error(
          `${LOG_PREFIX} ❌ INVALID WEBHOOK SIGNATURE`,
        );

        return res.status(400).json({
          success: false,
          message:
            "Invalid webhook signature",
        });
      }

      const body =
        JSON.parse(
          rawBody.toString(
            "utf8",
          ),
        ) as RazorpayWebhookBody;

      const event =
        body.event;

      const payout =
        body.payload?.payout?.entity;

      if (!payout?.id) {
        return res.status(200).json({
          success: true,
          message:
            "Webhook received but payout entity was not present",
        });
      }

      const razorpayPayoutId =
        payout.id;

      const payoutStatus =
        payout.status;

      logSection(
        `WEBHOOK ${
          event || "UNKNOWN"
        }`,
      );

      console.log(
        `${LOG_PREFIX} razorpayPayoutId:`,
        razorpayPayoutId,
      );

      console.log(
        `${LOG_PREFIX} status:`,
        payoutStatus,
      );

      // ==================================================
      // PROCESSED
      // ==================================================

      if (
        event ===
          "payout.processed" ||
        payoutStatus ===
          "processed"
      ) {
        const paidAt =
          new Date();

        const sellerResult =
          await SellerEarning.updateMany(
            {
              razorpayPayoutId,

              status:
                "WITHDRAWAL_PENDING",
            },

            {
              $set: {
                status: "PAID",
                paidAt,
              },
            },
          );

        const deliveryResult =
          await DeliveryChargeEarningModel.updateMany(
            {
              razorpayPayoutId,

              status:
                "WITHDRAWAL_PENDING",
            },

            {
              $set: {
                status: "PAID",
                paidAt,
              },
            },
          );

        const modified =
          sellerResult.modifiedCount +
          deliveryResult.modifiedCount;

        console.log(
          `${LOG_PREFIX} ✅ PAYOUT PROCESSED`,
          {
            razorpayPayoutId,

            sellerModified:
              sellerResult.modifiedCount,

            deliveryModified:
              deliveryResult.modifiedCount,
          },
        );

        return res.status(200).json({
          success: true,
          message:
            "Payout processed and earnings marked PAID",

          razorpayPayoutId,

          status: "PAID",

          modified,
        });
      }

      // ==================================================
      // FAILED / REVERSED / REJECTED / CANCELLED
      // ==================================================

      if (
        event ===
          "payout.reversed" ||
        event ===
          "payout.failed" ||
        event ===
          "payout.rejected" ||
        event ===
          "payout.cancelled" ||
        payoutStatus ===
          "reversed" ||
        payoutStatus ===
          "failed" ||
        payoutStatus ===
          "rejected" ||
        payoutStatus ===
          "cancelled"
      ) {
        const releaseUpdate =
          {
            $set: {
              status:
                "WALLET_AVAILABLE" as const,
            },

            $unset: {
              razorpayPayoutId:
                1,

              withdrawalId:
                1,

              paidAt: 1,
            },
          };

        const sellerResult =
          await SellerEarning.updateMany(
            {
              razorpayPayoutId,

              status:
                "WITHDRAWAL_PENDING",
            },

            releaseUpdate,
          );

        const deliveryResult =
          await DeliveryChargeEarningModel.updateMany(
            {
              razorpayPayoutId,

              status:
                "WITHDRAWAL_PENDING",
            },

            releaseUpdate,
          );

        const modified =
          sellerResult.modifiedCount +
          deliveryResult.modifiedCount;

        console.log(
          `${LOG_PREFIX} ↩ PAYOUT RETURNED TO WALLET`,
          {
            razorpayPayoutId,

            sellerModified:
              sellerResult.modifiedCount,

            deliveryModified:
              deliveryResult.modifiedCount,

            failureReason:
              payout.failure_reason,

            statusDetails:
              payout.status_details,
          },
        );

        return res.status(200).json({
          success: true,

          message:
            "Payout failed/reversed and earnings returned to WALLET_AVAILABLE",

          razorpayPayoutId,

          status:
            "WALLET_AVAILABLE",

          modified,
        });
      }

      // ==================================================
      // PENDING / QUEUED / PROCESSING
      // ==================================================

      if (
        event ===
          "payout.pending" ||
        event ===
          "payout.queued" ||
        event ===
          "payout.initiated" ||
        payoutStatus ===
          "pending" ||
        payoutStatus ===
          "queued" ||
        payoutStatus ===
          "processing"
      ) {
        const holdUpdate =
          {
            $set: {
              status:
                "WITHDRAWAL_PENDING" as const,
            },
          };

        const sellerResult =
          await SellerEarning.updateMany(
            {
              razorpayPayoutId,

              status: {
                $in: [
                  "WALLET_AVAILABLE",
                  "WITHDRAWAL_PENDING",
                ],
              },
            },

            holdUpdate,
          );

        const deliveryResult =
          await DeliveryChargeEarningModel.updateMany(
            {
              razorpayPayoutId,

              status: {
                $in: [
                  "WALLET_AVAILABLE",
                  "WITHDRAWAL_PENDING",
                ],
              },
            },

            holdUpdate,
          );

        const modified =
          sellerResult.modifiedCount +
          deliveryResult.modifiedCount;

        console.log(
          `${LOG_PREFIX} ⏳ PAYOUT STILL PROCESSING`,
          {
            razorpayPayoutId,

            sellerModified:
              sellerResult.modifiedCount,

            deliveryModified:
              deliveryResult.modifiedCount,
          },
        );

        return res.status(200).json({
          success: true,

          message:
            "Payout still processing",

          razorpayPayoutId,

          status:
            "WITHDRAWAL_PENDING",

          modified,
        });
      }

      // ==================================================
      // UNKNOWN
      // ==================================================

      console.log(
        `${LOG_PREFIX} ℹ️ UNHANDLED PAYOUT EVENT`,
        {
          event,
          razorpayPayoutId,
          payoutStatus,
        },
      );

      return res.status(200).json({
        success: true,
        message:
          "Webhook received",
      });
    } catch (error: any) {
      console.error(
        `${LOG_PREFIX} ❌ WEBHOOK ERROR`,
        safeError(error),
      );

      return res.status(500).json({
        success: false,
        message:
          "Webhook processing failed",
      });
    }
  };