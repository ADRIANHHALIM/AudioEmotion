/**
 * Settings Page
 * Audio input selection and app configuration
 */

import { useEffect, useState } from "react";
import {
  Mic,
  RefreshCw,
  Check,
  AlertCircle,
  Sliders,
  Volume2,
  Cpu,
  Database,
} from "lucide-react";
import { useAudioStore } from "../stores/audioStore";
import { useEmotionStore } from "../stores/emotionStore";
import { checkBrowserCompatibility } from "../utils/audio";

export default function Settings() {
  const { audioDevices, selectedDeviceId, setSelectedDevice, isRecording } =
    useAudioStore();

  const { modelPath, setModelPath, isModelLoaded } = useEmotionStore();

  const [compatibility, setCompatibility] = useState({
    supported: true,
    missing: [],
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Check compatibility
  useEffect(() => {
    setCompatibility(checkBrowserCompatibility());
  }, []);

  // Refresh audio devices
  const refreshDevices = async () => {
    setIsRefreshing(true);
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === "audioinput");
      // Update would happen through store, simplified here
    } catch (error) {
      console.error("Failed to refresh devices:", error);
    }
    setTimeout(() => setIsRefreshing(false), 500);
  };

  return (
    <div className="min-h-screen p-8">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 mt-1">
          Configure audio input and application preferences
        </p>
      </header>

      <div className="max-w-2xl space-y-6">
        {/* Audio Input Settings */}
        <section className="glass-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-xl bg-indigo-500/20">
              <Mic className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Audio Input</h2>
              <p className="text-sm text-gray-400">Select your microphone</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Device selector */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-300">
                  Input Device
                </label>
                <button
                  onClick={refreshDevices}
                  disabled={isRecording}
                  className="btn-ghost text-xs flex items-center gap-1"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`}
                  />
                  Refresh
                </button>
              </div>

              <select
                value={selectedDeviceId || ""}
                onChange={(e) => setSelectedDevice(e.target.value)}
                disabled={isRecording}
                className="input-field"
              >
                {audioDevices.length === 0 ? (
                  <option value="">No devices found</option>
                ) : (
                  audioDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label ||
                        `Microphone ${device.deviceId.slice(0, 8)}`}
                    </option>
                  ))
                )}
              </select>

              {isRecording && (
                <p className="text-xs text-yellow-400 mt-2">
                  Stop recording to change audio device
                </p>
              )}
            </div>

            {/* Audio settings info */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
              <InfoItem label="Sample Rate" value="16 kHz" />
              <InfoItem label="Channels" value="Mono" />
              <InfoItem label="Buffer Size" value="2048 samples" />
              <InfoItem label="Latency" value="~100ms" />
            </div>
          </div>
        </section>

        {/* AI Model Settings */}
        <section className="glass-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-xl bg-purple-500/20">
              <Cpu className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">AI Model</h2>
              <p className="text-sm text-gray-400">
                Emotion recognition model settings
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
              <div>
                <p className="text-sm font-medium text-white">Model Status</p>
                <p className="text-xs text-gray-400">
                  wav2vec2-emotion (quantized)
                </p>
              </div>
              <div
                className={`flex items-center gap-2 ${
                  isModelLoaded ? "text-green-400" : "text-yellow-400"
                }`}
              >
                {isModelLoaded ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span className="text-sm">Loaded</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm">Loading...</span>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <InfoItem label="Runtime" value="ONNX Web (WASM)" />
              <InfoItem label="Inference Window" value="2 seconds" />
              <InfoItem label="Hop Size" value="500ms" />
              <InfoItem label="Emotions" value="8 classes" />
            </div>
          </div>
        </section>

        {/* Browser Compatibility */}
        <section className="glass-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-xl bg-green-500/20">
              <Sliders className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Browser Compatibility
              </h2>
              <p className="text-sm text-gray-400">Required features status</p>
            </div>
          </div>

          <div className="space-y-3">
            <FeatureItem
              name="SharedArrayBuffer"
              supported={
                compatibility.supported &&
                !compatibility.missing.includes("SharedArrayBuffer")
              }
              description="Required for audio buffer sharing"
            />
            <FeatureItem
              name="AudioWorklet"
              supported={typeof AudioWorkletNode !== "undefined"}
              description="Required for audio processing"
            />
            <FeatureItem
              name="Web Workers"
              supported={typeof Worker !== "undefined"}
              description="Required for AI inference"
            />
            <FeatureItem
              name="WebAssembly"
              supported={typeof WebAssembly !== "undefined"}
              description="Required for ONNX runtime"
            />
            <FeatureItem
              name="MediaDevices API"
              supported={!!navigator.mediaDevices?.getUserMedia}
              description="Required for microphone access"
            />
          </div>

          {!compatibility.supported && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              <p className="text-sm text-red-400">
                Some required features are not available. Make sure you're using
                a modern browser and the app is served with proper COOP/COEP
                headers.
              </p>
            </div>
          )}
        </section>

        {/* Storage Info */}
        <section className="glass-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-xl bg-blue-500/20">
              <Database className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Data Storage</h2>
              <p className="text-sm text-gray-400">
                Session data and recordings
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <InfoItem label="Provider" value="Supabase" />
            <InfoItem label="Auth" value="Email/Password" />
            <InfoItem label="Storage" value="Row Level Security (RLS)" />
          </div>

          <p className="text-xs text-gray-500 mt-4">
            All data is stored securely and only accessible by you.
          </p>
        </section>
      </div>
    </div>
  );
}

function InfoItem({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-sm font-medium text-white">{value}</span>
    </div>
  );
}

function FeatureItem({ name, supported, description }) {
  return (
    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
      <div>
        <p className="text-sm font-medium text-white">{name}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <div
        className={`flex items-center gap-1 ${
          supported ? "text-green-400" : "text-red-400"
        }`}
      >
        {supported ? (
          <Check className="w-4 h-4" />
        ) : (
          <AlertCircle className="w-4 h-4" />
        )}
      </div>
    </div>
  );
}
