/**
 * Session Routes
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
const createSessionSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
});

const updateSessionSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * GET /api/sessions
 * Get all sessions for current user
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status, sort = "desc" } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where = {
      userId: req.user.id,
      ...(status && { status }),
    };

    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where,
        skip,
        take,
        orderBy: { startTime: sort === "asc" ? "asc" : "desc" },
        include: {
          tags: {
            include: {
              tag: true,
            },
          },
          _count: {
            select: { predictions: true },
          },
        },
      }),
      prisma.session.count({ where }),
    ]);

    res.json({
      sessions: sessions.map((s) => ({
        ...s,
        tags: s.tags.map((t) => t.tag),
        predictionCount: s._count.predictions,
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / take),
      },
    });
  })
);

/**
 * GET /api/sessions/:id
 * Get single session with predictions
 */
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const session = await prisma.session.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
        predictions: {
          orderBy: { timestamp: "asc" },
        },
      },
    });

    if (!session) {
      throw new AppError("Session not found", 404);
    }

    res.json({
      session: {
        ...session,
        tags: session.tags.map((t) => t.tag),
      },
    });
  })
);

/**
 * POST /api/sessions
 * Create new session
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = createSessionSchema.parse(req.body);

    const session = await prisma.session.create({
      data: {
        userId: req.user.id,
        name: data.name || `Session ${new Date().toLocaleDateString()}`,
        description: data.description,
        status: "ACTIVE",
      },
    });

    res.status(201).json({ session });
  })
);

/**
 * PATCH /api/sessions/:id
 * Update session
 */
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = updateSessionSchema.parse(req.body);

    // Verify ownership
    const existing = await prisma.session.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    });

    if (!existing) {
      throw new AppError("Session not found", 404);
    }

    // Handle tags separately
    const { tags, ...updateData } = data;

    const session = await prisma.session.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    // Update tags if provided
    if (tags) {
      // Remove existing tags
      await prisma.sessionTag.deleteMany({
        where: { sessionId: session.id },
      });

      // Add new tags
      await prisma.sessionTag.createMany({
        data: tags.map((tagId) => ({
          sessionId: session.id,
          tagId,
        })),
      });
    }

    res.json({
      session: {
        ...session,
        tags: session.tags.map((t) => t.tag),
      },
    });
  })
);

/**
 * POST /api/sessions/:id/end
 * End a session and calculate summary
 */
router.post(
  "/:id/end",
  asyncHandler(async (req, res) => {
    // Verify ownership
    const existing = await prisma.session.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
        status: "ACTIVE",
      },
      include: {
        predictions: true,
      },
    });

    if (!existing) {
      throw new AppError("Active session not found", 404);
    }

    // Calculate summary from predictions
    let emotionSummary = {};
    let dominantEmotion = "neutral";
    let maxCount = 0;
    let totalConfidence = 0;

    if (existing.predictions.length > 0) {
      // Count emotions and calculate averages
      const emotionCounts = {};
      const emotionTotals = {};

      for (const pred of existing.predictions) {
        // Count dominant emotions
        emotionCounts[pred.dominant] = (emotionCounts[pred.dominant] || 0) + 1;

        // Sum up emotion values
        const emotions = pred.emotions;
        for (const [emotion, value] of Object.entries(emotions)) {
          emotionTotals[emotion] = (emotionTotals[emotion] || 0) + value;
        }

        totalConfidence += pred.confidence;
      }

      // Find most common dominant emotion
      for (const [emotion, count] of Object.entries(emotionCounts)) {
        if (count > maxCount) {
          maxCount = count;
          dominantEmotion = emotion;
        }
      }

      // Calculate averages
      for (const [emotion, total] of Object.entries(emotionTotals)) {
        emotionSummary[emotion] = total / existing.predictions.length;
      }
    }

    // Calculate duration
    const duration = Math.floor(
      (new Date() - new Date(existing.startTime)) / 1000
    );

    // Update session
    const session = await prisma.session.update({
      where: { id: req.params.id },
      data: {
        endTime: new Date(),
        duration,
        status: "COMPLETED",
        dominantEmotion,
        averageConfidence:
          existing.predictions.length > 0
            ? totalConfidence / existing.predictions.length
            : 0,
        emotionSummary,
      },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
        _count: {
          select: { predictions: true },
        },
      },
    });

    res.json({
      session: {
        ...session,
        tags: session.tags.map((t) => t.tag),
        predictionCount: session._count.predictions,
      },
    });
  })
);

/**
 * DELETE /api/sessions/:id
 * Delete session
 */
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    // Verify ownership
    const existing = await prisma.session.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    });

    if (!existing) {
      throw new AppError("Session not found", 404);
    }

    await prisma.session.delete({
      where: { id: req.params.id },
    });

    res.json({ message: "Session deleted successfully" });
  })
);

export default router;
