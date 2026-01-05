/**
 * Prediction Routes
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
const createPredictionSchema = z.object({
  sessionId: z.string(),
  dominant: z.string(),
  confidence: z.number().min(0).max(1),
  emotions: z.record(z.number()),
  inferenceTime: z.number().optional(),
  timestamp: z.string().datetime().optional(),
});

const batchPredictionSchema = z.object({
  sessionId: z.string(),
  predictions: z.array(
    z.object({
      dominant: z.string(),
      confidence: z.number().min(0).max(1),
      emotions: z.record(z.number()),
      inferenceTime: z.number().optional(),
      timestamp: z.string().datetime().optional(),
    })
  ),
});

/**
 * POST /api/predictions
 * Create single prediction
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = createPredictionSchema.parse(req.body);

    // Verify session ownership
    const session = await prisma.session.findFirst({
      where: {
        id: data.sessionId,
        userId: req.user.id,
        status: "ACTIVE",
      },
    });

    if (!session) {
      throw new AppError("Active session not found", 404);
    }

    const prediction = await prisma.emotionPrediction.create({
      data: {
        sessionId: data.sessionId,
        dominant: data.dominant,
        confidence: data.confidence,
        emotions: data.emotions,
        inferenceTime: data.inferenceTime,
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
      },
    });

    res.status(201).json({ prediction });
  })
);

/**
 * POST /api/predictions/batch
 * Create multiple predictions at once
 */
router.post(
  "/batch",
  asyncHandler(async (req, res) => {
    const data = batchPredictionSchema.parse(req.body);

    // Verify session ownership
    const session = await prisma.session.findFirst({
      where: {
        id: data.sessionId,
        userId: req.user.id,
      },
    });

    if (!session) {
      throw new AppError("Session not found", 404);
    }

    // Create all predictions
    const predictions = await prisma.emotionPrediction.createMany({
      data: data.predictions.map((p) => ({
        sessionId: data.sessionId,
        dominant: p.dominant,
        confidence: p.confidence,
        emotions: p.emotions,
        inferenceTime: p.inferenceTime,
        timestamp: p.timestamp ? new Date(p.timestamp) : new Date(),
      })),
    });

    res.status(201).json({
      message: `Created ${predictions.count} predictions`,
      count: predictions.count,
    });
  })
);

/**
 * GET /api/predictions/session/:sessionId
 * Get all predictions for a session
 */
router.get(
  "/session/:sessionId",
  asyncHandler(async (req, res) => {
    // Verify session ownership
    const session = await prisma.session.findFirst({
      where: {
        id: req.params.sessionId,
        userId: req.user.id,
      },
    });

    if (!session) {
      throw new AppError("Session not found", 404);
    }

    const predictions = await prisma.emotionPrediction.findMany({
      where: { sessionId: req.params.sessionId },
      orderBy: { timestamp: "asc" },
    });

    res.json({ predictions });
  })
);

/**
 * GET /api/predictions/recent
 * Get recent predictions across all sessions
 */
router.get(
  "/recent",
  asyncHandler(async (req, res) => {
    const { limit = 100 } = req.query;

    const predictions = await prisma.emotionPrediction.findMany({
      where: {
        session: {
          userId: req.user.id,
        },
      },
      orderBy: { timestamp: "desc" },
      take: parseInt(limit),
      include: {
        session: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    res.json({ predictions });
  })
);

/**
 * DELETE /api/predictions/:id
 * Delete single prediction
 */
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    // Verify ownership through session
    const prediction = await prisma.emotionPrediction.findFirst({
      where: { id: req.params.id },
      include: {
        session: true,
      },
    });

    if (!prediction || prediction.session.userId !== req.user.id) {
      throw new AppError("Prediction not found", 404);
    }

    await prisma.emotionPrediction.delete({
      where: { id: req.params.id },
    });

    res.json({ message: "Prediction deleted" });
  })
);

export default router;
