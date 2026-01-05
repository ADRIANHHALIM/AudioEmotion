/**
 * Tag Routes
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
const createTagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
});

const updateTagSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
});

/**
 * GET /api/tags
 * Get all tags
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const tags = await prisma.tag.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { sessions: true },
        },
      },
    });

    res.json({
      tags: tags.map((t) => ({
        ...t,
        sessionCount: t._count.sessions,
      })),
    });
  })
);

/**
 * POST /api/tags
 * Create new tag
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = createTagSchema.parse(req.body);

    const tag = await prisma.tag.create({
      data: {
        name: data.name,
        color: data.color || "#6366f1",
      },
    });

    res.status(201).json({ tag });
  })
);

/**
 * PATCH /api/tags/:id
 * Update tag
 */
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = updateTagSchema.parse(req.body);

    const tag = await prisma.tag.update({
      where: { id: req.params.id },
      data,
    });

    res.json({ tag });
  })
);

/**
 * DELETE /api/tags/:id
 * Delete tag
 */
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.tag.delete({
      where: { id: req.params.id },
    });

    res.json({ message: "Tag deleted" });
  })
);

export default router;
