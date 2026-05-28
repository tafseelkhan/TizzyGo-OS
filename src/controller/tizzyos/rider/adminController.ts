import { Request, Response } from 'express';
import Rider from '../../../models/tizzyos/rider/Rider';
import { riderEmailHelper } from './helpers/emailHelper';
import crypto from "crypto";

export const getRiderDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const rider = await Rider.findById(req.params.id);
    if (!rider) {
      res.status(404).json({ error: 'Rider not found' });
      return;
    }
    res.json(rider);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const getRidersList = async (req: Request, res: Response): Promise<void> => {
  try {
    // Optionally, filter by status if query param hai
    const { status } = req.query;
    const filter: any = {};
    if (status) filter.status = status;

    const riders = await Rider.find(filter).sort({ createdAt: -1 }); // latest first

    res.json({ success: true, data: riders });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

function generateRiderId(): string {
  // Random 8-byte number → BigInt → base36
  const random = BigInt("0x" + crypto.randomBytes(8).toString("hex"));
  return "rider_" + random.toString(36);
}

export const approveRider = async (req: Request, res: Response): Promise<void> => {
  try {
    const rider = await Rider.findById(req.params.id);
    if (!rider) {
      res.status(404).json({ error: "Rider not found" });
      return;
    }

    const randomId = generateRiderId();

    rider.status = "Approved";
    rider.riderId = randomId;
    rider.reason = undefined;
    await rider.save();

    // Send approval email
    await riderEmailHelper.sendApprovalEmail(rider.email, rider.fullName, rider.riderId);

    res.json({ message: "Rider approved", riderId: rider.riderId });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const pendingRider = async (req: Request, res: Response): Promise<void> => {
  try {
    const { reason } = req.body;
    const rider = await Rider.findById(req.params.id);

    if (!rider) {
      res.status(404).json({ error: "Rider not found" });
      return;
    }

    rider.status = "Pending";
    rider.reason = reason;
    rider.riderId = undefined;
    await rider.save();

    // Send pending email
    await riderEmailHelper.sendPendingEmail(rider.email, rider.fullName, reason);

    res.json({ message: "Rider marked as pending" });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const rejectRider = async (req: Request, res: Response): Promise<void> => {
  try {
    const { reason } = req.body;
    const rider = await Rider.findById(req.params.id);

    if (!rider) {
      res.status(404).json({ error: "Rider not found" });
      return;
    }

    rider.status = "Rejected";
    rider.reason = reason;
    rider.riderId = undefined;
    await rider.save();

    // Send rejection email
    await riderEmailHelper.sendRejectionEmail(rider.email, rider.fullName, reason);

    res.json({ message: "Rider rejected" });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};