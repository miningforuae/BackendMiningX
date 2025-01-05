import express from "express";
import { getCurrentUser, loginUser, logoutUser, profile, registerUser } from "../controller/userController.js";
import { adminMiddleware, creatorMiddleware, protect } from "../middleware/authMiddleware.js";
import { deleteUser, getAllUsers } from "../controller/adminContoller.js";

const route=express.Router()

route.post("/register", registerUser);
route.post("/login", loginUser);
route.post("/logout", logoutUser); 
route.get("/profile", protect, profile);
route.get("/me", protect, getCurrentUser); // Add this new route



route.get("/admin/users", protect, adminMiddleware, getAllUsers);

route.delete("/admin/users/:id", protect, adminMiddleware, deleteUser);


export default route;