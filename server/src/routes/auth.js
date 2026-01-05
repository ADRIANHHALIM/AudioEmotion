/**
 * Authentication Routes
 */

import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import { authenticate, generateToken } from "../middleware/auth.js";

const router = Router();

// Validation schemas
const signUpSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(1).optional(),
});

const signInSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

/**
 * POST /api/auth/signup
 * Create new user account
 */
router.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const data = signUpSchema.parse(req.body);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new AppError("Email already registered", 409);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Create user with default settings
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
        settings: {
          create: {},
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    // Generate token
    const token = generateToken(user.id);

    res.status(201).json({
      message: "Account created successfully",
      user,
      token,
    });
  })
);

/**
 * POST /api/auth/signin
 * Sign in existing user
 */
router.post(
  "/signin",
  asyncHandler(async (req, res) => {
    const data = signInSchema.parse(req.body);

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      throw new AppError("Invalid credentials", 401);
    }

    // Check password
    const validPassword = await bcrypt.compare(data.password, user.password);

    if (!validPassword) {
      throw new AppError("Invalid credentials", 401);
    }

    // Generate token
    const token = generateToken(user.id);

    res.json({
      message: "Signed in successfully",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      },
      token,
    });
  })
);

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        createdAt: true,
        settings: true,
      },
    });

    res.json({ user });
  })
);

/**
 * POST /api/auth/refresh
 * Refresh JWT token
 */
router.post(
  "/refresh",
  authenticate,
  asyncHandler(async (req, res) => {
    const token = generateToken(req.user.id);
    res.json({ token });
  })
);

/**
 * POST /api/auth/change-password
 * Change user password
 */
router.post(
  "/change-password",
  authenticate,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(6),
    });

    const { currentPassword, newPassword } = schema.parse(req.body);

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.password);

    if (!validPassword) {
      throw new AppError("Current password is incorrect", 400);
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword },
    });

    res.json({ message: "Password changed successfully" });
  })
);

export default router;
