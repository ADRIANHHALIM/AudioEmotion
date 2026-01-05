/**
 * Audio Utility Functions
 */

/**
 * Resample audio from one sample rate to another using linear interpolation
 * @param {Float32Array} inputBuffer - Input audio samples
 * @param {number} inputSampleRate - Original sample rate
 * @param {number} outputSampleRate - Target sample rate
 * @returns {Float32Array} - Resampled audio
 */
export function resampleAudio(inputBuffer, inputSampleRate, outputSampleRate) {
  if (
    inputBuffer.length === 0 ||
    inputSampleRate === outputSampleRate ||
    !isFinite(inputSampleRate) ||
    !isFinite(outputSampleRate)
  ) {
    return inputBuffer.slice();
  }

  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.max(1, Math.round(inputBuffer.length / ratio));
  const output = new Float32Array(outputLength);

  let phase = 0;
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = phase;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, inputBuffer.length - 1);
    const t = srcIndex - srcIndexFloor;

    output[i] =
      inputBuffer[srcIndexFloor] * (1 - t) + inputBuffer[srcIndexCeil] * t;
    phase += ratio;
  }

  return output;
}

/**
 * Normalize audio to [-1, 1] range
 * @param {Float32Array} samples - Audio samples
 * @returns {Float32Array} - Normalized samples
 */
export function normalizeAudio(samples) {
  const normalized = new Float32Array(samples.length);
  let maxAbs = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = Math.abs(samples[i]);
    if (value > maxAbs) {
      maxAbs = value;
    }
  }

  if (maxAbs === 0) {
    normalized.set(samples);
    return normalized;
  }

  const inv = 1 / maxAbs;
  for (let i = 0; i < samples.length; i++) {
    normalized[i] = samples[i] * inv;
  }

  return normalized;
}

/**
 * Calculate RMS (Root Mean Square) of audio samples
 * @param {Float32Array} samples - Audio samples
 * @returns {number} - RMS value
 */
export function calculateRMS(samples) {
  return calculateRMSInRange(samples, 0, samples.length);
}

export function calculateRMSInRange(samples, start, end) {
  const clampedStart = Math.max(0, start);
  const clampedEnd = Math.min(samples.length, end);
  const length = clampedEnd - clampedStart;

  if (length <= 0) {
    return 0;
  }

  let sumSquares = 0;
  for (let i = clampedStart; i < clampedEnd; i++) {
    const value = samples[i];
    sumSquares += value * value;
  }

  return Math.sqrt(sumSquares / length);
}

/**
 * Downmix multi-channel audio to mono in-place (returns provided buffer when available)
 * @param {Float32Array[]} channelData - Array of per-channel Float32Arrays from AudioWorklet
 * @param {Float32Array} [target] - Optional buffer to reuse
 * @returns {Float32Array}
 */
export function downmixToMono(channelData, target) {
  if (!channelData || channelData.length === 0) {
    return target ? target.fill(0) : new Float32Array(0);
  }

  const channelCount = channelData.length;
  const sourceLength = channelData[0].length;
  const output =
    target && target.length === sourceLength
      ? target
      : new Float32Array(sourceLength);

  if (channelCount === 1) {
    output.set(channelData[0]);
    return output;
  }

  for (let i = 0; i < sourceLength; i++) {
    let sum = 0;
    for (let ch = 0; ch < channelCount; ch++) {
      sum += channelData[ch][i] || 0;
    }
    output[i] = sum / channelCount;
  }

  return output;
}

export function standardizeAudio(samples) {
  if (samples.length === 0) {
    return new Float32Array(0);
  }

  let mean = 0;
  for (let i = 0; i < samples.length; i++) {
    mean += samples[i];
  }
  mean /= samples.length;

  let variance = 0;
  for (let i = 0; i < samples.length; i++) {
    const centered = samples[i] - mean;
    variance += centered * centered;
  }
  variance /= samples.length;

  const denom = Math.sqrt(variance + 1e-7);
  const output = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    output[i] = (samples[i] - mean) / denom;
  }
  return output;
}

/**
 * Convert RMS to decibels
 * @param {number} rms - RMS value
 * @returns {number} - Decibel value
 */
export function rmsToDb(rms) {
  if (rms === 0) return -Infinity;
  return 20 * Math.log10(rms);
}

/**
 * Apply a Hanning window to audio samples
 * @param {Float32Array} samples - Audio samples
 * @returns {Float32Array} - Windowed samples
 */
export function applyHanningWindow(samples) {
  const windowed = new Float32Array(samples.length);
  const N = samples.length;

  for (let i = 0; i < N; i++) {
    const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
    windowed[i] = samples[i] * window;
  }

  return windowed;
}

/**
 * Compute simple FFT magnitude spectrum for visualization
 * @param {Float32Array} samples - Audio samples (length should be power of 2)
 * @returns {Float32Array} - Magnitude spectrum
 */
export function computeSpectrum(samples) {
  const N = samples.length;
  const magnitudes = new Float32Array(N / 2);

  // Simple DFT for visualization (not optimized, use for small N)
  for (let k = 0; k < N / 2; k++) {
    let real = 0;
    let imag = 0;

    for (let n = 0; n < N; n++) {
      const angle = (2 * Math.PI * k * n) / N;
      real += samples[n] * Math.cos(angle);
      imag -= samples[n] * Math.sin(angle);
    }

    magnitudes[k] = Math.sqrt(real * real + imag * imag) / N;
  }

  return magnitudes;
}

/**
 * Check if SharedArrayBuffer is available
 * @returns {boolean}
 */
export function isSharedArrayBufferAvailable() {
  try {
    new SharedArrayBuffer(1);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Check if AudioWorklet is supported
 * @returns {boolean}
 */
export function isAudioWorkletSupported() {
  return typeof AudioWorkletNode !== "undefined";
}

/**
 * Check browser compatibility for all required features
 * @returns {{ supported: boolean, missing: string[] }}
 */
export function checkBrowserCompatibility() {
  const missing = [];

  if (!isSharedArrayBufferAvailable()) {
    missing.push("SharedArrayBuffer (check COOP/COEP headers)");
  }

  if (!isAudioWorkletSupported()) {
    missing.push("AudioWorklet");
  }

  if (typeof Worker === "undefined") {
    missing.push("Web Workers");
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    missing.push("MediaDevices API");
  }

  if (typeof WebAssembly === "undefined") {
    missing.push("WebAssembly");
  }

  return {
    supported: missing.length === 0,
    missing,
  };
}
