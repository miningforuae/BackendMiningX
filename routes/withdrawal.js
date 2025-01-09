import express from 'express';
import { protect, adminMiddleware } from '../middleware/authMiddleware.js';
import {
  requestWithdrawal,
  processWithdrawalRequest,
  getPendingWithdrawals,
  getUserWithdrawals,
  getWithdrawalStats
} from '../controller/withdrawalContoller.js';

const router = express.Router();

// Route prefix: /api/v1/withdrawals
router.post('/withdrawals/request', protect, requestWithdrawal);
router.post('/withdrawals/process', protect, adminMiddleware, processWithdrawalRequest);
router.get('/withdrawals/pending', protect, adminMiddleware, getPendingWithdrawals);
router.get('/withdrawals/by-email', protect, getUserWithdrawals);router.get('/withdrawals/stats', protect, adminMiddleware, getWithdrawalStats);

export default router;