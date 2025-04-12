import MiningMachine from "../model/MiningMachine.js";
import uploadToCloudinary from "../helper/cloudinary.js";
import { StatusCodes } from "http-status-codes";

// In the controller file

export const createMiningMachine = async (req, res) => {
  try {
    const {
      machineName,
      hashrate,
      powerConsumption,
      priceRange,
      coinsMined,
      monthlyProfit,
      description,
    } = req.body;  

    const imageUrls = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const imageUrl = await uploadToCloudinary(file.buffer);
        imageUrls.push(imageUrl);
      }
    }

    const miningMachine = await MiningMachine.create({
      machineName,
      hashrate,
      powerConsumption,
      priceRange: Number(priceRange),  // Ensure it's converted to Number
      coinsMined,
      monthlyProfit: Number(monthlyProfit),  // Ensure it's converted to Number
      description,
      images: imageUrls,
    });

    res.status(StatusCodes.CREATED).json({
      success: true,
      data: miningMachine,
    });
  } catch (error) {
    console.error("Error creating mining machine:", error);
    res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: error.message,
    });
  }
};

export const getAllMiningMachines = async (req, res) => {
  try {
    const miningMachines = await MiningMachine.find({
      $or: [
        { isShareBased: false },
        { isShareBased: { $exists: false } }
      ]
    }).sort("-createdAt");

    
    res.status(StatusCodes.OK).json({
      success: true,
      count: miningMachines.length,
      data: miningMachines,
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message,
    });
  }
};

export const getMiningMachineById = async (req, res) => {
  try {
    const miningMachine = await MiningMachine.findById(req.params.id);

    if (!miningMachine) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Mining machine not found",
      });
    }

    res.status(StatusCodes.OK).json({
      success: true,
      data: miningMachine,
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateMiningMachine = async (req, res) => {
  try {
    let miningMachine = await MiningMachine.findById(req.params.id);

    if (!miningMachine) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Mining machine not found",
      });
    }

    // Convert priceRange and monthlyProfit to Numbers if they exist in the request
    if (req.body.priceRange) {
      req.body.priceRange = Number(req.body.priceRange);
    }
    if (req.body.monthlyProfit) {
      req.body.monthlyProfit = Number(req.body.monthlyProfit);
    }

    // Handle new image uploads if any
    if (req.files && req.files.length > 0) {
      const newImageUrls = [];
      for (const file of req.files) {
        const imageUrl = await uploadToCloudinary(file.buffer);
        newImageUrls.push(imageUrl);
      }
      req.body.images = [...miningMachine.images, ...newImageUrls];
    }

    miningMachine = await MiningMachine.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    res.status(StatusCodes.OK).json({
      success: true,
      data: miningMachine,
    });
  } catch (error) {
    res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteMiningMachine = async (req, res) => {
  try {
    const miningMachine = await MiningMachine.findById(req.params.id);

    if (!miningMachine) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Mining machine not found",
      });
    }

    await miningMachine.deleteOne();

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Mining machine deleted successfully",
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message,
    });
  }
};
