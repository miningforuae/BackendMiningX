import cron from 'node-cron';
import UserMachine from './model/UserMachine.js';
import SharePurchase from './model/SharePurchase.js';
import Balance from './model/Balance.js';
import Transaction from './model/withdrawals.js';
import mongoose from 'mongoose';

export const setupAutoProfitUpdates = () => {
  // Run every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    console.log('Starting automated profit update:', new Date());
    const session = await mongoose.startSession();
    
    try {
      await session.withTransaction(async () => {

        console.log('Processing normal machines...');
        const userMachines = await UserMachine.find({ status: 'active' })
          .populate('machine')
          .session(session);

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
            await machine.save({ session });

            console.log(`Updated normal machine ${machine._id}:`, {
              hoursProcessed: hoursSinceUpdate,
              profitAdded: profitToAdd
            });
          }
        }


        console.log('Processing share machines...');
        const activeShares = await SharePurchase.find({ status: 'active' })
          .populate('machine')
          .session(session);

        for (const share of activeShares) {
          const lastUpdate = share.lastProfitUpdate || share.purchaseDate;
          const currentDate = new Date();
          const hoursSinceUpdate = Math.floor(
            (currentDate.getTime() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60)
          );

          if (hoursSinceUpdate >= 1) {
            const hourlyProfitPerShare = share.profitPerShare / (30 * 24); // Convert monthly to hourly
            const profitToAdd = Number(
              (hourlyProfitPerShare * share.numberOfShares * hoursSinceUpdate).toFixed(4)
            );

            // Update balance
            let userBalance = await Balance.findOne({ user: share.user }).session(session);
            if (!userBalance) {
              userBalance = new Balance({
                user: share.user,
                miningBalance: 0,
                adminAdd: 0,
                totalBalance: 0
              });
            }

            userBalance.miningBalance += profitToAdd;
            userBalance.totalBalance = userBalance.adminAdd + userBalance.miningBalance;
            userBalance.lastUpdated = currentDate;
            await userBalance.save({ session });

            // Update share record
            share.totalProfitEarned += profitToAdd;
            share.lastProfitUpdate = currentDate;
            await share.save({ session });

            // Create transaction
            await Transaction.create([{
              user: share.user,
              amount: profitToAdd,
              type: 'SHARE_PROFIT',
              status: 'completed',
              balanceBefore: userBalance.totalBalance - profitToAdd,
              balanceAfter: userBalance.totalBalance,
              details: `Hourly profit for ${share.numberOfShares} shares (${hoursSinceUpdate} hours)`,
              transactionDate: currentDate
            }], { session });

            console.log(`Updated share ${share._id}:`, {
              hoursProcessed: hoursSinceUpdate,
              profitAdded: profitToAdd,
              newTotal: share.totalProfitEarned
            });
          }
        }
      });
    } catch (error) {
      console.error('Auto profit update error:', error);
      await session.abortTransaction();
    } finally {
      session.endSession();
    }
  });
};