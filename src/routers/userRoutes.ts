// src/routers/userRoutes.ts
import express from 'express';
import {
  register,
  login,
  verifyOTP,
  getAllUsers,
  myProfile,
  deleteUser,
  editProfile,
  updatePassword,
  forgotPassword,
  verifyResetOTP,
  resetPassword
} from '../controllers/userController';
import catchAsync from '../utils/catchAsync';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

// Public Routes
router.post('/register', catchAsync(register));
router.post('/login', catchAsync(login));
router.post('/verify-otp', catchAsync(verifyOTP));
router.post('/forgot-password', catchAsync(forgotPassword));
router.post('/verify-reset-otp', catchAsync(verifyResetOTP));
router.post('/reset-password', catchAsync(resetPassword));

// Protected Routes
// 'protect' and 'myProfile' now have matching types (Request, Response, Next)
router.get('/myProfile', protect, catchAsync(myProfile));
router.get('/allUsers', protect, catchAsync(getAllUsers));
router.patch('/updateMe', protect, catchAsync(editProfile));
router.post('/update-password', protect, catchAsync(updatePassword));
router.delete('/deleteMe', protect, catchAsync(deleteUser));

export default router;