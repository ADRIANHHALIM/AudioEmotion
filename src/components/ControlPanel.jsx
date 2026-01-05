/**
 * Control Panel Component
 * Start/Stop recording and manage audio pipeline
 */

import { useState, useEffect, useRef } from "react";
import {
  Mic,
  MicOff,
  AlertCircle,
  CheckCircle,
  Loader2,
  Lock,
} from "lucide-react";
import { useAudioStore } from "../stores/audioStore";
import { useEmotionStore } from "../stores/emotionStore";
import { useSessionStore } from "../stores/sessionStore";
import { useAuthStore } from "../stores/authStore";
import { predictionsApi } from "../lib/api";
import { AUDIO_CONSTANTS } from "../utils/RingBuffer";
import { checkBrowserCompatibility } from "../utils/audio";
import { EMOTION_COLORS } from "../utils/emotions";

export default function ControlPanel({ className = "" }) {
  const [compatibility, setCompatibility] = useState({
    supported: true,
    missing: [],
  });
  const [isInitializing, setIsInitializing] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const pendingPredictionsRef = useRef([]);
  const saveIntervalRef = useRef(null);
  const fileFinalizeRef = useRef(false);

  const { isAuthenticated } = useAuthStore();
  const { createSession, endSession } = useSessionStore();

  const {
    isInitialized,
    isRecording,
    isProcessorReady,
    sharedBuffer,
    error: audioError,
    initialize: initializeAudio,
    startRecording,
    stopRecording,
    clearError: clearAudioError,
    inputMode,
    stopFilePlayback,
    fileBuffer,
    uploadedFileName,
    isFilePlaying,
    fileDuration,
    filePlaybackPosition,
    seekFilePlayback,
    resumeFilePlayback,
  } = useAudioStore();

  const {
    isModelLoaded,
    isInferenceRunning,
    dominantEmotion,
    confidence,
    emotions,
    inferenceTime,
    sessionEmotionSummary,
    predictionCount,
    error: emotionError,
    initializeWorker,
    startInference,
    stopInference,
    resetSession,
    clearError: clearEmotionError,
  } = useEmotionStore();

  const currentColor =
    EMOTION_COLORS[dominantEmotion] || EMOTION_COLORS.neutral;
  const isFileMode = inputMode === "file";
  const [fileSessionActive, setFileSessionActive] = useState(false);

  // Check browser compatibility on mount
  useEffect(() => {
    setCompatibility(checkBrowserCompatibility());
  }, []);

  // Initialize audio and worker on mount
  useEffect(() => {
    const init = async () => {
      if (!compatibility.supported) return;

      setIsInitializing(true);

      // Initialize audio subsystem
      const audioOk = await initializeAudio();

      if (audioOk) {
        // Get the shared buffer and initialize inference worker
        const state = useAudioStore.getState();
        await initializeWorker(
          state.sharedBuffer,
          AUDIO_CONSTANTS.RING_BUFFER_CAPACITY
        );
      }

      setIsInitializing(false);
    };

    init();
  }, [compatibility.supported]);

  // Track predictions and batch save them
  useEffect(() => {
    if (!isInferenceRunning || !currentSessionId || !isAuthenticated) return;

    // Add current prediction to pending list
    if (dominantEmotion && confidence > 0) {
      pendingPredictionsRef.current.push({
        dominant: dominantEmotion,
        confidence,
        emotions: { ...emotions },
        inferenceTime,
        timestamp: new Date().toISOString(),
      });
    }
  }, [predictionCount]); // Trigger on each new prediction

  // Save predictions periodically
  useEffect(() => {
    if (!isInferenceRunning || !currentSessionId || !isAuthenticated) return;

    // Save predictions every 5 seconds
    saveIntervalRef.current = setInterval(async () => {
      if (pendingPredictionsRef.current.length > 0 && currentSessionId) {
        try {
          await predictionsApi.createBatch(
            currentSessionId,
            pendingPredictionsRef.current
          );
          console.log(
            `[ControlPanel] Saved ${pendingPredictionsRef.current.length} predictions`
          );
          pendingPredictionsRef.current = [];
        } catch (error) {
          console.error("[ControlPanel] Failed to save predictions:", error);
        }
      }
    }, 5000);

    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, [isInferenceRunning, currentSessionId, isAuthenticated]);

  const savePendingPredictions = async () => {
    if (
      currentSessionId &&
      isAuthenticated &&
      pendingPredictionsRef.current.length > 0
    ) {
      try {
        await predictionsApi.createBatch(
          currentSessionId,
          pendingPredictionsRef.current
        );
        console.log(
          `[ControlPanel] Saved ${pendingPredictionsRef.current.length} predictions`
        );
        pendingPredictionsRef.current = [];
      } catch (error) {
        console.error("[ControlPanel] Failed to save predictions:", error);
      }
    }
  };

  const finalizeActiveSession = async () => {
    await savePendingPredictions();
    if (currentSessionId && isAuthenticated) {
      try {
        await endSession(currentSessionId);
        console.log("[ControlPanel] Session ended and saved");
      } catch (error) {
        console.error("[ControlPanel] Failed to end session:", error);
      }
    }

    setCurrentSessionId(null);
  };

  // State for login required message
  const [showLoginRequired, setShowLoginRequired] = useState(false);

  // Handle start/stop toggle
  const handleToggle = async () => {
    if (isRecording || isFileMode) {
      stopInference();

      if (isRecording) {
        stopRecording();
      } else if (isFileMode) {
        try {
          await stopFilePlayback({
            clearBuffer: true,
            releaseContext: true,
          });
        } catch (error) {
          console.error("[ControlPanel] Failed to stop file playback:", error);
        }
        setFileSessionActive(false);
      }

      await finalizeActiveSession();

      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }

      return;
    }

    // Require authentication for live mic recording
    if (!isAuthenticated) {
      setShowLoginRequired(true);
      setTimeout(() => setShowLoginRequired(false), 5000); // Hide after 5 seconds
      return;
    }

    resetSession();

    // Create a new session in database
    if (isAuthenticated) {
      try {
        const result = await createSession({
          name: `Session ${new Date().toLocaleString()}`,
        });
        if (result.success && result.data) {
          setCurrentSessionId(result.data.id);
          console.log("[ControlPanel] Created session:", result.data.id);
        }
      } catch (error) {
        console.error("[ControlPanel] Failed to create session:", error);
      }
    }

    const started = await startRecording();
    if (started) {
      setTimeout(() => {
        startInference();
      }, 500);
    }
  };

  useEffect(() => {
    if (
      !isFileMode ||
      !fileBuffer ||
      fileSessionActive ||
      !isProcessorReady ||
      !isModelLoaded
    ) {
      return;
    }

    let cancelled = false;

    const startFileSession = async () => {
      if (isInferenceRunning) {
        stopInference();
      }

      pendingPredictionsRef.current = [];

      if (isAuthenticated) {
        try {
          const result = await createSession({
            name: `File Analysis - ${
              uploadedFileName || new Date().toLocaleString()
            }`,
          });
          if (!cancelled && result.success && result.data) {
            setCurrentSessionId(result.data.id);
            console.log("[ControlPanel] Created file session:", result.data.id);
          }
        } catch (error) {
          console.error("[ControlPanel] Failed to create file session:", error);
        }
      } else {
        setCurrentSessionId(null);
      }

      if (cancelled) return;

      startInference();

      try {
        const wasPlaying = isFilePlaying;
        await seekFilePlayback(0);
        if (!wasPlaying) {
          await resumeFilePlayback();
        }
      } catch (error) {
        console.error("[ControlPanel] Failed to sync playback:", error);
      }

      setFileSessionActive(true);
    };

    startFileSession();

    return () => {
      cancelled = true;
    };
  }, [
    isFileMode,
    fileBuffer,
    fileSessionActive,
    isProcessorReady,
    isModelLoaded,
    isInferenceRunning,
    isAuthenticated,
    uploadedFileName,
    createSession,
    startInference,
    stopInference,
    seekFilePlayback,
    resumeFilePlayback,
    isFilePlaying,
  ]);

  useEffect(() => {
    if (!fileSessionActive) {
      return;
    }

    const completedPlayback =
      isFileMode &&
      fileDuration > 0 &&
      !isFilePlaying &&
      filePlaybackPosition >= fileDuration - 0.05;
    const stoppedExternally = !isFileMode;

    if (!completedPlayback && !stoppedExternally) {
      return;
    }

    if (fileFinalizeRef.current) {
      return;
    }

    fileFinalizeRef.current = true;

    const finalizeFileSession = async () => {
      stopInference();

      if (completedPlayback) {
        try {
          await stopFilePlayback({
            clearBuffer: true,
            releaseContext: true,
          });
        } catch (error) {
          console.error("[ControlPanel] Failed to stop playback:", error);
        }
      }

      await finalizeActiveSession();
      setFileSessionActive(false);
      fileFinalizeRef.current = false;
    };

    finalizeFileSession();
  }, [
    fileSessionActive,
    isFileMode,
    isFilePlaying,
    fileDuration,
    filePlaybackPosition,
    stopFilePlayback,
    stopInference,
  ]);

  const error = audioError || emotionError;
  const isReady = isInitialized && isModelLoaded && compatibility.supported;
  const isAudioActive = isRecording || isFileMode;
  const buttonDisabled = !isAudioActive && (!isReady || isInitializing);

  return (
    <div className={`glass-card p-6 ${className}`}>
      {/* Compatibility warning */}
      {!compatibility.supported && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-400">
                Browser Compatibility Issue
              </p>
              <p className="text-xs text-red-300/70 mt-1">
                Missing: {compatibility.missing.join(", ")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-400">{error}</p>
            </div>
            <button
              onClick={() => {
                clearAudioError();
                clearEmotionError();
              }}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Login required message */}
      {showLoginRequired && (
        <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl animate-pulse">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-400">
                Login Required
              </p>
              <p className="text-xs text-amber-300/70 mt-1">
                Please login to use live microphone analysis. You can still use
                drag & drop file analysis without logging in.
              </p>
            </div>
            <button
              onClick={() => setShowLoginRequired(false)}
              className="text-xs text-amber-400 hover:text-amber-300"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main control button */}
      <div className="flex flex-col items-center">
        <button
          onClick={handleToggle}
          disabled={buttonDisabled}
          className={`
            relative w-32 h-32 rounded-full flex items-center justify-center
            transition-all duration-300 transform
            ${
              isAudioActive
                ? "bg-red-500 hover:bg-red-600 scale-110"
                : "bg-gradient-to-br from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
            }
            ${
              buttonDisabled
                ? "opacity-50 cursor-not-allowed"
                : "hover:scale-105"
            }
            active:scale-95
          `}
          style={{
            boxShadow: isAudioActive
              ? `0 0 60px ${currentColor}60, 0 0 100px ${currentColor}30`
              : "0 0 40px rgba(99, 102, 241, 0.3)",
          }}
        >
          {/* Pulsing ring when recording */}
          {isAudioActive && (
            <>
              <span
                className="absolute inset-0 rounded-full animate-ping opacity-20"
                style={{ backgroundColor: currentColor }}
              />
              <span
                className="absolute inset-2 rounded-full animate-pulse opacity-30"
                style={{ backgroundColor: currentColor }}
              />
            </>
          )}

          {isInitializing ? (
            <Loader2 className="w-12 h-12 text-white animate-spin" />
          ) : isAudioActive ? (
            <MicOff className="w-12 h-12 text-white" />
          ) : !isAuthenticated ? (
            <div className="relative">
              <Mic className="w-12 h-12 text-white/50" />
              <Lock className="w-5 h-5 text-amber-400 absolute -bottom-1 -right-1" />
            </div>
          ) : (
            <Mic className="w-12 h-12 text-white" />
          )}
        </button>

        <p className="mt-4 text-sm text-gray-400">
          {isInitializing
            ? "Initializing..."
            : isAudioActive
            ? "Tap to stop"
            : !isAuthenticated
            ? "Login required for live mic"
            : "Tap to start"}
        </p>
      </div>

      {/* Status indicators */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <StatusItem
          label="Audio"
          ready={isInitialized && isProcessorReady}
          active={isAudioActive}
        />
        <StatusItem
          label="AI Model"
          ready={isModelLoaded}
          active={isInferenceRunning}
        />
      </div>
    </div>
  );
}

function StatusItem({ label, ready, active }) {
  return (
    <div className="flex items-center gap-2 p-3 bg-white/5 rounded-xl">
      {active ? (
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
      ) : ready ? (
        <CheckCircle className="w-4 h-4 text-green-400" />
      ) : (
        <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
      )}
      <span className={`text-sm ${ready ? "text-gray-300" : "text-gray-500"}`}>
        {label}
      </span>
    </div>
  );
}
