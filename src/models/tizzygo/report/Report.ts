// src/models/Report.ts
import { Schema, model, Document, Types } from "mongoose";

export type ReportStatus = "pending" | "approved" | "rejected" | "action_taken";

export interface IReport extends Document {
  rpId: string;                 // e.g., RP-20250811-abc123
  user: any;                    // store full user object (as required)
  product: any;                 // store full product object
  menu: string;                 // menu (e.g., "Spam")
  submenu: string;              // sub menu (e.g., "User Spam")
  description?: string;
  images: string[];             // array of file urls (optional)
  source: "user" | "system";    // who submitted (user or system/admin)
  status: ReportStatus;
  adminNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReportSchema = new Schema<IReport>(
  {
    rpId: { type: String, required: true, unique: true },
    user: { type: Schema.Types.Mixed, required: true },
    product: { type: Schema.Types.Mixed, required: true },
    menu: { type: String, required: true },
    submenu: { type: String, required: true },
    description: { type: String },
    images: { type: [String], default: [] },
    source: { type: String, enum: ["user", "system"], default: "user" },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "action_taken"],
      default: "pending",
    },
    adminNotes: { type: String },
  },
  { timestamps: true }
);

export default model<IReport>("Report", ReportSchema);
