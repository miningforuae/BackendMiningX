import mongoose from 'mongoose';
import MiningMachine from '../model/MiningMachine.js';
import SharePurchase from '../model/SharePurchase.js';
import Balance from '../model/Balance.js';
import Transaction from '../model/withdrawals.js';
import User from '../model/UserModel.js';
import { sendEmail } from '../helper/emailServer.js';
import { StatusCodes } from 'http-status-codes';

// Get the special share machine
export const getSpecialShareMachine = async (req, res) => {
  try {
    const specialMachine = await MiningMachine.findOne({ 
      isShareBased: true,
      priceRange: 19000,
      sharePrice: 50
    });

    if (!specialMachine) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Special share machine not found"
      });
    }

    // Get sold shares
    const soldShares = await SharePurchase.countDocuments({
      machine: specialMachine._id
    });

    // Calculate availability
    const availableShares = specialMachine.totalShares - soldShares;

    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        ...specialMachine.toObject(),
        availableShares,
        soldShares
      }
    });
  } catch (error) {
    console.error("Error fetching special share machine:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message
    });
  }
};

// Purchase shares of the special machine
export const purchaseSpecialShares = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, numberOfShares } = req.body;

    if (!userId || !numberOfShares || numberOfShares < 1) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "User ID and valid number of shares are required"
      });
    }

    // Find user
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "User not found"
      });
    }

    // Find the special machine with a write lock to prevent race conditions
    const machine = await MiningMachine.findOneAndUpdate(
      {
        isShareBased: true,
        priceRange: 19000,
        sharePrice: 50
      },
      { $set: { lastChecked: new Date() } }, // Dummy update to acquire lock
      { 
        session,
        new: true,
        runValidators: true
      }
    );

    if (!machine) {
      await session.abortTransaction();
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Special share machine not found"
      });
    }

    // Check share availability with proper locking
    const soldShares = await SharePurchase.countDocuments({
      machine: machine._id,
      status: 'active'
    }).session(session);
    
    const availableShares = machine.totalShares - soldShares;
    
    if (numberOfShares > availableShares) {
      await session.abortTransaction();
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: `Only ${availableShares} shares available for purchase`
      });
    }

    // Calculate costs
    const sharePrice = machine.sharePrice;
    const totalCost = sharePrice * numberOfShares;
    const monthlyProfitPerShare = machine.profitPerShare;
    const expectedMonthlyProfit = monthlyProfitPerShare * numberOfShares;

    // Check if user has enough balance
    let balance = await Balance.findOneAndUpdate(
      { user: userId },
      { $set: { lastChecked: new Date() } }, // Dummy update to acquire lock
      { 
        session,
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    );

    if (!balance) {
      // Create balance if not exists (though upsert should handle this)
      balance = new Balance({
        user: userId,
        totalBalance: 0,
        adminAdd: 0,
        miningBalance: 0,
        lastUpdated: new Date()
      });
    }

    if (balance.totalBalance < totalCost) {
      await session.abortTransaction();
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Insufficient balance",
        required: totalCost,
        available: balance.totalBalance
      });
    }

    // Create share purchase
    const sharePurchase = await SharePurchase.create([{
      user: userId,
      machine: machine._id,
      numberOfShares: numberOfShares,
      pricePerShare: sharePrice,
      profitPerShare: monthlyProfitPerShare,
      totalInvestment: totalCost,
      purchaseDate: new Date(),
      lastProfitUpdate: new Date(),
      status: 'active'
    }], { session });

    // Create transaction record
    const transaction = await Transaction.create([{
      user: userId,
      amount: totalCost,
      type: 'SHARE_PURCHASE',
      status: 'completed',
      balanceBefore: balance.totalBalance,
      balanceAfter: balance.totalBalance - totalCost,
      details: `Purchased ${numberOfShares} shares of ${machine.machineName}`,
      transactionDate: new Date(),
      metadata: {
        machineId: machine._id,
        machineName: machine.machineName,
        shares: numberOfShares,
        pricePerShare: sharePrice
      }
    }], { session });

    // Update user balance
    balance.adminAdd -= totalCost;
    balance.totalBalance = balance.adminAdd + balance.miningBalance;
    balance.lastUpdated = new Date();
    await balance.save({ session });

    // Send email confirmation
    try {
      const emailData = {
        userName: `${user.firstName} ${user.lastName}`,
        machineName: machine.machineName,
        numberOfShares: numberOfShares,
        sharePrice: sharePrice,
        totalInvestment: totalCost,
        monthlyProfit: expectedMonthlyProfit,
        purchaseDate: new Date().toLocaleDateString()
      };
      
      await sendEmail(
        user.email,
        'Share Purchase Confirmation',
        'sharePurchaseConfirmation',
        emailData
      );
    } catch (emailError) {
      console.error("Email sending failed:", emailError);
      // Continue with transaction even if email fails
    }

    await session.commitTransaction();

    return res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Shares purchased successfully",
      data: {
        purchase: sharePurchase[0],
        transaction: transaction[0],
        newBalance: balance.totalBalance,
        expectedMonthlyProfit: expectedMonthlyProfit
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error("Share purchase error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Error purchasing shares",
      error: error.message
    });
  } finally {
    session.endSession();
  }
};
// Update profits for all share purchases (run this daily)
export const updateAllShareProfits = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const currentDate = new Date();
    const oneDayAgo = new Date(currentDate - 24 * 60 * 60 * 1000);

    // Find all active shares that haven't been updated in the last 24 hours
    const eligibleShares = await SharePurchase.find({
      status: 'active',
      lastProfitUpdate: { $lt: oneDayAgo }
    }).populate('user').session(session);

    if (eligibleShares.length === 0) {
      await session.abortTransaction();
      return res.status(StatusCodes.OK).json({
        success: true,
        message: "No shares eligible for profit update",
        updatedCount: 0
      });
    }

    const updates = [];
    
    for (const share of eligibleShares) {
      // Calculate profit for this share
      const profitAmount = share.numberOfShares * share.profitPerShare;
      
      // Find user's balance
      const balance = await Balance.findOne({ user: share.user._id }).session(session);
      if (!balance) {
        console.error(`Balance not found for user ${share.user._id}`);
        continue;  // Skip this share
      }
      
      // Update mining balance with profits
      balance.miningBalance += profitAmount;
      balance.totalBalance = balance.adminAdd + balance.miningBalance;
      balance.lastUpdated = currentDate;
      await balance.save({ session });
      
      // Update share last profit date
      share.lastProfitUpdate = currentDate;
      await share.save({ session });
      
      // Create transaction record for profit
      await Transaction.create([{
        user: share.user._id,
        amount: profitAmount,
        type: 'SHARE_PROFIT',
        status: 'completed',
        balanceBefore: balance.totalBalance - profitAmount,
        balanceAfter: balance.totalBalance,
        details: `Profit from ${share.numberOfShares} shares`,
        transactionDate: currentDate,
        metadata: {
          shareId: share._id,
          shares: share.numberOfShares,
          profitPerShare: share.profitPerShare
        }
      }], { session });
      
      updates.push({
        userId: share.user._id,
        userName: `${share.user.firstName} ${share.user.lastName}`,
        email: share.user.email,
        shares: share.numberOfShares,
        profitAmount: profitAmount,
        newMiningBalance: balance.miningBalance
      });
      
      // Optionally send email notification
      try {
        const emailData = {
          userName: `${share.user.firstName} ${share.user.lastName}`,
          profitAmount: profitAmount.toFixed(2),
          shares: share.numberOfShares,
          newBalance: balance.totalBalance.toFixed(2),
          date: currentDate.toLocaleDateString()
        };
        
        await sendEmail(
          share.user.email,
          'Mining Share Profit Update',
          'shareProfitUpdate',
          emailData
        );
      } catch (emailError) {
        console.error("Email sending failed:", emailError);
        // Continue even if email fails
      }
    }

    await session.commitTransaction();
    
    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Share profits updated successfully",
      updatedCount: updates.length,
      updates: updates
    });

  } catch (error) {
    await session.abortTransaction();
    console.error("Error updating share profits:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Error updating share profits",
      error: error.message
    });
  } finally {
    session.endSession();
  }
};


export const getUserShareDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "User ID is required"
      });
    }
    
    // Get all shares owned by user
    const shares = await SharePurchase.find({
      user: userId,
      status: 'active'
    }).populate('machine', 'machineName hashrate powerConsumption');
    
    if (!shares || shares.length === 0) {
      return res.status(StatusCodes.OK).json({
        success: true,
        data: {
          shares: [],
          summary: {
            totalShares: 0,
            totalInvestment: 0,
            expectedMonthlyProfit: 0
          }
        }
      });
    }
    
    // Calculate summary
    const totalShares = shares.reduce((sum, share) => sum + share.numberOfShares, 0);
    const totalInvestment = shares.reduce((sum, share) => sum + share.totalInvestment, 0);
    const expectedMonthlyProfit = shares.reduce(
      (sum, share) => sum + (share.numberOfShares * share.profitPerShare), 0
    );
    
    // Format share details
    const shareDetails = shares.map(share => ({
      id: share._id,
      machineName: share.machine.machineName,
      numberOfShares: share.numberOfShares,
      pricePerShare: share.pricePerShare,
      totalInvestment: share.totalInvestment,
      profitPerShare: share.profitPerShare,
      expectedMonthlyProfit: share.numberOfShares * share.profitPerShare,
      purchaseDate: share.purchaseDate,
      lastProfitUpdate: share.lastProfitUpdate,
      nextProfitUpdate: new Date(share.lastProfitUpdate.getTime() + 24 * 60 * 60 * 1000)
    }));
    
    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        shares: shareDetails,
        summary: {
          totalShares,
          totalInvestment,
          expectedMonthlyProfit
        }
      }
    });
    
  } catch (error) {
    console.error("Error fetching user share details:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Error retrieving share details",
      error: error.message
    });
  }
};


// Sell shares of a mining machine
export const sellSharePurchase = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { sharePurchaseId } = req.params;
    const { numberOfSharesToSell } = req.body;
    
    // Validate numberOfSharesToSell is provided and is a positive number
    if (!numberOfSharesToSell || numberOfSharesToSell < 1) {
      await session.abortTransaction();
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Valid number of shares to sell is required"
      });
    }
    
    // Find the share purchase with related documents
    const sharePurchase = await SharePurchase.findById(sharePurchaseId)
      .populate('user')
      .populate('machine')
      .session(session);

    if (!sharePurchase) {
      await session.abortTransaction();
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false, 
        message: 'Share purchase not found'
      });
    }

    if (sharePurchase.status !== 'active') {
      await session.abortTransaction();
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Cannot sell inactive shares'
      });
    }
    
    // Ensure user isn't trying to sell more shares than they own
    if (numberOfSharesToSell > sharePurchase.numberOfShares) {
      await session.abortTransaction();
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: `You only own ${sharePurchase.numberOfShares} shares`
      });
    }

    // Calculate selling price with 10% deduction
    const originalValue = sharePurchase.pricePerShare * numberOfSharesToSell;
    const sellingPrice = originalValue * 0.9;
    const deduction = originalValue * 0.1;

    // Find user balance
    const balance = await Balance.findOne({ user: sharePurchase.user._id }).session(session);
    if (!balance) {
      await session.abortTransaction();
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'User balance not found'
      });
    }

    // Create transaction record
    const saleTransaction = await Transaction.create([{
      user: sharePurchase.user._id,
      amount: sellingPrice,
      type: 'SHARE_SALE',
      status: 'completed',
      balanceBefore: balance.totalBalance,
      balanceAfter: balance.totalBalance + sellingPrice,
      details: `Sold ${numberOfSharesToSell} shares of ${sharePurchase.machine.machineName}`,
      transactionDate: new Date(),
      metadata: {
        machineId: sharePurchase.machine._id,
        machineName: sharePurchase.machine.machineName,
        shareId: sharePurchase._id,
        originalShares: sharePurchase.numberOfShares,
        soldShares: numberOfSharesToSell,
        originalValue: originalValue,
        deduction: deduction,
        sellingPrice: sellingPrice
      }
    }], { session });

    // Update user balance
    balance.adminAdd += sellingPrice;
    balance.totalBalance = balance.adminAdd + balance.miningBalance;
    balance.lastUpdated = new Date();
    await balance.save({ session });

    // Handle partial or complete share sales
    if (numberOfSharesToSell === sharePurchase.numberOfShares) {
      // All shares sold - mark as inactive
      sharePurchase.status = 'inactive';
      await sharePurchase.save({ session });
    } else {
      // Partial sale - reduce share count and update total investment
      const remainingShares = sharePurchase.numberOfShares - numberOfSharesToSell;
      const remainingInvestment = sharePurchase.pricePerShare * remainingShares;
      
      sharePurchase.numberOfShares = remainingShares;
      sharePurchase.totalInvestment = remainingInvestment;
      await sharePurchase.save({ session });
    }

    await session.commitTransaction();

    // Send email confirmation
    try {
      const emailData = {
        userName: `${sharePurchase.user.firstName} ${sharePurchase.user.lastName}`,
        machineName: sharePurchase.machine.machineName,
        soldShares: numberOfSharesToSell,
        originalValue: originalValue,
        deduction: deduction,
        sellingPrice: sellingPrice,
        newBalance: balance.totalBalance,
        remainingShares: sharePurchase.numberOfShares,
        date: new Date().toLocaleDateString()
      };
      
      await sendEmail(
        sharePurchase.user.email,
        'Share Sale Confirmation',
        'shareSaleConfirmation',
        emailData
      );
    } catch (emailError) {
      console.error('Email notification failed:', emailError);
      // Continue even if email fails
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: 'Shares sold successfully',
      data: {
        sale: {
          originalValue,
          deduction,
          sellingPrice,
          soldShares: numberOfSharesToSell,
          remainingShares: sharePurchase.numberOfShares,
          machineDetails: {
            name: sharePurchase.machine.machineName,
            id: sharePurchase.machine._id
          }
        },
        transaction: saleTransaction[0],
        newBalance: {
          total: balance.totalBalance,
          main: balance.adminAdd,
          mining: balance.miningBalance
        }
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Share sale error:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error processing share sale',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};