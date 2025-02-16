import mongoose from 'mongoose';

const userMachineSchema = new mongoose.Schema({
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
  assignedDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  monthlyProfitAccumulated: {
    type: Number,
    default: 0
  },
  // Machine details copied from the original machine
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
    required: [true, 'Monthly profit is required']
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
  }
}, {
  timestamps: true
});

export default mongoose.model('UserMachine', userMachineSchema);