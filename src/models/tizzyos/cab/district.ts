import mongoose, { Document, Schema } from "mongoose";

export interface IDistricts extends Document {
  name: string;
  shapeId: string;
  shapeGroup: string;
  shapeType: string;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: any; // GeoJSON coordinates - [longitude, latitude]
  };
  createdAt: Date;
  updatedAt: Date;
}

const DistrictsSchema = new Schema<IDistricts>(
  {
    name: {
      type: String,
      required: true,
      index: true,
    },
    shapeId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    shapeGroup: {
      type: String,
      required: true,
      default: "IND",
    },
    shapeType: {
      type: String,
      required: true,
      default: "ADM2",
    },
    geometry: {
      type: {
        type: String,
        enum: ["Polygon", "MultiPolygon"],
        required: true,
      },
      coordinates: {
        type: Schema.Types.Mixed,
        required: true,
      },
    },
  },
  {
    timestamps: true,
  },
);

// ✅ CRITICAL: GeoJSON 2dsphere index for geospatial queries
DistrictsSchema.index({ geometry: "2dsphere" });

export default mongoose.model<IDistricts>("Districts", DistrictsSchema);
