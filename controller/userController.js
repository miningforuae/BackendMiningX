import asyncHandler from "express-async-handler";
import User from "../model/UserModel.js";
import generateToken from "../helper/generateToken.js";
import bcrypt from "bcrypt";
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import ejs from 'ejs';
import { fileURLToPath } from 'url';
import path from 'path';
import { sendEmail } from "../helper/emailServer.js";

// Load environment variables
dotenv.config();
const __filename = fileURLToPath(import.meta.url);


export const registerUser = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password , country ,phoneNumber } = req.body;

  // Input validation
  if (!firstName || !lastName || !email || !password || !country ||!phoneNumber) {
      return res.status(400).json({ message: "All fields are required" });
  }
  if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" });
  }

  try {
      // Check if user exists
      const userExists = await User.findOne({ email });
      if (userExists) {
          return res.status(400).json({ message: "User already exists" });
      }

      // Create user
      const user = await User.create({ firstName, lastName, email, password ,country,phoneNumber });
 
      if (user) {
          // Generate token and set cookie
          const token = generateToken(user._id);
          const cookieOptions = {
            httpOnly: true,
            secure: true, // Must be true for cross-origin cookies
            sameSite: 'none', // Required for cross-origin
            path: '/',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
          };
          res.cookie('token', token, cookieOptions);
        
          try {
              await sendEmail(
                  email,
                  "Welcome to Our Platform!",
                  "welcome",
                  { firstName, email }
              );
          } catch (emailError) {
              console.error("Welcome email failed:", emailError);
              // Continue with registration even if email fails
              // You might want to log this to a monitoring service
          }

          res.status(200).json({
            user: {
              _id: user._id.toString(), // Ensure it's a string
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              role: user.role,
              country: user.country, 
              phoneNumber:user.phoneNumber,

            },
            token: token // Include the token in the response
          });
      } else {
          return res.status(400).json({ message: "Invalid user data" });
      }
  } catch (error) {
      console.error("Registration error:", error);
      return res.status(500).json({ message: "Server error", error: error.message });
  }
});


// Login user
export const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const user = await User.findOne({ email });

  if (!user) {
    return res.status(404).json({ message: "User not found, please sign up" });
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    return res.status(400).json({ message: "Invalid email or password" });
  }

  const token = generateToken(user._id);

  const cookieOptions = {
    httpOnly: true,
    secure: true, // Must be true for cross-origin cookies
    sameSite: 'none', // Required for cross-origin
    path: '/',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  };
  res.cookie('token', token, cookieOptions);

  
  res.status(200).json({
    _id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role, 
    phoneNumber:user.phoneNumber,
    mainBalance:user.mainBalance
  });
});


export const verifyPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ message: "Password is required" });
  }

  const user = await User.findById(req.user._id);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    return res.status(400).json({ message: "Invalid password" });
  }

  res.status(200).json({ message: "Password verified successfully" });
});



export const getCurrentUser = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role:user.role,
      phoneNumber:user.phoneNumber,
      country: user.country, // Include country in response
      mainBalance:user.mainBalance
    });
  } catch (error) {
    console.error("Get current user error:", error);
    res.status(500).json({ message: "Server error" });
  }
});


export const logoutUser = asyncHandler(async (req, res) => {
  const cookieOptions = {
    httpOnly: true,
    secure: true, 
    sameSite: 'none', 
    path: '/',
  };
  
  res.clearCookie("token", cookieOptions);
  res.status(200).json({ message: "User logged out successfully" });
});

export const profile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("-password");

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.status(200).json({
    name: user.name,
    email: user.email,
    role: user.role,

  });
});


export const updateProfile = asyncHandler(async (req, res) => {
  const { firstName, lastName, country, phoneNumber } = req.body;

  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update only the fields that are provided
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (country) user.country = country;
    if (phoneNumber) user.phoneNumber = phoneNumber;

    // Save the updated user
    const updatedUser = await user.save();

    res.status(200).json({
      _id: updatedUser._id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
      role: updatedUser.role,
      country: updatedUser.country,
      phoneNumber: updatedUser.phoneNumber
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});