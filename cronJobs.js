import cron from 'node-cron';
import UserMachine from './model/UserMAchine.js';
import SharePurchase from './model/SharePurchase.js';
import Balance from './model/Balance.js';
import Transaction from './model/withdrawals.js';
import mongoose from 'mongoose';

export const setupAutoProfitUpdates = () => {
  // Run at midnight (00:00) every day
  cron.schedule('0 0 * * *', async () => {
    console.log('Starting automated monthly profit update:', new Date());
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
          
          // Calculate days since last update
          const daysSinceUpdate = Math.floor(
            (currentDate.getTime() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60 * 24)
          );
          
          // Only update if at least 30 days have passed
          if (daysSinceUpdate >= 30) {
            // Add full monthly profit
            const profitToAdd = machine.machine.monthlyProfit;
            
            machine.monthlyProfitAccumulated += profitToAdd;
            machine.lastProfitUpdate = currentDate;
            await machine.save({ session });

            console.log(`Updated normal machine ${machine._id}:`, {
              daysProcessed: daysSinceUpdate,
              profitAdded: profitToAdd,
              totalAccumulated: machine.monthlyProfitAccumulated
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
          
          // Calculate days since last update
          const daysSinceUpdate = Math.floor(
            (currentDate.getTime() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60 * 24)
          );
          
          // Only update if at least 30 days have passed
          if (daysSinceUpdate >= 30) {
            // Calculate full monthly profit
            const profitToAdd = Number(
              (share.profitPerShare * share.numberOfShares).toFixed(4)
            );

            // Find or create user balance
            let userBalance = await Balance.findOne({ user: share.user }).session(session);
            if (!userBalance) {
              userBalance = new Balance({
                user: share.user,
                miningBalance: 0,
                adminAdd: 0,
                totalBalance: 0
              });
            }

            // Update user balance
            userBalance.miningBalance += profitToAdd;
            userBalance.totalBalance = userBalance.adminAdd + userBalance.miningBalance;
            userBalance.lastUpdated = currentDate;
            await userBalance.save({ session });

            // Update share record
            share.totalProfitEarned += profitToAdd;
            share.lastProfitUpdate = currentDate;
            await share.save({ session });

            // Create transaction record
            await Transaction.create([{
              user: share.user,
              amount: profitToAdd,
              type: 'SHARE_PROFIT',
              status: 'completed',
              balanceBefore: userBalance.totalBalance - profitToAdd,
              balanceAfter: userBalance.totalBalance,
              details: `Monthly profit for ${share.numberOfShares} shares (after ${daysSinceUpdate} days)`,
              transactionDate: currentDate,
              metadata: {
                shareId: share._id,
                machineId: share.machine._id,
                machineName: share.machine.machineName,
                numberOfShares: share.numberOfShares,
                profitPerShare: share.profitPerShare,
                daysSinceLastUpdate: daysSinceUpdate
              }
            }], { session });

            console.log(`Updated share ${share._id}:`, {
              daysProcessed: daysSinceUpdate,
              profitAdded: profitToAdd,
              newTotal: share.totalProfitEarned
            });
          }
        }
      });
      
      console.log('Monthly profit update completed successfully');
    } catch (error) {
      console.error('Monthly profit update error:', error);
      await session.abortTransaction();
    } finally {
      session.endSession();
    }
  });
};