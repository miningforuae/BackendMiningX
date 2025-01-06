import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connect from "./config.js";
import cookieParser from "cookie-parser";
import fs from 'node:fs'
import { setupAutoProfitUpdates } from "./cronJobs.js";

dotenv.config();
const app = express();


const port = process.env.PORT || 8000;
const routeFiles = fs.readdirSync("./routes");

routeFiles.forEach((file) => {
  // use dynamic import
  import(`./routes/${file}`)
    .then((route) => {
      app.use("/api/v1", route.default);
    })
    .catch((err) => {
      console.error(`Failed to load route file: ${file}`, err.message);
    });
});

// middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Expose-Headers', 'Set-Cookie');
  next();
});
app.options('*', cors()); // enable pre-flight

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  cors({
    origin: [
      'https://mining-x.vercel.app',
      'https://mining-e4zz5rnqu-miningforuaes-projects.vercel.app'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);


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