/**
 * Emotion Store - Zustand store for emotion recognition state
 * Uses main-thread inference for better WASM compatibility
 */

import { create } from "zustand";
import { EMOTION_LABELS, EMOTION_COLORS } from "../utils/emotions";
import { AUDIO_CONSTANTS } from "../utils/RingBuffer";
import {
  initializeInference,
  runInference,
  resetInference,
  isInferenceReady,
  getWindowSize,
  getHopSize,
} from "../utils/inference";

// Initial emotion values
const initialEmotions = EMOTION_LABELS.reduce((acc, label) => {
  acc[label] = 0;
  return acc;
}, {});

const initialState = {
  // Inference state
  isModelLoaded: false,
  isInferenceRunning: false,

  // Current predictions
  emotions: { ...initialEmotions },
  rawEmotions: { ...initialEmotions },
  dominantEmotion: "neutral",
  confidence: 0,

  // Performance metrics
  inferenceTime: 0,
  lastPredictionTime: null,

  // History for charts
  emotionHistory: [],
  maxHistoryLength: 60, // ~30 seconds at 2 predictions/sec

  // Session data
  sessionStartTime: null,
  sessionEmotionSummary: { ...initialEmotions },
  predictionCount: 0,

  // Audio buffer for inference
  audioBuffer: [],

  // Inference loop
  inferenceIntervalId: null,

  // Error state
  error: null,
  modelPath: "/models/emotion_model.onnx",
};

export const useEmotionStore = create((set, get) => ({
  ...initialState,

  // Initialize model (replaces worker initialization)
  initializeWorker: async (sharedBuffer, capacity) => {
    try {
      const state = get();

      // Store reference to shared buffer for reading audio
      set({ sharedBuffer, bufferCapacity: capacity });

      // Initialize the ONNX model
      const success = await initializeInference(state.modelPath);

      if (success) {
        set({ isModelLoaded: true, error: null });
        console.log("[EmotionStore] Model loaded successfully");
      } else {
        set({ error: "Failed to load model" });
      }

      return success;
    } catch (error) {
      set({ error: error.message });
      console.error("[EmotionStore] Initialization error:", error);
      return false;
    }
  },

  // Add audio samples to buffer (called from audio store)
  addAudioSamples: (samples) => {
    const state = get();
    if (!state.isInferenceRunning) return;

    // Add samples to buffer
    const newBuffer = [...state.audioBuffer];
    for (let i = 0; i < samples.length; i++) {
      newBuffer.push(samples[i]);
    }

    // Keep buffer at reasonable size (4x window)
    const maxSize = getWindowSize() * 4;
    if (newBuffer.length > maxSize) {
      newBuffer.splice(0, newBuffer.length - maxSize);
    }

    set({ audioBuffer: newBuffer });
  },

  // Process audio and run inference
  processAudio: async () => {
    const state = get();

    if (!state.isInferenceRunning || !isInferenceReady()) {
      return;
    }

    const windowSize = getWindowSize();
    const hopSize = getHopSize();

    // Check if we have enough samples
    if (state.audioBuffer.length < windowSize) {
      return;
    }

    // Get the latest window of audio
    const audioWindow = new Float32Array(state.audioBuffer.slice(-windowSize));

    // Run inference
    const result = await runInference(audioWindow, AUDIO_CONSTANTS.SAMPLE_RATE);

    if (result) {
      get().handlePrediction(result);

      // Remove processed samples according to hop size
      const newBuffer = state.audioBuffer.slice(
        Math.min(hopSize, state.audioBuffer.length)
      );
      set({ audioBuffer: newBuffer });
    }
  },

  // Handle prediction result
  handlePrediction: (data) => {
    const state = get();
    const {
      emotions,
      rawEmotions,
      dominant,
      confidence,
      inferenceTime,
      timestamp,
    } = data;

    // Update emotion history
    const historyEntry = {
      timestamp,
      emotions: { ...emotions },
      dominant,
      confidence,
      isSilence: data.isSilence || false,
    };

    const newHistory = [...state.emotionHistory, historyEntry].slice(
      -state.maxHistoryLength
    );

    // Update session summary (running average)
    const newCount = state.predictionCount + 1;
    const newSummary = { ...state.sessionEmotionSummary };

    for (const label of EMOTION_LABELS) {
      newSummary[label] =
        (state.sessionEmotionSummary[label] * state.predictionCount +
          emotions[label]) /
        newCount;
    }

    set({
      emotions,
      rawEmotions,
      dominantEmotion: dominant,
      confidence,
      inferenceTime,
      lastPredictionTime: timestamp,
      emotionHistory: newHistory,
      sessionEmotionSummary: newSummary,
      predictionCount: newCount,
    });
  },

  // Start inference
  startInference: () => {
    const state = get();

    if (!isInferenceReady()) {
      set({ error: "Model not initialized" });
      return false;
    }

    // Start inference loop
    const intervalId = setInterval(() => {
      get().processAudio();
    }, 150); // Run inference every 150ms

    set({
      isInferenceRunning: true,
      inferenceIntervalId: intervalId,
      sessionStartTime: Date.now(),
    });

    console.log("[EmotionStore] Inference started");
    return true;
  },

  // Stop inference
  stopInference: () => {
    const state = get();

    if (state.inferenceIntervalId) {
      clearInterval(state.inferenceIntervalId);
    }

    set({
      isInferenceRunning: false,
      inferenceIntervalId: null,
    });

    console.log("[EmotionStore] Inference stopped");
  },

  // Reset session data
  resetSession: () => {
    resetInference();

    set({
      emotions: { ...initialEmotions },
      rawEmotions: { ...initialEmotions },
      dominantEmotion: "neutral",
      confidence: 0,
      emotionHistory: [],
      sessionEmotionSummary: { ...initialEmotions },
      predictionCount: 0,
      sessionStartTime: null,
      audioBuffer: [],
    });
  },

  // Set model path
  setModelPath: (path) => {
    set({ modelPath: path });
  },

  // Get current emotion color
  getCurrentColor: () => {
    const state = get();
    return EMOTION_COLORS[state.dominantEmotion] || EMOTION_COLORS.neutral;
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },

  // Terminate (cleanup)
  terminateWorker: () => {
    const state = get();
    if (state.inferenceIntervalId) {
      clearInterval(state.inferenceIntervalId);
    }
    set({
      isModelLoaded: false,
      isInferenceRunning: false,
      inferenceIntervalId: null,
    });
  },

  // Full reset
  reset: () => {
    get().terminateWorker();
    set(initialState);
  },
}));
