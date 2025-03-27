import cron from 'node-cron';
import UserMachine from './model/UserMAchine.js';
import SharePurchase from './model/SharePurchase.js';
import Balance from './model/Balance.js';
import Transaction from './model/withdrawals.js';
import mongoose from 'mongoose';

export const setupAutoProfitUpdates = () => {
  // Run every hour
  cron.schedule('0 * * * *', async () => {
    console.log('Starting automated profit update:', new Date());


    try {
      // ✅ Normal Machine Profit Update
      const userMachines = await UserMachine.find({ status: 'active' }).populate('machine');

      for (const machine of userMachines) {
        const lastUpdate = machine.lastProfitUpdate || machine.assignedDate;
        const currentDate = new Date();
        const hoursSinceUpdate = Math.floor(
          (currentDate.getTime() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60)
        );

        if (hoursSinceUpdate >= 1) {
          const profitPerHour = machine.machine.monthlyProfit;
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

      // ✅ Share Machine Profit Update
      console.log('Starting share machine profit update:', new Date());

      const activeShares = await SharePurchase.find({ status: 'active' }).populate('machine');

      for (const share of activeShares) {
        const lastUpdate = share.lastProfitUpdate || share.purchaseDate;
        const currentDate = new Date();
        const hoursSinceUpdate = Math.floor(
          (currentDate.getTime() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60)
        );

        if (hoursSinceUpdate >= 1) {
          const profitPerHour = share.profitPerShare ; 
          const profitToAdd = profitPerHour * share.numberOfShares * hoursSinceUpdate;

          // Update user balance
          let userBalance = await Balance.findOne({ user: share.user });
          if (!userBalance) {
            userBalance = new Balance({ user: share.user, miningBalance: 0 });
          }
          userBalance.miningBalance += profitToAdd;
          userBalance.lastUpdated = currentDate;
          await userBalance.save();

          // Record the transaction
          await Transaction.create({
            user: share.user,
            amount: profitToAdd,
            transactionDate: currentDate,
            type: 'SHARE_PROFIT',
            status: 'completed',
            details: `Profit added for ${hoursSinceUpdate} hour(s) from shared machine`
          });

          // Update the last profit update time
          share.lastProfitUpdate = currentDate;
          await share.save();

          console.log(`Updated share profit for user ${share.user}:`, {
            hoursProcessed: hoursSinceUpdate,
            profitAdded: profitToAdd,
            newBalance: userBalance.miningBalance
          });
        }
      }
    } catch (error) {
      console.error('Auto profit update error:', error);
    }
  });
};
