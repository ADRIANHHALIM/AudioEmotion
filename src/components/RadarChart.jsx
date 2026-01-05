/**
 * Radar Chart Component
 * Displays emotion values in a radar/spider chart format
 */

import { useMemo } from "react";
import { useEmotionStore } from "../stores/emotionStore";
import {
  EMOTION_LABELS,
  EMOTION_COLORS,
  EMOTION_EMOJIS,
} from "../utils/emotions";

export default function RadarChart({ size = 300, className = "" }) {
  const { emotions, dominantEmotion, isInferenceRunning } = useEmotionStore();

  const currentColor =
    EMOTION_COLORS[dominantEmotion] || EMOTION_COLORS.neutral;

  // Calculate points for the radar chart
  const chartData = useMemo(() => {
    const center = size / 2;
    const radius = size / 2 - 40;
    const numPoints = EMOTION_LABELS.length;
    const angleStep = (2 * Math.PI) / numPoints;

    // Background grid circles
    const gridCircles = [0.25, 0.5, 0.75, 1].map((scale) => ({
      r: radius * scale,
      label: `${scale * 100}%`,
    }));

    // Axis lines and labels
    const axes = EMOTION_LABELS.map((label, i) => {
      const angle = -Math.PI / 2 + i * angleStep;
      return {
        label,
        emoji: EMOTION_EMOJIS[label],
        color: EMOTION_COLORS[label],
        x1: center,
        y1: center,
        x2: center + radius * Math.cos(angle),
        y2: center + radius * Math.sin(angle),
        labelX: center + (radius + 25) * Math.cos(angle),
        labelY: center + (radius + 25) * Math.sin(angle),
      };
    });

    // Data polygon points
    const dataPoints = EMOTION_LABELS.map((label, i) => {
      const value = emotions[label] || 0;
      const angle = -Math.PI / 2 + i * angleStep;
      const r = radius * value;
      return {
        x: center + r * Math.cos(angle),
        y: center + r * Math.sin(angle),
        value,
        label,
        color: EMOTION_COLORS[label],
      };
    });

    // Create SVG path for data polygon
    const dataPath =
      dataPoints
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${p.y}`)
        .join(" ") + " Z";

    return { center, radius, gridCircles, axes, dataPoints, dataPath };
  }, [emotions, size]);

  return (
    <div className={`glass-card p-6 ${className}`}>
      <h3 className="text-lg font-semibold text-white mb-4">Emotion Radar</h3>

      <svg
        width={size}
        height={size}
        className="mx-auto"
        style={{ overflow: "visible" }}
      >
        {/* Background glow */}
        <defs>
          <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={currentColor} stopOpacity="0.2" />
            <stop offset="100%" stopColor={currentColor} stopOpacity="0" />
          </radialGradient>

          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background glow circle */}
        {isInferenceRunning && (
          <circle
            cx={chartData.center}
            cy={chartData.center}
            r={chartData.radius}
            fill="url(#radarGlow)"
            className="transition-all duration-500"
          />
        )}

        {/* Grid circles */}
        {chartData.gridCircles.map(({ r }, i) => (
          <circle
            key={i}
            cx={chartData.center}
            cy={chartData.center}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="1"
          />
        ))}

        {/* Axis lines */}
        {chartData.axes.map(
          ({ label, x1, y1, x2, y2, labelX, labelY, emoji, color }) => (
            <g key={label}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="1"
              />
              <text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-lg"
                fill={color}
              >
                {emoji}
              </text>
            </g>
          )
        )}

        {/* Data polygon fill */}
        <path
          d={chartData.dataPath}
          fill={`${currentColor}30`}
          stroke={currentColor}
          strokeWidth="2"
          filter="url(#glow)"
          className="transition-all duration-300"
        />

        {/* Data points */}
        {chartData.dataPoints.map(({ x, y, value, label, color }) => (
          <circle
            key={label}
            cx={x}
            cy={y}
            r={value > 0.1 ? 5 : 3}
            fill={color}
            stroke="white"
            strokeWidth="2"
            className="transition-all duration-300"
            style={{
              filter:
                value > 0.3 ? "drop-shadow(0 0 5px " + color + ")" : "none",
            }}
          />
        ))}

        {/* Center point */}
        <circle
          cx={chartData.center}
          cy={chartData.center}
          r="4"
          fill="white"
          opacity="0.5"
        />
      </svg>
    </div>
  );
}
