import express from 'express';
import {
  getSpecialShareMachine,
  purchaseSpecialShares,
  updateAllShareProfits,
  getUserShareDetails
} from '../controller/shareMachineController.js';
import { protect, adminMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public routes
router.get('/special-machine', getSpecialShareMachine);

// Protected routes
router.post('/purchase', protect, purchaseSpecialShares);
router.get('/user-shares/:userId', protect, getUserShareDetails);

// Admin only routes
router.post('/update-profits', adminMiddleware, updateAllShareProfits);

export default router;