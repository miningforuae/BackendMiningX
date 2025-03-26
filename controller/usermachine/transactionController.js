// transactionController.js
import User from "../../model/UserModel.js";
import UserMachine from "../../model/UserMAchine.js";
import MiningMachine from "../../model/MiningMachine.js";
import Transaction from "../../model/withdrawals.js";
import Balance from "../../model/Balance.js";
import mongoose from "mongoose";
import { sendEmail } from "../../helper/emailServer.js";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const executeTransactionWithRetry = async (transactionFunction) => {
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(
        async () => {
          result = await transactionFunction(session);
        },
        {
          readPreference: "primary",
          readConcern: { level: "snapshot" },
          writeConcern: { w: "majority" },
        }
      );

      return result; // If successful, return the result
    } catch (error) {
      lastError = error;
      console.error(`Transaction attempt ${attempt} failed:`, error);

      const isTransientError =
        error.errorLabels?.includes("TransientTransactionError") ||
        error.code === 251; // NoSuchTransaction

      if (!isTransientError || attempt === MAX_RETRIES) {
        throw error; // Rethrow if not transient or out of retries
      }

      await sleep(RETRY_DELAY_MS * attempt); // Exponential backoff
    } finally {
      await session.endSession();
    }
  }

  throw lastError;
};

export const purchaseAndAssignMachine = async (req, res) => {
  try {
    const { userId, machineId, quantity = 1 } = req.body;

    if (!userId || !machineId || quantity < 1) {
      return res.status(400).json({
        message: "User ID, Machine ID, and valid quantity are required",
      });
    }

    const result = await executeTransactionWithRetry(async (session) => {
      // Find user, machine and balance
      const [user, machine, balance] = await Promise.all([
        User.findById(userId).session(session),
        MiningMachine.findById(machineId).session(session),
        Balance.findOne({ user: userId }).session(session),
      ]);

      if (!user || !machine || !balance) {
        throw new Error("User, machine, or balance record not found");
      }

      const totalCost = machine.priceRange * quantity;

      if (balance.totalBalance < totalCost) {
        throw new Error("Insufficient balance");
      }

      // Create purchase transaction
      const transaction = await Transaction.create(
        [
          {
            user: userId,
            amount: totalCost,
            type: "MACHINE_PURCHASE",
            status: "completed",
            balanceBefore: balance.totalBalance,
            balanceAfter: balance.totalBalance - totalCost,
            metadata: {
              machineId: machine._id,
              machineName: machine.machineName,
              quantity: quantity,
              pricePerUnit: machine.priceRange,
            },
          },
        ],
        { session }
      );

      // Update balance
      balance.adminAdd -= totalCost;
      balance.totalBalance = balance.adminAdd + balance.miningBalance;
      balance.lastUpdated = new Date();
      await balance.save({ session });

      // Create machine assignments
      const assignments = Array(quantity)
        .fill()
        .map(() => ({
          user: userId,
          machine: machineId,
          assignedDate: new Date(),
          status: "active",
          monthlyProfitAccumulated: 0,
          description: machine.description,
          monthlyProfit: machine.monthlyProfit,
          coinsMined: machine.coinsMined,
          priceRange: machine.priceRange,
          powerConsumption: machine.powerConsumption,
          hashrate: machine.hashrate,
          machineName: machine.machineName,
        }));

      const userMachines = await UserMachine.create(assignments, { session });

      return {
        transaction: transaction[0],
        userMachines,
        balance,
      };
    });

    const populatedMachines = await UserMachine.find({
      _id: { $in: result.userMachines.map((m) => m._id) },
    })
      .populate({
        path: "user",
        select: "firstName lastName email",
      })
      .populate({
        path: "machine",
        select: "machineName model priceRange monthlyProfit",
      })
      .lean(); // Use lean() for better performance since we don't need Mongoose documents

    // Format the response
    return res.status(201).json({
      message: "Machine(s) purchased and assigned successfully",
      machines: populatedMachines,
      transaction: {
        id: result.transaction._id,
        totalCost: result.transaction.amount,
        newBalance: result.balance.adminAdd,
      },
    });
  } catch (error) {
    console.error("Machine purchase error:", error);
    return res.status(400).json({
      message: "Error purchasing machines",
      error: error.message,
    });
  }
};
export const checkPurchaseEligibility = async (req, res) => {
  try {
    const { userId, machineId, quantity = 1 } = req.query;

    if (!userId || !machineId) {
      return res
        .status(400)
        .json({ message: "User ID and Machine ID are required" });
    }

    const user = await User.findById(userId);
    const machine = await MiningMachine.findById(machineId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!machine) {
      return res.status(404).json({ message: "Machine not found" });
    }

    const totalCost = machine.priceRange * quantity;
    const canAfford = user.adminAdd >= totalCost;

    res.status(200).json({
      canPurchase: canAfford,
      userBalance: user.adminAdd,
      requiredAmount: totalCost,
      shortfall: canAfford ? 0 : totalCost - user.adminAdd,
      machine: {
        name: machine.machineName,
        pricePerUnit: machine.priceRange,
        quantity: quantity,
      },
    });
  } catch (error) {
    console.error("Eligibility check error:", error);
    res.status(500).json({
      message: "Error checking purchase eligibility",
      error: error.message,
    });
  }
};

export const sellUserMachine = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userMachineId } = req.params;

    const userMachine = await UserMachine.findById(userMachineId)
      .populate("user")
      .populate("machine")
      .session(session);

    if (!userMachine) {
      await session.abortTransaction();
      return res.status(404).json({ message: "User machine not found" });
    }

    if (userMachine.status !== "active") {
      await session.abortTransaction();
      return res.status(400).json({ message: "Cannot sell inactive machine" });
    }

    const originalPrice = userMachine.machine.priceRange;
    const sellingPrice = originalPrice * 0.9;
    const deduction = originalPrice * 0.1;

    const balance = await Balance.findOne({
      user: userMachine.user._id,
    }).session(session);
    if (!balance) {
      await session.abortTransaction();
      return res.status(404).json({ message: "User balance not found" });
    }

    const saleTransaction = new Transaction({
      user: userMachine.user._id,
      amount: sellingPrice,
      type: "MACHINE_SALE",
      status: "completed",
      balanceBefore: balance.totalBalance,
      balanceAfter: balance.totalBalance + sellingPrice,
      metadata: {
        machineId: userMachine.machine._id,
        machineName: userMachine.machine.machineName,
        originalPrice: originalPrice,
        deduction: deduction,
        sellingPrice: sellingPrice,
      },
    });

    balance.adminAdd += sellingPrice;
    balance.totalBalance = balance.adminAdd + balance.miningBalance;
    balance.lastUpdated = new Date();

    userMachine.status = "inactive";

    await saleTransaction.save({ session });
    await balance.save({ session });
    await userMachine.save({ session });

    await session.commitTransaction();

    try {
      await sendEmail(
        userMachine.user.email,
        "Machine Sale Confirmation",
        "machineSale",
        {
          machineName: userMachine.machine.machineName,
          originalPrice: originalPrice,
          deduction: deduction,
          sellingPrice: sellingPrice,
          newBalance: balance.totalBalance,
        }
      );
    } catch (emailError) {
      console.error("Email notification failed:", emailError);
    }

    return res.status(200).json({
      message: "Machine sold successfully",
      sale: {
        originalPrice,
        deduction,
        sellingPrice,
        machineDetails: {
          name: userMachine.machine.machineName,
          id: userMachine.machine._id,
        },
      },
      transaction: saleTransaction,
      newBalance: {
        total: balance.totalBalance,
        main: balance.adminAdd,
        mining: balance.miningBalance,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Machine sale error:", error);
    return res
      .status(500)
      .json({ message: "Error processing machine sale", error: error.message });
  } finally {
    session.endSession();
  }
};

export const getSaleHistory = async (req, res) => {
  try {
    const { userId } = req.params;

    const sales = await Transaction.find({
      user: userId,
      type: "MACHINE_SALE",
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      sales: sales.map((sale) => ({
        transactionId: sale._id,
        date: sale.createdAt,
        machineName: sale.metadata.machineName,
        originalPrice: sale.metadata.originalPrice,
        deduction: sale.metadata.deduction,
        sellingPrice: sale.metadata.sellingPrice,
        balanceBefore: sale.balanceBefore,
        balanceAfter: sale.balanceAfter,
      })),
    });
  } catch (error) {
    console.error("Error fetching sale history:", error);
    return res
      .status(500)
      .json({ message: "Error retrieving sale history", error: error.message });
  }
};
