// import { Request, Response } from "express";
// import Stripe from "stripe";
// import Seller from "../../../../../models/tizzyos/seller/PayOut/Portal/wallet";

// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
//   apiVersion: "2025-09-30.clover",
// });

// // ==============================
// // Create Stripe Account for seller
// // ==============================
// export const createSellerAccount = async (req: Request, res: Response) => {
//   console.log("➡️ [CREATE SELLER ACCOUNT] API called");
//   console.log("📥 Request body:", req.body);

//   try {
//     const { name, email } = req.body;

//     if (!name || !email) {
//       console.log("❌ Missing name or email");
//       return res.status(400).json({
//         success: false,
//         message: "Name and email are required",
//       });
//     }

//     console.log("🔄 Creating Stripe Express account...");
//     const account = await stripe.accounts.create({
//       type: "express",
//       country: "IN",
//       email,
//     });

//     console.log("✅ Stripe account created:", {
//       stripeAccountId: account.id,
//     });

//     console.log("💾 Saving seller to DB...");
//     const seller = new Seller({
//       name,
//       email,
//       stripeAccountId: account.id,
//     });

//     await seller.save();

//     console.log("✅ Seller saved in DB:", seller._id);

//     res.status(201).json({
//       success: true,
//       seller,
//     });
//   } catch (error: any) {
//     console.error("🔥 Error in createSellerAccount:", error);

//     res.status(500).json({
//       success: false,
//       error: error.message,
//     });
//   }
// };

// // ==============================
// // Change payout mode (auto / manual)
// // ==============================
// export const setPayoutMode = async (req: Request, res: Response) => {
//   console.log("➡️ [SET PAYOUT MODE] API called");
//   console.log("📌 Params:", req.params);
//   console.log("📥 Body:", req.body);

//   try {
//     const { sellerId } = req.params;
//     const { payoutMode } = req.body;

//     if (!["automatic", "manual"].includes(payoutMode)) {
//       console.log("❌ Invalid payout mode:", payoutMode);
//       return res.status(400).json({
//         success: false,
//         message: "Invalid payoutMode. Use 'automatic' or 'manual'",
//       });
//     }

//     console.log(`🔄 Updating payout mode to "${payoutMode}" for seller:`, sellerId);

//     const seller = await Seller.findByIdAndUpdate(
//       sellerId,
//       { payoutMode },
//       { new: true }
//     );

//     if (!seller) {
//       console.log("❌ Seller not found:", sellerId);
//       return res.status(404).json({
//         success: false,
//         message: "Seller not found",
//       });
//     }

//     console.log("✅ Payout mode updated successfully");

//     res.status(200).json({
//       success: true,
//       seller,
//     });
//   } catch (error: any) {
//     console.error("🔥 Error in setPayoutMode:", error);

//     res.status(500).json({
//       success: false,
//       error: error.message,
//     });
//   }
// };
