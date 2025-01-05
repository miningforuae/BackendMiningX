// routes/miningMachineRoutes.js
import express from "express";
import multer from "multer";
import {
  createMiningMachine,
  getAllMiningMachines,
  getMiningMachineById,
  updateMiningMachine,
  deleteMiningMachine,
} from "../controller/MiningContoller.js";

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.post("/mining-machines", upload.array("images", 5), createMiningMachine);
router.get("/mining-machines", getAllMiningMachines);
router.get("/mining-machines/:id", getMiningMachineById);
router.put(
  "/mining-machines/:id",
  upload.array("images", 5),
  updateMiningMachine
);
router.delete("/mining-machines/:id", deleteMiningMachine);

export default router;
``;
