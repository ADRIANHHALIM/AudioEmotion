/**
 * Waveform Visualizer Component
 * Displays a fluid, glowing waveform that reacts to audio volume
 */

import { useMemo } from "react";
import { useAudioStore } from "../stores/audioStore";
import { useEmotionStore } from "../stores/emotionStore";
import { EMOTION_COLORS } from "../utils/emotions";

export default function Waveform({ className = "" }) {
  const { rmsHistory, volume, isRecording, isFilePlaying } = useAudioStore();
  const { dominantEmotion, confidence, isInferenceRunning } = useEmotionStore();

  const currentColor =
    EMOTION_COLORS[dominantEmotion] || EMOTION_COLORS.neutral;
  const isAudioActive = isRecording || isFilePlaying;
  const statusLabel = isRecording
    ? "Listening..."
    : isFilePlaying
    ? "Analyzing file..."
    : "Ready";

  // Generate waveform path from RMS history
  const waveformPath = useMemo(() => {
    if (rmsHistory.length < 2) {
      return "M 0,50 L 100,50";
    }

    const width = 100;
    const height = 100;
    const centerY = height / 2;
    const points = rmsHistory.slice(-64); // Use last 64 points
    const step = width / (points.length - 1);

    // Create smooth curve through points
    let path = `M 0,${centerY}`;

    points.forEach((rms, i) => {
      const x = i * step;
      const amplitude = Math.min(rms * 500, 40); // Scale RMS to amplitude
      const y1 = centerY - amplitude;
      const y2 = centerY + amplitude;

      // Add wave with some randomness for organic feel
      const offset = Math.sin(i * 0.5 + Date.now() * 0.001) * 2;
      path += ` L ${x},${y1 + offset}`;
    });

    // Mirror for bottom half
    for (let i = points.length - 1; i >= 0; i--) {
      const x = i * step;
      const rms = points[i];
      const amplitude = Math.min(rms * 500, 40);
      const y2 = centerY + amplitude;
      const offset = Math.sin(i * 0.5 + Date.now() * 0.001) * 2;
      path += ` L ${x},${y2 + offset}`;
    }

    path += " Z";

    return path;
  }, [rmsHistory]);

  // Generate bar visualization
  const bars = useMemo(() => {
    const numBars = 32;
    const barData = [];
    const points = rmsHistory.slice(-numBars);

    for (let i = 0; i < numBars; i++) {
      const rms = points[i] || 0;
      const height = Math.max(4, Math.min(rms * 400, 80));
      const delay = i * 0.02;

      barData.push({ height, delay });
    }

    return barData;
  }, [rmsHistory]);

  return (
    <div className={`relative ${className}`}>
      {/* Background glow */}
      <div
        className="absolute inset-0 rounded-3xl transition-all duration-500"
        style={{
          background: isInferenceRunning
            ? `radial-gradient(ellipse at center, ${currentColor}20 0%, transparent 70%)`
            : "radial-gradient(ellipse at center, rgba(99, 102, 241, 0.1) 0%, transparent 70%)",
          filter: `blur(${20 + volume * 30}px)`,
          transform: `scale(${1 + volume * 0.1})`,
        }}
      />

      {/* Main visualization container */}
      <div className="relative glass-card p-8 overflow-hidden">
        {/* Pulsing ring */}
        <div
          className="absolute inset-4 rounded-2xl border-2 transition-all duration-300"
          style={{
            borderColor: `${currentColor}30`,
            boxShadow: isAudioActive
              ? `0 0 ${20 + volume * 40}px ${currentColor}40, inset 0 0 ${
                  10 + volume * 20
                }px ${currentColor}20`
              : "none",
            transform: `scale(${1 + volume * 0.02})`,
          }}
        />

        {/* Bar visualization */}
        <div className="relative h-48 flex items-center justify-center gap-1">
          {bars.map((bar, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-75"
              style={{
                width: "6px",
                height: `${bar.height}px`,
                backgroundColor: isInferenceRunning ? currentColor : "#6366f1",
                opacity: 0.5 + bar.height / 160,
                boxShadow: isAudioActive
                  ? `0 0 ${bar.height / 4}px ${
                      isInferenceRunning ? currentColor : "#6366f1"
                    }`
                  : "none",
                animationDelay: `${bar.delay}s`,
              }}
            />
          ))}
        </div>

        {/* Status indicator */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              isAudioActive ? "animate-pulse" : ""
            }`}
            style={{
              backgroundColor: isAudioActive ? currentColor : "#6b7280",
              boxShadow: isAudioActive ? `0 0 10px ${currentColor}` : "none",
            }}
          />
          <span className="text-xs text-gray-400">{statusLabel}</span>
        </div>
      </div>
    </div>
  );
}
