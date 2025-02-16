// machineController.js
import UserMachine from '../../model/UserMAchine.js';
import MiningMachine from '../../model/MiningMachine.js';
import mongoose from 'mongoose';
import { sendEmail } from '../../helper/emailServer.js';
import User from '../../model/UserModel.js';



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
      machinePrice: machine.priceRange.toString(),
      monthlyProfit: machine.monthlyProfit.toString(),
      powerConsumption: machine.powerConsumption.toString()
    };
    
    await sendEmail(user.email, 'New Mining Machines Assigned', 'machineAssignment', emailData);
    await session.commitTransaction();

    const populatedAssignments = await UserMachine.find({
      _id: { $in: assignments.map(a => a._id) }
    })
      .populate('user', 'firstName lastName email')
      .populate('machine', 'machineName model');

    res.status(201).json(populatedAssignments);
  } catch (error) {
    await session.abortTransaction();
    console.error('Machine assignment error:', error);
    res.status(500).json({ message: 'Error assigning machines to user', error: error.message });
  } finally {
    session.endSession();
  }
};

export const getUserMachines = async (req, res) => {
  try {
    const userIdentifier = req.params.userId;

    if (!userIdentifier) {
      return res.status(400).json({ message: 'User identifier is required' });
    }

    let user;
    const isValidObjectId = mongoose.Types.ObjectId.isValid(userIdentifier);

    if (isValidObjectId) {
      user = await User.findById(userIdentifier);
    } else {
      user = await User.findOne({ email: userIdentifier });
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found', identifier: userIdentifier });
    }

    const userMachines = await UserMachine.find({ user: user._id })
      .populate('user', 'firstName lastName email')
      .populate('machine', 'machineName model');

    res.status(200).json(userMachines.length === 0 ? [] : userMachines);
  } catch (error) {
    console.error('Error retrieving user machines:', error);
    res.status(500).json({ message: 'Error retrieving user machines', error: error.message });
  }
};

export const removeUserMachine = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userMachineId } = req.params;

    if (!userMachineId) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'User Machine ID is required' });
    }

    const removedUserMachine = await UserMachine.findByIdAndDelete(userMachineId, { session });

    if (!removedUserMachine) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'User Machine assignment not found' });
    }

    await session.commitTransaction();
    res.status(200).json({ message: 'Machine assignment removed successfully', removedUserMachine });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error removing user machine:', error);
    res.status(500).json({ message: 'Error removing user machine assignment', error: error.message });
  } finally {
    session.endSession();
  }
};

export const getAllUserMachines = async (req, res) => {
  try {
    const userMachines = await UserMachine.find()
      .populate('user', 'firstName lastName email')
      .populate('machine', 'machineName model');

    res.status(200).json(userMachines);
  } catch (error) {
    console.error('Error retrieving all user machines:', error);
    res.status(500).json({ message: 'Error retrieving all user machines', error: error.message });
  }
};