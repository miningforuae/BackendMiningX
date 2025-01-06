// server.js
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import connect from "./config.js";

import fs from 'node:fs';
import { setupAutoProfitUpdates } from "./cronJobs.js";
const app = express();

// Define allowed origins
const allowedOrigins = [
  'https://mining-x.vercel.app',
  'https://mining-e4zz5rnqu-miningforuaes-projects.vercel.app',
  // Add local development URL if needed
  process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : null
].filter(Boolean);

// CORS configuration
const corsOptions = {
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Set-Cookie'],
  maxAge: 86400 // Preflight results can be cached for 24 hours
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Additional security headers middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,UPDATE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Cookie parser middleware with secure options
app.use(cookieParser());

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const port = process.env.PORT || 8000;
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