/**
 * Inference Worker - Thread C
 *
 * This Web Worker runs the ONNX inference session for emotion recognition.
 * It reads audio samples from the SharedArrayBuffer ring buffer using Atomics,
 * runs the model, and posts emotion predictions back to the main thread.
 *
 * Architecture:
 * - Uses onnxruntime-web with WASM backend
 * - Implements sliding window inference
 * - Applies softmax and temporal smoothing
 */

// Import ONNX Runtime Web
import * as ort from "onnxruntime-web";
import {
  calculateRMS,
  normalizeAudio,
  resampleAudio,
  standardizeAudio,
} from "../utils/audio";
import { EMOTION_LABELS } from "../utils/emotions";

// Set WASM paths before any operations
ort.env.wasm.wasmPaths = "/wasm/";
ort.env.wasm.numThreads = 1;

// Constants matching RingBuffer.js
const RING_BUFFER_HEADER_SIZE = 3;

// Audio processing constants
const TARGET_SAMPLE_RATE = 16000;
const INFERENCE_WINDOW_SAMPLES = 2376;
const HOP_DURATION_SECONDS = 0.5;
const HOP_SIZE_SAMPLES = Math.min(
  INFERENCE_WINDOW_SAMPLES - 1,
  Math.max(1, Math.floor(TARGET_SAMPLE_RATE * HOP_DURATION_SECONDS))
);
const NOISE_GATE_THRESHOLD = 0.01;
const VOICE_HOLD_MS = 800;
const EMA_ALPHA = 0.2;

// Worker state
let session = null;
let isRunning = false;
let sharedBuffer = null;
let controlBuffer = null;
let dataBuffer = null;
let capacity = 0;

let lastVoicedTimestamp = 0;

const NEUTRAL_VECTOR = EMOTION_LABELS.reduce((acc, label) => {
  acc[label] = label === "neutral" ? 1 : 0;
  return acc;
}, {});

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
 * Initialize ONNX Runtime session
 */
async function initializeModel(modelPath) {
  try {
    // Disable multi-threading to avoid SharedArrayBuffer conflicts in worker
    ort.env.wasm.numThreads = 1;

    // Set execution providers
    const options = {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    };

    // Load the model
    session = await ort.InferenceSession.create(modelPath, options);

    postMessage({
      type: "modelLoaded",
      inputNames: session.inputNames,
      outputNames: session.outputNames,
    });

    return true;
  } catch (error) {
    postMessage({
      type: "error",
      error: `Failed to load model: ${error.message}`,
    });
    return false;
  }
}

/**
 * Initialize shared buffer for reading audio
 */
function initializeBuffer(buffer, bufferCapacity) {
  sharedBuffer = buffer;
  capacity = bufferCapacity;

  controlBuffer = new Int32Array(sharedBuffer, 0, RING_BUFFER_HEADER_SIZE);

  const dataOffset = RING_BUFFER_HEADER_SIZE * Int32Array.BYTES_PER_ELEMENT;
  dataBuffer = new Float32Array(sharedBuffer, dataOffset, capacity);

  postMessage({ type: "bufferInitialized" });
}

/**
 * Read samples from ring buffer
 */
function readFromBuffer(destination) {
  if (!controlBuffer || !dataBuffer) return 0;

  const writePtr = Atomics.load(controlBuffer, 0);
  const readPtr = Atomics.load(controlBuffer, 1);

  const available =
    writePtr >= readPtr ? writePtr - readPtr : capacity - readPtr + writePtr;

  const toRead = Math.min(destination.length, available);

  if (toRead === 0) return 0;

  let readIndex = readPtr;

  for (let i = 0; i < toRead; i++) {
    destination[i] = dataBuffer[readIndex];
    readIndex = (readIndex + 1) % capacity;
  }

  // Update read pointer
  Atomics.store(controlBuffer, 1, readIndex);

  return toRead;
}

/**
 * Get available samples count
 */
function getAvailableSamples() {
  if (!controlBuffer) return 0;

  const writePtr = Atomics.load(controlBuffer, 0);
  const readPtr = Atomics.load(controlBuffer, 1);

  return writePtr >= readPtr
    ? writePtr - readPtr
    : capacity - readPtr + writePtr;
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
 * Apply temporal smoothing (EMA)
 */
function smoothPrediction(current) {
  return probabilitySmoother.update(current);
}

/**
 * Run inference on audio window
 */
async function runInference(
  samples,
  sourceSampleRate = TARGET_SAMPLE_RATE
) {
  if (!session) return null;

  try {
    const preparedSamples =
      sourceSampleRate === TARGET_SAMPLE_RATE
        ? samples
        : resampleAudio(samples, sourceSampleRate, TARGET_SAMPLE_RATE);
    const normalizedSamples = normalizeAudio(preparedSamples);
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

    const outputName = session.outputNames[0];
    const logits = results[outputName].data;
    const probabilities = softmax(Array.from(logits));

    const rawEmotions = {};
    EMOTION_LABELS.forEach((label, index) => {
      rawEmotions[label] = probabilities[index] ?? 0;
    });

    const emotions = smoothPrediction(rawEmotions);
    const { dominant, confidence } = getDominant(emotions);

    return {
      emotions,
      rawEmotions,
      dominant,
      confidence,
      inferenceTime,
    };
  } catch (error) {
    postMessage({
      type: "error",
      error: `Inference error: ${error.message}`,
    });
    return null;
  }
}

/**
 * Main inference loop
 */
async function inferenceLoop() {
  console.log("[InferenceWorker] Starting inference loop");
  console.log("[InferenceWorker] Window size:", INFERENCE_WINDOW_SAMPLES);
  console.log("[InferenceWorker] Buffer initialized:", !!sharedBuffer);
  console.log("[InferenceWorker] Session ready:", !!session);

  // Buffer to accumulate samples
  let sampleBuffer = [];

  while (isRunning) {
    const available = getAvailableSamples();

    // Read whatever is available
    if (available > 0) {
      const tempBuffer = new Float32Array(available);
      const read = readFromBuffer(tempBuffer);

      if (read > 0) {
        // Add to our sample buffer
        for (let i = 0; i < read; i++) {
          sampleBuffer.push(tempBuffer[i]);
        }

        // Keep buffer at reasonable size (2x window)
        if (sampleBuffer.length > INFERENCE_WINDOW_SAMPLES * 2) {
          sampleBuffer = sampleBuffer.slice(-INFERENCE_WINDOW_SAMPLES * 2);
        }
      }
    }

    // Run inference when we have enough samples
    if (sampleBuffer.length >= INFERENCE_WINDOW_SAMPLES) {
      const windowData = new Float32Array(
        sampleBuffer.slice(-INFERENCE_WINDOW_SAMPLES)
      );

      const now = Date.now();
      const rms = calculateRMS(windowData);
      if (rms < NOISE_GATE_THRESHOLD) {
        postMessage({
          type: "prediction",
          ...buildSilencePayload(now),
        });
        sampleBuffer = sampleBuffer.slice(
          Math.min(HOP_SIZE_SAMPLES, sampleBuffer.length)
        );
        continue;
      }

      lastVoicedTimestamp = now;
      const result = await runInference(windowData);

      if (result) {
        postMessage({
          type: "prediction",
          emotions: result.emotions,
          rawEmotions: result.rawEmotions,
          dominant: result.dominant,
          confidence: result.confidence,
          inferenceTime: result.inferenceTime,
          timestamp: Date.now(),
          isSilence: false,
        });

        sampleBuffer = sampleBuffer.slice(
          Math.min(HOP_SIZE_SAMPLES, sampleBuffer.length)
        );
      }
    }

    // Small yield to prevent blocking
    await sleep(100);
  }

  console.log("[InferenceWorker] Inference loop stopped");
}

/**
 * Utility sleep function
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function buildSilencePayload(timestamp) {
  const holdActive =
    timestamp - lastVoicedTimestamp < VOICE_HOLD_MS && lastVoicedTimestamp > 0;
  const baselineState = holdActive
    ? probabilitySmoother.getState() || { ...NEUTRAL_VECTOR }
    : probabilitySmoother.update(NEUTRAL_VECTOR);
  const emotions = { ...baselineState };
  const { dominant, confidence } = getDominant(emotions);

  return {
    emotions,
    rawEmotions: emotions,
    dominant,
    confidence,
    inferenceTime: 0,
    timestamp,
    isSilence: true,
  };
}

/**
 * Handle messages from main thread
 */
self.onmessage = async (event) => {
  const { type, ...data } = event.data;

  switch (type) {
    case "init":
      console.log("[InferenceWorker] Initializing with model:", data.modelPath);
      const success = await initializeModel(data.modelPath);
      if (success && data.sharedBuffer) {
        initializeBuffer(data.sharedBuffer, data.capacity);
      }
      break;

    case "initBuffer":
      initializeBuffer(data.sharedBuffer, data.capacity);
      break;

    case "start":
      console.log(
        "[InferenceWorker] Start requested, session:",
        !!session,
        "buffer:",
        !!sharedBuffer
      );
      if (session && sharedBuffer) {
        isRunning = true;
        probabilitySmoother.reset();
        lastVoicedTimestamp = 0;
        postMessage({ type: "started" });
        inferenceLoop();
      } else {
        postMessage({
          type: "error",
          error: "Cannot start: model or buffer not initialized",
        });
      }
      break;

    case "stop":
      isRunning = false;
      probabilitySmoother.reset();
      lastVoicedTimestamp = 0;
      postMessage({ type: "stopped" });
      break;

    case "reset":
      probabilitySmoother.reset();
      lastVoicedTimestamp = 0;
      break;

    default:
      postMessage({
        type: "error",
        error: `Unknown message type: ${type}`,
      });
  }
};

// Notify main thread that worker is ready
postMessage({ type: "ready" });
