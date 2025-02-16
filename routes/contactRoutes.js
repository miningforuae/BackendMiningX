import express from 'express';
import { protect, adminMiddleware } from '../middleware/authMiddleware.js';
import {
  getAllContacts,
  getContactById,
  createContact,
  markAsRead,
  deleteContact,
  getContactStats
} from '../controller/contactController.js';

const router = express.Router();

// Public route for form submission
router.post('/contacts', createContact);

// Admin routes
router.get('/contacts/all', protect, adminMiddleware, getAllContacts);
router.get('/contacts/stats', protect, adminMiddleware, getContactStats);
router.get('/contacts/:id', protect, adminMiddleware, getContactById);
router.put('/contacts/:id/read', protect, adminMiddleware, markAsRead);
router.delete('/contacts/:id', protect, adminMiddleware, deleteContact);

export default router;