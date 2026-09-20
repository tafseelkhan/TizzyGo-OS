import { Request, Response } from "express";
import axios from "axios";
import Razorpay from "razorpay";

import User from "../../../models/tizzygo/auths/User";
import GatewayAccountModel from "../../../models/tizzyos/seller/PayOut/Portal/GatewayAccount";

// ======================================================
// LOG HELPERS
// ======================================================

const LOG_PREFIX = "[RAZORPAY ONBOARDING]";

const mask = (value: unknown, visibleStart = 3, visibleEnd = 2): string => {
  if (value === undefined || value === null) {
    return "undefined";
  }

  const str = String(value);

  if (str.length <= visibleStart + visibleEnd) {
    return "***";
  }

  return (
    str.slice(0, visibleStart) +
    "*".repeat(Math.max(3, str.length - visibleStart - visibleEnd)) +
    str.slice(-visibleEnd)
  );
};

const maskEmail = (email?: string): string => {
  if (!email) return "undefined";

  const [name, domain] = email.split("@");

  if (!domain) {
    return mask(email);
  }

  if (name.length <= 2) {
    return `**@${domain}`;
  }

  return `${name.slice(0, 2)}***@${domain}`;
};

const safeError = (error: any) => {
  return {
    message: error?.message,
    name: error?.name,
    code: error?.code,
    status: error?.response?.status,
    statusText: error?.response?.statusText,
    responseData: error?.response?.data,
    responseHeaders: error?.response?.headers,
    errorObject: error?.error,
  };
};

const logSection = (title: string) => {
  console.log("");
  console.log("=".repeat(70));
  console.log(`${LOG_PREFIX} ${title}`);
  console.log("=".repeat(70));
};

const logDuration = (label: string, startTime: number) => {
  console.log(`${LOG_PREFIX} ${label}: ${Date.now() - startTime}ms`);
};

// ======================================================
// RAZORPAY SDK
// ======================================================

console.log(`${LOG_PREFIX} Initializing Razorpay SDK...`);

console.log(
  `${LOG_PREFIX} RAZORPAY_KEY_ID present:`,
  Boolean(process.env.RAZORPAY_KEY_ID),
);

console.log(
  `${LOG_PREFIX} RAZORPAY_KEY_ID prefix:`,
  process.env.RAZORPAY_KEY_ID
    ? process.env.RAZORPAY_KEY_ID.slice(0, 8) + "..."
    : "MISSING",
);

console.log(
  `${LOG_PREFIX} RAZORPAY_KEY_SECRET present:`,
  Boolean(process.env.RAZORPAY_KEY_SECRET),
);

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

// ======================================================
// RAZORPAY ROUTE API CLIENT
// ======================================================

const razorpayApi = axios.create({
  baseURL: "https://api.razorpay.com/v2",

  auth: {
    username: process.env.RAZORPAY_KEY_ID!,
    password: process.env.RAZORPAY_KEY_SECRET!,
  },

  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },

  timeout: 30000,
});

// ======================================================
// AXIOS DEBUG INTERCEPTORS
// ======================================================

razorpayApi.interceptors.request.use(
  (config) => {
    console.log("");
    console.log(`${LOG_PREFIX} 🌐 AXIOS REQUEST`);

    console.log(`${LOG_PREFIX} Method:`, config.method?.toUpperCase());

    console.log(
      `${LOG_PREFIX} URL:`,
      `${config.baseURL || ""}${config.url || ""}`,
    );

    console.log(
      `${LOG_PREFIX} Content-Type:`,
      config.headers?.["Content-Type"],
    );

    if (config.data) {
      console.log(
        `${LOG_PREFIX} Request body:`,
        JSON.stringify(config.data, null, 2),
      );
    }

    return config;
  },
  (error) => {
    console.error(
      `${LOG_PREFIX} ❌ AXIOS REQUEST INTERCEPTOR ERROR`,
      safeError(error),
    );

    return Promise.reject(error);
  },
);

razorpayApi.interceptors.response.use(
  (response) => {
    console.log("");
    console.log(`${LOG_PREFIX} 🌐 AXIOS RESPONSE`);

    console.log(`${LOG_PREFIX} Status:`, response.status);

    console.log(`${LOG_PREFIX} Status Text:`, response.statusText);

    console.log(
      `${LOG_PREFIX} Response Data:`,
      JSON.stringify(response.data, null, 2),
    );

    return response;
  },
  (error) => {
    console.error("");
    console.error(`${LOG_PREFIX} ❌ AXIOS RESPONSE ERROR`);

    console.error(`${LOG_PREFIX} Status:`, error?.response?.status);

    console.error(`${LOG_PREFIX} Status Text:`, error?.response?.statusText);

    console.error(
      `${LOG_PREFIX} Response Data:`,
      JSON.stringify(error?.response?.data, null, 2),
    );

    console.error(
      `${LOG_PREFIX} Response Headers:`,
      JSON.stringify(error?.response?.headers, null, 2),
    );

    console.error(`${LOG_PREFIX} Error Message:`, error?.message);

    return Promise.reject(error);
  },
);

// ======================================================
// API 1
// CREATE RAZORPAY ROUTE LINKED ACCOUNT
// ======================================================

export const createPayoutAccount = async (req: Request, res: Response) => {
  const requestStartTime = Date.now();

  logSection("CREATE PAYOUT ACCOUNT API START");

  console.log(`${LOG_PREFIX} HTTP Method:`, req.method);

  console.log(`${LOG_PREFIX} URL:`, req.originalUrl);

  console.log(`${LOG_PREFIX} Content-Type:`, req.headers["content-type"]);

  console.log(
    `${LOG_PREFIX} Authorization present:`,
    Boolean(req.headers.authorization),
  );

  console.log(`${LOG_PREFIX} Request body received:`, req.body);

  try {
    const {
      userId,
      name,
      email,
      phone,
      pan,
      businessType = "individual",
      address,
      street2 = "",
      city,
      state,
      postalCode,
      country = "IN",
    } = req.body || {};

    // ==================================================
    // INPUT DEBUG
    // ==================================================

    console.log("");
    console.log(`${LOG_PREFIX} 📋 Parsed input`);

    console.log(`${LOG_PREFIX} userId:`, userId);

    console.log(`${LOG_PREFIX} name:`, name);

    console.log(`${LOG_PREFIX} email:`, maskEmail(email));

    console.log(`${LOG_PREFIX} phone:`, mask(phone));

    console.log(`${LOG_PREFIX} PAN present:`, Boolean(pan));

    console.log(
      `${LOG_PREFIX} PAN masked:`,
      pan ? mask(pan, 2, 1) : "undefined",
    );

    console.log(`${LOG_PREFIX} businessType:`, businessType);

    console.log(`${LOG_PREFIX} address:`, address);

    console.log(`${LOG_PREFIX} street2:`, street2);

    console.log(`${LOG_PREFIX} city:`, city);

    console.log(`${LOG_PREFIX} state:`, state);

    console.log(`${LOG_PREFIX} postalCode:`, postalCode);

    console.log(`${LOG_PREFIX} country:`, country);

    // ==================================================
    // VALIDATION
    // ==================================================

    logSection("VALIDATION");

    if (!userId) {
      console.error(`${LOG_PREFIX} ❌ userId missing`);

      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    if (!name || !email || !phone) {
      console.error(`${LOG_PREFIX} ❌ Basic identity fields missing`);

      return res.status(400).json({
        success: false,
        message: "name, email and phone are required",
      });
    }

    if (!address || !city || !state || !postalCode) {
      console.error(`${LOG_PREFIX} ❌ Operational address incomplete`);

      return res.status(400).json({
        success: false,
        message: "Complete operational address is required",
      });
    }

    if (!pan) {
      console.error(`${LOG_PREFIX} ❌ PAN missing`);

      return res.status(400).json({
        success: false,
        message: "PAN is required",
      });
    }

    console.log(`${LOG_PREFIX} ✅ Validation passed`);

    // ==================================================
    // FIND USER
    // ==================================================

    logSection("FIND TIZZYGO USER");

    const userStartTime = Date.now();

    console.log(`${LOG_PREFIX} Searching User.findById:`, userId);

    const user = await User.findById(userId);

    logDuration("User lookup completed", userStartTime);

    if (!user) {
      console.error(`${LOG_PREFIX} ❌ User not found`);

      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    console.log(`${LOG_PREFIX} ✅ User found`);

    console.log(`${LOG_PREFIX} Mongo User ID:`, user._id.toString());

    // ==================================================
    // CHECK DUPLICATE
    // ==================================================

    logSection("CHECK EXISTING GATEWAY ACCOUNT");

    const duplicateStartTime = Date.now();

    const existingGatewayAccount = await GatewayAccountModel.findOne({
      userId: user._id,
      gateway: "RAZORPAY",
    });

    logDuration("Duplicate check completed", duplicateStartTime);

    if (existingGatewayAccount) {
      console.warn(`${LOG_PREFIX} ⚠️ Gateway Account already exists`);

      console.log(
        `${LOG_PREFIX} Local Gateway Account ID:`,
        existingGatewayAccount._id,
      );

      console.log(
        `${LOG_PREFIX} Razorpay Account ID:`,
        existingGatewayAccount.gatewayAccountId,
      );

      console.log(
        `${LOG_PREFIX} Product ID:`,
        existingGatewayAccount.gatewayProductId,
      );

      return res.status(409).json({
        success: false,
        message: "Razorpay Gateway Account already exists for this user",
        data: existingGatewayAccount,
      });
    }

    console.log(`${LOG_PREFIX} ✅ No existing Gateway Account`);

    // ==================================================
    // STEP 1
    // CREATE LINKED ACCOUNT
    // ==================================================

    logSection("STEP 1 — CREATE RAZORPAY LINKED ACCOUNT");

    const accountPayload = {
      email: email.toLowerCase().trim(),

      phone: phone.trim(),

      contact_name: name.trim(),

      legal_business_name: name.trim(),

      customer_facing_business_name: name.trim(),

      business_type: businessType,

      reference_id: String(user._id),

      profile: {
        business_model: "TizzyGo marketplace and logistics services",

        addresses: {
          operation: {
            street1: address.trim(),

            street2: street2?.trim() || "",

            city: city.trim(),

            state: state.trim(),

            postal_code: postalCode.trim(),

            country: country || "IN",
          },
        },
      },
    };

    console.log(
      `${LOG_PREFIX} 📤 Linked Account Payload:`,
      JSON.stringify(accountPayload, null, 2),
    );

    console.log(
      `${LOG_PREFIX} Razorpay Base URL:`,
      "https://api.razorpay.com/v2",
    );

    console.log(
      `${LOG_PREFIX} Razorpay Key ID prefix:`,
      process.env.RAZORPAY_KEY_ID
        ? process.env.RAZORPAY_KEY_ID.slice(0, 8) + "..."
        : "MISSING",
    );

    console.log(
      `${LOG_PREFIX} Razorpay Secret present:`,
      Boolean(process.env.RAZORPAY_KEY_SECRET),
    );

    console.log(`${LOG_PREFIX} Calling POST /accounts...`);

    const accountStartTime = Date.now();

    const razorpayAccountResponse = await razorpayApi.post(
      "/accounts",
      accountPayload,
    );

    logDuration("Linked Account API completed", accountStartTime);

    const razorpayAccount = razorpayAccountResponse.data;

    console.log(`${LOG_PREFIX} ✅ Linked Account created`);

    console.log(`${LOG_PREFIX} Razorpay Account ID:`, razorpayAccount?.id);

    console.log(`${LOG_PREFIX} Account Status:`, razorpayAccount?.status);

    console.log(
      `${LOG_PREFIX} Account Email:`,
      maskEmail(razorpayAccount?.email),
    );

    console.log(
      `${LOG_PREFIX} Full Account Response:`,
      JSON.stringify(razorpayAccount, null, 2),
    );

    // ==================================================
    // STEP 2
    // CREATE STAKEHOLDER
    // ==================================================

    logSection("STEP 2 — CREATE STAKEHOLDER");

    const stakeholderPayload = {
      name: name.trim(),

      email: email.toLowerCase().trim(),

      relationship: {
        director: false,
        executive: true,
      },

      phone: {
        primary: phone.trim(),
      },

      kyc: {
        pan: pan.trim().toUpperCase(),
      },

      percentage_ownership: 100,
    };

    console.log(
      `${LOG_PREFIX} 📤 Stakeholder Payload:`,
      JSON.stringify(
        {
          ...stakeholderPayload,
          kyc: {
            pan: mask(pan.trim().toUpperCase(), 2, 1),
          },
        },
        null,
        2,
      ),
    );

    const stakeholderStartTime = Date.now();

    const stakeholder = await razorpay.stakeholders.create(
      razorpayAccount.id,
      stakeholderPayload,
    );

    logDuration("Stakeholder API completed", stakeholderStartTime);

    console.log(`${LOG_PREFIX} ✅ Stakeholder created`);

    console.log(`${LOG_PREFIX} Stakeholder ID:`, stakeholder.id);

    console.log(
      `${LOG_PREFIX} Stakeholder Response:`,
      JSON.stringify(stakeholder, null, 2),
    );

    // ==================================================
    // STEP 3
    // REQUEST ROUTE PRODUCT
    // ==================================================

    logSection("STEP 3 — REQUEST ROUTE PRODUCT");

    const productPayload = {
      product_name: "route",
      tnc_accepted: true,
    };

    console.log(
      `${LOG_PREFIX} 📤 Route Product Payload:`,
      JSON.stringify(productPayload, null, 2),
    );

    const productStartTime = Date.now();

    const productResponse = await razorpayApi.post(
      `/accounts/${razorpayAccount.id}/products`,
      productPayload,
    );

    logDuration("Route Product API completed", productStartTime);

    const product = productResponse.data;

    console.log(`${LOG_PREFIX} ✅ Route Product created`);

    console.log(`${LOG_PREFIX} Product ID:`, product?.id);

    console.log(`${LOG_PREFIX} Activation Status:`, product?.activation_status);

    console.log(
      `${LOG_PREFIX} Product Response:`,
      JSON.stringify(product, null, 2),
    );

    // ==================================================
    // SAVE DATABASE
    // ==================================================

    logSection("SAVE GATEWAY ACCOUNT");

    const databaseStartTime = Date.now();

    const gatewayAccountRecord = await GatewayAccountModel.create({
      userId: user._id,

      gateway: "RAZORPAY",

      gatewayAccountId: razorpayAccount.id,

      gatewayStakeholderId: stakeholder.id,

      gatewayProductId: product.id,

      onboardingStatus: product.activation_status || "requested",

      accountStatus: razorpayAccount.status,

      email: email.toLowerCase().trim(),

      phone: phone.trim(),
    });

    logDuration("Gateway Account DB save completed", databaseStartTime);

    console.log(`${LOG_PREFIX} 💾 Gateway Account saved`);

    console.log(`${LOG_PREFIX} Local ID:`, gatewayAccountRecord._id);

    // ==================================================
    // FINAL SUCCESS
    // ==================================================

    logSection("CREATE PAYOUT ACCOUNT SUCCESS");

    logDuration("TOTAL REQUEST TIME", requestStartTime);

    return res.status(201).json({
      success: true,

      message: "Razorpay Route payout onboarding initiated successfully",

      data: {
        gatewayAccountId: gatewayAccountRecord._id,

        razorpayAccountId: razorpayAccount.id,

        razorpayStakeholderId: stakeholder.id,

        razorpayProductId: product.id,

        accountStatus: razorpayAccount.status,

        activationStatus: product.activation_status || "requested",
      },
    });
  } catch (error: any) {
    logSection("CREATE PAYOUT ACCOUNT FAILED");

    console.error(`${LOG_PREFIX} ❌ ERROR TYPE:`, error?.constructor?.name);

    console.error(`${LOG_PREFIX} ❌ ERROR MESSAGE:`, error?.message);

    console.error(`${LOG_PREFIX} ❌ ERROR CODE:`, error?.code);

    console.error(`${LOG_PREFIX} ❌ HTTP STATUS:`, error?.response?.status);

    console.error(`${LOG_PREFIX} ❌ STATUS TEXT:`, error?.response?.statusText);

    console.error(
      `${LOG_PREFIX} ❌ RAZORPAY RESPONSE DATA:`,
      JSON.stringify(error?.response?.data, null, 2),
    );

    console.error(
      `${LOG_PREFIX} ❌ RAZORPAY RESPONSE HEADERS:`,
      JSON.stringify(error?.response?.headers, null, 2),
    );

    console.error(
      `${LOG_PREFIX} ❌ SDK ERROR OBJECT:`,
      JSON.stringify(error?.error, null, 2),
    );

    console.error(`${LOG_PREFIX} ❌ FULL ERROR:`, error);

    logDuration("TOTAL FAILED REQUEST TIME", requestStartTime);

    return res.status(error?.response?.status || 500).json({
      success: false,

      message:
        error?.response?.data?.error?.description ||
        error?.error?.description ||
        error?.message ||
        "Razorpay payout onboarding failed",

      razorpayError: error?.response?.data || error?.error || null,
    });
  }
};

// ======================================================
// API 2
// UPDATE PAYOUT ACCOUNT
// SUBMIT BANK DETAILS
// ======================================================

export const updatePayoutAccount = async (req: Request, res: Response) => {
  const requestStartTime = Date.now();

  logSection("UPDATE PAYOUT ACCOUNT API START");

  console.log(`${LOG_PREFIX} Method:`, req.method);

  console.log(`${LOG_PREFIX} URL:`, req.originalUrl);

  console.log(`${LOG_PREFIX} Content-Type:`, req.headers["content-type"]);

  console.log(`${LOG_PREFIX} Request body:`, {
    ...req.body,
    accountNumber: req.body?.accountNumber
      ? mask(req.body.accountNumber, 2, 2)
      : undefined,
  });

  try {
    const { userId, accountNumber, ifscCode, beneficiaryName } = req.body || {};

    console.log(`${LOG_PREFIX} userId:`, userId);

    console.log(`${LOG_PREFIX} IFSC:`, ifscCode);

    console.log(`${LOG_PREFIX} Account Number:`, mask(accountNumber, 2, 2));

    console.log(`${LOG_PREFIX} Beneficiary Name:`, beneficiaryName);

    // ==================================================
    // VALIDATION
    // ==================================================

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    if (!accountNumber || !ifscCode || !beneficiaryName) {
      return res.status(400).json({
        success: false,
        message: "accountNumber, ifscCode and beneficiaryName are required",
      });
    }

    // ==================================================
    // FIND USER
    // ==================================================

    console.log(`${LOG_PREFIX} 🔎 Finding user...`);

    const user = await User.findById(userId);

    if (!user) {
      console.error(`${LOG_PREFIX} ❌ User not found`);

      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    console.log(`${LOG_PREFIX} ✅ User found`);

    // ==================================================
    // FIND GATEWAY ACCOUNT
    // ==================================================

    console.log(`${LOG_PREFIX} 🔎 Finding Gateway Account...`);

    const gatewayAccount = await GatewayAccountModel.findOne({
      userId: user._id,
      gateway: "RAZORPAY",
    });

    if (!gatewayAccount) {
      console.error(`${LOG_PREFIX} ❌ Gateway Account not found`);

      return res.status(404).json({
        success: false,
        message:
          "Razorpay Gateway Account not found. Create payout account first.",
      });
    }

    console.log(`${LOG_PREFIX} ✅ Gateway Account found`);

    console.log(
      `${LOG_PREFIX} Razorpay Account ID:`,
      gatewayAccount.gatewayAccountId,
    );

    console.log(
      `${LOG_PREFIX} Razorpay Product ID:`,
      gatewayAccount.gatewayProductId,
    );

    if (!gatewayAccount.gatewayAccountId || !gatewayAccount.gatewayProductId) {
      console.error(`${LOG_PREFIX} ❌ Missing Razorpay account/product ID`);

      return res.status(400).json({
        success: false,
        message: "Razorpay account or product configuration ID is missing",
      });
    }

    // ==================================================
    // STEP 4
    // UPDATE PRODUCT CONFIGURATION
    // ==================================================

    logSection("STEP 4 — UPDATE ROUTE PRODUCT / BANK DETAILS");

    const updatePayload = {
      settlements: {
        account_number: String(accountNumber).trim(),

        ifsc_code: String(ifscCode).trim().toUpperCase(),

        beneficiary_name: String(beneficiaryName).trim(),
      },

      tnc_accepted: true,
    };

    console.log(`${LOG_PREFIX} 📤 Bank update payload:`, {
      settlements: {
        account_number: mask(updatePayload.settlements.account_number, 2, 2),

        ifsc_code: updatePayload.settlements.ifsc_code,

        beneficiary_name: updatePayload.settlements.beneficiary_name,
      },

      tnc_accepted: true,
    });

    const updateStartTime = Date.now();

    const updateResponse = await razorpayApi.patch(
      `/accounts/${gatewayAccount.gatewayAccountId}/products/${gatewayAccount.gatewayProductId}`,
      updatePayload,
    );

    logDuration("Bank details API completed", updateStartTime);

    const product = updateResponse.data;

    console.log(`${LOG_PREFIX} ✅ Route Product updated`);

    console.log(`${LOG_PREFIX} Activation Status:`, product?.activation_status);

    console.log(
      `${LOG_PREFIX} Requirements:`,
      JSON.stringify(product?.requirements, null, 2),
    );

    console.log(
      `${LOG_PREFIX} Requested Configuration:`,
      JSON.stringify(product?.requested_configuration, null, 2),
    );

    console.log(
      `${LOG_PREFIX} Active Configuration:`,
      JSON.stringify(product?.active_configuration, null, 2),
    );

    // ==================================================
    // UPDATE DATABASE
    // ==================================================

    gatewayAccount.onboardingStatus =
      product.activation_status || gatewayAccount.onboardingStatus;

    await gatewayAccount.save();

    console.log(`${LOG_PREFIX} 💾 Local Gateway Account status updated`);

    logDuration("TOTAL UPDATE REQUEST TIME", requestStartTime);

    return res.status(200).json({
      success: true,

      message:
        "Bank details submitted successfully for Razorpay Route verification",

      data: {
        gatewayAccountId: gatewayAccount._id,

        razorpayAccountId: gatewayAccount.gatewayAccountId,

        razorpayProductId: gatewayAccount.gatewayProductId,

        activationStatus: product.activation_status,

        requestedConfiguration: product.requested_configuration || null,

        activeConfiguration: product.active_configuration || null,

        requirements: product.requirements || [],
      },
    });
  } catch (error: any) {
    logSection("UPDATE PAYOUT ACCOUNT FAILED");

    console.error(`${LOG_PREFIX} Error Message:`, error?.message);

    console.error(`${LOG_PREFIX} Error Code:`, error?.code);

    console.error(`${LOG_PREFIX} HTTP Status:`, error?.response?.status);

    console.error(
      `${LOG_PREFIX} Response Data:`,
      JSON.stringify(error?.response?.data, null, 2),
    );

    console.error(
      `${LOG_PREFIX} Response Headers:`,
      JSON.stringify(error?.response?.headers, null, 2),
    );

    console.error(
      `${LOG_PREFIX} SDK Error:`,
      JSON.stringify(error?.error, null, 2),
    );

    logDuration("TOTAL FAILED UPDATE REQUEST TIME", requestStartTime);

    return res.status(error?.response?.status || 500).json({
      success: false,

      message:
        error?.response?.data?.error?.description ||
        error?.error?.description ||
        error?.message ||
        "Razorpay payout account update failed",

      razorpayError: error?.response?.data || error?.error || null,
    });
  }
};

// ======================================================
// API 3
// GET PAYOUT ACCOUNT STATUS
// ======================================================

export const getPayoutAccountStatus = async (req: Request, res: Response) => {
  const requestStartTime = Date.now();

  logSection("GET PAYOUT ACCOUNT STATUS API START");

  console.log(`${LOG_PREFIX} Method:`, req.method);

  console.log(`${LOG_PREFIX} URL:`, req.originalUrl);

  try {
    const { userId } = req.params;

    console.log(`${LOG_PREFIX} userId:`, userId);
    // ==================================================
    // TEMPORARY RAZORPAY API ACCESS TEST
    // ==================================================

    logSection("TEMPORARY RAZORPAY API ACCESS TEST");

    try {
      const testResponse = await razorpayApi.get(
        "/accounts/acc_TanNHh1o84tvft",
      );

      console.log(`${LOG_PREFIX} ✅ Razorpay API access working`);

      console.log(`${LOG_PREFIX} Status:`, testResponse.status);

      console.log(`${LOG_PREFIX} Account ID:`, testResponse.data?.id);

      console.log(`${LOG_PREFIX} Account Status:`, testResponse.data?.status);

      return res.status(200).json({
        success: true,
        razorpayApiWorking: true,
        status: testResponse.status,
        accountId: testResponse.data?.id,
        accountStatus: testResponse.data?.status,
      });
    } catch (error: any) {
      console.error(`${LOG_PREFIX} ❌ Razorpay API access failed`);

      console.error(`${LOG_PREFIX} Status:`, error?.response?.status);

      console.error(
        `${LOG_PREFIX} Response:`,
        JSON.stringify(error?.response?.data, null, 2),
      );

      return res.status(error?.response?.status || 500).json({
        success: false,
        razorpayApiWorking: false,
        message:
          error?.response?.data?.error?.description ||
          error?.message ||
          "Razorpay API test failed",
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    // ==================================================
    // FIND USER
    // ==================================================

    console.log(`${LOG_PREFIX} 🔎 Finding user...`);

    const user = await User.findById(userId);

    if (!user) {
      console.error(`${LOG_PREFIX} ❌ User not found`);

      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    console.log(`${LOG_PREFIX} ✅ User found`);

    // ==================================================
    // FIND GATEWAY ACCOUNT
    // ==================================================

    console.log(`${LOG_PREFIX} 🔎 Finding Gateway Account...`);

    const gatewayAccount = await GatewayAccountModel.findOne({
      userId: user._id,
      gateway: "RAZORPAY",
    });

    if (!gatewayAccount) {
      console.error(`${LOG_PREFIX} ❌ Gateway Account not found`);

      return res.status(404).json({
        success: false,
        message: "Razorpay Gateway Account not found",
      });
    }

    console.log(`${LOG_PREFIX} ✅ Gateway Account found`);

    console.log(
      `${LOG_PREFIX} Razorpay Account ID:`,
      gatewayAccount.gatewayAccountId,
    );

    console.log(
      `${LOG_PREFIX} Razorpay Product ID:`,
      gatewayAccount.gatewayProductId,
    );

    // ==================================================
    // FETCH LINKED ACCOUNT
    // ==================================================

    logSection("FETCH RAZORPAY LINKED ACCOUNT");

    const accountStartTime = Date.now();

    const razorpayAccount = await razorpay.accounts.fetch(
      gatewayAccount.gatewayAccountId,
    );

    logDuration("Linked Account fetch completed", accountStartTime);

    console.log(
      `${LOG_PREFIX} Account response:`,
      JSON.stringify(razorpayAccount, null, 2),
    );

    // ==================================================
    // FETCH ROUTE PRODUCT
    // ==================================================

    logSection("FETCH ROUTE PRODUCT");

    const productStartTime = Date.now();

    const productResponse = await razorpayApi.get(
      `/accounts/acc_TanNHh1o84tvft`,
    );

    console.log("[RAZORPAY GET TEST]", {
      status: productResponse.status,
      accountId: productResponse.data?.id,
      accountStatus: productResponse.data?.status,
    });

    logDuration("Route Product fetch completed", productStartTime);

    const product = productResponse.data;

    console.log(
      `${LOG_PREFIX} Product response:`,
      JSON.stringify(product, null, 2),
    );

    // ==================================================
    // UPDATE LOCAL STATUS
    // ==================================================

    gatewayAccount.accountStatus = razorpayAccount.status;

    gatewayAccount.onboardingStatus =
      product.activation_status || gatewayAccount.onboardingStatus;

    await gatewayAccount.save();

    console.log(`${LOG_PREFIX} 💾 Local status updated`);

    logDuration("TOTAL STATUS REQUEST TIME", requestStartTime);

    return res.status(200).json({
      success: true,

      message: "Razorpay payout account status fetched successfully",

      data: {
        gatewayAccountId: gatewayAccount._id,

        razorpayAccountId: gatewayAccount.gatewayAccountId,

        razorpayStakeholderId: gatewayAccount.gatewayStakeholderId,

        razorpayProductId: gatewayAccount.gatewayProductId,

        accountStatus: razorpayAccount.status,

        activationStatus: product.activation_status,

        requestedConfiguration: product.requested_configuration || null,

        activeConfiguration: product.active_configuration || null,

        requirements: product.requirements || [],
      },
    });
  } catch (error: any) {
    logSection("GET PAYOUT ACCOUNT STATUS FAILED");

    console.error(`${LOG_PREFIX} Error Message:`, error?.message);

    console.error(`${LOG_PREFIX} Error Code:`, error?.code);

    console.error(`${LOG_PREFIX} HTTP Status:`, error?.response?.status);

    console.error(
      `${LOG_PREFIX} Response Data:`,
      JSON.stringify(error?.response?.data, null, 2),
    );

    console.error(
      `${LOG_PREFIX} Response Headers:`,
      JSON.stringify(error?.response?.headers, null, 2),
    );

    console.error(
      `${LOG_PREFIX} SDK Error:`,
      JSON.stringify(error?.error, null, 2),
    );

    logDuration("TOTAL FAILED STATUS REQUEST TIME", requestStartTime);

    return res.status(error?.response?.status || 500).json({
      success: false,

      message:
        error?.response?.data?.error?.description ||
        error?.error?.description ||
        error?.message ||
        "Unable to fetch Razorpay payout account status",

      razorpayError: error?.response?.data || error?.error || null,
    });
  }
};
