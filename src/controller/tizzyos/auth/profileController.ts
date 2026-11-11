// controllers/auth/profileController.ts

import type { Response } from "express";

import { updateAppRole } from "../../../services/tizzyos/auth/profileService";

import type { AuthenticatedRequest } from "../../../middleware/authMiddleware";

/**
 * UPDATE APP ROLES (TIZZYOS ONLY)
 *
 * Allows a logged-in user to set their TIZZYOS roles.
 * - Only app = "TIZZYOS" is accepted.
 * - roles must be a non-empty array of strings.
 * - Allowed values: SELLER, FWS, SHIPPING, CAB, RENT
 * - Duplicates are rejected by the service layer.
 *
 * Requires authMiddleware (req.userId must be set).
 */
export async function updateAppRoleHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { app, roles } = req.body ?? {};

    if (typeof app !== "string" || !app.trim()) {
      return res.status(400).json({
        success: false,
        message: "App is required",
      });
    }

    if (!Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one role must be selected",
      });
    }

    if (!roles.every((role: unknown) => typeof role === "string")) {
      return res.status(400).json({
        success: false,
        message: "Roles must be an array of strings",
      });
    }

    const result = await updateAppRole(req.userId, app, roles);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Update app roles error:", error);

    return res.status(400).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to update app roles",
    });
  }
}