// services/auth/profileService.ts

import mongoose from "mongoose";

import {
  APP_ROLES,
  type AppName,
  type AppRole,
} from "../../../models/auth/user.schema";

import { getQutonConnectModels } from "../../../config/tizzygo/qutonConnectDatabase";

// ============================================================
// CONSTANTS
// ============================================================

/**
 * Only TIZZYOS is allowed for self-service app/role updates.
 * Inside TIZZYOS, any combination of these roles can be
 * self-assigned (one or many, no duplicates).
 */
const ALLOWED_APP: AppName = "TIZZYOS";
const ALLOWED_ROLES: readonly AppRole[] = [
  "SELLER",
  "FWS",
  "SHIPPING",
  "CAB",
  "RENT",
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getAuthModels() {
  return getQutonConnectModels();
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
// UPDATE APP-SPECIFIC ROLES (TIZZYOS ONLY)
//
// User can select ONE OR MANY of:
//   SELLER, FWS, SHIPPING, CAB, RENT
// Duplicates are rejected. At least one role is required.
// ============================================================

export async function updateAppRole(
  userId: string,
  app: string,
  roles: string[],
) {
  const { User } = getAuthModels();

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
  }

  // Only TIZZYOS allowed
  if (app !== ALLOWED_APP) {
    throw new Error(`Only ${ALLOWED_APP} app can be updated`);
  }

  const appName = app as AppName;

  // Roles must be a non-empty array of strings
  if (!Array.isArray(roles) || roles.length === 0) {
    throw new Error("At least one role must be selected");
  }

  if (!roles.every((role) => typeof role === "string")) {
    throw new Error("Roles must be an array of strings");
  }

  // No duplicates allowed
  const uniqueRoles = [...new Set(roles)];
  if (uniqueRoles.length !== roles.length) {
    throw new Error("Duplicate roles are not allowed");
  }

  // Every role must be valid in schema for this app
  const schemaRoles = APP_ROLES[appName] as readonly string[];
  for (const role of uniqueRoles) {
    if (!schemaRoles.includes(role)) {
      throw new Error(`Role "${role}" is not valid for ${appName}`);
    }
  }

  // Every role must be in the self-assignable whitelist
  for (const role of uniqueRoles) {
    if (!ALLOWED_ROLES.includes(role as AppRole)) {
      throw new Error(
        `Role "${role}" cannot be self-assigned. Contact support if you need this role.`,
      );
    }
  }

  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const apps = serializeApps(user.apps);
  const existingIndex = apps.findIndex((entry) => entry.app === appName);

  const assignedRoles = uniqueRoles as AppRole[];

  if (existingIndex >= 0) {
    apps[existingIndex] = { app: appName, roles: assignedRoles };
  } else {
    apps.push({ app: appName, roles: assignedRoles });
  }

  user.apps = apps;
  user.markModified("apps");
  await user.save();

  return {
    apps: serializeApps(user.apps),
    activeApp: appName,
    activeRoles: assignedRoles,
    message: `${appName} roles updated to [${assignedRoles.join(", ")}]. Effective immediately.`,
  };
}