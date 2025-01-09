import mongoose from 'mongoose';
import User from '../model/UserModel.js';  
import Transaction from '../model/withdrawals.js';
import UserMachine from '../model/UserMAchine.js';
import { sendEmail } from '../helper/emailServer.js';

// Request a new withdrawal
export const requestWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { email, amount } = req.body;

    if (!email || !amount || amount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Valid email and amount are required' });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() }).session(session);
    
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'User not found with provided email' });
    }

    const userMachines = await UserMachine.find({ 
      user: user._id,
      status: 'active'
    }).session(session);

    const totalProfit = userMachines.reduce(
      (sum, machine) => sum + (machine.monthlyProfitAccumulated || 0), 
      0
    );

    if (amount > totalProfit) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ 
        message: 'Withdrawal amount exceeds available profit',
        availableProfit: totalProfit
      });
    }

    // Create pending transaction record
    const transaction = new Transaction({
      user: user._id,
      amount: amount,
      type: 'withdrawal',
      status: 'pending',
      details: `Withdrawal request of $${amount} from mining profits`
    });

    await transaction.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Send confirmation email to user
    try {
      await sendEmail(
        user.email,
        'Withdrawal Request Submitted',
        'withdrawalRequest',
        {
          userName: `${user.firstName} ${user.lastName}`,
          amount: amount,
          requestDate: new Date().toLocaleString(),
          transactionId: transaction._id
        }
      );
    } catch (emailError) {
      console.error('Error sending withdrawal request email:', emailError);
    }

    res.status(200).json({
      message: 'Withdrawal request submitted successfully',
      requestedAmount: amount,
      availableProfit: totalProfit,
      transaction: transaction,
      userEmail: user.email
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Withdrawal request error:', error);
    res.status(500).json({ 
      message: 'Error processing withdrawal request',
      error: error.message 
    });
  }
};

export const processWithdrawalRequest = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { transactionId, action, adminComment } = req.body;
    const adminId = req.user._id; // Assuming admin user info is in request

    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action. Must be approved or rejected' });
    }

    const transaction = await Transaction.findById(transactionId)
      .session(session)
      .populate('user', 'firstName lastName email');
    
    if (!transaction) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Transaction not found' });
    }

    if (transaction.status !== 'pending') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Transaction is no longer pending' });
    }

    if (action === 'approved') {
      // Find user's machines and deduct profit
      const userMachines = await UserMachine.find({ 
        user: transaction.user._id,
        status: 'active'
      }).session(session);

      const totalProfit = userMachines.reduce(
        (sum, machine) => sum + (machine.monthlyProfitAccumulated || 0), 
        0
      );

      if (transaction.amount > totalProfit) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ 
          message: 'Insufficient funds for withdrawal',
          availableProfit: totalProfit
        });
      }

      // Deduct profit from machines
      let remainingAmount = transaction.amount;
      for (const machine of userMachines) {
        if (remainingAmount <= 0) break;

        const machineProfit = machine.monthlyProfitAccumulated || 0;
        const deductAmount = Math.min(machineProfit, remainingAmount);

        machine.monthlyProfitAccumulated -= deductAmount;
        remainingAmount -= deductAmount;

        await machine.save({ session });
      }
    }

    // Update transaction status
    transaction.status = action;
    transaction.adminComment = adminComment;
    transaction.processedBy = adminId;
    transaction.processedAt = new Date();
    await transaction.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Send status update email to user
    try {
      await sendEmail(
        transaction.user.email,
        `Withdrawal Request ${action.toUpperCase()}`,
        'withdrawalStatus',
        {
          userName: `${transaction.user.firstName} ${transaction.user.lastName}`,
          amount: transaction.amount,
          status: action.toUpperCase(),
          transactionId: transaction._id,
          adminComment: adminComment
        }
      );
    } catch (emailError) {
      console.error('Error sending withdrawal status email:', emailError);
    }

    res.status(200).json({
      message: `Withdrawal request ${action} successfully`,
      transaction: transaction
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error processing withdrawal request:', error);
    res.status(500).json({ 
      message: 'Error processing withdrawal request',
      error: error.message 
    });
  }
};

// Get all pending withdrawal requests (for admin)
export const getPendingWithdrawals = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const withdrawals = await Transaction.find({ 
      type: 'withdrawal',
      status: 'pending'
    })
      .sort({ transactionDate: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .populate('user', 'firstName lastName email');

    const total = await Transaction.countDocuments({ 
      type: 'withdrawal',
      status: 'pending'
    });

    res.status(200).json({
      withdrawals,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      totalWithdrawals: total
    });
  } catch (error) {
    console.error('Error retrieving pending withdrawals:', error);
    res.status(500).json({ 
      message: 'Error retrieving pending withdrawals',
      error: error.message 
    });
  }
};

// Get user's withdrawal history
// In withdrawalController.js
export const getUserWithdrawals = async (req, res) => {
  try {
    const { email } = req.query;
    const { page = 1, limit = 10 } = req.query;

    // First find the user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.status(404).json({ 
        message: 'User not found with provided email'
      });
    }

    // Then find their withdrawals using the user's _id
    const withdrawals = await Transaction.find({ 
      user: user._id,
      type: 'withdrawal'
    })
      .sort({ transactionDate: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .populate('user', 'email firstName lastName');

    const total = await Transaction.countDocuments({ 
      user: user._id,
      type: 'withdrawal'
    });

    res.status(200).json({
      withdrawals,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      totalWithdrawals: total
    });
  } catch (error) {
    console.error('Error retrieving user withdrawals:', error);
    res.status(500).json({ 
      message: 'Error retrieving withdrawal history',
      error: error.message 
    });
  }
};

// Get withdrawal statistics (for admin)
export const getWithdrawalStats = async (req, res) => {
  try {
    const [
      pendingCount,
      pendingAmount,
      approvedCount,
      approvedAmount,
      rejectedCount
    ] = await Promise.all([
      Transaction.countDocuments({ type: 'withdrawal', status: 'pending' }),
      Transaction.aggregate([
        { $match: { type: 'withdrawal', status: 'pending' }},
        { $group: { _id: null, total: { $sum: '$amount' }}}
      ]),
      Transaction.countDocuments({ type: 'withdrawal', status: 'approved' }),
      Transaction.aggregate([
        { $match: { type: 'withdrawal', status: 'approved' }},
        { $group: { _id: null, total: { $sum: '$amount' }}}
      ]),
      Transaction.countDocuments({ type: 'withdrawal', status: 'rejected' })
    ]);

    res.status(200).json({
      pending: {
        count: pendingCount,
        amount: pendingAmount[0]?.total || 0
      },
      approved: {
        count: approvedCount,
        amount: approvedAmount[0]?.total || 0
      },
      rejected: {
        count: rejectedCount
      }
    });
  } catch (error) {
    console.error('Error retrieving withdrawal statistics:', error);
    res.status(500).json({ 
      message: 'Error retrieving withdrawal statistics',
      error: error.message 
    });
  }
};