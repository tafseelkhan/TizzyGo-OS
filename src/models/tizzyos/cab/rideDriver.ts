// models/rides/RideDriver.ts

import mongoose, { Document, Schema } from "mongoose";

export interface IRideDriver extends Document {
  userId: mongoose.Types.ObjectId;
  driverCode: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  licenceNumber: string;
  licenceExpiryDate: Date;
  licenceFront: string;
  licenceBack: string;
  vehicle: {
    categoryCode: string;
    companyCode: string;
    modelCode: string;
    vehicleNumber: string;
    vehicleColor: string;
    manufacturingYear: number;
  };
  documents: {
    rcFront: string;
    rcBack: string;
    insurance: string;
    pollutionCertificate: string;
  };
}

const RideDriverSchema = new Schema<IRideDriver>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    driverCode: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "suspended"],
      default: "pending",
      required: true,
    },
    licenceNumber: {
      type: String,
      required: true,
    },
    licenceExpiryDate: {
      type: Date,
      required: true,
    },
    licenceFront: {
      type: String,
      required: true,
    },
    licenceBack: {
      type: String,
      required: true,
    },
    vehicle: {
      categoryCode: {
        type: String,
        required: true,
      },
      companyCode: {
        type: String,
        required: true,
      },
      modelCode: {
        type: String,
        required: true,
      },
      vehicleNumber: {
        type: String,
        required: true,
        uppercase: true,
        trim: true,
      },
      vehicleColor: {
        type: String,
        required: true,
      },
      manufacturingYear: {
        type: Number,
        required: true,
      },
    },
    documents: {
      rcFront: {
        type: String,
        required: true,
      },
      rcBack: {
        type: String,
        required: true,
      },
      insurance: {
        type: String,
        required: false,
      },
      pollutionCertificate: {
        type: String,
        required: false,
      },
    },
  },
  {
    timestamps: true,
  },
);

RideDriverSchema.index({ userId: 1 }, { unique: true });

export default mongoose.model<IRideDriver>("RideDriver", RideDriverSchema);
