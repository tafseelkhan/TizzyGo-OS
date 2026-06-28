// models/employee.model.ts
import mongoose, { Schema, Document } from "mongoose";

export interface IEmployee extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  email: string;
  phone: string;
  role: "MANAGER" | "SUPERVISOR" | "SCANNER" | "PACKER" | "DISPATCHER";
  fwsCode: string;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  isActive: boolean;
  joiningDate: Date;
  address?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EmployeeSchema = new Schema<IEmployee>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      required: true,
      enum: ["MANAGER", "SUPERVISOR", "SCANNER", "PACKER", "DISPATCHER"],
      default: "SCANNER",
    },
    fwsCode: {
      type: String,
      required: true,
    },
    // ✅ New Approval Fields
    approvalStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"],
      default: "PENDING",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    joiningDate: {
      type: Date,
      default: Date.now,
    },
    address: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for better query performance
EmployeeSchema.index({ warehouseId: 1 });
EmployeeSchema.index({ role: 1 });
EmployeeSchema.index({ isActive: 1 });
EmployeeSchema.index({ userId: 1 });

export const Employee = mongoose.model<IEmployee>("Employee", EmployeeSchema);
