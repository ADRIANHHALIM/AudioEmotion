/**
 * Audio Processor - AudioWorklet for capturing microphone input
 *
 * This processor runs on Thread B (Audio Thread) and writes samples
 * to a SharedArrayBuffer ring buffer that the inference worker reads from.
 *
 * Features:
 * - Captures audio at native sample rate
 * - Resamples to 16kHz for wav2vec2
 * - Writes to lock-free ring buffer using Atomics
 * - Calculates RMS for visualization
 */

const RING_BUFFER_HEADER_SIZE = 3; // writePtr, readPtr, capacity

class AudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    this.isInitialized = false;
    this.sharedBuffer = null;
    this.controlBuffer = null;
    this.dataBuffer = null;
    this.capacity = 0;

    // Resampling state
    this.inputSampleRate = sampleRate; // Global from AudioWorklet
    this.targetSampleRate = 16000; // wav2vec2 requirement
    this.resampleRatio = this.inputSampleRate / this.targetSampleRate;
    this.resampleBuffer = [];
    this.downmixBuffer = null;

    // Handle messages from main thread
    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    // Notify that processor is ready
    this.port.postMessage({ type: "ready" });
  }

  handleMessage(data) {
    switch (data.type) {
      case "init":
        this.initializeBuffer(data.sharedBuffer, data.capacity);
        break;
      case "reset":
        this.resetBuffer();
        break;
      case "stop":
        this.isInitialized = false;
        break;
    }
  }

  initializeBuffer(sharedBuffer, capacity) {
    try {
      this.sharedBuffer = sharedBuffer;
      this.capacity = capacity;

      // Control buffer for atomic operations
      this.controlBuffer = new Int32Array(
        sharedBuffer,
        0,
        RING_BUFFER_HEADER_SIZE
      );

      // Data buffer for audio samples
      const dataOffset = RING_BUFFER_HEADER_SIZE * Int32Array.BYTES_PER_ELEMENT;
      this.dataBuffer = new Float32Array(sharedBuffer, dataOffset, capacity);

      this.isInitialized = true;
      this.port.postMessage({ type: "initialized" });
    } catch (error) {
      this.port.postMessage({ type: "error", error: error.message });
    }
  }

  resetBuffer() {
    if (this.controlBuffer) {
      Atomics.store(this.controlBuffer, 0, 0); // writePtr
      Atomics.store(this.controlBuffer, 1, 0); // readPtr
    }
    this.resampleBuffer = [];
  }

  /**
   * Write samples to the ring buffer
   * @param {Float32Array} samples - Resampled audio samples
   * @returns {number} - Number of samples written
   */
  writeToBuffer(samples) {
    if (!this.isInitialized || !this.controlBuffer || !this.dataBuffer) {
      return 0;
    }

    const writePtr = Atomics.load(this.controlBuffer, 0);
    const readPtr = Atomics.load(this.controlBuffer, 1);

    // Calculate available space
    const available =
      readPtr <= writePtr
        ? this.capacity - writePtr + readPtr - 1
        : readPtr - writePtr - 1;

    const toWrite = Math.min(samples.length, available);

    if (toWrite === 0) return 0;

    let writeIndex = writePtr;

    for (let i = 0; i < toWrite; i++) {
      this.dataBuffer[writeIndex] = samples[i];
      writeIndex = (writeIndex + 1) % this.capacity;
    }

    // Update write pointer atomically
    Atomics.store(this.controlBuffer, 0, writeIndex);

    return toWrite;
  }

  /**
   * Resample audio using linear interpolation
   * Accumulates samples until we have enough for the target rate
   */
  resample(inputSamples) {
    // Accumulate input samples
    for (let i = 0; i < inputSamples.length; i++) {
      this.resampleBuffer.push(inputSamples[i]);
    }

    const ratio = this.resampleRatio;
    if (this.resampleBuffer.length < ratio) {
      return new Float32Array(0);
    }

    const outputSamples = Math.floor(this.resampleBuffer.length / ratio);
    const output = new Float32Array(outputSamples);

    let phase = 0;
    for (let i = 0; i < outputSamples; i++) {
      const srcIndex = phase;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(
        srcIndexFloor + 1,
        this.resampleBuffer.length - 1
      );
      const t = srcIndex - srcIndexFloor;

      output[i] =
        this.resampleBuffer[srcIndexFloor] * (1 - t) +
        this.resampleBuffer[srcIndexCeil] * t;
      phase += ratio;
    }

    const consumed = Math.floor(outputSamples * ratio);
    this.resampleBuffer = this.resampleBuffer.slice(consumed);

    return output;
  }

  /**
   * Downmix any number of channels to mono without extra allocations
   * @param {Float32Array[]} channelData
   * @returns {Float32Array}
   */
  downmixChannels(channelData) {
    const channelCount = channelData.length;
    if (channelCount === 1) {
      return channelData[0];
    }

    const frameCount = channelData[0].length;

    if (!this.downmixBuffer || this.downmixBuffer.length !== frameCount) {
      this.downmixBuffer = new Float32Array(frameCount);
    }

    const output = this.downmixBuffer;
    for (let i = 0; i < frameCount; i++) {
      let sum = 0;
      for (let c = 0; c < channelCount; c++) {
        const channel = channelData[c];
        sum += channel ? channel[i] || 0 : 0;
      }
      output[i] = sum / channelCount;
    }

    return output;
  }

  copyForTransfer(samples) {
    const buffer = new Float32Array(samples.length);
    buffer.set(samples);
    return buffer;
  }

  /**
   * Calculate RMS of samples for visualization
   */
  calculateRMS(samples) {
    if (samples.length === 0) return 0;

    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      sumSquares += samples[i] * samples[i];
    }

    return Math.sqrt(sumSquares / samples.length);
  }

  /**
   * Main audio processing callback
   * Called for each audio block (typically 128 samples)
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];

    // Check if we have audio input
    if (!input || !input.length || !input[0] || !input[0].length) {
      return true; // Keep processor alive
    }

    const monoChannel = this.downmixChannels(input);

    // Calculate RMS for visualization (before resampling)
    const rms = this.calculateRMS(monoChannel);

    // Send RMS to main thread for visualization
    this.port.postMessage({
      type: "rms",
      rms: rms,
      timestamp: currentTime,
    });

    // Resample to 16kHz if needed
    let samples;
    if (this.inputSampleRate !== this.targetSampleRate) {
      samples = this.resample(monoChannel);
    } else {
      samples = monoChannel;
    }

    // Send samples to main thread for inference
    if (samples.length > 0) {
      // Convert to regular array for transfer
      const messageBuffer = this.copyForTransfer(samples);
      this.port.postMessage(
        {
          type: "samples",
          samples: messageBuffer,
        },
        [messageBuffer.buffer]
      );
    }

    // Write to shared buffer if initialized
    if (this.isInitialized && samples.length > 0) {
      const written = this.writeToBuffer(samples);

      // Notify if buffer is getting full or data was dropped
      if (written < samples.length) {
        this.port.postMessage({
          type: "bufferOverflow",
          dropped: samples.length - written,
        });
      }
    }

    return true; // Keep processor alive
  }
}

registerProcessor("audio-processor", AudioProcessor);
