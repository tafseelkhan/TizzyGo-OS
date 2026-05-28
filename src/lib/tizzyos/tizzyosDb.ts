// lib/tizzyosDb.ts
import mongoose from 'mongoose';

const uri = process.env.TIZZYOS_DB_URI!;

const tizzyosConnection = mongoose.createConnection(uri); // ✅ No need for options

tizzyosConnection.on('connected', () => {
  console.log('🧩 Connected to TizzyOS DB');
});

export default tizzyosConnection;
