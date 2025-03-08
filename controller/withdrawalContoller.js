import mongoose from "mongoose";
import User from "../model/UserModel.js";
import Transaction from "../model/withdrawals.js";
import UserMachine from "../model/UserMAchine.js";
import { sendEmail } from "../helper/emailServer.js";
import Balance from "../model/Balance.js";

// Request a new withdrawal
export const requestWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { email, amount } = req.body;

    if (!email || !amount || amount <= 0) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ message: "Valid email and amount are required" });
    }

    // Find user and balance
    const user = await User.findOne({ email: email.toLowerCase() }).session(
      session
    );
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ message: "User not found" });
    }

    const balance = await Balance.findOne({ user: user._id }).session(session);
    if (!balance) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Balance record not found" });
    }

    // Check available balance
    if (amount > balance.totalBalance) {
      await session.abortTransaction();
      return res.status(400).json({
        message: "Withdrawal amount exceeds available balance",
        availableBalance: balance.totalBalance,
      });
    }

    // Create pending transaction record
    const transaction = new Transaction({
      user: user._id,
      amount: amount,
      type: "withdrawal",
      status: "pending",
      balanceBefore: balance.totalBalance,
      balanceAfter: balance.totalBalance - amount,
      details: `Withdrawal request of $${amount}`,
    });

    await transaction.save({ session });
    await session.commitTransaction();

    // Send email notification
    try {
      await sendEmail(
        user.email,
        "Withdrawal Request Submitted",
        "withdrawalRequest",
        {
          userName: `${user.firstName} ${user.lastName}`,
          amount: amount,
          requestDate: new Date().toLocaleString(),
          transactionId: transaction._id,
        }
      );
    } catch (emailError) {
      console.error("Email notification failed:", emailError);
    }

    return res.status(200).json({
      message: "Withdrawal request submitted successfully",
      transaction: transaction,
      availableBalance: balance.totalBalance,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Withdrawal request error:", error);
    return res.status(500).json({
      message: "Error processing withdrawal request",
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

///
export const processWithdrawalRequest = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { transactionId, action, adminComment } = req.body;
    const adminId = req.user._id;

    if (!["approved", "rejected"].includes(action)) {
      return res.status(400).json({ message: "Invalid action" });
    }

    const transaction = await Transaction.findById(transactionId)
      .session(session)
      .populate("user");

    if (!transaction) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Transaction not found" });
    }

    if (transaction.status !== "pending") {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ message: "Transaction is no longer pending" });
    }

    const balance = await Balance.findOne({
      user: transaction.user._id,
    }).session(session);

    if (action === "approved") {
      if (transaction.amount > balance.totalBalance) {
        await session.abortTransaction();
        return res.status(400).json({
          message: "Insufficient balance",
          available: balance.totalBalance,
        });
      }

      // Deduct from balances - first from mining balance then from main if needed
      let remainingAmount = transaction.amount;

      // First deduct from mining balance
      // Modified withdrawal logic
      const mainDeduction = Math.min(balance.adminAdd, remainingAmount);
      balance.adminAdd -= mainDeduction;
      remainingAmount -= mainDeduction;

      if (remainingAmount > 0) {
        balance.miningBalance -= remainingAmount;
      }

      balance.totalBalance = balance.adminAdd + balance.miningBalance;
      await balance.save({ session });
    }

    // Update transaction
    transaction.status = action;
    transaction.adminComment = adminComment;
    transaction.processedBy = adminId;
    transaction.processedAt = new Date();
    await transaction.save({ session });

    await session.commitTransaction();

    // Send email notification
    try {
      await sendEmail(
        transaction.user.email,
        `Withdrawal Request ${action.toUpperCase()}`,
        "withdrawalStatus",
        {
          userName: `${transaction.user.firstName} ${transaction.user.lastName}`,
          amount: transaction.amount,
          status: action,
          transactionId: transaction._id,
          adminComment: adminComment,
        }
      );
    } catch (emailError) {
      console.error("Email notification failed:", emailError);
    }

    return res.status(200).json({
      message: `Withdrawal request ${action} successfully`,
      transaction: transaction,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Withdrawal processing error:", error);
    return res.status(500).json({
      message: "Error processing withdrawal request",
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

// Get all pending withdrawal requests (for admin)
export const getPendingWithdrawals = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const withdrawals = await Transaction.find({
      type: "withdrawal",
      status: "pending",
    })
      .sort({ transactionDate: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .populate("user", "firstName lastName email");

    const total = await Transaction.countDocuments({
      type: "withdrawal",
      status: "pending",
    });

    res.status(200).json({
      withdrawals,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      totalWithdrawals: total,
    });
  } catch (error) {
    console.error("Error retrieving pending withdrawals:", error);
    res.status(500).json({
      message: "Error retrieving pending withdrawals",
      error: error.message,
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
        message: "User not found with provided email",
      });
    }

    // Then find their withdrawals using the user's _id
    const withdrawals = await Transaction.find({
      user: user._id,
      type: "withdrawal",
    })
      .sort({ transactionDate: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .populate("user", "email firstName lastName");

    const total = await Transaction.countDocuments({
      user: user._id,
      type: "withdrawal",
    });

    res.status(200).json({
      withdrawals,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      totalWithdrawals: total,
    });
  } catch (error) {
    console.error("Error retrieving user withdrawals:", error);
    res.status(500).json({
      message: "Error retrieving withdrawal history",
      error: error.message,
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
      rejectedCount,
    ] = await Promise.all([
      Transaction.countDocuments({ type: "withdrawal", status: "pending" }),
      Transaction.aggregate([
        { $match: { type: "withdrawal", status: "pending" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Transaction.countDocuments({ type: "withdrawal", status: "approved" }),
      Transaction.aggregate([
        { $match: { type: "withdrawal", status: "approved" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Transaction.countDocuments({ type: "withdrawal", status: "rejected" }),
    ]);

    res.status(200).json({
      pending: {
        count: pendingCount,
        amount: pendingAmount[0]?.total || 0,
      },
      approved: {
        count: approvedCount,
        amount: approvedAmount[0]?.total || 0,
      },
      rejected: {
        count: rejectedCount,
      },
    });
  } catch (error) {
    console.error("Error retrieving withdrawal statistics:", error);
    res.status(500).json({
      message: "Error retrieving withdrawal statistics",
      error: error.message,
    });
  }
};

// Add this to your withdrawalController.js file
export const getAllWithdrawals = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      startDate,
      endDate,
      status,
      sortBy = "transactionDate",
      sortOrder = "desc",
    } = req.query;

    // Build filter object
    const filter = { type: "withdrawal" };

    // Add date range filter if provided
    if (startDate || endDate) {
      filter.transactionDate = {};
      if (startDate) filter.transactionDate.$gte = new Date(startDate);
      if (endDate) filter.transactionDate.$lte = new Date(endDate);
    }

    // Add status filter if provided
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      filter.status = status;
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    // Execute query with pagination
    const withdrawals = await Transaction.find(filter)
      .sort(sort)
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .populate("user", "firstName lastName email")
      .populate("processedBy", "firstName lastName email");

    // Get total count for pagination
    const total = await Transaction.countDocuments(filter);

    // Calculate total amount
    const totalAmount = await Transaction.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    res.status(200).json({
      withdrawals,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      totalWithdrawals: total,
      totalAmount: totalAmount[0]?.total || 0,
      filters: {
        startDate,
        endDate,
        status,
      },
      sorting: {
        sortBy,
        sortOrder,
      },
    });
  } catch (error) {
    console.error("Error retrieving all withdrawals:", error);
    res.status(500).json({
      message: "Error retrieving withdrawals",
      error: error.message,
    });
  }
};

// Get balance update history
export const getBalanceHistory = async (req, res) => {
  try {
    const { userId, startDate, endDate, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (userId) filter.user = userId;
    if (startDate || endDate) {
      filter.processedAt = {};
      if (startDate) filter.processedAt.$gte = new Date(startDate);
      if (endDate) filter.processedAt.$lte = new Date(endDate);
    }

    // Get both profit-type transactions (admin updates) and machine profits
    const transactions = await Transaction.find(filter)
      .sort({ processedAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .populate("user", "firstName lastName email")
      .populate("processedBy", "firstName lastName email");

    const total = await Transaction.countDocuments(filter);

    res.status(200).json({
      transactions,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      totalTransactions: total,
    });
  } catch (error) {
    console.error("Error retrieving balance history:", error);
    res.status(500).json({
      message: "Error retrieving balance history",
      error: error.message,
    });
  }
};
