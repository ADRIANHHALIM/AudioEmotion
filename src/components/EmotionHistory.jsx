/**
 * Emotion History Chart Component
 * Shows emotion timeline over the session
 */

import { useMemo } from "react";
import { useEmotionStore } from "../stores/emotionStore";
import {
  EMOTION_LABELS,
  EMOTION_COLORS,
  EMOTION_EMOJIS,
} from "../utils/emotions";

export default function EmotionHistory({ className = "" }) {
  const { emotionHistory, isInferenceRunning } = useEmotionStore();

  // Prepare chart data
  const chartData = useMemo(() => {
    if (emotionHistory.length < 2) return null;

    const width = 100;
    const height = 60;
    const padding = { top: 5, bottom: 5 };
    const effectiveHeight = height - padding.top - padding.bottom;

    // Get the last 30 data points
    const data = emotionHistory.slice(-30);
    const step = width / (data.length - 1);

    // Create paths for each emotion
    const paths = {};

    EMOTION_LABELS.forEach((emotion) => {
      const points = data.map((entry, i) => {
        const x = i * step;
        const value = entry.emotions[emotion] || 0;
        const y = padding.top + effectiveHeight * (1 - value);
        return { x, y };
      });

      // Create smooth SVG path
      let path = `M ${points[0].x},${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpx = (prev.x + curr.x) / 2;
        path += ` C ${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`;
      }

      paths[emotion] = path;
    });

    return { paths, data };
  }, [emotionHistory]);

  // Get dominant emotions over time
  const dominantTimeline = useMemo(() => {
    if (emotionHistory.length === 0) return [];

    return emotionHistory.slice(-30).map((entry) => ({
      emotion: entry.dominant,
      color: EMOTION_COLORS[entry.dominant],
      emoji: EMOTION_EMOJIS[entry.dominant],
    }));
  }, [emotionHistory]);

  if (emotionHistory.length < 2) {
    return (
      <div className={`glass-card p-6 ${className}`}>
        <h3 className="text-lg font-semibold text-white mb-4">
          Emotion Timeline
        </h3>
        <div className="h-32 flex items-center justify-center text-gray-500 text-sm">
          {isInferenceRunning
            ? "Collecting data..."
            : "Start recording to see timeline"}
        </div>
      </div>
    );
  }

  return (
    <div className={`glass-card p-6 ${className}`}>
      <h3 className="text-lg font-semibold text-white mb-4">
        Emotion Timeline
      </h3>

      {/* Dominant emotion strip */}
      <div className="flex gap-0.5 mb-4 h-6 rounded-lg overflow-hidden">
        {dominantTimeline.map((item, i) => (
          <div
            key={i}
            className="flex-1 transition-all duration-200"
            style={{ backgroundColor: item.color }}
            title={item.emotion}
          />
        ))}
      </div>

      {/* Line chart */}
      <div className="relative h-24 bg-white/5 rounded-xl p-2 overflow-hidden">
        <svg
          viewBox="0 0 100 60"
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          {/* Grid lines */}
          <line
            x1="0"
            y1="15"
            x2="100"
            y2="15"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="0.5"
          />
          <line
            x1="0"
            y1="30"
            x2="100"
            y2="30"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="0.5"
          />
          <line
            x1="0"
            y1="45"
            x2="100"
            y2="45"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="0.5"
          />

          {/* Emotion paths */}
          {chartData &&
            EMOTION_LABELS.map((emotion) => (
              <path
                key={emotion}
                d={chartData.paths[emotion]}
                fill="none"
                stroke={EMOTION_COLORS[emotion]}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.6"
                className="transition-all duration-300"
              />
            ))}
        </svg>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-2">
        {EMOTION_LABELS.slice(0, 4).map((emotion) => (
          <div
            key={emotion}
            className="flex items-center gap-1.5 text-xs text-gray-400"
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: EMOTION_COLORS[emotion] }}
            />
            <span className="capitalize">{emotion}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
