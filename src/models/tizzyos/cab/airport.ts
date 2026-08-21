import mongoose, { Schema, Document } from "mongoose";

export interface IAirport extends Document {
  airportName: string;
  otherName?: string;
  state?: string;
  elevationMeters?: number;
  runwayDesignation?: string;
  runwayDimension?: string;
  operatorOwner?: string;
  schedule?: string;
  source?: string;
  boundary: {
    type: "Polygon";
    coordinates: number[][][];
  };
  sourceObjectId?: any;
  dataSource?: string;
  dataVersion?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AirportSchema = new Schema<IAirport>(
  {
    airportName: {
      type: String,
      required: true,
      index: true,
    },
    otherName: {
      type: String,
    },
    state: {
      type: String,
    },
    elevationMeters: {
      type: Number,
    },
    runwayDesignation: {
      type: String,
    },
    runwayDimension: {
      type: String,
    },
    operatorOwner: {
      type: String,
    },
    schedule: {
      type: String,
    },
    source: {
      type: String,
    },
    boundary: {
      type: {
        type: String,
        enum: ["Polygon"],
        required: true,
        default: "Polygon",
      },
      coordinates: {
        type: [[[Number]]],
        required: true,
        index: "2dsphere",
      },
    },
    sourceObjectId: {
      type: Schema.Types.Mixed,
    },
    dataSource: {
      type: String,
    },
    dataVersion: {
      type: String,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "airports",
    timestamps: true,
  }
);

// Ensure 2dsphere index on boundary
// This ensures the index exists even if not defined in schema
AirportSchema.index({ boundary: "2dsphere" });

export default mongoose.model<IAirport>("Airport", AirportSchema);  