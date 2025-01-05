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
  monthlyProfitAccumulated: {
    type: Number,
    default: 0
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
});

export default mongoose.model('UserMachine', userMachineSchema);