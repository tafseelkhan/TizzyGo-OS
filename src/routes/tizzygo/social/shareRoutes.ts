import { Router } from "express";
import { addShare, getShareStats } from "../../../controller/tizzygo/social/shareController";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";
import Share from "../../../models/tizzygo/social/Share";

const router = Router();

router.post("/create", authMiddleware, addShare);
router.get("/stats/:productId", getShareStats);
// GET /s/:shareId
router.get("/s/:shareId", async (req, res) => {
  const { shareId } = req.params;
const share = await Share.findById(shareId);
if (!share) {
  return res.status(404).send("Invalid share link");
}

  const ua = req.headers["user-agent"] || "";
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad/i.test(ua);

  const appLink = `tizzygo://aircloud/s/${share.productId}`;
  const storeLink = isIOS
    ? "https://apps.apple.com/app/idYOUR_APP_ID"
    : "https://play.google.com/store/apps/details?id=com.tizzygo.app";

  // Update stats
  share.openCount = (share.openCount || 0) + 1;
  if (isAndroid) share.platformStats = { ...(share.platformStats || {}), android: ((share.platformStats?.android || 0) + 1) };
  else if (isIOS) share.platformStats = { ...(share.platformStats || {}), ios: ((share.platformStats?.ios || 0) + 1) };
  else share.platformStats = { ...(share.platformStats || {}), web: ((share.platformStats?.web || 0) + 1) };

  await share.save();

  res.send(`
    <html>
      <head>
        <meta http-equiv="refresh" content="0; url=${appLink}" />
        <script>
          setTimeout(() => { window.location = '${storeLink}'; }, 1500);
        </script>
      </head>
      <body>Redirecting...</body>
    </html>
  `);
});
export default router;
