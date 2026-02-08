// src/controller/userController.ts
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import prisma from '../models'; // Import the singleton instance
import { AuthRequest } from '../middleware/authMiddleware';

// --- Email Configuration ---
// Clean SMTP credentials (remove surrounding quotes if present)
const smtpUser = process.env.SMTP_USER?.trim().replace(/^["']|["']$/g, '') || '';
const smtpPass = process.env.SMTP_PASS?.trim().replace(/^["']|["']$/g, '') || '';

// Only create transporter if credentials are available
const transporter = smtpUser && smtpPass ? nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
  tls: {
    rejectUnauthorized: false // For development, set to true in production
  }
}) : null;

// Verify SMTP connection on startup (optional, can be removed if not needed)
if (transporter) {
  transporter.verify((error, success) => {
    if (error) {
      console.error("SMTP connection error:", error);
    } else {
      console.log("SMTP server is ready to send emails");
    }
  });
} else {
  console.warn("SMTP credentials not configured. Email functionality disabled.");
}

const generateOTP = () => Math.floor(10000 + Math.random() * 90000).toString();

const sendOTPEmail = async (email: string, otp: string) => {
  if (!transporter) {
    console.warn("SMTP not configured. Email not sent. OTP for development:", otp);
    return;
  }

  try {
    await transporter.sendMail({
      from: `"YourTales Support" <${smtpUser}>`,
      to: email,
      subject: "Your OTP for YourTales",
      html: `<p>Your OTP is: <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
    });
    console.log(`OTP sent to ${email}`);
  } catch (error) {
    console.error("Error sending email:", error);
    // Log OTP for development purposes if email fails
    console.warn(`OTP for ${email} (email failed): ${otp}`);
  }
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

  // Create User
  const user = await prisma.user.create({
    data: {
      fullName,
      email,
      passwordHash: hashedPassword,
      otpCode: otp,
      role: role || 'READER', // Default to READER if not provided
    },
  });

  await sendOTPEmail(email, otp);

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

  await sendOTPEmail(email, otp);

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
