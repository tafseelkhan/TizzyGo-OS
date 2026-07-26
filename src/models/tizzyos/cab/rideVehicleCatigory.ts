// models/rides/RideVehicleCategory.ts
import mongoose, { Document, Schema } from "mongoose";

interface IModel {
  name: string;
  code: string;
  vehicleType: string;
  vehicleClass: string; // Changed from 'class'
  baseFare: number;
  classFare: number;
  maxPassengers: number;

  // New fields
  hasAC: boolean;
  luggageCapacity: number;
  handBagCapacity: number;
  seatCapacity: number;
  passengerCapacity: number;
}

interface ICompany {
  name: string;
  code: string;
  models: IModel[];
}

interface IRideVehicleCategory extends Document {
  category: string;
  code: string;
  companies: ICompany[];
}

const ModelSchema = new Schema<IModel>({
  name: { type: String, required: true },
  code: { type: String, required: true },
  vehicleType: { type: String, required: true },
  vehicleClass: {
    type: String,
    required: true,
    enum: ["Economy", "Standard", "Comfort", "Premium", "Luxury"],
  },
  baseFare: { type: Number, required: true },
  classFare: { type: Number, required: true },
  maxPassengers: { type: Number, required: true },

  // New fields
  hasAC: { type: Boolean, required: true },
  luggageCapacity: { type: Number, required: true },
  handBagCapacity: { type: Number, required: true },
  seatCapacity: { type: Number, required: true },
  passengerCapacity: { type: Number, required: true },
});

const CompanySchema = new Schema<ICompany>({
  name: { type: String, required: true },
  code: { type: String, required: true },
  models: { type: [ModelSchema], required: true },
});

const RideVehicleCategorySchema = new Schema<IRideVehicleCategory>(
  {
    category: { type: String, required: true },
    code: { type: String, required: true },
    companies: { type: [CompanySchema], required: true },
  },
  {
    collection: "ridevehiclecategories",
    timestamps: true, // Recommended
  },
);

export default mongoose.model<IRideVehicleCategory>(
  "RideVehicleCategory",
  RideVehicleCategorySchema,
);
