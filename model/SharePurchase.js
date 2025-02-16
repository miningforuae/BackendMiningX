// SharePurchase.js
import mongoose from 'mongoose';

const sharePurchaseSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  machine: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MiningMachine',
    required: true
  },
  numberOfShares: {
    type: Number,
    required: true,
    min: 1
  },
  pricePerShare: {
    type: Number,
    required: true
  },
  profitPerShare: {
    type: Number,
    required: true
  },
  totalInvestment: {
    type: Number,
    required: true
  },
  purchaseDate: {
    type: Date,
    default: Date.now
  },
  lastProfitUpdate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  }
}, {
  timestamps: true
});

export default mongoose.model('SharePurchase', sharePurchaseSchema);