import { Request, Response } from "express";
import Register from "../../../../models/tizzyos/shipping/fws/fwsRegistration";

export const riderOnlineStatusController = async (
  req: Request,
  res: Response
) => {
  console.log("=== RIDER ONLINE STATUS CONTROLLER STARTED ===");
  console.log("Request received at:", new Date().toISOString());
  
  try {
    const userId = req.user?.id || req.body.riderId; // userId naam se rakhna better hai
    console.log("Extracted userId:", userId);
    console.log("Request body:", JSON.stringify(req.body, null, 2));

    const { isOnline } = req.body;
    console.log("isOnline value:", isOnline, "Type:", typeof isOnline);

    if (!userId) {
      console.log("❌ Validation failed: User ID is missing");
      return res.status(400).json({
        success: false,
        message: "User ID missing"
      });
    }

    if (typeof isOnline !== "boolean") {
      console.log("❌ Validation failed: isOnline is not boolean");
      return res.status(400).json({
        success: false,
        message: "isOnline must be boolean"
      });
    }

    console.log("✅ All validations passed");

    const updateData: any = {
      isOnline
    };

    if (isOnline) {
      updateData.lastOnlineAt = new Date();
      console.log("🟢 Rider going ONLINE, setting lastOnlineAt:", updateData.lastOnlineAt);
    } else {
      updateData.lastOfflineAt = new Date();
      console.log("🔴 Rider going OFFLINE, setting lastOfflineAt:", updateData.lastOfflineAt);
    }

    console.log("Update data to be sent to DB:", JSON.stringify(updateData, null, 2));
    console.log("Searching rider with userId:", userId);

    // YAHAN CHANGE KARO: findByIdAndUpdate ki jagah findOneAndUpdate
    const rider = await Register.findOneAndUpdate(
      { userId: userId }, // userId field se search karo
      { $set: updateData },
      { new: true }
    );

    console.log("Database update result:", rider ? "Success" : "No rider found");

    if (!rider) {
      console.log("❌ Rider not found in database for userId:", userId);
      return res.status(404).json({
        success: false,
        message: "Rider not found"
      });
    }

    console.log("✅ Rider status updated successfully");
    console.log("Updated rider data:", {
      riderId: rider._id,
      userId: rider.userId,
      isOnline: rider.isOnline,
      lastOnlineAt: rider.lastOnlineAt,
      lastOfflineAt: rider.lastOfflineAt
    });

    return res.status(200).json({
      success: true,
      message: isOnline
        ? "Rider is now ONLINE"
        : "Rider is now OFFLINE",
      data: {
        riderId: rider._id,
        userId: rider.userId,
        isOnline: rider.isOnline,
        lastOnlineAt: rider.lastOnlineAt,
        lastOfflineAt: rider.lastOfflineAt
      }
    });

  } catch (error) {
    console.error("❌ ERROR in riderOnlineStatusController:", error);
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
    console.error("Error occurred at:", new Date().toISOString());
    
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  } finally {
    console.log("=== RIDER ONLINE STATUS CONTROLLER ENDED ===");
    console.log("\n");
  }
};