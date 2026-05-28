import mongoose from 'mongoose';

const userRoleSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  role: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
});

const UserRole = mongoose.models.UserRole || mongoose.model('UserRole', userRoleSchema);
export default UserRole;