import express from 'express';
import { protect, adminMiddleware } from '../middleware/authMiddleware.js';
import {
  assignMachineToUser,
  getUserMachines,
  updateMonthlyProfit,
  removeUserMachine,
  getAllUserMachines,
  getProfitUpdateStatus,
  manualProfitUpdate,
  // Add new imports
  processWithdrawal,
  getUserTransactions,
  getAllTransactions,
  getUserTotalProfit
} from '../controller/UserMachine.js';

const router = express.Router();

// Existing routes
router.post('/assign', protect, adminMiddleware, assignMachineToUser);
router.get('/userMachine/:userId', protect, getUserMachines);
router.get('/admin/all', protect, adminMiddleware, getAllUserMachines);
router.get('/profit/status/:userMachineId', protect, adminMiddleware, getProfitUpdateStatus);
router.patch('/profit/manual/:userMachineId', protect, adminMiddleware, manualProfitUpdate);
router.patch('/profit/:userMachineId', protect, adminMiddleware, updateMonthlyProfit);
router.delete('/:userMachineId', protect, adminMiddleware, removeUserMachine);

// New routes for withdrawal and transactions
router.post('/withdrawal', protect, processWithdrawal);  // User can withdraw
router.get('/transactions/:userIdentifier', protect, getUserTransactions);
router.get('/admin/transactions', protect, adminMiddleware, getAllTransactions);  // Admin can view all transactions
router.get('/total-profit/:userIdentifier', protect, getUserTotalProfit);

export default router;