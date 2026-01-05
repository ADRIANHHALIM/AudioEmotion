/**
 * Audio Store - Zustand store for audio pipeline state
 * Handles high-frequency updates from AudioWorklet
 */

import { create } from "zustand";
import { createRingBuffer, AUDIO_CONSTANTS } from "../utils/RingBuffer";

let fileProgressRafId = null;

const stopProgressLoop = () => {
  if (fileProgressRafId) {
    cancelAnimationFrame(fileProgressRafId);
    fileProgressRafId = null;
  }
};

const startProgressLoop = (get, set) => {
  stopProgressLoop();
  const loop = () => {
    const state = get();
    if (!state.isFilePlaying || !state.audioContext) {
      fileProgressRafId = null;
      return;
    }
    const currentTime = state.audioContext.currentTime;
    const elapsed = Math.max(0, currentTime - state.filePlaybackStartTime);
    const position = Math.min(state.fileDuration, elapsed);
    set({ filePlaybackPosition: position });
    fileProgressRafId = requestAnimationFrame(loop);
  };
  fileProgressRafId = requestAnimationFrame(loop);
};

const createWorkletNode = async (audioContext, get, set) => {
  await audioContext.audioWorklet.addModule("/audio-processor.js");
  const workletNode = new AudioWorkletNode(audioContext, "audio-processor", {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 1,
  });

  workletNode.port.onmessage = (event) => {
    const { type, ...data } = event.data;
    switch (type) {
      case "ready": {
        const state = get();
        workletNode.port.postMessage({
          type: "init",
          sharedBuffer: state.sharedBuffer,
          capacity: AUDIO_CONSTANTS.RING_BUFFER_CAPACITY,
        });
        break;
      }
      case "initialized":
        set({ isProcessorReady: true });
        break;
      case "rms": {
        const newRms = data.rms;
        const volume = Math.min(1, newRms * 10);
        set((state) => ({
          rms: newRms,
          volume,
          rmsHistory: [...state.rmsHistory.slice(-127), newRms],
        }));
        break;
      }
      case "samples":
        if (data.samples && data.samples.length > 0) {
          import("./emotionStore").then(({ useEmotionStore }) => {
            useEmotionStore.getState().addAudioSamples(data.samples);
          });
        }
        break;
      case "bufferOverflow":
        console.warn(`Buffer overflow: ${data.dropped} samples dropped`);
        break;
      case "error":
        set({ error: data.error });
        break;
      default:
        break;
    }
  };

  return workletNode;
};

// Initial state
const initialState = {
  // Audio context state
  isInitialized: false,
  isRecording: false,
  isProcessorReady: false,
  inputMode: "mic",

  // Audio devices
  audioDevices: [],
  selectedDeviceId: null,

  // Visualization data
  rms: 0,
  rmsHistory: [], // Last N RMS values for waveform
  volume: 0, // Normalized 0-1

  // Shared buffer
  sharedBuffer: null,

  // Audio context references (not persisted)
  audioContext: null,
  workletNode: null,
  mediaStream: null,
  fileSourceNode: null,
  fileBuffer: null,
  fileDuration: 0,
  filePlaybackPosition: 0,
  filePlaybackStartTime: 0,
  filePauseOffset: 0,
  uploadedFileName: null,
  isFilePlaying: false,

  // Error state
  error: null,
};

export const useAudioStore = create((set, get) => ({
  ...initialState,

  // Initialize audio context and devices
  initialize: async () => {
    try {
      // Check for required APIs
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("MediaDevices API not supported");
      }

      if (typeof SharedArrayBuffer === "undefined") {
        throw new Error(
          "SharedArrayBuffer not available. Check COOP/COEP headers."
        );
      }

      // Get audio devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === "audioinput");

      // Create shared buffer for audio data
      const sharedBuffer = createRingBuffer(
        AUDIO_CONSTANTS.RING_BUFFER_CAPACITY
      );

      set({
        audioDevices: audioInputs,
        selectedDeviceId: audioInputs[0]?.deviceId || null,
        sharedBuffer,
        isInitialized: true,
        error: null,
      });

      return true;
    } catch (error) {
      set({ error: error.message, isInitialized: false });
      return false;
    }
  },

  // Select audio input device
  setSelectedDevice: (deviceId) => {
    set({ selectedDeviceId: deviceId });
  },

  // Start audio capture
  startRecording: async () => {
    const state = get();

    if (!state.isInitialized || state.isRecording) {
      return false;
    }

    try {
      // Stop any file playback before starting mic mode
      if (
        state.inputMode === "file" ||
        state.fileBuffer ||
        state.isFilePlaying
      ) {
        await get().stopFilePlayback({
          clearBuffer: true,
          releaseContext: true,
        });
      }

      // Create audio context
      const audioContext = new AudioContext({
        sampleRate: 48000, // Will be resampled to 16kHz in worklet
      });

      const workletNode = await createWorkletNode(audioContext, get, set);

      // Get microphone stream
      const constraints = {
        audio: {
          deviceId: state.selectedDeviceId
            ? { exact: state.selectedDeviceId }
            : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(
        constraints
      );

      // Connect stream to worklet
      const sourceNode = audioContext.createMediaStreamSource(mediaStream);
      sourceNode.connect(workletNode);

      set({
        audioContext,
        workletNode,
        mediaStream,
        isRecording: true,
        inputMode: "mic",
        uploadedFileName: null,
        error: null,
      });

      return true;
    } catch (error) {
      set({ error: error.message });
      return false;
    }
  },

  // Stop audio capture
  stopRecording: () => {
    const state = get();

    // Stop media stream tracks
    if (state.mediaStream) {
      state.mediaStream.getTracks().forEach((track) => track.stop());
    }

    // Reset worklet
    if (state.workletNode) {
      state.workletNode.port.postMessage({ type: "reset" });
      state.workletNode.disconnect();
    }

    // Close audio context
    if (state.audioContext) {
      state.audioContext.close();
    }

    set({
      audioContext: null,
      workletNode: null,
      mediaStream: null,
      isRecording: false,
      isProcessorReady: false,
      rms: 0,
      rmsHistory: [],
      volume: 0,
      inputMode: "mic",
    });
  },

  // Start playback for uploaded audio
  startFilePlayback: async (audioBuffer, fileName = "Uploaded audio") => {
    const state = get();

    if (!audioBuffer) {
      set({ error: "Invalid audio buffer" });
      return false;
    }

    // Auto-initialize if not already done
    if (!state.sharedBuffer) {
      console.log("[AudioStore] Auto-initializing for file playback...");

      if (typeof SharedArrayBuffer === "undefined") {
        set({
          error: "SharedArrayBuffer not available. Check COOP/COEP headers.",
        });
        return false;
      }

      const sharedBuffer = createRingBuffer(
        AUDIO_CONSTANTS.RING_BUFFER_CAPACITY
      );
      set({ sharedBuffer, isInitialized: true });
    }

    try {
      // Stop mic capture if active
      if (state.isRecording) {
        get().stopRecording();
      }

      await get().stopFilePlayback({
        clearBuffer: true,
        releaseContext: true,
      });

      const audioContext = new AudioContext({
        sampleRate: audioBuffer.sampleRate || 16000,
      });
      const workletNode = await createWorkletNode(audioContext, get, set);

      set({
        audioContext,
        workletNode,
        fileBuffer: audioBuffer,
        fileDuration: audioBuffer.duration,
        filePlaybackPosition: 0,
        filePlaybackStartTime: 0,
        filePauseOffset: 0,
        uploadedFileName: fileName,
        inputMode: "file",
        isFilePlaying: false,
        isRecording: false,
        error: null,
      });

      await get().playBufferFromOffset(0);
      return true;
    } catch (error) {
      console.error("[AudioStore] Failed to start file playback:", error);
      set({ error: error.message });
      return false;
    }
  },

  // Play from a specific offset (in seconds)
  playBufferFromOffset: async (offsetSeconds = 0) => {
    const state = get();

    if (!state.audioContext || !state.workletNode || !state.fileBuffer) {
      return false;
    }

    const clampedOffset = Math.min(
      Math.max(offsetSeconds, 0),
      state.fileDuration
    );

    if (clampedOffset >= state.fileDuration) {
      set({
        isFilePlaying: false,
        filePlaybackPosition: state.fileDuration,
        filePauseOffset: state.fileDuration,
      });
      return false;
    }

    if (state.fileSourceNode) {
      state.fileSourceNode.onended = null;
      try {
        state.fileSourceNode.stop();
      } catch (error) {
        // Ignore
      }
      try {
        state.fileSourceNode.disconnect();
      } catch (error) {
        // Ignore
      }
    }

    const sourceNode = state.audioContext.createBufferSource();
    sourceNode.buffer = state.fileBuffer;
    sourceNode.connect(state.workletNode);
    sourceNode.connect(state.audioContext.destination);

    sourceNode.onended = () => {
      stopProgressLoop();
      set((current) => {
        const finalPosition = current.fileDuration;
        return {
          fileSourceNode: null,
          isFilePlaying: false,
          filePauseOffset: finalPosition,
          filePlaybackPosition: finalPosition,
        };
      });
    };

    await state.audioContext.resume();
    sourceNode.start(0, clampedOffset);

    set({
      fileSourceNode: sourceNode,
      isFilePlaying: true,
      filePlaybackStartTime: state.audioContext.currentTime - clampedOffset,
      filePauseOffset: clampedOffset,
      filePlaybackPosition: clampedOffset,
    });
    startProgressLoop(get, set);
    return true;
  },

  pauseFilePlayback: () => {
    const state = get();

    if (!state.isFilePlaying || !state.fileSourceNode || !state.audioContext) {
      return;
    }

    const elapsed = Math.max(
      0,
      state.audioContext.currentTime - state.filePlaybackStartTime
    );
    const newOffset = Math.min(state.fileDuration, elapsed);

    const sourceNode = state.fileSourceNode;
    sourceNode.onended = null;
    try {
      sourceNode.stop();
    } catch (error) {
      // Ignore
    }
    try {
      sourceNode.disconnect();
    } catch (error) {
      // Ignore
    }

    stopProgressLoop();
    set({
      fileSourceNode: null,
      isFilePlaying: false,
      filePauseOffset: newOffset,
      filePlaybackPosition: newOffset,
    });
  },

  resumeFilePlayback: async () => {
    const state = get();
    if (!state.fileBuffer) {
      return false;
    }
    return get().playBufferFromOffset(state.filePauseOffset || 0);
  },

  seekFilePlayback: async (positionSeconds) => {
    const state = get();
    if (!state.fileBuffer || typeof positionSeconds !== "number") {
      return;
    }

    const clamped = Math.min(Math.max(positionSeconds, 0), state.fileDuration);
    const wasPlaying = state.isFilePlaying;

    if (wasPlaying) {
      get().pauseFilePlayback();
    }

    set({
      filePauseOffset: clamped,
      filePlaybackPosition: clamped,
    });

    if (wasPlaying) {
      await get().playBufferFromOffset(clamped);
    }
  },

  stopFilePlayback: async (options = {}) => {
    const state = get();
    const { clearBuffer = false, releaseContext = false } = options;

    if (
      !state.fileBuffer &&
      !state.fileSourceNode &&
      state.inputMode !== "file"
    ) {
      return;
    }

    if (state.fileSourceNode) {
      state.fileSourceNode.onended = null;
      try {
        state.fileSourceNode.stop();
      } catch (error) {
        // Ignore
      }
      try {
        state.fileSourceNode.disconnect();
      } catch (error) {
        // Ignore
      }
    }

    stopProgressLoop();

    const update = {
      fileSourceNode: null,
      isFilePlaying: false,
      filePlaybackStartTime: 0,
      filePlaybackPosition: 0,
      filePauseOffset: 0,
    };

    if (clearBuffer) {
      update.fileBuffer = null;
      update.fileDuration = 0;
      update.uploadedFileName = null;
      update.inputMode = "mic";
    }

    set(update);

    if (releaseContext && state.audioContext) {
      try {
        await state.audioContext.close();
      } catch (error) {
        // Ignore
      }

      set({
        audioContext: null,
        workletNode: null,
        isProcessorReady: false,
      });
    }
  },

  // Reset error
  clearError: () => {
    set({ error: null });
  },

  setError: (error) => {
    set({ error });
  },

  // Full reset
  reset: async () => {
    await get().stopFilePlayback({
      clearBuffer: true,
      releaseContext: true,
    });
    get().stopRecording();
    set(initialState);
  },
}));
