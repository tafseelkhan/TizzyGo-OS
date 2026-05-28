import mongoose, { Schema, Document } from "mongoose";
import { Rider } from "../../types/tizzyos/rider";

const RiderSchema: Schema = new Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    fullName: { type: String, required: true },
    dateOfBirth: { type: Date, required: true },
    gender: { type: String, enum: ["Male", "Female", "Other"], required: true },
    phoneNumber: { type: String, required: true, match: /^[0-9]{10}$/ },
    email: { type: String, required: true, match: /.+\@.+\..+/ },
    currentAddress: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true, match: /^[0-9]{6}$/ },

    // Documents
    aadhaarNumber: { type: String, sparse: true },
    panNumber: { type: String, sparse: true },
    aadhaarFrontImage: { type: String },
    aadhaarBackImage: { type: String },
    panFrontImage: { type: String },
    panBackImage: { type: String },
    drivingLicenseNumber: { type: String, required: true },
    licenseExpiryDate: { type: Date, required: true },
    drivingLicensePhoto: { type: String, required: true },

    // Vehicle Info
    vehicleType: {
      type: String,
      enum: ["Auto", "Bike", "Scooter", "Car"],
      required: true,
    },
    vehicleCompany: { type: String, required: true }, // ✅ New field
    vehicleModel: { type: String, required: true }, // ✅ New field
    vehicleRegistrationNumber: { type: String, required: true },
    vehicleInsuranceCopy: { type: String, required: true },

    // Rider Status
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
    UniqueOSRiderId: { type: String, unique: true, sparse: true },
    reason: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model<Rider & Document>("Rider", RiderSchema);
