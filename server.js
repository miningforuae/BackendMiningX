import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import connect from "./config.js";
import fs from 'node:fs';
import { setupAutoProfitUpdates } from "./cronJobs.js";

const app = express();

// Define allowed origins
const allowedOrigins = [
  'https://www.theminerex.com',
  'https://mining-x-miningforuaes-projects.vercel.app',
  'http://localhost:3000', 
  'http://localhost:5173',  
  'http://127.0.0.1:3000', 
  'http://127.0.0.1:5173' 
].filter(Boolean);

// CORS configuration
const corsOptions = {
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('Blocked origin:', origin); // Helpful for debugging
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Set-Cookie'],
  maxAge: 86400
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Security headers middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,UPDATE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Middleware
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Dynamic route loading
const port = process.env.PORT || 8000;
const routeFiles = fs.readdirSync("./routes");

// Routes setup
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
    await connect();
    setupAutoProfitUpdates();
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
      console.log('Allowed origins:', allowedOrigins);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

server();