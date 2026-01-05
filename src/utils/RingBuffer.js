/**
 * RingBuffer - Lock-free Circular Buffer using SharedArrayBuffer & Atomics
 *
 * This implements a SPSC (Single Producer, Single Consumer) ring buffer
 * for transferring audio data between the AudioWorklet (producer) and
 * the Inference Worker (consumer) without blocking.
 *
 * Memory Layout:
 * [0]: Write pointer (producer updates)
 * [1]: Read pointer (consumer updates)
 * [2]: Buffer capacity
 * [3...N]: Audio sample data
 */

export const RING_BUFFER_HEADER_SIZE = 3; // writePtr, readPtr, capacity

export class RingBufferWriter {
  /**
   * @param {SharedArrayBuffer} sharedBuffer - The shared memory buffer
   * @param {number} capacity - Number of float samples the buffer can hold
   */
  constructor(sharedBuffer, capacity) {
    this.sharedBuffer = sharedBuffer;
    this.capacity = capacity;

    // Control indices (Int32 for Atomics compatibility)
    this.controlBuffer = new Int32Array(
      sharedBuffer,
      0,
      RING_BUFFER_HEADER_SIZE
    );

    // Data buffer starts after header
    const dataOffset = RING_BUFFER_HEADER_SIZE * Int32Array.BYTES_PER_ELEMENT;
    this.dataBuffer = new Float32Array(sharedBuffer, dataOffset, capacity);

    // Initialize capacity in shared memory
    Atomics.store(this.controlBuffer, 2, capacity);
  }

  /**
   * Write audio samples to the ring buffer
   * @param {Float32Array} samples - Audio samples to write
   * @returns {number} - Number of samples actually written
   */
  write(samples) {
    const writePtr = Atomics.load(this.controlBuffer, 0);
    const readPtr = Atomics.load(this.controlBuffer, 1);

    const available = this.availableWrite(writePtr, readPtr);

    const toWrite = Math.min(samples.length, available);

    if (toWrite === 0) {
      return 0;
    }

    let writeIndex = writePtr;

    for (let i = 0; i < toWrite; i++) {
      this.dataBuffer[writeIndex] = samples[i];
      writeIndex = (writeIndex + 1) % this.capacity;
    }

    // Update write pointer atomically
    Atomics.store(this.controlBuffer, 0, writeIndex);

    return toWrite;
  }

  availableRead() {
    const writePtr = Atomics.load(this.controlBuffer, 0);
    const readPtr = Atomics.load(this.controlBuffer, 1);

    return writePtr >= readPtr
      ? writePtr - readPtr
      : this.capacity - readPtr + writePtr;
  }

  availableWrite(
    writePtr = Atomics.load(this.controlBuffer, 0),
    readPtr = Atomics.load(this.controlBuffer, 1)
  ) {
    // Leave one slot empty to differentiate full vs empty states
    return readPtr <= writePtr
      ? this.capacity - writePtr + readPtr - 1
      : readPtr - writePtr - 1;
  }

  isFull() {
    return this.availableWrite() === 0;
  }

  isEmpty() {
    return this.availableRead() === 0;
  }

  /**
   * Reset the buffer to initial state
   */
  reset() {
    Atomics.store(this.controlBuffer, 0, 0);
    Atomics.store(this.controlBuffer, 1, 0);
  }
}

export class RingBufferReader {
  /**
   * @param {SharedArrayBuffer} sharedBuffer - The shared memory buffer
   * @param {number} capacity - Number of float samples the buffer can hold
   */
  constructor(sharedBuffer, capacity) {
    this.sharedBuffer = sharedBuffer;
    this.capacity = capacity;

    // Control indices
    this.controlBuffer = new Int32Array(
      sharedBuffer,
      0,
      RING_BUFFER_HEADER_SIZE
    );

    // Data buffer starts after header
    const dataOffset = RING_BUFFER_HEADER_SIZE * Int32Array.BYTES_PER_ELEMENT;
    this.dataBuffer = new Float32Array(sharedBuffer, dataOffset, capacity);
  }

  /**
   * Read audio samples from the ring buffer
   * @param {Float32Array} destination - Buffer to read samples into
   * @returns {number} - Number of samples actually read
   */
  read(destination) {
    const writePtr = Atomics.load(this.controlBuffer, 0);
    const readPtr = Atomics.load(this.controlBuffer, 1);

    // Calculate available samples
    const available =
      writePtr >= readPtr
        ? writePtr - readPtr
        : this.capacity - readPtr + writePtr;

    const toRead = Math.min(destination.length, available);

    if (toRead === 0) return 0;

    let readIndex = readPtr;

    for (let i = 0; i < toRead; i++) {
      destination[i] = this.dataBuffer[readIndex];
      readIndex = (readIndex + 1) % this.capacity;
    }

    // Update read pointer atomically
    Atomics.store(this.controlBuffer, 1, readIndex);

    return toRead;
  }

  /**
   * Peek at samples without advancing the read pointer
   * @param {Float32Array} destination - Buffer to peek samples into
   * @returns {number} - Number of samples peeked
   */
  peek(destination) {
    const writePtr = Atomics.load(this.controlBuffer, 0);
    const readPtr = Atomics.load(this.controlBuffer, 1);

    const available =
      writePtr >= readPtr
        ? writePtr - readPtr
        : this.capacity - readPtr + writePtr;

    const toPeek = Math.min(destination.length, available);

    if (toPeek === 0) return 0;

    let readIndex = readPtr;

    for (let i = 0; i < toPeek; i++) {
      destination[i] = this.dataBuffer[readIndex];
      readIndex = (readIndex + 1) % this.capacity;
    }

    return toPeek;
  }

  /**
   * Get the number of samples available for reading
   */
  availableRead() {
    const writePtr = Atomics.load(this.controlBuffer, 0);
    const readPtr = Atomics.load(this.controlBuffer, 1);

    return writePtr >= readPtr
      ? writePtr - readPtr
      : this.capacity - readPtr + writePtr;
  }

  /**
   * Wait for a minimum number of samples to be available
   * Uses Atomics.wait for efficient blocking
   * @param {number} minSamples - Minimum samples to wait for
   * @param {number} timeout - Timeout in milliseconds
   * @returns {boolean} - True if enough samples available, false if timeout
   */
  waitForSamples(minSamples, timeout = 1000) {
    const startTime = performance.now();

    while (this.availableRead() < minSamples) {
      if (performance.now() - startTime > timeout) {
        return false;
      }
      // Small yield to prevent busy-waiting
      // In a real implementation, you'd use Atomics.waitAsync
    }

    return true;
  }

  /**
   * Reset the read pointer (caution: may cause data loss)
   */
  reset() {
    const writePtr = Atomics.load(this.controlBuffer, 0);
    Atomics.store(this.controlBuffer, 1, writePtr);
  }
}

/**
 * Create a SharedArrayBuffer for the ring buffer
 * @param {number} capacity - Number of float samples
 * @returns {SharedArrayBuffer}
 */
export function createRingBuffer(capacity) {
  // Calculate total size: header (Int32) + data (Float32)
  const headerSize = RING_BUFFER_HEADER_SIZE * Int32Array.BYTES_PER_ELEMENT;
  const dataSize = capacity * Float32Array.BYTES_PER_ELEMENT;
  const totalSize = headerSize + dataSize;

  const sharedBuffer = new SharedArrayBuffer(totalSize);

  // Initialize pointers to 0
  const controlBuffer = new Int32Array(
    sharedBuffer,
    0,
    RING_BUFFER_HEADER_SIZE
  );
  Atomics.store(controlBuffer, 0, 0); // writePtr
  Atomics.store(controlBuffer, 1, 0); // readPtr
  Atomics.store(controlBuffer, 2, capacity); // capacity

  return sharedBuffer;
}

/**
 * Audio processing constants
 */
export const AUDIO_CONSTANTS = {
  SAMPLE_RATE: 16000, // wav2vec2 expects 16kHz
  BUFFER_DURATION_MS: 100, // Buffer duration for inference
  INFERENCE_WINDOW_MS: 2000, // 2 second sliding window for emotion detection
  HOP_SIZE_MS: 500, // Hop between inference windows

  get SAMPLES_PER_BUFFER() {
    return Math.floor((this.SAMPLE_RATE * this.BUFFER_DURATION_MS) / 1000);
  },

  get INFERENCE_WINDOW_SAMPLES() {
    return Math.floor((this.SAMPLE_RATE * this.INFERENCE_WINDOW_MS) / 1000);
  },

  get HOP_SIZE_SAMPLES() {
    return Math.floor((this.SAMPLE_RATE * this.HOP_SIZE_MS) / 1000);
  },

  // Ring buffer capacity (hold 5 seconds of audio)
  get RING_BUFFER_CAPACITY() {
    return this.SAMPLE_RATE * 5;
  },
};
