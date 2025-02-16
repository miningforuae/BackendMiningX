import mongoose from "mongoose";
import MiningMachine from "../../model/MiningMachine.js";
import SharePurchase from "../../model/SharePurchase.js";
import Balance from "../../model/Balance.js";
import Transaction from "../../model/withdrawals.js";
import { sendEmail } from "../../helper/emailServer.js";

const calculateShareDetails = (machine) => {
  const totalShares = Math.floor(machine.priceRange / machine.sharePrice);
  const profitPerShare = machine.monthlyProfit / totalShares;
  return { totalShares, profitPerShare };
};

export const getShareAvailability = async (req, res) => {
  try {
    const { machineId } = req.params;

    const machine = await MiningMachine.findById(machineId);
    if (!machine || !machine.isShareBased) {
      return res
        .status(400)
        .json({ message: "Invalid machine or not share-based" });
    }

    const { totalShares, profitPerShare } = calculateShareDetails(machine);
    const soldShares = await SharePurchase.countDocuments({
      machine: machineId,
    });
    const availableShares = totalShares - soldShares;

    return res.status(200).json({
      machineId,
      machineName: machine.machineName,
      totalShares,
      soldShares,
      availableShares,
      sharePrice: machine.sharePrice,
      profitPerShare,
      totalValue: machine.priceRange,
    });
  } catch (error) {
    console.error("Error checking share availability:", error);
    return res
      .status(500)
      .json({
        message: "Error checking share availability",
        error: error.message,
      });
  }
};

export const getUserShares = async (req, res) => {
  try {
    const { userId } = req.params;

    const shares = await SharePurchase.find({ user: userId })
      .populate("machine", "machineName sharePrice monthlyProfit")
      .sort("-purchaseDate");

    const totalInvestment = shares.reduce(
      (sum, share) => sum + share.totalInvestment,
      0
    );
    const totalShares = shares.reduce(
      (sum, share) => sum + share.numberOfShares,
      0
    );

    return res.status(200).json({
      shares,
      summary: {
        totalInvestment,
        totalShares,
        totalMonthlyProfit: shares.reduce(
          (sum, share) => sum + share.numberOfShares * share.profitPerShare,
          0
        ),
      },
    });
  } catch (error) {
    console.error("Error fetching user shares:", error);
    return res
      .status(500)
      .json({ message: "Error retrieving user shares", error: error.message });
  }
};

export const updateShareProfits = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { machineId } = req.params;
    const currentDate = new Date();

    const shares = await SharePurchase.find({
      machine: machineId,
      status: "active",
      lastProfitUpdate: {
        $lt: new Date(currentDate - 24 * 60 * 60 * 1000),
      },
    }).session(session);

    const updates = await Promise.all(
      shares.map(async (share) => {
        const balance = await Balance.findOne({ user: share.user }).session(
          session
        );
        const profitAmount = share.numberOfShares * share.profitPerShare;

        balance.miningBalance += profitAmount;
        balance.totalBalance = balance.adminAdd + balance.miningBalance;
        await balance.save({ session });

        share.lastProfitUpdate = currentDate;
        await share.save({ session });

        return {
          userId: share.user,
          shares: share.numberOfShares,
          profit: profitAmount,
        };
      })
    );

    await session.commitTransaction();

    return res.status(200).json({
      message: "Share profits updated successfully",
      updates,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Error updating share profits:", error);
    return res
      .status(500)
      .json({ message: "Error updating share profits", error: error.message });
  } finally {
    session.endSession();
  }
};

export const createShareMachine = async (req, res) => {
  try {
    const {
      machineName,
      hashrate,
      powerConsumption,
      priceRange,
      coinsMined,
      monthlyProfit,
      ProfitAdmin,
      description,
      sharePrice = 50,
      totalShares = 380,
      profitPerShare = 9.21,
    } = req.body;

    const imageUrls = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const imageUrl = await uploadToCloudinary(file.buffer);
        imageUrls.push(imageUrl);
      }
    }

    const machine = await MiningMachine.create({
      machineName,
      hashrate,
      powerConsumption,
      priceRange,
      coinsMined,
      monthlyProfit,
      ProfitAdmin,
      description,
      images: imageUrls,
      isShareBased: true,
      sharePrice,
      totalShares,
      profitPerShare,
      availableShares: totalShares,
    });

    res.status(StatusCodes.CREATED).json({
      success: true,
      data: machine,
    });
  } catch (error) {
    res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: error.message,
    });
  }
};

export const purchaseShares = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { machineId, numberOfShares } = req.body;
    const userId = req.user.id;

    const machine = await MiningMachine.findById(machineId).session(session);
    if (!machine || !machine.isShareBased) {
      throw new Error("Invalid machine or not available for share purchase");
    }

    if (numberOfShares > machine.availableShares) {
      throw new Error(`Only ${machine.availableShares} shares available`);
    }

    const totalCost = numberOfShares * machine.sharePrice;
    const balance = await Balance.findOne({ user: userId }).session(session);

    if (!balance || balance.totalBalance < totalCost) {
      throw new Error("Insufficient balance");
    }

    // Create transaction
    const transaction = await Transaction.create(
      [
        {
          user: userId,
          amount: totalCost,
          type: "SHARE_PURCHASE",
          status: "completed",
          balanceBefore: balance.totalBalance,
          balanceAfter: balance.totalBalance - totalCost,
          metadata: {
            machineId,
            shares: numberOfShares,
            pricePerShare: machine.sharePrice,
            profitPerShare: machine.profitPerShare,
          },
        },
      ],
      { session }
    );

    // Update machine's available shares
    machine.availableShares -= numberOfShares;
    await machine.save({ session });

    // Update user's balance
    balance.adminAdd -= totalCost;
    balance.totalBalance = balance.adminAdd + balance.miningBalance;
    await balance.save({ session });

    await session.commitTransaction();

    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        transaction: transaction[0],
        sharesPurchased: numberOfShares,
        totalCost,
        newBalance: balance.totalBalance,
        expectedMonthlyProfit: numberOfShares * machine.profitPerShare,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: error.message,
    });
  } finally {
    session.endSession();
  }
};
