/**
 * Database seed file
 * Run with: npm run db:seed
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Create default tags
  const tags = await Promise.all([
    prisma.tag.upsert({
      where: { name: "Work" },
      update: {},
      create: { name: "Work", color: "#3b82f6" },
    }),
    prisma.tag.upsert({
      where: { name: "Personal" },
      update: {},
      create: { name: "Personal", color: "#10b981" },
    }),
    prisma.tag.upsert({
      where: { name: "Meeting" },
      update: {},
      create: { name: "Meeting", color: "#f59e0b" },
    }),
    prisma.tag.upsert({
      where: { name: "Presentation" },
      update: {},
      create: { name: "Presentation", color: "#8b5cf6" },
    }),
    prisma.tag.upsert({
      where: { name: "Interview" },
      update: {},
      create: { name: "Interview", color: "#ef4444" },
    }),
  ]);

  console.log(`✅ Created ${tags.length} tags`);

  // Create demo user
  const hashedPassword = await bcrypt.hash("demo1234", 10);

  const demoUser = await prisma.user.upsert({
    where: { email: "demo@audioemotion.app" },
    update: {},
    create: {
      email: "demo@audioemotion.app",
      password: hashedPassword,
      name: "Demo User",
      settings: {
        create: {
          showConfidenceScores: true,
          darkMode: true,
          animationsEnabled: true,
        },
      },
    },
  });

  console.log(`✅ Created demo user: ${demoUser.email}`);

  // Create sample session with predictions
  const sampleSession = await prisma.session.create({
    data: {
      userId: demoUser.id,
      name: "Sample Analysis Session",
      description: "A demo session showing emotion recognition capabilities",
      startTime: new Date(Date.now() - 300000), // 5 minutes ago
      endTime: new Date(),
      duration: 300,
      dominantEmotion: "happy",
      averageConfidence: 0.78,
      emotionSummary: {
        angry: 0.05,
        calm: 0.15,
        disgust: 0.02,
        fearful: 0.08,
        happy: 0.45,
        neutral: 0.2,
        sad: 0.05,
      },
      status: "COMPLETED",
      predictions: {
        create: [
          {
            timestamp: new Date(Date.now() - 290000),
            dominant: "neutral",
            confidence: 0.65,
            emotions: {
              angry: 0.1,
              calm: 0.2,
              disgust: 0.02,
              fearful: 0.05,
              happy: 0.1,
              neutral: 0.48,
              sad: 0.05,
            },
            inferenceTime: 45,
          },
          {
            timestamp: new Date(Date.now() - 280000),
            dominant: "happy",
            confidence: 0.82,
            emotions: {
              angry: 0.02,
              calm: 0.1,
              disgust: 0.01,
              fearful: 0.02,
              happy: 0.75,
              neutral: 0.08,
              sad: 0.02,
            },
            inferenceTime: 42,
          },
          {
            timestamp: new Date(Date.now() - 270000),
            dominant: "happy",
            confidence: 0.78,
            emotions: {
              angry: 0.03,
              calm: 0.12,
              disgust: 0.02,
              fearful: 0.03,
              happy: 0.68,
              neutral: 0.1,
              sad: 0.02,
            },
            inferenceTime: 44,
          },
          {
            timestamp: new Date(Date.now() - 260000),
            dominant: "calm",
            confidence: 0.71,
            emotions: {
              angry: 0.05,
              calm: 0.55,
              disgust: 0.02,
              fearful: 0.05,
              happy: 0.2,
              neutral: 0.1,
              sad: 0.03,
            },
            inferenceTime: 43,
          },
        ],
      },
      tags: {
        create: [
          { tagId: tags[0].id }, // Work
          { tagId: tags[2].id }, // Meeting
        ],
      },
    },
  });

  console.log(`✅ Created sample session: ${sampleSession.name}`);

  console.log("\n🎉 Seeding completed!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
