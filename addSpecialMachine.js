import mongoose from 'mongoose';
import MiningMachine from './model/MiningMachine.js';  // Fixed path
import dotenv from 'dotenv';

dotenv.config();

// Function to connect to MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

// Function to add the special machine
const addSpecialMachine = async () => {
  try {
    await connectDB();
    
    // Check if the special machine already exists to avoid duplicates
    const existingMachine = await MiningMachine.findOne({ 
      machineName: "Premium Share Mining Machine",
      isShareBased: true,
      priceRange: 19000
    });
    
    if (existingMachine) {
      console.log("Special share machine already exists:", existingMachine._id);
      return existingMachine;
    }
    
    // Create the special machine
    const specialMachine = await MiningMachine.create({
      machineName: "Premium Share Mining Machine",
      hashrate: "180 TH/s",
      powerConsumption: 3400,
      priceRange: 19000,
      coinsMined: "Bitcoin",
      monthlyProfit: 3500,  // Total monthly profit of the machine
      description: "Premium mining machine available for share-based investment. Purchase shares and earn proportional profits each month. Each share costs $50 and earns $9.21 monthly.",
      images: ["https://example.com/premium-miner-image.jpg"],  // Replace with actual image URLs
      isShareBased: true,
      sharePrice: 50,
      totalShares: 380,
      availableShares: 380,
      profitPerShare: 9.21
    });
    
    console.log("Special share machine created successfully:", specialMachine);
    return specialMachine;
    
  } catch (error) {
    console.error("Error creating special machine:", error);
    throw error;
  } finally {
    // Close the connection
    mongoose.connection.close();
    console.log("MongoDB connection closed");
  }
};

// ES Module compatible way to run the script directly
// This replaces the require.main === module check
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  addSpecialMachine()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

export { addSpecialMachine };