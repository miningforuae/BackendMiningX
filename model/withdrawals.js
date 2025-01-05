import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema({
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    transactionDate: {
      type: Date,
      default: Date.now
    },
    type: {
      type: String,
      enum: ['withdrawal', 'profit'],
      required: true
    },
    details: {
      type: String
    }
  });
  
  const Transaction = mongoose.model('Transaction', transactionSchema);
  export default Transaction