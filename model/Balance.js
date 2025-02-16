// models/Balance.js
import mongoose from 'mongoose';

const balanceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  totalBalance: {
    type: Number,
    default: 0
  },
  adminAdd: {
    type: Number,
    default: 0
  },
  miningBalance: {
    type: Number,
    default: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('Balance', balanceSchema);