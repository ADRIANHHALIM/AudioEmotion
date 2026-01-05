/**
 * User Routes
 */

import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// All routes require authentication
router.use(authenticate);

// Validation schemas
const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  avatar: z.string().url().optional(),
});

const updateSettingsSchema = z.object({
  defaultMicrophoneId: z.string().optional(),
  noiseReduction: z.boolean().optional(),
  echoCancellation: z.boolean().optional(),
  showConfidenceScores: z.boolean().optional(),
  darkMode: z.boolean().optional(),
  animationsEnabled: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
  sessionReminders: z.boolean().optional(),
});

/**
 * GET /api/users/profile
 * Get current user profile
 */
router.get(
  "/profile",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        createdAt: true,
        _count: {
          select: {
            sessions: true,
          },
        },
      },
    });

    res.json({ user });
  })
);

/**
 * PATCH /api/users/profile
 * Update user profile
 */
router.patch(
  "/profile",
  asyncHandler(async (req, res) => {
    const data = updateProfileSchema.parse(req.body);

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        createdAt: true,
      },
    });

    res.json({ user });
  })
);

/**
 * GET /api/users/settings
 * Get user settings
 */
router.get(
  "/settings",
  asyncHandler(async (req, res) => {
    let settings = await prisma.userSettings.findUnique({
      where: { userId: req.user.id },
    });

    // Create default settings if not exists
    if (!settings) {
      settings = await prisma.userSettings.create({
        data: { userId: req.user.id },
      });
    }

    res.json({ settings });
  })
);

/**
 * PATCH /api/users/settings
 * Update user settings
 */
router.patch(
  "/settings",
  asyncHandler(async (req, res) => {
    const data = updateSettingsSchema.parse(req.body);

    const settings = await prisma.userSettings.upsert({
      where: { userId: req.user.id },
      update: data,
      create: {
        userId: req.user.id,
        ...data,
      },
    });

    res.json({ settings });
  })
);

/**
 * DELETE /api/users/account
 * Delete user account and all data
 */
router.delete(
  "/account",
  asyncHandler(async (req, res) => {
    // Delete user (cascades to sessions, predictions, settings)
    await prisma.user.delete({
      where: { id: req.user.id },
    });

    res.json({ message: "Account deleted successfully" });
  })
);

export default router;
