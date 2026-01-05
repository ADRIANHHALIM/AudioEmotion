/**
 * Emotion Constants and Utilities
 * Based on Plutchik's Wheel of Emotions
 */

// Emotion labels matching wav2vec2 emotion fine-tuning order (8 classes)
export const EMOTION_LABELS = [
  "angry",
  "disgust",
  "fearful",
  "happy",
  "neutral",
  "sad",
  "surprised",
  "calm",
];

// Plutchik's Color System - EXACT hex codes
export const EMOTION_COLORS = {
  angry: "#DC143C", // Crimson
  disgust: "#9370DB", // Medium Purple
  fearful: "#228B22", // Forest Green
  happy: "#FFD700", // Gold
  neutral: "#A9A9A9", // Grey
  sad: "#4169E1", // Royal Blue
  surprised: "#87CEEB", // Sky Blue
  calm: "#98FB98", // Pale Green
};

// Emotion emojis
export const EMOTION_EMOJIS = {
  angry: "😡",
  disgust: "🤢",
  fearful: "😨",
  happy: "😄",
  neutral: "😐",
  sad: "😢",
  surprised: "😲",
  calm: "😌",
};

// Emotion descriptions for UI
export const EMOTION_DESCRIPTIONS = {
  angry: "Anger detected in voice",
  disgust: "Disgust detected in voice",
  fearful: "Fear or anxiety detected",
  happy: "Happiness and joy detected",
  neutral: "Neutral emotional state",
  sad: "Sadness detected in tone",
  surprised: "Elevated energy or surprise detected",
  calm: "Calm and relaxed tone",
};

/**
 * Get emotion data by label
 * @param {string} emotion - Emotion label
 * @returns {{ label: string, color: string, emoji: string, description: string }}
 */
export function getEmotionData(emotion) {
  const normalized = emotion.toLowerCase();
  return {
    label: normalized,
    color: EMOTION_COLORS[normalized] || EMOTION_COLORS.neutral,
    emoji: EMOTION_EMOJIS[normalized] || EMOTION_EMOJIS.neutral,
    description: EMOTION_DESCRIPTIONS[normalized] || "Unknown emotion",
  };
}

/**
 * Convert emotion probabilities array to labeled object
 * @param {Float32Array | number[]} probabilities - Probability array from model
 * @returns {Object.<string, number>}
 */
export function probabilitiesToEmotions(probabilities) {
  const emotions = {};
  EMOTION_LABELS.forEach((label, index) => {
    emotions[label] = probabilities[index] || 0;
  });
  return emotions;
}

/**
 * Get the dominant emotion from probabilities
 * @param {Object.<string, number>} emotions - Labeled emotions object
 * @returns {{ emotion: string, confidence: number }}
 */
export function getDominantEmotion(emotions) {
  let maxEmotion = "neutral";
  let maxConfidence = 0;

  for (const [emotion, confidence] of Object.entries(emotions)) {
    if (confidence > maxConfidence) {
      maxConfidence = confidence;
      maxEmotion = emotion;
    }
  }

  return { emotion: maxEmotion, confidence: maxConfidence };
}

/**
 * Apply softmax to raw logits
 * @param {Float32Array | number[]} logits - Raw model output
 * @returns {Float32Array}
 */
export function softmax(logits) {
  const maxLogit = Math.max(...logits);
  const expScores = logits.map((x) => Math.exp(x - maxLogit));
  const sumExp = expScores.reduce((a, b) => a + b, 0);
  return new Float32Array(expScores.map((x) => x / sumExp));
}

/**
 * Apply temporal smoothing to emotion predictions
 * Uses exponential moving average
 * @param {Object.<string, number>} current - Current frame emotions
 * @param {Object.<string, number>} previous - Previous smoothed emotions
 * @param {number} alpha - Smoothing factor (0-1, higher = more responsive)
 * @returns {Object.<string, number>}
 */
export function smoothEmotions(current, previous, alpha = 0.3) {
  if (!previous) return current;

  const smoothed = {};
  for (const emotion of EMOTION_LABELS) {
    smoothed[emotion] =
      alpha * current[emotion] + (1 - alpha) * (previous[emotion] || 0);
  }

  return smoothed;
}

/**
 * Format confidence as percentage string
 * @param {number} confidence - Confidence value (0-1)
 * @returns {string}
 */
export function formatConfidence(confidence) {
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Get appropriate glow intensity based on confidence
 * @param {number} confidence - Confidence value (0-1)
 * @returns {number} - Glow intensity (0-1)
 */
export function getGlowIntensity(confidence) {
  // Map confidence to glow intensity with minimum threshold
  const minThreshold = 0.3;
  if (confidence < minThreshold) return 0;
  return (confidence - minThreshold) / (1 - minThreshold);
}
