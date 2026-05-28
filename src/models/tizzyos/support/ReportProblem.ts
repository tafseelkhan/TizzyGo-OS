// models/support/ReportProblem.ts

import mongoose from 'mongoose';

const reportProblemSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    image: {
      type: String,
    },
    imagePath: {
      type: String,
    },
    // ✅ Reply by admin/company
    reply: {
      type: String,
      default: '',
    },
    repliedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

export const ReportProblem = mongoose.model('ReportProblem', reportProblemSchema);
