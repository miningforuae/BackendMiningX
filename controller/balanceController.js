import mongoose from 'mongoose';
import Balance from '../model/Balance.js';
import Transaction from '../model/withdrawals.js';
import UserMAchine from '../model/UserMAchine.js';

export const updateBalance = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, amount, type, balanceType = 'mining' } = req.body; // Add balanceType with default
    
    if (!['withdrawal', 'profit'].includes(type)) {
      throw new Error('Invalid transaction type');
    }

    const balance = await Balance.findOne({ user: userId }).session(session);
    if (!balance) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Balance record not found' });
    }

    // Create transaction record
    const transaction = new Transaction({
      user: userId,
      amount: Math.abs(amount),
      type: type,
      status: type === 'withdrawal' ? 'pending' : 'approved',
      details: `${type} transaction of $${amount}`,
      transactionDate: new Date()
    });

    // For profit transactions, update balance based on balanceType
    if (type === 'profit') {
      if (balanceType === 'admin') {
        balance.adminAdd += amount;
      } else {
        balance.miningBalance += amount;
      }
      
      balance.totalBalance = balance.adminAdd + balance.miningBalance;
      balance.lastUpdated = new Date();
      
      await transaction.save({ session });
      await balance.save({ session });
      
      await session.commitTransaction();

      return res.status(200).json({
        message: `${balanceType === 'admin' ? 'Admin' : 'Mining'} profit added successfully`,
        balances: {
          total: balance.totalBalance,
          main: balance.adminAdd,
          mining: balance.miningBalance
        },
        transaction: transaction
      });
    }
    // ... rest of the code remains the same
  } catch (error) {
    await session.abortTransaction();
    console.error('Balance update error:', error);
    return res.status(500).json({ 
      message: 'Error updating balance',
      error: error.message 
    });
  } finally {
    session.endSession();
  }
};

// Add this new controller for processing withdrawal requests
export const processWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { transactionId, status, adminComment } = req.body;
    const adminId = req.user._id; // Assuming you have admin user in request

    const transaction = await Transaction.findById(transactionId).session(session);
    if (!transaction || transaction.type !== 'withdrawal') {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Withdrawal transaction not found' });
    }

    if (transaction.status !== 'pending') {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Transaction already processed' });
    }

    const balance = await Balance.findOne({ user: transaction.user }).session(session);
    if (!balance) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Balance record not found' });
    }

    // Update transaction
    transaction.status = status;
    transaction.adminComment = adminComment;
    transaction.processedBy = adminId;
    transaction.processedAt = new Date();

    // If approved, process the withdrawal
    if (status === 'approved') {
      const amount = transaction.amount;
      const totalAvailable = balance.adminAdd + balance.miningBalance;
      
      if (amount > totalAvailable) {
        await session.abortTransaction();
        return res.status(400).json({ message: 'Insufficient funds' });
      }

      // First use mining balance
      const miningDeduction = Math.min(balance.miningBalance, amount);
      balance.miningBalance -= miningDeduction;
      
      // Then use main balance if needed
      const remainingAmount = amount - miningDeduction;
      if (remainingAmount > 0) {
        balance.adminAdd -= remainingAmount;
      }

      balance.totalBalance = balance.adminAdd + balance.miningBalance;
      balance.lastUpdated = new Date();

      await balance.save({ session });
    }

    await transaction.save({ session });
    await session.commitTransaction();

    return res.status(200).json({
      message: `Withdrawal ${status}`,
      transaction: transaction,
      balances: {
        total: balance.totalBalance,
        main: balance.adminAdd,
        mining: balance.miningBalance
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Withdrawal processing error:', error);
    return res.status(500).json({ 
      message: 'Error processing withdrawal',
      error: error.message 
    });
  } finally {
    session.endSession();
  }
};

// Add this function to your balance controller
const initializeBalance = async (userId) => {
  const newBalance = new Balance({
    user: userId,
    totalBalance: 0,
    adminAdd: 0,
    miningBalance: 0,
    lastUpdated: new Date()
  });
  return await newBalance.save();
};


export const getBalance = async (req, res) => {
  try {
    const { userId } = req.params;

    let balance = await Balance.findOne({ user: userId });
    if (!balance) {
      try {
        balance = await initializeBalance(userId);
      } catch (initError) {
        console.error('Failed to initialize balance:', initError);
        return res.status(500).json({ 
          message: 'Failed to initialize balance record',
          error: 'BALANCE_INIT_FAILED'
        });
      }
    }

    const machines = await UserMAchine.find({ 
      user: userId,
      status: 'active'
    }).populate('machine', 'machineName monthlyProfit');

    const machineDetails = machines.map(m => ({
      machineId: m._id,
      name: m.machine.machineName,
      accumulatedProfit: m.monthlyProfitAccumulated || 0,
      lastProfitUpdate: m.lastProfitUpdate
    }));

    return res.status(200).json({
      balances: {
        total: balance.totalBalance,
        adminAdd: balance.adminAdd,
        mining: balance.miningBalance
      },
      machines: {
        count: machines.length,
        details: machineDetails
      },
      lastUpdated: balance.lastUpdated
    });

  } catch (error) {
    console.error('Error in getBalance:', error);
    return res.status(500).json({ 
      message: 'Error retrieving balance',
      error: 'BALANCE_FETCH_FAILED'
    });
  }
};