// ✅ routes/auths/profileRoutes.ts
import express from "express";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";
import { getProfile, updateProfile } from "../../../controller/tizzyos/auths/profileController";

const router = express.Router();

function asyncHandler(
  fn: (req: express.Request, res: express.Response, next: express.NextFunction) => any
) {
  return function (req: express.Request, res: express.Response, next: express.NextFunction): void {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ✅ GET /api/profile/me
router.get("/me", authMiddleware, asyncHandler(getProfile));

// ✅ PUT /api/profile/update with multer
router.put("/update", authMiddleware, asyncHandler(updateProfile));

export default router;