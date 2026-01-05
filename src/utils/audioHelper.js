/**
 * Audio Helper utilities for processing uploaded files
 */

/**
 * Read, decode, resample, and downmix an uploaded audio file to 16 kHz mono
 * @param {File} file - The uploaded audio file
 * @param {number} targetSampleRate - Desired output sample rate (default 16000)
 * @returns {Promise<AudioBuffer>} Resampled mono AudioBuffer ready for playback
 */
export async function processUploadedFile(file, targetSampleRate = 16000) {
  if (!file) {
    throw new Error("No audio file provided");
  }

  const arrayBuffer = await file.arrayBuffer();
  const decodingContext = new AudioContext();

  try {
    const decodedBuffer = await decodingContext.decodeAudioData(
      arrayBuffer.slice(0)
    );

    // Downmix to mono if needed
    let monoBuffer = decodedBuffer;
    if (decodedBuffer.numberOfChannels > 1) {
      const downmixed = decodingContext.createBuffer(
        1,
        decodedBuffer.length,
        decodedBuffer.sampleRate
      );
      const output = downmixed.getChannelData(0);

      for (let i = 0; i < decodedBuffer.length; i++) {
        let sum = 0;
        for (let ch = 0; ch < decodedBuffer.numberOfChannels; ch++) {
          sum += decodedBuffer.getChannelData(ch)[i] || 0;
        }
        output[i] = sum / decodedBuffer.numberOfChannels;
      }

      monoBuffer = downmixed;
    }

    // Resample using OfflineAudioContext for high quality conversion
    const offlineLength = Math.max(
      1,
      Math.ceil(monoBuffer.duration * targetSampleRate)
    );
    const offlineContext = new OfflineAudioContext(
      1,
      offlineLength,
      targetSampleRate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = monoBuffer;
    source.connect(offlineContext.destination);
    source.start(0);

    const renderedBuffer = await offlineContext.startRendering();
    return renderedBuffer;
  } finally {
    await decodingContext.close();
  }
}
