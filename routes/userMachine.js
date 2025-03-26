import express from "express";
import { protect, adminMiddleware } from "../middleware/authMiddleware.js";
import {
  assignMachineToUser,
  getAllUserMachines,
  getUserMachines,
  removeUserMachine,
} from "../controller/usermachine/machineController.js";
import {
  getMachineProfitPercentages,
  getProfitUpdateStatus,
  manualProfitUpdate,
  updateMonthlyProfit,
} from "../controller/usermachine/profitController.js";
import {
  checkPurchaseEligibility,
  getSaleHistory,
  purchaseAndAssignMachine,
  sellUserMachine,
} from "../controller/usermachine/transactionController.js";
import { getBalance, updateBalance } from "../controller/balanceController.js";

const router = express.Router();
/**
 * SECTION 1: Machine Management Routes
 * Handles basic CRUD operations for machine assignments
 */
router.route("/assign").post(protect, adminMiddleware, assignMachineToUser);

router.route("/userMachine/:userId").get(protect, getUserMachines);

router.route("/admin/all").get(protect, adminMiddleware, getAllUserMachines);

router
  .route("/:userMachineId")
  .delete(protect, adminMiddleware, removeUserMachine);

/**
 * SECTION 2: Profit Management Routes
 * Handles profit tracking, updates, and status checks
 */
router
  .route("/profit/status/:userMachineId")
  .get(protect, getProfitUpdateStatus);

router
  .route("/profit/manual/:userMachineId")
  .patch(protect, adminMiddleware, manualProfitUpdate);

router.route("/profit/:userMachineId").patch(protect, updateMonthlyProfit);

/**
 * SECTION 3: Transaction Management Routes
 * Handles purchases, sales, and related financial operations
 */
router.route("/purchaseMAchine").post(protect, purchaseAndAssignMachine);

router.route("/check-eligibility").get(protect, checkPurchaseEligibility);

// Update this route to be more specific
router.route("/sell-machine/:userMachineId").post(protect, sellUserMachine);

router.route("/sales-history/:userId").get(protect, getSaleHistory);

//balnce
router.route("/balance/:userId").get(protect, getBalance);

router.route("/balance/update").post(protect, adminMiddleware, updateBalance);

// Add to your routes file
router
  .route("/profit/percentages/:userId")
  .get(protect, getMachineProfitPercentages);

export default router;
