import { Schema, Document } from 'mongoose';
import tizzyosConnection from '../../../lib/tizzyos/tizzyosDb';

interface IPendingDetails {
  reason: string;
  durationInDays: number;
}

export interface ISellerApplication extends Document {
  uniqOsId?: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  address: {
    full: string;
    pincode: string;
    city: string;
    state: string;
    country: string;
  };
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  pendingDetails?: IPendingDetails;
  createdAt: Date;
}

const SellerApplicationSchema = new Schema<ISellerApplication>({
  uniqOsId: {
    type: String,
    required: function () {
      return this.status === 'approved';
    },
    unique: true,
  },
  userId: { type: String, required: true },
  fullName: { type: String },
  email: { type: String },
  phone: { type: String },
  address: {
    full: { type: String },
    pincode: { type: String },
    city: { type: String },
    state: { type: String },
    country: { type: String },
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  rejectionReason: { type: String },
  pendingDetails: {
    reason: String,
    durationInDays: Number,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default tizzyosConnection.models.SellerApplication ||
  tizzyosConnection.model<ISellerApplication>('SellerApplication', SellerApplicationSchema);
