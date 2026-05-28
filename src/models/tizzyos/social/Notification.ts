import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  recipient: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  product: mongoose.Types.ObjectId;
  type: string;
  message: string;
  createdAt: Date;
  isRead: boolean;
}

const notificationSchema = new Schema<INotification>({
  recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  sender: { type: Schema.Types.ObjectId, ref: 'User' },
  product: { type: Schema.Types.ObjectId, ref: 'Product' },
  type: { type: String, enum: ['like', 'dislike', 'comment', 'reply', 'share', 'rating'], required: true },
  message: String,
  createdAt: { type: Date, default: Date.now },
  isRead: { type: Boolean, default: false }
});

export default mongoose.model<INotification>('Notification', notificationSchema);
