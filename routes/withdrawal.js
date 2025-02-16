import express from 'express';
import { protect, adminMiddleware } from '../middleware/authMiddleware.js';
import {
  requestWithdrawal,
  processWithdrawalRequest,
  getPendingWithdrawals,
  getUserWithdrawals,
  getWithdrawalStats,
  getAllWithdrawals,
  getBalanceHistory,
} from '../controller/withdrawalContoller.js';

const router = express.Router();

// Route prefix: /api/v1/withdrawals
router.post('/withdrawals/request', protect, requestWithdrawal);
router.post('/withdrawals/process', protect, adminMiddleware, processWithdrawalRequest);
router.get('/withdrawals/pending', protect, adminMiddleware, getPendingWithdrawals);
router.get('/withdrawals/by-email', protect, getUserWithdrawals);router.get('/withdrawals/stats', protect, adminMiddleware, getWithdrawalStats);
// Add this to your existing router
router.get('/withdrawals/all', protect, adminMiddleware, getAllWithdrawals);



//blance update routes
router.get('/balanceUpade/history', protect, getBalanceHistory);
export default router;