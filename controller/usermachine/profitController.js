// profitController.js
import UserMachine from '../../model/UserMAchine.js';
import Balance from '../../model/Balance.js';
import mongoose from 'mongoose';
import { sendEmail } from '../../helper/emailServer.js';

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
    const hoursSinceUpdate = Math.floor((currentDate - lastUpdate) / (1000 * 60 * 60));

    res.status(200).json({
      userMachineId: userMachine._id,
      userName: `${userMachine.user.firstName} ${userMachine.user.lastName}`,
      machineName: userMachine.machine.machineName,
      lastUpdateDate: lastUpdate,
      hoursSinceLastUpdate: hoursSinceUpdate,
      hoursUntilNextUpdate: Math.max(0, 1 - hoursSinceUpdate),
      currentAccumulatedProfit: userMachine.monthlyProfitAccumulated,
      status: userMachine.status
    });
  } catch (error) {
    console.error('Error getting profit update status:', error);
    res.status(500).json({ message: 'Error getting profit update status', error: error.message });
  }
};

export const updateMonthlyProfit = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userMachineId } = req.params;
    
    const userMachine = await UserMachine.findById(userMachineId)
      .populate('machine')
      .populate('user')
      .session(session);

    if (!userMachine) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'User machine not found' });
    }

    // Calculate profit
    const lastUpdate = userMachine.lastProfitUpdate || userMachine.assignedDate;
    const currentDate = new Date();
    const hoursSinceUpdate = Math.floor(
      (currentDate - lastUpdate) / (1000 * 60 * 60)
    );

    if (hoursSinceUpdate >= 1) {
      const profitPerHour = userMachine.machine.monthlyProfit ;
      const profitToAdd = profitPerHour * hoursSinceUpdate;
      
      // Update machine's accumulated profit
      userMachine.monthlyProfitAccumulated += profitToAdd;
      userMachine.lastProfitUpdate = currentDate;

      // Update user's balance
      const balance = await Balance.findOne({ user: userMachine.user._id }).session(session);
      if (!balance) {
        await session.abortTransaction();
        return res.status(404).json({ message: 'Balance record not found' });
      }

      // Add profit to mining balance
      balance.miningBalance += profitToAdd;
      balance.totalBalance = balance.adminAdd + balance.miningBalance;
      balance.lastUpdated = currentDate;

      // Save all changes
      await userMachine.save({ session });
      await balance.save({ session });
      await session.commitTransaction();

      return res.status(200).json({
        message: 'Profit updated successfully',
        profitAdded: profitToAdd,
        newMachineTotal: userMachine.monthlyProfitAccumulated,
        newBalance: {
          total: balance.totalBalance,
          mining: balance.miningBalance,
          adminAdd: balance.adminAdd
        }
      });
    } else {
      await session.abortTransaction();
      return res.status(200).json({
        message: 'Too soon for next update',
        minutesUntilNextUpdate: 60 - ((hoursSinceUpdate * 60) % 60)
      });
    }
  } catch (error) {
    await session.abortTransaction();
    console.error('Profit update error:', error);
    return res.status(500).json({ message: 'Error updating profit' });
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
    res.status(500).json({ message: 'Error updating profit manually', error: error.message });
  } finally {
    session.endSession();
  }
};