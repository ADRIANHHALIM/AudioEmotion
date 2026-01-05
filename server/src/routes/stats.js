/**
 * Statistics Routes
 */

import { Router } from "express";
import prisma from "../lib/prisma.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/stats/overview
 * Get user statistics overview
 */
router.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    // Get session counts
    const [totalSessions, completedSessions, totalPredictions] =
      await Promise.all([
        prisma.session.count({ where: { userId } }),
        prisma.session.count({
          where: { userId, status: "COMPLETED" },
        }),
        prisma.emotionPrediction.count({
          where: { session: { userId } },
        }),
      ]);

    // Get total duration
    const durationResult = await prisma.session.aggregate({
      where: { userId, duration: { not: null } },
      _sum: { duration: true },
    });

    // Get average confidence
    const confidenceResult = await prisma.emotionPrediction.aggregate({
      where: { session: { userId } },
      _avg: { confidence: true },
    });

    // Get emotion distribution
    const emotionCounts = await prisma.emotionPrediction.groupBy({
      by: ["dominant"],
      where: { session: { userId } },
      _count: true,
      orderBy: { _count: { dominant: "desc" } },
    });

    const emotionDistribution = emotionCounts.reduce((acc, item) => {
      acc[item.dominant] = item._count;
      return acc;
    }, {});

    res.json({
      stats: {
        totalSessions,
        completedSessions,
        totalPredictions,
        totalDuration: durationResult._sum.duration || 0,
        averageConfidence: confidenceResult._avg.confidence || 0,
        emotionDistribution,
      },
    });
  })
);

/**
 * GET /api/stats/emotions
 * Get detailed emotion statistics
 */
router.get(
  "/emotions",
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get emotion averages over time
    const predictions = await prisma.emotionPrediction.findMany({
      where: {
        session: { userId },
        timestamp: { gte: startDate },
      },
      select: {
        timestamp: true,
        dominant: true,
        confidence: true,
        emotions: true,
      },
      orderBy: { timestamp: "asc" },
    });

    // Group by day
    const dailyEmotions = {};

    for (const pred of predictions) {
      const day = pred.timestamp.toISOString().split("T")[0];

      if (!dailyEmotions[day]) {
        dailyEmotions[day] = {
          date: day,
          count: 0,
          dominantCounts: {},
          emotionTotals: {},
        };
      }

      dailyEmotions[day].count++;
      dailyEmotions[day].dominantCounts[pred.dominant] =
        (dailyEmotions[day].dominantCounts[pred.dominant] || 0) + 1;

      const emotions = pred.emotions;
      for (const [emotion, value] of Object.entries(emotions)) {
        dailyEmotions[day].emotionTotals[emotion] =
          (dailyEmotions[day].emotionTotals[emotion] || 0) + value;
      }
    }

    // Calculate averages
    const timeline = Object.values(dailyEmotions).map((day) => {
      const emotionAverages = {};
      for (const [emotion, total] of Object.entries(day.emotionTotals)) {
        emotionAverages[emotion] = total / day.count;
      }

      // Find dominant for the day
      let dominant = "neutral";
      let maxCount = 0;
      for (const [emotion, count] of Object.entries(day.dominantCounts)) {
        if (count > maxCount) {
          maxCount = count;
          dominant = emotion;
        }
      }

      return {
        date: day.date,
        predictions: day.count,
        dominant,
        averages: emotionAverages,
      };
    });

    res.json({ timeline });
  })
);

/**
 * GET /api/stats/sessions
 * Get session statistics
 */
router.get(
  "/sessions",
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get sessions with their dominant emotions
    const sessions = await prisma.session.findMany({
      where: {
        userId,
        startTime: { gte: startDate },
        status: "COMPLETED",
      },
      select: {
        id: true,
        name: true,
        startTime: true,
        duration: true,
        dominantEmotion: true,
        averageConfidence: true,
        _count: {
          select: { predictions: true },
        },
      },
      orderBy: { startTime: "desc" },
    });

    // Calculate averages
    const totalDuration = sessions.reduce(
      (sum, s) => sum + (s.duration || 0),
      0
    );
    const avgDuration =
      sessions.length > 0 ? totalDuration / sessions.length : 0;
    const avgConfidence =
      sessions.length > 0
        ? sessions.reduce((sum, s) => sum + (s.averageConfidence || 0), 0) /
          sessions.length
        : 0;

    res.json({
      sessions: sessions.map((s) => ({
        ...s,
        predictionCount: s._count.predictions,
      })),
      summary: {
        totalSessions: sessions.length,
        totalDuration,
        averageDuration: avgDuration,
        averageConfidence: avgConfidence,
      },
    });
  })
);

/**
 * GET /api/stats/trends
 * Get emotion trends over time
 */
router.get(
  "/trends",
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { weeks = 4 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(weeks) * 7);

    // Get weekly emotion averages
    const predictions = await prisma.emotionPrediction.findMany({
      where: {
        session: { userId },
        timestamp: { gte: startDate },
      },
      select: {
        timestamp: true,
        emotions: true,
      },
    });

    // Group by week
    const weeklyData = {};

    for (const pred of predictions) {
      // Get week number
      const weekStart = new Date(pred.timestamp);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekKey = weekStart.toISOString().split("T")[0];

      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = {
          week: weekKey,
          count: 0,
          emotionTotals: {},
        };
      }

      weeklyData[weekKey].count++;

      const emotions = pred.emotions;
      for (const [emotion, value] of Object.entries(emotions)) {
        weeklyData[weekKey].emotionTotals[emotion] =
          (weeklyData[weekKey].emotionTotals[emotion] || 0) + value;
      }
    }

    // Calculate weekly averages
    const trends = Object.values(weeklyData)
      .map((week) => {
        const averages = {};
        for (const [emotion, total] of Object.entries(week.emotionTotals)) {
          averages[emotion] = total / week.count;
        }
        return {
          week: week.week,
          predictions: week.count,
          averages,
        };
      })
      .sort((a, b) => a.week.localeCompare(b.week));

    res.json({ trends });
  })
);

export default router;
