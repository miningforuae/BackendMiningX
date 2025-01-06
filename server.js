import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import fs from 'node:fs';
import { setupAutoProfitUpdates } from "./cronJobs.js";

dotenv.config();
const app = express();
const port = process.env.PORT || 8000;

// CORS configuration - MUST come before routes
const allowedOrigins = [
  'https://mining-x.vercel.app',
  'https://mining-e4zz5rnqu-miningforuaes-projects.vercel.app',
  // Add any other origins you need
];

// Middleware
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      return callback(new Error('CORS not allowed'), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Set-Cookie']
}));

// Add security headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Expose-Headers', 'Set-Cookie');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    return res.status(200).json({});
  }
  next();
});

// Routes
const routeFiles = fs.readdirSync("./routes");
for (const file of routeFiles) {
  try {
    const route = await import(`./routes/${file}`);
    app.use("/api/v1", route.default);
  } catch (err) {
    console.error(`Failed to load route file: ${file}`, err.message);
  }
}

const server = async () => {
  try {
        await connect()
        setupAutoProfitUpdates()
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.log("Failed to strt server.....", error.message);
    process.exit(1);
  }
};

server();