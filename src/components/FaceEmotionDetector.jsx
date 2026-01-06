import { useState, useRef, useEffect, useCallback } from "react";
import {
  Camera,
  CameraOff,
  RefreshCw,
  Maximize2,
  Minimize2,
  Users,
  Activity,
  AlertCircle,
} from "lucide-react";
import * as ort from "onnxruntime-web";

/**
 * CONFIGURATION
 */
const MODEL_INPUT_SIZE = 640;
const CONFIDENCE_THRESHOLD = 0.45;
const IOU_THRESHOLD = 0.45;
const INFERENCE_INTERVAL = 60; // Run AI every 60ms
const EMOTION_SMOOTHING_FACTOR = 0.4;

const FACE_EMOTION_LABELS = [
  "angry",
  "disgust",
  "fear",
  "happy",
  "neutral",
  "sad",
  "surprise",
];

const FACE_EMOTION_COLORS = {
  angry: "#ef4444",
  disgust: "#d946ef",
  fear: "#8b5cf6",
  happy: "#22c55e",
  neutral: "#94a3b8",
  sad: "#3b82f6",
  surprise: "#f59e0b",
};

const FACE_EMOTION_EMOJIS = {
  angry: "😠",
  disgust: "🤢",
  fear: "😨",
  happy: "😊",
  neutral: "😐",
  sad: "😢",
  surprise: "😲",
};

export default function FaceEmotionDetector({ className = "" }) {
  // --- STATE ---
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState(null);

  // Data Display
  const [displayDetections, setDisplayDetections] = useState([]);
  const [fps, setFps] = useState(0);
  const [inferenceTime, setInferenceTime] = useState(0);

  // --- REFS ---
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const sessionRef = useRef(null);
  const requestRef = useRef(null);
  const detectionsRef = useRef([]);

  // Logic Refs
  const lastInferenceTimeRef = useRef(0);
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(0);

  // Memory Optimization
  const processingCanvasRef = useRef(null);
  const float32DataRef = useRef(
    new Float32Array(3 * MODEL_INPUT_SIZE * MODEL_INPUT_SIZE)
  );
  const emotionHistoryRef = useRef({});

  // --- 1. LOAD MODEL ---
  const loadModel = useCallback(async () => {
    if (sessionRef.current) return sessionRef.current;

    setIsLoading(true);
    setError(null);

    try {
      ort.env.wasm.wasmPaths =
        "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.3/dist/";

      const options = {
        executionProviders: ["webgl", "wasm"],
        graphOptimizationLevel: "all",
      };

      const session = await ort.InferenceSession.create(
        "/models/face_emotion.onnx",
        options
      );

      sessionRef.current = session;

      if (!processingCanvasRef.current) {
        processingCanvasRef.current = document.createElement("canvas");
        processingCanvasRef.current.width = MODEL_INPUT_SIZE;
        processingCanvasRef.current.height = MODEL_INPUT_SIZE;
      }

      console.log("Model loaded:", session.handler?.backendName);
      return session;
    } catch (err) {
      console.error("Model Error:", err);
      setError("Failed to load model. Check /models/face_emotion.onnx");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // --- 2. CAMERA HELPERS ---

  // Helper: Hentikan hardware kamera (Tracks)
  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
          frameRate: { ideal: 60 },
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Langsung play, jangan tunggu metadata
        await videoRef.current
          .play()
          .catch((e) => console.error("Play error:", e));
      }

      streamRef.current = stream;
    } catch (err) {
      console.error("Camera Error:", err);
      setError("Camera access denied.");
      throw err;
    }
  }, []);

  // --- 3. MANUAL STOP (User Click) ---
  const stopCamera = useCallback(() => {
    stopTracks(); // Matikan Hardware
    setIsActive(false); // Matikan Loop

    // Reset Data
    emotionHistoryRef.current = {};
    setFps(0);
    setDisplayDetections([]);
    detectionsRef.current = [];
  }, [stopTracks]);

  // --- 4. PREPROCESSING ---
  const preprocessImage = useCallback((sourceElement) => {
    const canvas = processingCanvasRef.current;
    if (
      !canvas ||
      sourceElement.videoWidth === 0 ||
      sourceElement.videoHeight === 0
    )
      return null;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const scale = Math.min(
      MODEL_INPUT_SIZE / sourceElement.videoWidth,
      MODEL_INPUT_SIZE / sourceElement.videoHeight
    );
    const newWidth = sourceElement.videoWidth * scale;
    const newHeight = sourceElement.videoHeight * scale;
    const offsetX = (MODEL_INPUT_SIZE - newWidth) / 2;
    const offsetY = (MODEL_INPUT_SIZE - newHeight) / 2;

    ctx.fillStyle = "#727272";
    ctx.fillRect(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    ctx.drawImage(sourceElement, offsetX, offsetY, newWidth, newHeight);

    const imageData = ctx.getImageData(
      0,
      0,
      MODEL_INPUT_SIZE,
      MODEL_INPUT_SIZE
    );
    const { data } = imageData;
    const floatData = float32DataRef.current;

    for (let i = 0; i < data.length / 4; i++) {
      floatData[i] = data[i * 4] / 255.0;
      floatData[i + MODEL_INPUT_SIZE * MODEL_INPUT_SIZE] =
        data[i * 4 + 1] / 255.0;
      floatData[i + 2 * MODEL_INPUT_SIZE * MODEL_INPUT_SIZE] =
        data[i * 4 + 2] / 255.0;
    }

    return {
      tensor: new ort.Tensor("float32", floatData, [
        1,
        3,
        MODEL_INPUT_SIZE,
        MODEL_INPUT_SIZE,
      ]),
      scale,
      offsetX,
      offsetY,
    };
  }, []);

  // --- 5. POST PROCESSING ---
  const calculateIoU = (box1, box2) => {
    const x1 = Math.max(box1.x1, box2.x1);
    const y1 = Math.max(box1.y1, box2.y1);
    const x2 = Math.min(box1.x2, box2.x2);
    const y2 = Math.min(box1.y2, box2.y2);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const area1 = (box1.x2 - box1.x1) * (box1.y2 - box1.y1);
    const area2 = (box2.x2 - box2.x1) * (box2.y2 - box2.y1);
    return inter / (area1 + area2 - inter);
  };

  const processOutput = useCallback(
    (output, scale, offsetX, offsetY, videoWidth, videoHeight) => {
      const boxes = [];
      const numDetections = 8400;
      const numClasses = 7;
      const data = output.data;

      for (let i = 0; i < numDetections; i++) {
        let maxProb = -Infinity;
        let maxClass = -1;
        const probs = {};

        for (let c = 0; c < numClasses; c++) {
          const prob = data[(4 + c) * numDetections + i];
          probs[FACE_EMOTION_LABELS[c]] = prob;
          if (prob > maxProb) {
            maxProb = prob;
            maxClass = c;
          }
        }

        if (maxProb < CONFIDENCE_THRESHOLD) continue;

        const cx = data[0 * numDetections + i];
        const cy = data[1 * numDetections + i];
        const w = data[2 * numDetections + i];
        const h = data[3 * numDetections + i];

        const x1 = (cx - w / 2 - offsetX) / scale;
        const y1 = (cy - h / 2 - offsetY) / scale;
        const x2 = (cx + w / 2 - offsetX) / scale;
        const y2 = (cy + h / 2 - offsetY) / scale;

        boxes.push({
          bbox: {
            x1: Math.max(0, x1),
            y1: Math.max(0, y1),
            x2: Math.min(videoWidth, x2),
            y2: Math.min(videoHeight, y2),
          },
          prob: maxProb,
          classId: maxClass,
          probs: probs,
        });
      }

      boxes.sort((a, b) => b.prob - a.prob);
      const result = [];
      const active = new Array(boxes.length).fill(true);

      for (let i = 0; i < boxes.length; i++) {
        if (!active[i]) continue;

        const rawProbs = boxes[i].probs;
        const smoothedProbs = {};
        let maxSmoothedProb = 0;
        let finalEmotion = FACE_EMOTION_LABELS[boxes[i].classId];

        const prevProbs = emotionHistoryRef.current[0] || null;

        FACE_EMOTION_LABELS.forEach((label) => {
          const current = rawProbs[label];
          const prev = prevProbs ? prevProbs[label] : current;
          const smoothed =
            EMOTION_SMOOTHING_FACTOR * prev +
            (1 - EMOTION_SMOOTHING_FACTOR) * current;
          smoothedProbs[label] = smoothed;

          if (smoothed > maxSmoothedProb) {
            maxSmoothedProb = smoothed;
            finalEmotion = label;
          }
        });

        emotionHistoryRef.current[0] = smoothedProbs;

        result.push({
          ...boxes[i],
          emotion: finalEmotion,
          confidence: maxSmoothedProb,
          emotionProbs: smoothedProbs,
        });

        for (let j = i + 1; j < boxes.length; j++) {
          if (
            active[j] &&
            calculateIoU(boxes[i].bbox, boxes[j].bbox) > IOU_THRESHOLD
          ) {
            active[j] = false;
          }
        }
      }

      return result;
    },
    []
  );

  // --- 6. ANIMATION LOOP ---
  const tick = useCallback(async () => {
    if (!isActive) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Safety: readyState < 2 berarti video belum ada data frame
    if (!video || !canvas || video.readyState < 2) {
      requestRef.current = requestAnimationFrame(tick);
      return;
    }

    const ctx = canvas.getContext("2d");
    if (
      canvas.width !== video.videoWidth ||
      canvas.height !== video.videoHeight
    ) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    // Draw Video
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();

    // Inference
    const now = performance.now();
    if (
      now - lastInferenceTimeRef.current >= INFERENCE_INTERVAL &&
      !isLoading &&
      sessionRef.current
    ) {
      lastInferenceTimeRef.current = now;

      try {
        const tStart = performance.now();
        const preprocessed = preprocessImage(video);

        if (preprocessed) {
          const { tensor, scale, offsetX, offsetY } = preprocessed;
          const feeds = { images: tensor };
          const outputMap = await sessionRef.current.run(feeds);
          const output = outputMap[sessionRef.current.outputNames[0]];

          const dets = processOutput(
            output,
            scale,
            offsetX,
            offsetY,
            canvas.width,
            canvas.height
          );

          detectionsRef.current = dets;
          setDisplayDetections(dets);
          setInferenceTime(Math.round(performance.now() - tStart));
        }
      } catch (e) {
        console.error("Inference Error:", e);
      }
    }

    // Draw Overlays
    detectionsRef.current.forEach((det) => {
      const { bbox, emotion, confidence } = det;
      const color = FACE_EMOTION_COLORS[emotion];

      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(bbox.x1, bbox.y1, bbox.x2 - bbox.x1, bbox.y2 - bbox.y1, 8);
      ctx.stroke();

      ctx.fillStyle = color;
      const label = `${
        FACE_EMOTION_EMOJIS[emotion]
      } ${emotion.toUpperCase()} ${(confidence * 100).toFixed(0)}%`;
      ctx.font = "bold 16px sans-serif";
      const txtParams = ctx.measureText(label);
      ctx.fillRect(bbox.x1, bbox.y1 - 30, txtParams.width + 20, 30);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, bbox.x1 + 10, bbox.y1 - 10);
    });

    // FPS
    frameCountRef.current++;
    if (now - lastFpsTimeRef.current >= 1000) {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
      lastFpsTimeRef.current = now;
    }

    requestRef.current = requestAnimationFrame(tick);
  }, [isActive, isLoading, preprocessImage, processOutput]);

  // --- 7. TOGGLE HANDLER ---
  const toggle = useCallback(async () => {
    if (isActive) {
      stopCamera();
    } else {
      try {
        await loadModel();
        await startCamera();
        setIsActive(true); // Mulai Loop
      } catch (err) {
        console.error("Initialization Failed:", err);
      }
    }
  }, [isActive, loadModel, startCamera, stopCamera]);

  // --- 8. EFFECTS (DIPISAH SUPAYA TIDAK MEMATIKAN KAMERA) ---

  // Effect A: Handle Animation Loop (Hanya cancel animasi, JANGAN matikan tracks)
  useEffect(() => {
    if (isActive) {
      requestRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
    };
  }, [isActive, tick]);

  // Effect B: Handle Unmount (Hanya jalan saat component dihancurkan/navigasi)
  useEffect(() => {
    return () => {
      stopTracks(); // Matikan kamera hanya jika user menutup halaman
    };
  }, [stopTracks]);

  // --- RENDER ---
  const primaryDetection = displayDetections[0];
  const primaryEmotion = primaryDetection?.emotion;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl transition-all duration-300 ${
        isFullscreen ? "fixed inset-0 z-50 rounded-none" : className
      }`}
    >
      {/* Header UI */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/80 to-transparent flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div
            className={`p-3 rounded-xl backdrop-blur-md transition-colors duration-500 ${
              primaryEmotion ? "" : "bg-slate-800/50"
            }`}
            style={{
              backgroundColor: primaryEmotion
                ? `${FACE_EMOTION_COLORS[primaryEmotion]}40`
                : "",
            }}
          >
            <span className="text-2xl">
              {primaryEmotion ? FACE_EMOTION_EMOJIS[primaryEmotion] : "📷"}
            </span>
          </div>
          <div>
            <h3 className="text-white font-bold tracking-tight">
              AI Emotion Engine
            </h3>
            <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3" /> {inferenceTime}ms
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" /> {displayDetections.length}
              </span>
              <span className="flex items-center gap-1">FPS: {fps}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 rounded-lg bg-black/40 hover:bg-black/60 text-white transition"
          >
            {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
          <button
            onClick={toggle}
            disabled={isLoading}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg font-semibold transition-all shadow-lg ${
              isActive
                ? "bg-red-500 hover:bg-red-600 text-white shadow-red-500/20"
                : "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20"
            } ${isLoading && "opacity-50 cursor-wait"}`}
          >
            {isLoading ? (
              <RefreshCw className="animate-spin" size={18} />
            ) : isActive ? (
              <CameraOff size={18} />
            ) : (
              <Camera size={18} />
            )}
            {isActive ? "STOP" : "START"}
          </button>
        </div>
      </div>

      {/* Main Viewport */}
      <div className="relative w-full h-full min-h-[500px] bg-black flex items-center justify-center">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover opacity-0 -z-10"
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          className="w-full h-full object-contain block"
        />

        {/* Status Overlays */}
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-20">
            <RefreshCw
              size={48}
              className="animate-spin text-emerald-500 mb-4"
            />
            <p className="text-white font-medium">Loading AI Model...</p>
          </div>
        )}

        {!isActive && !isLoading && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 bg-slate-900/90 backdrop-blur-sm">
            <div className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center mb-6 animate-pulse">
              <Camera size={48} className="opacity-50" />
            </div>
            <p className="text-xl font-medium text-slate-300">
              Ready to Initialize
            </p>
            <p className="text-sm mt-2">Uses WebGL & Temporal Smoothing</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 text-red-400 z-30 p-6 text-center">
            <AlertCircle size={48} className="mb-4" />
            <p className="text-lg font-bold mb-2">System Error</p>
            <p className="text-sm opacity-80">{error}</p>
            <button
              onClick={() => setError(null)}
              className="mt-6 px-4 py-2 bg-white/10 rounded hover:bg-white/20"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Probability Bars */}
      {isActive && primaryDetection && (
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 via-black/60 to-transparent">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {Object.entries(primaryDetection.emotionProbs).map(
              ([emotion, prob]) => (
                <div
                  key={emotion}
                  className="bg-white/5 rounded-lg p-2 backdrop-blur-sm border border-white/5"
                >
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300 capitalize">{emotion}</span>
                    <span
                      className="font-mono"
                      style={{ color: FACE_EMOTION_COLORS[emotion] }}
                    >
                      {(prob * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all duration-300 ease-out"
                      style={{
                        width: `${prob * 100}%`,
                        backgroundColor: FACE_EMOTION_COLORS[emotion],
                      }}
                    />
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
