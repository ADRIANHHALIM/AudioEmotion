/**
 * File Inference - Analyze entire audio file at once
 * Similar to Colab approach: load file → run inference → get result
 */

import * as ort from "onnxruntime-web";
import { EMOTION_LABELS } from "./emotions";

const TARGET_SAMPLE_RATE = 16000;
const WINDOW_SAMPLES = 2376; // Model input size
const MODEL_PATH = "/models/emotion_model.onnx";

let session = null;
let isInitialized = false;

/**
 * Initialize the ONNX model
 */
async function initializeModel() {
  if (isInitialized && session) {
    return true;
  }

  try {
    console.log("[FileInference] Loading ONNX model...");
    ort.env.wasm.numThreads = 1;

    session = await ort.InferenceSession.create(MODEL_PATH, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });

    isInitialized = true;
    console.log("[FileInference] Model loaded successfully");
    console.log("[FileInference] Input names:", session.inputNames);
    console.log("[FileInference] Output names:", session.outputNames);

    return true;
  } catch (error) {
    console.error("[FileInference] Failed to load model:", error);
    return false;
  }
}

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
 * Normalize audio samples to [-1, 1]
 */
function normalizeAudio(samples) {
  const max = Math.max(...samples.map(Math.abs));
  if (max === 0) return samples;
  return samples.map((s) => s / max);
}

/**
 * Standardize audio (zero mean, unit variance)
 */
function standardizeAudio(samples) {
  const n = samples.length;
  if (n === 0) return samples;

  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += samples[i];
  }
  const mean = sum / n;

  let variance = 0;
  for (let i = 0; i < n; i++) {
    const diff = samples[i] - mean;
    variance += diff * diff;
  }
  variance /= n;

  const std = Math.sqrt(variance);
  if (std === 0) return samples.map(() => 0);

  return samples.map((s) => (s - mean) / std);
}

/**
 * Run inference on a single audio window
 */
async function runInferenceOnWindow(samples) {
  if (!session) {
    throw new Error("Model not initialized");
  }

  // Prepare samples (pad or truncate to WINDOW_SAMPLES)
  let inputSamples;
  if (samples.length < WINDOW_SAMPLES) {
    inputSamples = new Float32Array(WINDOW_SAMPLES);
    inputSamples.set(samples);
  } else if (samples.length > WINDOW_SAMPLES) {
    inputSamples = samples.slice(0, WINDOW_SAMPLES);
  } else {
    inputSamples = samples;
  }

  // Normalize and standardize
  const normalized = normalizeAudio(Array.from(inputSamples));
  const standardized = standardizeAudio(normalized);

  // Create tensor [batch, samples, channels]
  const inputTensor = new ort.Tensor(
    "float32",
    new Float32Array(standardized),
    [1, standardized.length, 1]
  );

  // Run inference
  const feeds = {};
  feeds[session.inputNames[0]] = inputTensor;

  const results = await session.run(feeds);
  const outputName = session.outputNames[0];
  const logits = Array.from(results[outputName].data);

  return softmax(logits);
}

/**
 * Analyze entire audio file
 * Processes the file in overlapping windows and averages the results
 */
export async function analyzeAudioFile(audioBuffer) {
  // Ensure model is loaded
  const modelReady = await initializeModel();
  if (!modelReady) {
    throw new Error("Failed to load emotion model");
  }

  const startTime = performance.now();

  // Get audio samples
  const samples = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  console.log("[FileInference] Analyzing audio:", {
    duration: audioBuffer.duration,
    sampleRate,
    samples: samples.length,
  });

  // If audio is very short, just run one inference
  if (samples.length <= WINDOW_SAMPLES) {
    console.log("[FileInference] Short audio, running single inference");
    const probabilities = await runInferenceOnWindow(samples);

    const emotions = {};
    EMOTION_LABELS.forEach((label, i) => {
      emotions[label] = probabilities[i];
    });

    const maxIndex = probabilities.indexOf(Math.max(...probabilities));
    const dominant = EMOTION_LABELS[maxIndex];
    const confidence = probabilities[maxIndex];

    const inferenceTime = performance.now() - startTime;

    return {
      emotions,
      dominant,
      confidence,
      inferenceTime,
      windowsProcessed: 1,
    };
  }

  // For longer audio, process in overlapping windows
  const hopSize = Math.floor(WINDOW_SAMPLES / 2); // 50% overlap
  const windows = [];

  for (
    let start = 0;
    start + WINDOW_SAMPLES <= samples.length;
    start += hopSize
  ) {
    windows.push(samples.slice(start, start + WINDOW_SAMPLES));
  }

  // Also include the last window if there are remaining samples
  if (samples.length % hopSize !== 0) {
    const lastWindow = new Float32Array(WINDOW_SAMPLES);
    const remaining = samples.slice(-WINDOW_SAMPLES);
    lastWindow.set(
      remaining.length >= WINDOW_SAMPLES
        ? remaining.slice(-WINDOW_SAMPLES)
        : remaining
    );
    windows.push(lastWindow);
  }

  console.log("[FileInference] Processing", windows.length, "windows");

  // Run inference on each window
  const allProbabilities = [];
  for (const window of windows) {
    const probs = await runInferenceOnWindow(window);
    allProbabilities.push(probs);
  }

  // Average the probabilities across all windows
  const avgProbabilities = new Array(EMOTION_LABELS.length).fill(0);
  for (const probs of allProbabilities) {
    for (let i = 0; i < probs.length; i++) {
      avgProbabilities[i] += probs[i];
    }
  }
  for (let i = 0; i < avgProbabilities.length; i++) {
    avgProbabilities[i] /= allProbabilities.length;
  }

  // Create emotions map
  const emotions = {};
  EMOTION_LABELS.forEach((label, i) => {
    emotions[label] = avgProbabilities[i];
  });

  // Find dominant emotion
  const maxIndex = avgProbabilities.indexOf(Math.max(...avgProbabilities));
  const dominant = EMOTION_LABELS[maxIndex];
  const confidence = avgProbabilities[maxIndex];

  const inferenceTime = performance.now() - startTime;

  console.log("[FileInference] Analysis complete:", {
    dominant,
    confidence: (confidence * 100).toFixed(1) + "%",
    inferenceTime: inferenceTime.toFixed(0) + "ms",
  });

  return {
    emotions,
    dominant,
    confidence,
    inferenceTime,
    windowsProcessed: windows.length,
  };
}

/**
 * Check if model is ready
 */
export function isFileInferenceReady() {
  return isInitialized && session !== null;
}

/**
 * Preload the model
 */
export async function preloadModel() {
  return initializeModel();
}
