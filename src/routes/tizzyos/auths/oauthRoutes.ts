import express from "express";
import { googleLogin } from "../../../controller/tizzyos/auths/googleController";
import { facebookLogin } from "../../../controller/tizzyos/auths/facebookController";

const router = express.Router();

// ✅ Google Login route
import { RequestHandler } from "express";

router.post("/google", googleLogin as RequestHandler);

// ✅ Facebook Login route
router.post("/facebook", facebookLogin);

export default router;
