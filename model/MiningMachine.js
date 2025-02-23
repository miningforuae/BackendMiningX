import mongoose from 'mongoose';

const miningMachineSchema = new mongoose.Schema({
  machineName: {
    type: String,
    required: [true, 'Machine name is required'],
    trim: true
  },
  hashrate: {
    type: String,
    required: [true, 'Hashrate is required']
  },
  powerConsumption: {
    type: Number,
    required: [true, 'Power consumption is required']
  },
  priceRange: {
    type: Number,
    required: [true, 'Price range is required']
  },
  coinsMined: {
    type: String,
    required: [true, 'Coins mined information is required']
  },
  monthlyProfit: {
    type: Number,
    required: [true, 'Monthly profit estimation is required']
  },
 
  description: {
    type: String,
    required: [true, 'Description is required']
  },
  images: [{
    type: String  
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },

  isShareBased: {
    type: Boolean,
    default: false
  },
  sharePrice: {
    type: Number,
    default: 50  // Default share price as per requirement
  },
  availableShares: {
    type: Number,
    default: 380  // Total shares as per requirement
  },
  profitPerShare: {
    type: Number,
    default: 9.21  // Monthly profit per share as per requirement
  },
  totalShares: {
    type: Number,
    default: 380  // To keep track of total shares
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});
export default mongoose.model('MiningMachine', miningMachineSchema);
