import cron from 'node-cron';
import UserMachine from './model/UserMAchine.js';
import mongoose from 'mongoose';

const BATCH_SIZE = 100;

const updateMonthlyProfit = async (userMachineId) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const userMachine = await UserMachine.findById(userMachineId)
      .populate('machine')
      .session(session);

    if (!userMachine || userMachine.status !== 'active') {
      await session.abortTransaction();
      return;
    }

    const machineProfit = userMachine.machine.ProfitAdmin;
    const lastUpdate = userMachine.lastProfitUpdate || userMachine.assignedDate;
    const currentDate = new Date();
    
    // Changed to hours
    const hoursSinceUpdate = Math.floor(
      (currentDate - lastUpdate) / (1000 * 60 * 60)
    );

    if (hoursSinceUpdate >= 1) {  // Check if at least 1 hour has passed
      const periodsToUpdate = hoursSinceUpdate;  // Each hour is a period
      
      userMachine.monthlyProfitAccumulated += (machineProfit * periodsToUpdate);
      userMachine.lastProfitUpdate = new Date();

      await userMachine.save({ session });
      console.log(`Updated profit for machine ${userMachineId}: +${machineProfit * periodsToUpdate}`);
    }

    await session.commitTransaction();
    return { updated: hoursSinceUpdate >= 1, userMachineId };
  } catch (error) {
    await session.abortTransaction();
    console.error(`Error updating profit for machine ${userMachineId}:`, error);
    return { updated: false, userMachineId, error };
  } finally {
    session.endSession();
  }
};

export const setupAutoProfitUpdates = () => {
  // Run every hour
  cron.schedule('0 * * * *', async () => {
    console.log('Starting automated profit update:', new Date());
    
    try {
      const userMachines = await UserMachine.find({ status: 'active' })
        .populate('machine');

      for (const machine of userMachines) {
        const lastUpdate = machine.lastProfitUpdate || machine.assignedDate;
        const currentDate = new Date();
        const hoursSinceUpdate = Math.floor(
          (currentDate.getTime() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60)
        );

        if (hoursSinceUpdate >= 1) {
          const profitPerHour = machine.machine.ProfitAdmin / 24;
          const profitToAdd = profitPerHour * hoursSinceUpdate;

          machine.monthlyProfitAccumulated += profitToAdd;
          machine.lastProfitUpdate = currentDate;

          await machine.save();
          
          console.log(`Updated profit for machine ${machine._id}:`, {
            hoursProcessed: hoursSinceUpdate,
            profitAdded: profitToAdd,
            newTotal: machine.monthlyProfitAccumulated
          });
        }
      }
    } catch (error) {
      console.error('Auto profit update error:', error);
    }
  });
};