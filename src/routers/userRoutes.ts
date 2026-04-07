// src/routers/userRoutes.ts
import express from 'express';
import multer from 'multer';
import path from 'path';
import {
  register,
  login,
  verifyOTP,
  getAllUsers,
  myProfile,
  deleteUser,
  editProfile,
  uploadAvatar,
  updatePassword,
  forgotPassword,
  verifyResetOTP,
  resetPassword,
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
} from '../controllers/userController.js';
import catchAsync from '../utils/catchAsync.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// --- Multer config for avatar uploads ---
const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(process.cwd(), 'uploads', 'avatars'));
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${uniqueSuffix}${ext}`);
  },
});
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (_req, file, cb) => {
    const allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];

    if (allowedMime.includes(file.mimetype) || (file.mimetype === 'application/octet-stream' && allowedExts.includes(ext))) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
    }
  },
});

// Public Routes
router.post('/register', catchAsync(register));
router.post('/login', catchAsync(login));
router.post('/verify-otp', catchAsync(verifyOTP));
router.post('/forgot-password', catchAsync(forgotPassword));
router.post('/verify-reset-otp', catchAsync(verifyResetOTP));
router.post('/reset-password', catchAsync(resetPassword));

// Public — view followers/following of any user
router.get('/:id/followers', catchAsync(getFollowers));
router.get('/:id/following', catchAsync(getFollowing));

// Protected Routes
router.get('/myProfile', protect, catchAsync(myProfile));
router.get('/my-profile', protect, catchAsync(myProfile)); // alias
router.get('/allUsers', protect, catchAsync(getAllUsers));
router.patch('/updateMe', protect, catchAsync(editProfile));
router.patch('/edit-profile', protect, catchAsync(editProfile)); // alias
router.post('/update-password', protect, catchAsync(updatePassword));
router.delete('/deleteMe', protect, catchAsync(deleteUser));

// Avatar upload (protected, multipart/form-data)
router.post('/upload-avatar', protect, avatarUpload.single('avatar'), catchAsync(uploadAvatar));

// Follow / Unfollow (protected)
router.post('/:id/follow', protect, catchAsync(followUser));
router.delete('/:id/unfollow', protect, catchAsync(unfollowUser));

export default router;
