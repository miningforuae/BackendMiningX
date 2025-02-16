// import UserMachine from '../model/UserMAchine.js';
// import User from '../model/UserModel.js';
// import MiningMachine from '../model/MiningMachine.js';
// import mongoose from 'mongoose';
// import { sendEmail } from '../helper/emailServer.js';
// import Transaction from "../model/withdrawals.js"

// export const assignMachineToUser = async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const { userId, machineId, quantity = 1 } = req.body;

//     if (!userId || !machineId || quantity < 1) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(400).json({ message: 'User ID, Machine ID, and valid quantity are required' });
//     }

//     const user = await User.findById(userId).session(session);
//     if (!user) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(404).json({ message: 'User not found' });
//     }

//     const machine = await MiningMachine.findById(machineId).session(session);
//     if (!machine) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(404).json({ message: 'Machine not found' });
//     }

//     // Create multiple assignments based on quantity
//     const assignments = [];
//     for (let i = 0; i < quantity; i++) {
//       const userMachine = new UserMachine({
//         user: userId,
//         machine: machineId,
//         assignedDate: new Date(),
//         status: 'active',
//         monthlyProfitAccumulated: 0
//       });
//       assignments.push(userMachine);
//     }

//     await UserMachine.insertMany(assignments, { session });

//     const emailData = {
//       userName: `${user.firstName} ${user.lastName}`,
//       machineName: machine.machineName.toString(),
//       quantity: quantity,
//       assignedDate: new Date().toLocaleDateString(),
//       machinePrice: machine.priceRange.toString(),
//       monthlyProfit: machine.monthlyProfit.toString(),
//       powerConsumption: machine.powerConsumption.toString()
//     };
//     await sendEmail(
//       user.email,
//       'New Mining Machines Assigned',
//       'machineAssignment',
//       emailData
//     );

//     await session.commitTransaction();
//     session.endSession();

//     // Populate the response with user and machine details
//     const populatedAssignments = await UserMachine.find({
//       _id: { $in: assignments.map(a => a._id) }
//     })
//       .populate('user', 'firstName lastName email')
//       .populate('machine', 'machineName model');

//     res.status(201).json(populatedAssignments);
//   } catch (error) {
//     await session.abortTransaction();
//     session.endSession();
//     console.error('Machine assignment error:', error);
//     res.status(500).json({ 
//       message: 'Error assigning machines to user',
//       error: error.message 
//     });
//   }
// };

// export const getUserMachines = async (req, res) => {
//   try {
//     const userIdentifier = req.params.userId;

//     if (!userIdentifier) {
//       return res.status(400).json({ message: 'User identifier is required' });
//     }

//     let user;
//     // Check if the identifier is a valid MongoDB ObjectId
//     const isValidObjectId = mongoose.Types.ObjectId.isValid(userIdentifier);

//     if (isValidObjectId) {
//       user = await User.findById(userIdentifier);
//     } else {
//       // If not a valid ObjectId, search by email
//       user = await User.findOne({ email: userIdentifier });
//     }

//     if (!user) {
//       return res.status(404).json({ 
//         message: 'User not found',
//         identifier: userIdentifier 
//       });
//     }

//     // Now that we have the user, find their machines using the _id
//     const userMachines = await UserMachine.find({ user: user._id })
//       .populate('user', 'firstName lastName email')
//       .populate('machine', 'machineName model');

//     if (userMachines.length === 0) {
//       return res.status(200).json([]); // Return empty array instead of 404
//     }

//     res.status(200).json(userMachines);
//   } catch (error) {
//     console.error('Error retrieving user machines:', error);
//     res.status(500).json({ 
//       message: 'Error retrieving user machines',
//       error: error.message 
//     });
//   }
// };

// export const removeUserMachine = async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const { userMachineId } = req.params;

//     // Validate userMachineId
//     if (!userMachineId) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(400).json({ message: 'User Machine ID is required' });
//     }

//     // Find and remove the user-machine assignment
//     const removedUserMachine = await UserMachine.findByIdAndDelete(userMachineId, { session });

//     if (!removedUserMachine) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(404).json({ message: 'User Machine assignment not found' });
//     }

//     await session.commitTransaction();
//     session.endSession();

//     res.status(200).json({ 
//       message: 'Machine assignment removed successfully',
//       removedUserMachine 
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     session.endSession();

//     console.error('Error removing user machine:', error);
//     res.status(500).json({ 
//       message: 'Error removing user machine assignment',
//       error: error.message 
//     });
//   }
// };

// export const getAllUserMachines = async (req, res) => {
//   try {
//     // Find all user-machine assignments with populated details
//     const userMachines = await UserMachine.find()
//       .populate('user', 'firstName lastName email')
//       .populate('machine', 'machineName model');

//     res.status(200).json(userMachines);
//   } catch (error) {
//     console.error('Error retrieving all user machines:', error);
//     res.status(500).json({ 
//       message: 'Error retrieving all user machines',
//       error: error.message 
//     });
//   }
// };
// export const getProfitUpdateStatus = async (req, res) => {
//   try {
//     const { userMachineId } = req.params;

//     const userMachine = await UserMachine.findById(userMachineId)
//       .populate('machine')
//       .populate('user', 'firstName lastName email');

//     if (!userMachine) {
//       return res.status(404).json({ message: 'User machine assignment not found' });
//     }

//     const lastUpdate = userMachine.lastProfitUpdate || userMachine.assignedDate;
//     const currentDate = new Date();
//     // Changed from days to hours
//     const hoursSinceUpdate = Math.floor((currentDate - lastUpdate) / (1000 * 60 * 60));

//     res.status(200).json({
//       userMachineId: userMachine._id,
//       userName: `${userMachine.user.firstName} ${userMachine.user.lastName}`,
//       machineName: userMachine.machine.machineName,
//       lastUpdateDate: lastUpdate,
//       hoursSinceLastUpdate: hoursSinceUpdate,
//       hoursUntilNextUpdate: Math.max(0, 1 - hoursSinceUpdate), // Changed from 30 days to 1 hour
//       currentAccumulatedProfit: userMachine.monthlyProfitAccumulated,
//       status: userMachine.status
//     });
//   } catch (error) {
//     console.error('Error getting profit update status:', error);
//     res.status(500).json({ 
//       message: 'Error getting profit update status',
//       error: error.message 
//     });
//   }
// };

// export const updateMonthlyProfit = async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const { userMachineId } = req.params;
    
//     const userMachine = await UserMachine.findById(userMachineId)
//       .populate('machine')
//       .session(session);

//     if (!userMachine) {
//       await session.abortTransaction();
//       return res.status(404).json({ message: 'User machine assignment not found' });
//     }

//     if (userMachine.status !== 'active') {
//       await session.abortTransaction();
//       return res.status(400).json({ message: 'Machine is not active' });
//     }

//     // Calculate profit since assignment or last update
//     const lastUpdate = userMachine.lastProfitUpdate || userMachine.assignedDate;
//     const currentDate = new Date();
    
//     // Calculate hours since last update
//     const hoursSinceUpdate = Math.floor(
//       (currentDate.getTime() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60)
//     );

//     // Debug logging
//     console.log('Profit Update Debug:', {
//       machineId: userMachineId,
//       lastUpdate: lastUpdate,
//       currentDate: currentDate,
//       hoursSinceUpdate: hoursSinceUpdate,
//       currentAccumulatedProfit: userMachine.monthlyProfitAccumulated,
//       machineProfit: userMachine.machine.ProfitAdmin
//     });

//     if (hoursSinceUpdate >= 1) {
//       const profitPerHour = userMachine.machine.ProfitAdmin / 24; // Daily profit divided by 24 hours
//       const profitToAdd = profitPerHour * hoursSinceUpdate;
      
//       userMachine.monthlyProfitAccumulated += profitToAdd;
//       userMachine.lastProfitUpdate = currentDate;

//       await userMachine.save({ session });
//       await session.commitTransaction();

//       return res.status(200).json({
//         message: 'Profit updated successfully',
//         hoursProcessed: hoursSinceUpdate,
//         profitAdded: profitToAdd,
//         newTotal: userMachine.monthlyProfitAccumulated,
//         nextUpdateIn: '1 hour'
//       });
//     } else {
//       await session.commitTransaction();
//       return res.status(200).json({
//         message: 'Too soon for next update',
//         minutesUntilNextUpdate: 60 - ((hoursSinceUpdate * 60) % 60),
//         currentProfit: userMachine.monthlyProfitAccumulated
//       });
//     }
//   } catch (error) {
//     await session.abortTransaction();
//     console.error('Profit update error:', error);
//     return res.status(500).json({ 
//       message: 'Error updating profit',
//       error: error.message 
//     });
//   } finally {
//     session.endSession();
//   }
// };


// export const manualProfitUpdate = async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const { userMachineId } = req.params;
//     const { profitAmount } = req.body;

//     if (!profitAmount || isNaN(profitAmount)) {
//       await session.abortTransaction();
//       return res.status(400).json({ message: 'Valid profit amount is required' });
//     }

//     const userMachine = await UserMachine.findById(userMachineId).session(session);

//     if (!userMachine) {
//       await session.abortTransaction();
//       return res.status(404).json({ message: 'User machine assignment not found' });
//     }

//     userMachine.monthlyProfitAccumulated += Number(profitAmount);
//     userMachine.lastProfitUpdate = new Date();

//     await userMachine.save({ session });
//     await session.commitTransaction();

//     res.status(200).json({
//       message: 'Profit manually updated successfully',
//       profitAdded: profitAmount,
//       newTotal: userMachine.monthlyProfitAccumulated
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     console.error('Error in manual profit update:', error);
//     res.status(500).json({ 
//       message: 'Error updating profit manually',
//       error: error.message 
//     });
//   } finally {
//     session.endSession();
//   }
// };

// ///purchase machine by user
// export const purchaseAndAssignMachine = async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const { userId, machineId, quantity = 1 } = req.body;

//     if (!userId || !machineId || quantity < 1) {
//       await session.abortTransaction();
//       return res.status(400).json({ message: 'User ID, Machine ID, and valid quantity are required' });
//     }

//     // Find user, machine and balance
//     const [user, machine, balance] = await Promise.all([
//       User.findById(userId).session(session),
//       MiningMachine.findById(machineId).session(session),
//       Balance.findOne({ user: userId }).session(session)
//     ]);

//     if (!user || !machine || !balance) {
//       await session.abortTransaction();
//       return res.status(404).json({ 
//         message: 'User, machine, or balance record not found' 
//       });
//     }

//     // Calculate total cost
//     const totalCost = machine.priceRange * quantity;

//     // Check if user has sufficient balance
//     if (balance.mainBalance < totalCost) {
//       await session.abortTransaction();
//       return res.status(400).json({ 
//         message: 'Insufficient balance',
//         required: totalCost,
//         current: balance.mainBalance
//       });
//     }

//     // Create purchase transaction
//     const transaction = new Transaction({
//       user: userId,
//       amount: totalCost,
//       type: 'MACHINE_PURCHASE',
//       status: 'completed',
//       balanceBefore: balance.totalBalance,
//       balanceAfter: balance.totalBalance - totalCost,
//       metadata: {
//         machineId: machine._id,
//         machineName: machine.machineName,
//         quantity: quantity,
//         pricePerUnit: machine.priceRange
//       }
//     });

//     // Update balance
//     balance.mainBalance -= totalCost;
//     balance.totalBalance = balance.mainBalance + balance.miningBalance;
//     balance.lastUpdated = new Date();

//     // Create machine assignments
//     const assignments = Array(quantity).fill().map(() => ({
//       user: userId,
//       machine: machineId,
//       assignedDate: new Date(),
//       status: 'active',
//       monthlyProfitAccumulated: 0
//     }));

//     // Save all changes
//     await Transaction.create([transaction], { session });
//     await balance.save({ session });
//     const userMachines = await UserMachine.create(assignments, { session });

//     await session.commitTransaction();

//     // Send email notification
//     try {
//       await sendEmail(
//         user.email,
//         'Mining Machine Purchase Confirmation',
//         'machinePurchase',
//         {
//           userName: `${user.firstName} ${user.lastName}`,
//           machineName: machine.machineName,
//           quantity: quantity,
//           totalCost: totalCost,
//           remainingBalance: balance.mainBalance,
//           machineDetails: {
//             price: machine.priceRange,
//             monthlyProfit: machine.monthlyProfit,
//             powerConsumption: machine.powerConsumption
//           }
//         }
//       );
//     } catch (emailError) {
//       console.error('Email notification failed:', emailError);
//     }

//     // Return populated response
//     const populatedMachines = await UserMachine.find({
//       _id: { $in: userMachines.map(m => m._id) }
//     })
//       .populate('user', 'firstName lastName email')
//       .populate('machine', 'machineName model priceRange monthlyProfit');

//     return res.status(201).json({
//       message: 'Machine(s) purchased and assigned successfully',
//       machines: populatedMachines,
//       transaction: {
//         id: transaction._id,
//         totalCost,
//         newBalance: balance.mainBalance
//       }
//     });

//   } catch (error) {
//     await session.abortTransaction();
//     console.error('Machine purchase error:', error);
//     return res.status(500).json({ 
//       message: 'Error purchasing machines',
//       error: error.message 
//     });
//   } finally {
//     session.endSession();
//   }
// };
// // Add this route to check if user can afford a machine
// export const checkPurchaseEligibility = async (req, res) => {
//   try {
//     const { userId, machineId, quantity = 1 } = req.query;

//     if (!userId || !machineId) {
//       return res.status(400).json({ message: 'User ID and Machine ID are required' });
//     }

//     const user = await User.findById(userId);
//     const machine = await MiningMachine.findById(machineId);

//     if (!user) {
//       return res.status(404).json({ message: 'User not found' });
//     }

//     if (!machine) {
//       return res.status(404).json({ message: 'Machine not found' });
//     }

//     const totalCost = machine.priceRange * quantity;
//     const canAfford = user.mainBalance >= totalCost;

//     res.status(200).json({
//       canPurchase: canAfford,
//       userBalance: user.mainBalance,
//       requiredAmount: totalCost,
//       shortfall: canAfford ? 0 : totalCost - user.mainBalance,
//       machine: {
//         name: machine.machineName,
//         pricePerUnit: machine.priceRange,
//         quantity: quantity
//       }
//     });

//   } catch (error) {
//     console.error('Eligibility check error:', error);
//     res.status(500).json({ 
//       message: 'Error checking purchase eligibility',
//       error: error.message 
//     });
//   }
// };


// export const sellUserMachine = async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const { userMachineId } = req.params;
    
//     // Find user machine with populated details
//     const userMachine = await UserMachine.findById(userMachineId)
//       .populate('user')
//       .populate('machine')
//       .session(session);

//     if (!userMachine) {
//       await session.abortTransaction();
//       return res.status(404).json({ message: 'User machine not found' });
//     }

//     // Verify machine is active
//     if (userMachine.status !== 'active') {
//       await session.abortTransaction();
//       return res.status(400).json({ message: 'Cannot sell inactive machine' });
//     }

//     // Calculate selling price (90% of original price)
//     const originalPrice = userMachine.machine.priceRange;
//     const sellingPrice = originalPrice * 0.9;
//     const deduction = originalPrice * 0.1;

//     // Find user's balance
//     const balance = await Balance.findOne({ user: userMachine.user._id }).session(session);
//     if (!balance) {
//       await session.abortTransaction();
//       return res.status(404).json({ message: 'User balance not found' });
//     }

//     // Create sale transaction record
//     const saleTransaction = new Transaction({
//       user: userMachine.user._id,
//       amount: sellingPrice,
//       type: 'MACHINE_SALE',
//       status: 'completed',
//       balanceBefore: balance.totalBalance,
//       balanceAfter: balance.totalBalance + sellingPrice,
//       metadata: {
//         machineId: userMachine.machine._id,
//         machineName: userMachine.machine.machineName,
//         originalPrice: originalPrice,
//         deduction: deduction,
//         sellingPrice: sellingPrice
//       }
//     });

//     // Update user's balance
//     balance.mainBalance += sellingPrice;
//     balance.totalBalance = balance.mainBalance + balance.miningBalance;
//     balance.lastUpdated = new Date();

//     // Set machine status to inactive
//     userMachine.status = 'inactive';

//     // Save all changes
//     await saleTransaction.save({ session });
//     await balance.save({ session });
//     await userMachine.save({ session });

//     await session.commitTransaction();

//     // Send email notification
//     try {
//       await sendEmail(
//         userMachine.user.email,
//         'Machine Sale Confirmation',
//         'machineSale',
//         {
//           machineName: userMachine.machine.machineName,
//           originalPrice: originalPrice,
//           deduction: deduction,
//           sellingPrice: sellingPrice,
//           newBalance: balance.totalBalance
//         }
//       );
//     } catch (emailError) {
//       console.error('Email notification failed:', emailError);
//     }

//     return res.status(200).json({
//       message: 'Machine sold successfully',
//       sale: {
//         originalPrice,
//         deduction,
//         sellingPrice,
//         machineDetails: {
//           name: userMachine.machine.machineName,
//           id: userMachine.machine._id
//         }
//       },
//       transaction: saleTransaction,
//       newBalance: {
//         total: balance.totalBalance,
//         main: balance.mainBalance,
//         mining: balance.miningBalance
//       }
//     });

//   } catch (error) {
//     await session.abortTransaction();
//     console.error('Machine sale error:', error);
//     return res.status(500).json({ 
//       message: 'Error processing machine sale',
//       error: error.message 
//     });
//   } finally {
//     session.endSession();
//   }
// };

// export const getSaleHistory = async (req, res) => {
//   try {
//     const { userId } = req.params;

//     const sales = await Transaction.find({
//       user: userId,
//       type: 'MACHINE_SALE'
//     }).sort({ createdAt: -1 });

//     return res.status(200).json({
//       sales: sales.map(sale => ({
//         transactionId: sale._id,
//         date: sale.createdAt,
//         machineName: sale.metadata.machineName,
//         originalPrice: sale.metadata.originalPrice,
//         deduction: sale.metadata.deduction,
//         sellingPrice: sale.metadata.sellingPrice,
//         balanceBefore: sale.balanceBefore,
//         balanceAfter: sale.balanceAfter
//       }))
//     });

//   } catch (error) {
//     console.error('Error fetching sale history:', error);
//     return res.status(500).json({ 
//       message: 'Error retrieving sale history',
//       error: error.message 
//     });
//   }
// };