import mongoose, { Schema, Document, Model } from "mongoose";

export interface IMediaUploadTracker extends Document {
  fileUrl: string;
  filePath: string;
  uploadedBy: mongoose.Types.ObjectId;
  status: "PENDING" | "USED" | "DELETED";
  createdAt: Date;
  lastCheckedAt: Date;
  usedInProduct: boolean;
  deleted: boolean;
  checkedCount: number;
  lastError?: string;
}

const MediaUploadTrackerSchema = new Schema<IMediaUploadTracker>(
  {
    fileUrl: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    filePath: {
      type: String,
      required: true,
      index: true,
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "USED", "DELETED"],
      default: "PENDING",
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    lastCheckedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    usedInProduct: {
      type: Boolean,
      default: false,
      index: true,
    },
    deleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    checkedCount: {
      type: Number,
      default: 0,
    },
    lastError: {
      type: String,
    },
  },
  {
    timestamps: true,
    collection: "mediauploadtrackers",
  },
);

// Compound indexes for efficient batch processing
MediaUploadTrackerSchema.index(
  { status: 1, createdAt: 1, deleted: 1 },
  { name: "cleanup_batch_idx" },
);

// Index for checking files older than 24 hours
MediaUploadTrackerSchema.index(
  { status: 1, createdAt: 1 },
  { name: "pending_old_idx" },
);

// Index for product reference lookups
MediaUploadTrackerSchema.index(
  { fileUrl: 1, status: 1 },
  { name: "fileurl_status_idx" },
);

export const MediaUploadTracker: Model<IMediaUploadTracker> =
  mongoose.model<IMediaUploadTracker>(
    "MediaUploadTracker",
    MediaUploadTrackerSchema,
  );
