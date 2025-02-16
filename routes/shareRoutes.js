import express from 'express';
import {
  createShareMachine,
  purchaseShares,
  getShareMachineDetails,
  getUserShareHoldings,
  updateShareProfits,
  getAllShareMachines
} from '../controller/shareMachineController.js';
import { protect, adminMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public routes
router.get('/share-machines', getAllShareMachines);
router.get('/share-machines/:machineId', getShareMachineDetails);

// Protected routes
router.get('/my-shares',protect. getUserShareHoldings);
router.post('/purchase-shares',protect. purchaseShares);

// Admin only routes
router.post('/create-share-machine',adminMiddleware, createShareMachine);
router.put('/update-profits/:machineId',adminMiddleware, updateShareProfits);

export default router;