import UserMachine from '../model/UserMAchine.js';
import User from '../model/UserModel.js';
import MiningMachine from '../model/MiningMachine.js';
import mongoose from 'mongoose';
import { sendEmail } from '../helper/emailServer.js';
import Transaction from "../model/withdrawals.js"

export const assignMachineToUser = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, machineId, quantity = 1 } = req.body;

    if (!userId || !machineId || quantity < 1) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'User ID, Machine ID, and valid quantity are required' });
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'User not found' });
    }

    const machine = await MiningMachine.findById(machineId).session(session);
    if (!machine) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Machine not found' });
    }

    // Create multiple assignments based on quantity
    const assignments = [];
    for (let i = 0; i < quantity; i++) {
      const userMachine = new UserMachine({
        user: userId,
        machine: machineId,
        assignedDate: new Date(),
        status: 'active',
        monthlyProfitAccumulated: 0
      });
      assignments.push(userMachine);
    }

    await UserMachine.insertMany(assignments, { session });

    const emailData = {
      userName: `${user.firstName} ${user.lastName}`,
      machineName: machine.machineName.toString(),
      quantity: quantity,
      assignedDate: new Date().toLocaleDateString(),
      profitRate: machine.ProfitAdmin.toString()
    };

    await sendEmail(
      user.email,
      'New Mining Machines Assigned',
      'machineAssignment',
      emailData
    );

    await session.commitTransaction();
    session.endSession();

    // Populate the response with user and machine details
    const populatedAssignments = await UserMachine.find({
      _id: { $in: assignments.map(a => a._id) }
    })
      .populate('user', 'firstName lastName email')
      .populate('machine', 'machineName model');

    res.status(201).json(populatedAssignments);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Machine assignment error:', error);
    res.status(500).json({ 
      message: 'Error assigning machines to user',
      error: error.message 
    });
  }
};

export const getUserMachines = async (req, res) => {
  try {
    const userIdentifier = req.params.userId;

    if (!userIdentifier) {
      return res.status(400).json({ message: 'User identifier is required' });
    }

    let user;
    // Check if the identifier is a valid MongoDB ObjectId
    const isValidObjectId = mongoose.Types.ObjectId.isValid(userIdentifier);

    if (isValidObjectId) {
      user = await User.findById(userIdentifier);
    } else {
      // If not a valid ObjectId, search by email
      user = await User.findOne({ email: userIdentifier });
    }

    if (!user) {
      return res.status(404).json({ 
        message: 'User not found',
        identifier: userIdentifier 
      });
    }

    // Now that we have the user, find their machines using the _id
    const userMachines = await UserMachine.find({ user: user._id })
      .populate('user', 'firstName lastName email')
      .populate('machine', 'machineName model');

    if (userMachines.length === 0) {
      return res.status(200).json([]); // Return empty array instead of 404
    }

    res.status(200).json(userMachines);
  } catch (error) {
    console.error('Error retrieving user machines:', error);
    res.status(500).json({ 
      message: 'Error retrieving user machines',
      error: error.message 
    });
  }
};

export const removeUserMachine = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userMachineId } = req.params;

    // Validate userMachineId
    if (!userMachineId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'User Machine ID is required' });
    }

    // Find and remove the user-machine assignment
    const removedUserMachine = await UserMachine.findByIdAndDelete(userMachineId, { session });

    if (!removedUserMachine) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'User Machine assignment not found' });
    }

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ 
      message: 'Machine assignment removed successfully',
      removedUserMachine 
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error('Error removing user machine:', error);
    res.status(500).json({ 
      message: 'Error removing user machine assignment',
      error: error.message 
    });
  }
};

export const getAllUserMachines = async (req, res) => {
  try {
    // Find all user-machine assignments with populated details
    const userMachines = await UserMachine.find()
      .populate('user', 'firstName lastName email')
      .populate('machine', 'machineName model');

    res.status(200).json(userMachines);
  } catch (error) {
    console.error('Error retrieving all user machines:', error);
    res.status(500).json({ 
      message: 'Error retrieving all user machines',
      error: error.message 
    });
  }
};
export const getProfitUpdateStatus = async (req, res) => {
  try {
    const { userMachineId } = req.params;

    const userMachine = await UserMachine.findById(userMachineId)
      .populate('machine')
      .populate('user', 'firstName lastName email');

    if (!userMachine) {
      return res.status(404).json({ message: 'User machine assignment not found' });
    }

    const lastUpdate = userMachine.lastProfitUpdate || userMachine.assignedDate;
    const currentDate = new Date();
    // Changed from days to hours
    const hoursSinceUpdate = Math.floor((currentDate - lastUpdate) / (1000 * 60 * 60));

    res.status(200).json({
      userMachineId: userMachine._id,
      userName: `${userMachine.user.firstName} ${userMachine.user.lastName}`,
      machineName: userMachine.machine.machineName,
      lastUpdateDate: lastUpdate,
      hoursSinceLastUpdate: hoursSinceUpdate,
      hoursUntilNextUpdate: Math.max(0, 1 - hoursSinceUpdate), // Changed from 30 days to 1 hour
      currentAccumulatedProfit: userMachine.monthlyProfitAccumulated,
      status: userMachine.status
    });
  } catch (error) {
    console.error('Error getting profit update status:', error);
    res.status(500).json({ 
      message: 'Error getting profit update status',
      error: error.message 
    });
  }
};

export const updateMonthlyProfit = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userMachineId } = req.params;
    
    const userMachine = await UserMachine.findById(userMachineId)
      .populate('machine')
      .session(session);

    if (!userMachine) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'User machine assignment not found' });
    }

    if (userMachine.status !== 'active') {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Machine is not active' });
    }

    // Calculate profit since assignment or last update
    const lastUpdate = userMachine.lastProfitUpdate || userMachine.assignedDate;
    const currentDate = new Date();
    
    // Calculate hours since last update
    const hoursSinceUpdate = Math.floor(
      (currentDate.getTime() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60)
    );

    // Debug logging
    console.log('Profit Update Debug:', {
      machineId: userMachineId,
      lastUpdate: lastUpdate,
      currentDate: currentDate,
      hoursSinceUpdate: hoursSinceUpdate,
      currentAccumulatedProfit: userMachine.monthlyProfitAccumulated,
      machineProfit: userMachine.machine.ProfitAdmin
    });

    if (hoursSinceUpdate >= 1) {
      const profitPerHour = userMachine.machine.ProfitAdmin / 24; // Daily profit divided by 24 hours
      const profitToAdd = profitPerHour * hoursSinceUpdate;
      
      userMachine.monthlyProfitAccumulated += profitToAdd;
      userMachine.lastProfitUpdate = currentDate;

      await userMachine.save({ session });
      await session.commitTransaction();

      return res.status(200).json({
        message: 'Profit updated successfully',
        hoursProcessed: hoursSinceUpdate,
        profitAdded: profitToAdd,
        newTotal: userMachine.monthlyProfitAccumulated,
        nextUpdateIn: '1 hour'
      });
    } else {
      await session.commitTransaction();
      return res.status(200).json({
        message: 'Too soon for next update',
        minutesUntilNextUpdate: 60 - ((hoursSinceUpdate * 60) % 60),
        currentProfit: userMachine.monthlyProfitAccumulated
      });
    }
  } catch (error) {
    await session.abortTransaction();
    console.error('Profit update error:', error);
    return res.status(500).json({ 
      message: 'Error updating profit',
      error: error.message 
    });
  } finally {
    session.endSession();
  }
};


export const manualProfitUpdate = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userMachineId } = req.params;
    const { profitAmount } = req.body;

    if (!profitAmount || isNaN(profitAmount)) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Valid profit amount is required' });
    }

    const userMachine = await UserMachine.findById(userMachineId).session(session);

    if (!userMachine) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'User machine assignment not found' });
    }

    userMachine.monthlyProfitAccumulated += Number(profitAmount);
    userMachine.lastProfitUpdate = new Date();

    await userMachine.save({ session });
    await session.commitTransaction();

    res.status(200).json({
      message: 'Profit manually updated successfully',
      profitAdded: profitAmount,
      newTotal: userMachine.monthlyProfitAccumulated
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error in manual profit update:', error);
    res.status(500).json({ 
      message: 'Error updating profit manually',
      error: error.message 
    });
  } finally {
    session.endSession();
  }
};

export const processWithdrawal = async (req, res) => {
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

    // Calculate total available profit
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

    // Deduct profit from machines
    let remainingAmount = amount;
    for (const machine of userMachines) {
      if (remainingAmount <= 0) break;

      const machineProfit = machine.monthlyProfitAccumulated || 0;
      const deductAmount = Math.min(machineProfit, remainingAmount);

      machine.monthlyProfitAccumulated -= deductAmount;
      remainingAmount -= deductAmount;

      await machine.save({ session });
    }

    // Create transaction record
    const transaction = new Transaction({
      user: user._id,
      amount: amount,
      type: 'withdrawal',
      details: `Withdrawal of ${amount} from mining profits`
    });

    await transaction.save({ session });

    // Send confirmation email
 

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: 'Withdrawal processed successfully',
      withdrawnAmount: amount,
      remainingProfit: totalProfit - amount,
      transaction: transaction,
      userEmail: user.email
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Withdrawal error:', error);
    res.status(500).json({ 
      message: 'Error processing withdrawal',
      error: error.message 
    });
  }
};
// Get user's transaction history
export const getUserTransactions = async (req, res) => {
  try {
    // Change userId to userIdentifier to match route parameter
    const userIdentifier = req.params.userIdentifier;  // Changed from userId
    const { page = 1, limit = 10 } = req.query;
   
    console.log('Searching for user with identifier:', userIdentifier);
   
    if (!userIdentifier) {
      return res.status(400).json({
        message: 'User identifier is required',
      });
    }

    let user;
    if (mongoose.Types.ObjectId.isValid(userIdentifier)) {
      user = await User.findById(userIdentifier);
      console.log('Searched by ObjectId:', user ? 'found' : 'not found');
    } else {
      const decodedIdentifier = decodeURIComponent(userIdentifier).trim().toLowerCase();
      user = await User.findOne({
        email: { $regex: new RegExp(`^${decodedIdentifier}$`, 'i') }
      });
      console.log('Searched by email:', user ? 'found' : 'not found');
    }

    if (!user) {
      console.log('No user found. Attempted identifier:', userIdentifier);
      
      // For debugging
      const allUsers = await User.find({}, 'email');
      console.log('Available users in database:', allUsers.map(u => u.email));
      
      return res.status(404).json({
        message: 'User not found',
        identifier: userIdentifier
      });
    }

    const transactions = await Transaction.find({ user: user._id })
      .sort({ transactionDate: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .populate('user', 'firstName lastName email');

    const total = await Transaction.countDocuments({ user: user._id });

    res.status(200).json({
      transactions,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      totalTransactions: total,
      user: {
        id: user._id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`
      }
    });
  } catch (error) {
    console.error('Error retrieving transaction history:', error);
    res.status(500).json({
      message: 'Error retrieving transaction history',
      error: error.message
    });
  }
};
// Get all transactions (for admin panel)
export const getAllTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, sortBy = 'transactionDate', order = 'desc' } = req.query;

    const transactions = await Transaction.find()
      .sort({ [sortBy]: order })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'firstName lastName email');

    const total = await Transaction.countDocuments();

    res.status(200).json({
      transactions,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      totalTransactions: total
    });
  } catch (error) {
    console.error('Error retrieving all transactions:', error);
    res.status(500).json({ 
      message: 'Error retrieving transactions',
      error: error.message 
    });
  }
};

// Get user's current total profit (updated version)
export const getUserTotalProfit = async (req, res) => {
  try {
    const userIdentifier = req.params.userIdentifier;
    
    console.log('=== Get User Total Profit API ===');
    console.log('Received identifier:', userIdentifier);

    let user;
    // Check if the identifier is a valid MongoDB ObjectId
    if (mongoose.Types.ObjectId.isValid(userIdentifier)) {
      user = await User.findById(userIdentifier);
    } else {
      // If not a valid ObjectId, try email lookup
      const decodedIdentifier = decodeURIComponent(userIdentifier);
      user = await User.findOne({ email: decodedIdentifier });
    }

    if (!user) {
      return res.status(404).json({ 
        message: 'User not found',
        identifier: userIdentifier 
      });
    }

    const userMachines = await UserMachine.find({ 
      user: user._id,
      status: 'active'
    }).populate('machine');

    let totalProfit = 0;
    const machineDetails = [];

    for (const machine of userMachines) {
      const profit = machine.monthlyProfitAccumulated || 0;
      totalProfit += profit;
      machineDetails.push({
        machineId: machine.machine._id,
        machineName: machine.machine.machineName,
        profit: profit,
        assignedDate: machine.assignedDate,
        lastProfitUpdate: machine.lastProfitUpdate || machine.assignedDate
      });
    }

    res.status(200).json({
      userId: user._id,
      userEmail: user.email,
      userName: `${user.firstName} ${user.lastName}`,
      totalMachines: userMachines.length,
      totalProfit: totalProfit,
      machines: machineDetails.sort((a, b) => b.profit - a.profit) // Sort by profit descending
    });
  } catch (error) {
    console.error('Error in getUserTotalProfit:', error);
    res.status(500).json({ 
      message: 'Error calculating total profit',
      error: error.message 
    });
  }
};