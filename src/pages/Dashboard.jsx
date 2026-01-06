import FaceEmotionDetector from "../components/FaceEmotionDetector";
import Waveform from "../components/Waveform";
import EmotionDisplay from "../components/EmotionDisplay";
import ControlPanel from "../components/ControlPanel";
import RadarChart from "../components/RadarChart";
import EmotionHistory from "../components/EmotionHistory";
import FileAnalyzer from "../components/FileAnalyzer";
import { useEmotionStore } from "../stores/emotionStore";
import { useAudioStore } from "../stores/audioStore";
import { EMOTION_COLORS } from "../utils/emotions";

export default function Dashboard() {
  const {
    dominantEmotion,
    isInferenceRunning,
    sessionStartTime,
    predictionCount,
  } = useEmotionStore();

  const { isRecording } = useAudioStore();

  const currentColor =
    EMOTION_COLORS[dominantEmotion] || EMOTION_COLORS.neutral;

  // Calculate session duration
  const sessionDuration = sessionStartTime
    ? Math.floor((Date.now() - sessionStartTime) / 1000)
    : 0;
  const minutes = Math.floor(sessionDuration / 60);
  const seconds = sessionDuration % 60;

  return (
    <div className="min-h-screen p-8">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white">Live Analysis</h1>
        <p className="text-gray-400 mt-1">
          Real-time speech emotion recognition powered by AI
        </p>
      </header>

      {/* Session stats bar - only show when recording */}
      {isRecording && (
        <div className="mb-6 flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-gray-400">Recording</span>
          </div>
          <div className="text-gray-400">
            Duration:{" "}
            <span className="text-white font-mono">
              {minutes}:{seconds.toString().padStart(2, "0")}
            </span>
          </div>
          <div className="text-gray-400">
            Predictions:{" "}
            <span className="text-white font-mono">{predictionCount}</span>
          </div>
        </div>
      )}

      {/* Main grid layout */}
      <div className="grid grid-cols-12 gap-6">
        {/* Face Emotion Detection - Top Full Width */}
        <div className="col-span-12">
          <FaceEmotionDetector />
        </div>

        {/* Left column - Waveform & Emotion Display */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          {/* Waveform visualizer (mic only) */}
          <Waveform className="w-full" />

          {/* Emotion display */}
          <EmotionDisplay />

          {/* Emotion history timeline */}
          <EmotionHistory />
        </div>

        {/* Right column - Control, File Analyzer & Radar */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          {/* Control panel (mic recording) */}
          <ControlPanel />

          {/* File Analyzer (separate from mic) */}
          <FileAnalyzer />

          {/* Radar chart */}
          <RadarChart size={280} />

          {/* Quick stats */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              Session Stats
            </h3>

            <div className="space-y-4">
              <StatItem
                label="Dominant Mood"
                value={dominantEmotion}
                color={currentColor}
                capitalize
              />
              <StatItem
                label="Analysis Duration"
                value={`${minutes}:${seconds.toString().padStart(2, "0")}`}
              />
              <StatItem
                label="Total Predictions"
                value={predictionCount.toString()}
              />
              <StatItem
                label="Status"
                value={isInferenceRunning ? "Active" : "Idle"}
                status={isInferenceRunning ? "active" : "idle"}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatItem({ label, value, color, capitalize, status }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-400">{label}</span>
      <span
        className={`text-sm font-medium ${capitalize ? "capitalize" : ""} ${
          status === "active"
            ? "text-green-400"
            : status === "idle"
            ? "text-gray-500"
            : "text-white"
        }`}
        style={color ? { color } : undefined}
      >
        {value}
      </span>
    </div>
  );
}
