/**
 * Inference Service - Main Thread ONNX Inference
 *
 * This module runs ONNX inference on the main thread to avoid
 * WASM loading issues in Web Workers.
 */

import * as ort from "onnxruntime-web";
import {
  calculateRMS,
  normalizeAudio,
  resampleAudio,
  standardizeAudio,
} from "./audio";
import { EMOTION_LABELS } from "./emotions";

const TARGET_SAMPLE_RATE = 16000;
const INFERENCE_WINDOW_SAMPLES = 2376;
const HOP_DURATION_SECONDS = 0.5;
const HOP_SAMPLES = Math.min(
  INFERENCE_WINDOW_SAMPLES - 1,
  Math.max(1, Math.floor(TARGET_SAMPLE_RATE * HOP_DURATION_SECONDS))
);
const NOISE_GATE_THRESHOLD = 0.01;
const VOICE_HOLD_MS = 800;
const EMA_ALPHA = 0.2;

const NEUTRAL_VECTOR = EMOTION_LABELS.reduce((acc, label) => {
  acc[label] = label === "neutral" ? 1 : 0;
  return acc;
}, {});

// State
let session = null;
let isInitialized = false;
let lastVoicedTimestamp = 0;

class EmaSmoother {
  constructor(alpha) {
    this.alpha = alpha;
    this.state = null;
  }

  update(values) {
    if (!this.state) {
      this.state = { ...values };
      return { ...this.state };
    }

    const smoothed = {};
    for (const label of EMOTION_LABELS) {
      const next = values[label] ?? 0;
      const prev = this.state[label] ?? 0;
      smoothed[label] = this.alpha * next + (1 - this.alpha) * prev;
    }

    this.state = smoothed;
    return { ...this.state };
  }

  reset() {
    this.state = null;
  }

  getState() {
    return this.state ? { ...this.state } : null;
  }
}

const probabilitySmoother = new EmaSmoother(EMA_ALPHA);

/**
 * Apply softmax to logits
 */
function softmax(logits) {
  const maxLogit = Math.max(...logits);
  const expScores = logits.map((x) => Math.exp(x - maxLogit));
  const sumExp = expScores.reduce((a, b) => a + b, 0);
  return expScores.map((x) => x / sumExp);
}

/**
 * Apply temporal smoothing (EMA)
 */
/**
 * Initialize the ONNX inference session
 */
export async function initializeInference(
  modelPath = "/models/emotion_model.onnx"
) {
  try {
    console.log("[Inference] Initializing ONNX Runtime...");

    // Configure ONNX Runtime
    ort.env.wasm.numThreads = 1;

    // Load the model
    console.log("[Inference] Loading model:", modelPath);
    session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });

    isInitialized = true;
    console.log("[Inference] Model loaded successfully");
    console.log("[Inference] Input names:", session.inputNames);
    console.log("[Inference] Output names:", session.outputNames);

    return true;
  } catch (error) {
    console.error("[Inference] Failed to initialize:", error);
    return false;
  }
}

/**
 * Check if inference is ready
 */
export function isInferenceReady() {
  return isInitialized && session !== null;
}

/**
 * Run inference on audio samples
 */
export async function runInference(
  audioSamples,
  sourceSampleRate = TARGET_SAMPLE_RATE
) {
  if (!session) {
    console.error("[Inference] Session not initialized");
    return null;
  }

  try {
    const now = Date.now();
    const rms = calculateRMS(audioSamples);

    if (rms < NOISE_GATE_THRESHOLD) {
      return buildSilenceResult(now);
    }

    lastVoicedTimestamp = now;

    let samples = audioSamples;

    if (sourceSampleRate !== TARGET_SAMPLE_RATE) {
      samples = resampleAudio(audioSamples, sourceSampleRate, TARGET_SAMPLE_RATE);
    }

    if (samples.length < INFERENCE_WINDOW_SAMPLES) {
      const padded = new Float32Array(INFERENCE_WINDOW_SAMPLES);
      padded.set(samples);
      samples = padded;
    } else if (samples.length > INFERENCE_WINDOW_SAMPLES) {
      samples = samples.slice(-INFERENCE_WINDOW_SAMPLES);
    }

    const normalizedSamples = normalizeAudio(samples);
    const standardizedSamples = standardizeAudio(normalizedSamples);

    const inputTensor = new ort.Tensor("float32", standardizedSamples, [
      1,
      standardizedSamples.length,
      1,
    ]);

    const feeds = {};
    feeds[session.inputNames[0]] = inputTensor;

    const startTime = performance.now();
    const results = await session.run(feeds);
    const inferenceTime = performance.now() - startTime;

    // Get output logits
    const outputName = session.outputNames[0];
    const logits = results[outputName].data;

    const logitsArray = Array.from(logits);
    const probabilities = softmax(logitsArray);

    const debugRows = EMOTION_LABELS.map((label, index) => {
      const logit = logitsArray[index] ?? 0;
      const probability = probabilities[index] ?? 0;
      return {
        label,
        logit: Number(logit.toFixed(6)),
        probability: Number(probability.toFixed(6)),
      };
    });
    console.table(debugRows);

    const emotions = probabilitiesToMap(probabilities);
    const smoothedEmotions = probabilitySmoother.update(emotions);
    const { dominant, confidence } = getDominant(smoothedEmotions);

    return {
      emotions: smoothedEmotions,
      rawEmotions: emotions,
      dominant,
      confidence,
      inferenceTime,
      timestamp: Date.now(),
      isSilence: false,
    };
  } catch (error) {
    console.error("[Inference] Error running inference:", error);
    return null;
  }
}

/**
 * Reset inference state
 */
export function resetInference() {
  probabilitySmoother.reset();
  lastVoicedTimestamp = 0;
}

/**
 * Get required window size
 */
export function getWindowSize() {
  return INFERENCE_WINDOW_SAMPLES;
}

export function getHopSize() {
  return HOP_SAMPLES;
}

/**
 * Get emotion labels
 */
export function getEmotionLabels() {
  return EMOTION_LABELS;
}

function probabilitiesToMap(probabilities) {
  const output = {};
  EMOTION_LABELS.forEach((label, index) => {
    output[label] = probabilities[index] ?? 0;
  });
  return output;
}

function getDominant(emotions) {
  let dominant = "neutral";
  let confidence = 0;
  for (const [label, value] of Object.entries(emotions)) {
    if (value > confidence) {
      confidence = value;
      dominant = label;
    }
  }
  return { dominant, confidence };
}

function buildSilenceResult(timestamp) {
  const holdActive =
    timestamp - lastVoicedTimestamp < VOICE_HOLD_MS && lastVoicedTimestamp > 0;
  const baselineState = holdActive
    ? probabilitySmoother.getState() || { ...NEUTRAL_VECTOR }
    : probabilitySmoother.update(NEUTRAL_VECTOR);
  const baseline = { ...baselineState };
  const { dominant, confidence } = getDominant(baseline);

  return {
    emotions: baseline,
    rawEmotions: baseline,
    dominant,
    confidence,
    inferenceTime: 0,
    timestamp,
    isSilence: true,
  };
}
