// src/controller/userController.ts
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { sendEmail } from '../utils/emailService.js';
import path from 'path';
import fs from 'fs';
import prisma from '../models/index.js';
import { AuthRequest } from '../middleware/authMiddleware.js';
import { getOTPTemplate } from '../utils/emailTemplates.js';

const generateOTP = () => Math.floor(10000 + Math.random() * 90000).toString();

const sendOTPEmail = async (email: string, name: string, otp: string, type: 'registration' | 'forgot_password') => {
  const isRegistration = type === 'registration';
  const { success, error } = await sendEmail({
    to: email,
    subject: isRegistration ? "Verify your YourTales account" : "Reset your YourTales password",
    html: getOTPTemplate(name, otp, type),
  });

  if (!success) {
    console.error(`Error sending ${type} email:`, error);
    console.warn(`OTP for ${email} (email failed): ${otp}`);
    return;
  }

  console.log(`${type} OTP sent to ${email}`);
};

// --- Controllers ---

export const register = async (req: Request, res: Response) => {
  const { fullName, email, password, role } = req.body;

  if (!fullName || !email || !password) {
    return res.status(400).json({ message: 'Full Name, email, and password are required.' });
  }

  // Check if user exists
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return res.status(400).json({ message: 'Email already in use' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const otp = generateOTP();

  // Validate Role to ensure users cannot self-register as EDITOR or ADMIN
  const allowedRoles = ['AUTHOR', 'READER'];
  const assignedRole = role && allowedRoles.includes(role.toUpperCase()) ? role.toUpperCase() : 'READER';

  // Create User
  const user = await prisma.user.create({
    data: {
      fullName,
      email,
      passwordHash: hashedPassword,
      otpCode: otp,
      role: assignedRole,
    },
  });

  await sendOTPEmail(email, fullName, otp, 'registration');

  return res.status(201).json({
    message: 'User registered successfully. Please verify your OTP.',
    userId: user.id
  });
};

export const verifyOTP = async (req: Request, res: Response) => {
  const { email, otp } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) return res.status(404).json({ message: 'User not found.' });
  if (user.otpVerified) return res.status(200).json({ message: 'User is already verified.' });
  if (user.otpCode !== otp) return res.status(400).json({ message: 'Invalid OTP.' });

  await prisma.user.update({
    where: { email },
    data: { otpVerified: true, otpCode: null },
  });

  return res.status(200).json({ message: 'Account verified successfully. You may now login.' });
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.passwordHash) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  if (!user.otpVerified) {
    return res.status(403).json({ message: 'Account not verified. Please verify OTP.' });
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  // Generate Token
  const token = jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '7d' }
  );

  return res.status(200).json({
    message: 'Login successful',
    token,
    user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role }
  });
};

export const getAllUsers = async (req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    select: { id: true, fullName: true, email: true, role: true, avatarUrl: true } // Don't return passwords
  });
  return res.status(200).json({ users });
};

// Get Logged In User Profile (Secure)
export const myProfile = async (req: AuthRequest, res: Response) => {
  // req.user is set by the 'protect' middleware
  const userId = req.user.userId;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, email: true, role: true, bio: true, avatarUrl: true, createdAt: true }
  });

  if (!user) return res.status(404).json({ message: "User not found" });

  return res.status(200).json({ user });
};

export const editProfile = async (req: AuthRequest, res: Response) => {
  const { fullName, bio, avatarUrl } = req.body;
  const userId = req.user.userId;

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { fullName, bio, avatarUrl },
    select: { id: true, fullName: true, email: true, role: true, bio: true, avatarUrl: true, createdAt: true }
  });

  return res.status(200).json({ message: 'Profile updated', user: updatedUser });
};

interface MulterFile { fieldname: string; originalname: string; encoding: string; mimetype: string; size: number; filename: string; destination: string; path: string; buffer: Buffer; }

export const uploadAvatar = async (req: AuthRequest & { file?: MulterFile }, res: Response) => {
  const userId = req.user.userId;

  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  // Build the public URL for the uploaded file
  const avatarUrl = `/uploads/avatars/${req.file.filename}`;

  // Delete old avatar file if it exists and is a local file
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
  if (user?.avatarUrl && user.avatarUrl.startsWith('/uploads/')) {
    const oldPath = path.join(process.cwd(), user.avatarUrl);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl },
    select: { id: true, fullName: true, email: true, role: true, bio: true, avatarUrl: true, createdAt: true },
  });

  return res.status(200).json({ message: 'Avatar updated', user: updatedUser, avatarUrl });
};

export const deleteUser = async (req: AuthRequest, res: Response) => {
  const userId = req.user.userId;
  await prisma.user.delete({ where: { id: userId } });
  return res.status(200).json({ message: 'User deleted successfully' });
};

export const updatePassword = async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.userId;

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid current password' });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hashedNewPassword }
    });

    return res.status(200).json({ message: 'Password updated successfully' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error updating password', error: error.message });
  }
};
export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ message: 'Email is required.' });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(404).json({ message: 'User with this email does not exist.' });

  const otp = generateOTP();

  await prisma.user.update({
    where: { email },
    data: { otpCode: otp },
  });

  await sendOTPEmail(email, user.fullName, otp, 'forgot_password');

  return res.status(200).json({ message: 'Password reset OTP sent to your email.' });
};

export const verifyResetOTP = async (req: Request, res: Response) => {
  const { email, otp } = req.body;

  if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required.' });

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) return res.status(404).json({ message: 'User not found.' });
  if (user.otpCode !== otp) return res.status(400).json({ message: 'Invalid OTP.' });

  return res.status(200).json({ message: 'OTP verified successfully. You can now reset your password.' });
};

export const resetPassword = async (req: Request, res: Response) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res.status(400).json({ message: 'Email, OTP, and new password are required.' });
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) return res.status(404).json({ message: 'User not found.' });
  if (user.otpCode !== otp) return res.status(400).json({ message: 'Invalid or expired OTP.' });

  const hashedNewPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { email },
    data: {
      passwordHash: hashedNewPassword,
      otpCode: null // Consume the OTP
    },
  });

  return res.status(200).json({ message: 'Password reset successful. You can now login with your new password.' });
};

// --- Follow System ---

export const followUser = async (req: AuthRequest, res: Response) => {
  const followerId = req.user.userId;
  const followingId = Number(req.params.id);

  if (followerId === followingId) {
    return res.status(400).json({ message: 'You cannot follow yourself.' });
  }

  const targetUser = await prisma.user.findUnique({ where: { id: followingId } });
  if (!targetUser) return res.status(404).json({ message: 'User not found.' });

  // Check if already following
  const existing = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId, followingId } },
  });
  if (existing) return res.status(400).json({ message: 'You are already following this user.' });

  await prisma.follow.create({ data: { followerId, followingId } });

  const { emitToUser } = await import('../services/socketService.js');
  emitToUser(followingId, 'stats_update', { type: 'FOLLOW_CHANGE' });

  return res.status(201).json({ message: `You are now following ${targetUser.fullName}.` });
};

export const unfollowUser = async (req: AuthRequest, res: Response) => {
  const followerId = req.user.userId;
  const followingId = Number(req.params.id);

  const existing = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId, followingId } },
  });
  if (!existing) return res.status(400).json({ message: 'You are not following this user.' });

  await prisma.follow.delete({
    where: { followerId_followingId: { followerId, followingId } },
  });

  const { emitToUser } = await import('../services/socketService.js');
  emitToUser(followingId, 'stats_update', { type: 'FOLLOW_CHANGE' });

  return res.status(200).json({ message: 'Unfollowed successfully.' });
};

export const getFollowers = async (req: AuthRequest, res: Response) => {
  const userId = Number(req.params.id);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ message: 'User not found.' });

  const follows = await prisma.follow.findMany({
    where: { followingId: userId },
    include: {
      follower: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const followers = follows.map((f: { follower: { id: number; fullName: string; avatarUrl: string | null; role: string } }) => f.follower);
  return res.status(200).json({ followers, count: followers.length });
};

export const getFollowing = async (req: AuthRequest, res: Response) => {
  const userId = Number(req.params.id);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ message: 'User not found.' });

  const follows = await prisma.follow.findMany({
    where: { followerId: userId },
    include: {
      following: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const following = follows.map((f: { following: { id: number; fullName: string; avatarUrl: string | null; role: string } }) => f.following);
  return res.status(200).json({ following, count: following.length });
};
