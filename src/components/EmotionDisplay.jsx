/**
 * Emotion Display Component
 * Shows current detected emotion with animated transitions
 */

import { useMemo } from "react";
import { useEmotionStore } from "../stores/emotionStore";
import {
  EMOTION_COLORS,
  EMOTION_EMOJIS,
  EMOTION_DESCRIPTIONS,
  formatConfidence,
} from "../utils/emotions";

export default function EmotionDisplay({ className = "" }) {
  const {
    dominantEmotion,
    confidence,
    emotions,
    isInferenceRunning,
    inferenceTime,
  } = useEmotionStore();

  const currentColor =
    EMOTION_COLORS[dominantEmotion] || EMOTION_COLORS.neutral;
  const emoji = EMOTION_EMOJIS[dominantEmotion] || EMOTION_EMOJIS.neutral;
  const description = EMOTION_DESCRIPTIONS[dominantEmotion] || "Analyzing...";

  // Sort emotions by confidence for display
  const sortedEmotions = useMemo(() => {
    return Object.entries(emotions)
      .sort(([, a], [, b]) => b - a)
      .map(([label, value]) => ({
        label,
        value,
        color: EMOTION_COLORS[label],
        emoji: EMOTION_EMOJIS[label],
      }));
  }, [emotions]);

  return (
    <div className={`${className}`}>
      {/* Main emotion display */}
      <div
        className="glass-card p-6 transition-all duration-500"
        style={{
          borderColor: `${currentColor}30`,
          boxShadow: isInferenceRunning
            ? `0 0 40px ${currentColor}20, inset 0 1px 0 ${currentColor}20`
            : "none",
        }}
      >
        {/* Dominant emotion */}
        <div className="flex items-center gap-4 mb-6">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl transition-all duration-300"
            style={{
              backgroundColor: `${currentColor}20`,
              boxShadow: `0 0 30px ${currentColor}30`,
            }}
          >
            {emoji}
          </div>
          <div>
            <h3 className="text-2xl font-bold capitalize text-white">
              {dominantEmotion}
            </h3>
            <p className="text-sm text-gray-400">{description}</p>
          </div>
          <div className="ml-auto text-right">
            <p
              className="text-3xl font-bold transition-colors duration-300"
              style={{ color: currentColor }}
            >
              {formatConfidence(confidence)}
            </p>
            <p className="text-xs text-gray-500">confidence</p>
          </div>
        </div>

        {/* Confidence bar */}
        <div className="h-2 bg-white/5 rounded-full overflow-hidden mb-6">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${confidence * 100}%`,
              backgroundColor: currentColor,
              boxShadow: `0 0 10px ${currentColor}`,
            }}
          />
        </div>

        {/* All emotions grid */}
        <div className="grid grid-cols-4 gap-3">
          {sortedEmotions.map(({ label, value, color, emoji }) => (
            <div
              key={label}
              className={`p-3 rounded-xl transition-all duration-200 ${
                label === dominantEmotion
                  ? "bg-white/10 ring-1 ring-white/20"
                  : "bg-white/5 hover:bg-white/10"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{emoji}</span>
                <span className="text-xs text-gray-400 capitalize">
                  {label}
                </span>
              </div>
              <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${value * 100}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1 text-right">
                {formatConfidence(value)}
              </p>
            </div>
          ))}
        </div>

        {/* Performance info */}
        {isInferenceRunning && (
          <div className="mt-4 pt-4 border-t border-white/5 flex justify-between text-xs text-gray-500">
            <span>Inference: {inferenceTime.toFixed(0)}ms</span>
            <span>Model: wav2vec2-emotion</span>
          </div>
        )}
      </div>
    </div>
  );
}
