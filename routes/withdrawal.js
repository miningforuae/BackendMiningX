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

// User routes
router.post('/request', protect, requestWithdrawal);
router.get('/user/:userId', protect, getUserWithdrawals);

// Admin routes
router.post('/process', protect, adminMiddleware, processWithdrawalRequest);
router.get('/pending', protect, adminMiddleware, getPendingWithdrawals);
router.get('/stats', protect, adminMiddleware, getWithdrawalStats);

export default router;