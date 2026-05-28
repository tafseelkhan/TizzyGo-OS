// models/Payment.ts
import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  plan: { type: String, required: true },
  amount: { type: Number, required: true },
  method: { type: String, required: true },
  scriptPath: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
export default Payment;
