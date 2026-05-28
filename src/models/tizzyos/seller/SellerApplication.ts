import mongoose, { Schema, Document } from 'mongoose';

export interface ISellerApplication extends Document {
  uniqOsId: string;
  userId: string; // ✅ FIXED: string instead of ObjectId
  modelType: 'seller';
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
  documents: {
    type: string;
    pages: {
      url: string;
      side?: 'front' | 'back';
      ocrData?: Record<string, any>;
    }[];
  }[];
  business: {
    name: string;
    gst?: string;
    category?: string;
  };
  optionalDocs?: {
    name: string;
    url: string;
  }[];
  status: 'pending' | 'approved' | 'rejected';
  approvedDocument?: 'aadhaar' | 'pan';
  ocrExtractedText?: string;
  createdAt: Date;
}

const SellerApplicationSchema: Schema = new Schema<ISellerApplication>({
  uniqOsId: {
  type: String,
  unique: true,
  sparse: true // ✅ this is the fix!
},

  userId: {
    type: String,
    required: true, // ✅ Removed `ref` to avoid confusion with ObjectId
  },

  modelType: {
    type: String,
    enum: ['seller'],
    default: 'seller',
  },

  fullName: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },

  address: {
    full: { type: String, required: true },
    pincode: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, required: true },
  },

  documents: [
    {
      type: { type: String, required: true },
      pages: [
        {
          url: { type: String, required: true },
          side: { type: String, enum: ['front', 'back'] },
          ocrData: { type: Schema.Types.Mixed },
        },
      ],
    },
  ],

  business: {
    name: { type: String, required: true },
    gst: { type: String },
    category: { type: String, required: true },
  },

  optionalDocs: [
    {
      name: { type: String },
      url: { type: String },
    },
  ],

  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },

  approvedDocument: {
    type: String,
    enum: ['aadhaar', 'pan'],
  },

  ocrExtractedText: {
    type: String,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.models.SellerApplication ||
  mongoose.model<ISellerApplication>('SellerApplication', SellerApplicationSchema);
