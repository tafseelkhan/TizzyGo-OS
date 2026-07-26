// models/rides/RideDriver.ts
import mongoose, { Document, Schema } from "mongoose";

export interface IRideDriver extends Document {
  userId: mongoose.Types.ObjectId;
  driverCode: string;
  rideTypeCode: string; // ✅ New
  status: "pending" | "approved" | "rejected" | "suspended";

  // Licence Details
  licenceNumber: string;
  licenceExpiryDate: Date;
  licenceFront: string;
  licenceBack: string;

  // Vehicle Details - Complete as per JSON
  vehicle: {
    categoryCode: string;
    companyCode: string;
    modelCode: string;
    vehicleNumber: string;
    vehicleColor: string;
    manufacturingYear: number;

    // ✅ New fields from JSON
    vehicleType: string;
    vehicleClass: string;
    baseFare: number;
    classFare: number;
    maxPassengers: number;
    hasAC: boolean;
    luggageCapacity: number;
    handBagCapacity: number;
    seatCapacity: number;
    passengerCapacity: number;
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
      unique: true,
      required: true,
    },
    driverCode: { type: String, required: true, unique: true },
    rideTypeCode: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "suspended"],
      default: "pending",
    },
    licenceNumber: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    licenceExpiryDate: { type: Date, required: true },
    licenceFront: { type: String, required: true },
    licenceBack: { type: String, required: true },

    vehicle: {
      categoryCode: {
        type: String,
        required: true,
        uppercase: true,
        trim: true,
      },
      companyCode: {
        type: String,
        required: true,
        uppercase: true,
        trim: true,
      },
      modelCode: { type: String, required: true, uppercase: true, trim: true },
      vehicleNumber: {
        type: String,
        required: true,
        uppercase: true,
        trim: true,
      },
      vehicleColor: { type: String, required: true, trim: true },
      manufacturingYear: { type: Number, required: true },

      // ✅ New fields
      vehicleType: { type: String, required: true },
      vehicleClass: { type: String, required: true },
      baseFare: { type: Number, required: true },
      classFare: { type: Number, required: true },
      maxPassengers: { type: Number, required: true },
      hasAC: { type: Boolean, required: true },
      luggageCapacity: { type: Number, required: true },
      handBagCapacity: { type: Number, required: true },
      seatCapacity: { type: Number, required: true },
      passengerCapacity: { type: Number, required: true },
    },

    documents: {
      rcFront: { type: String, required: true },
      rcBack: { type: String, required: true },
      insurance: { type: String, default: "" },
      pollutionCertificate: { type: String, default: "" },
    },
  },
  { timestamps: true },
);

RideDriverSchema.index({ rideTypeCode: 1 });

export default mongoose.model<IRideDriver>("RideDriver", RideDriverSchema);
