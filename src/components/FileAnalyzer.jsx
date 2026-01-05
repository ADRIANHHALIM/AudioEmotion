/**
 * File Analyzer Component
 * Standalone drag & drop audio file analysis (separate from live mic)
 */

import { useState, useRef, useCallback } from "react";
import {
  Upload,
  FileAudio,
  Play,
  Pause,
  Square,
  Loader2,
  Check,
  AlertCircle,
} from "lucide-react";
import { processUploadedFile } from "../utils/audioHelper";
import { analyzeAudioFile } from "../utils/fileInference";
import {
  EMOTION_LABELS,
  EMOTION_COLORS,
  EMOTION_EMOJIS,
} from "../utils/emotions";

export default function FileAnalyzer({ className = "" }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);

  // File state
  const [fileName, setFileName] = useState(null);
  const [audioBuffer, setAudioBuffer] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Analysis result
  const [result, setResult] = useState(null);

  const fileInputRef = useRef(null);
  const audioRef = useRef(null);
  const dragCounterRef = useRef(0);

  const resetState = () => {
    setFileName(null);
    setAudioBuffer(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setResult(null);
    setError(null);
  };

  const handleFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith("audio/")) {
      setError("Please select a valid audio file");
      return;
    }

    resetState();
    setFileName(file.name);
    setIsProcessing(true);
    setError(null);

    try {
      // Create URL for playback
      const url = URL.createObjectURL(file);
      setAudioUrl(url);

      // Process file (resample to 16kHz mono)
      console.log("[FileAnalyzer] Processing file:", file.name);
      const processedBuffer = await processUploadedFile(file, 16000);
      setAudioBuffer(processedBuffer);
      setDuration(processedBuffer.duration);
      console.log(
        "[FileAnalyzer] File processed:",
        processedBuffer.duration,
        "seconds"
      );

      // Analyze the file
      setIsAnalyzing(true);
      console.log("[FileAnalyzer] Starting analysis...");
      const analysisResult = await analyzeAudioFile(processedBuffer);

      if (analysisResult) {
        setResult(analysisResult);
        console.log("[FileAnalyzer] Analysis complete:", analysisResult);
      } else {
        setError("Failed to analyze audio");
      }
    } catch (err) {
      console.error("[FileAnalyzer] Error:", err);
      setError(err.message || "Failed to process audio file");
    } finally {
      setIsProcessing(false);
      setIsAnalyzing(false);
    }
  }, []);

  // Drag & Drop handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) {
      setIsDragging(true);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

    if (e.dataTransfer?.files?.length) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files?.length) {
      handleFile(e.target.files[0]);
      e.target.value = "";
    }
  };

  const handleClick = () => {
    if (!isProcessing && !isAnalyzing) {
      fileInputRef.current?.click();
    }
  };

  // Playback handlers
  const togglePlayback = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleSeek = (e) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Number(e.target.value);
    }
  };

  const handleClear = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    resetState();
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const dominantEmotion = result?.dominant || "neutral";
  const dominantColor =
    EMOTION_COLORS[dominantEmotion] || EMOTION_COLORS.neutral;
  const dominantEmoji = EMOTION_EMOJIS[dominantEmotion] || "😐";

  return (
    <div className={`glass-card p-6 ${className}`}>
      <h3 className="text-lg font-semibold text-white mb-4">
        📁 File Analysis
      </h3>
      <p className="text-sm text-gray-400 mb-4">
        Drop an audio file for instant emotion analysis
      </p>

      {/* Hidden audio element for playback */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleFileInput}
      />

      {/* Drop Zone */}
      {!audioBuffer && (
        <div
          className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${
            isDragging
              ? "border-[#5A7ACD] bg-[#5A7ACD]/10"
              : "border-gray-600 hover:border-gray-500 hover:bg-white/5"
          } ${isProcessing ? "pointer-events-none opacity-50" : ""}`}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClick}
        >
          {isProcessing ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 text-[#5A7ACD] animate-spin" />
              <p className="text-white font-medium">
                {isAnalyzing ? "Analyzing emotions..." : "Processing audio..."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div
                className={`p-4 rounded-full transition-colors ${
                  isDragging ? "bg-[#5A7ACD]/20" : "bg-white/5"
                }`}
              >
                {isDragging ? (
                  <FileAudio className="w-8 h-8 text-[#5A7ACD]" />
                ) : (
                  <Upload className="w-8 h-8 text-gray-400" />
                )}
              </div>
              <div>
                <p className="text-white font-medium">
                  {isDragging ? "Drop to analyze" : "Drop audio file here"}
                </p>
                <p className="text-sm text-gray-400 mt-1">or click to browse</p>
              </div>
              <p className="text-xs text-gray-500">
                MP3, WAV, M4A, OGG, FLAC supported
              </p>
            </div>
          )}
        </div>
      )}

      {/* File loaded - show player and results */}
      {audioBuffer && (
        <div className="space-y-4">
          {/* File info & controls */}
          <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
            <button
              onClick={togglePlayback}
              className="p-2 rounded-full bg-[#5A7ACD] hover:bg-[#4A6ABD] transition-colors"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 text-white" />
              ) : (
                <Play className="w-4 h-4 text-white" />
              )}
            </button>

            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{fileName}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-400 font-mono">
                  {formatTime(currentTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeek}
                  className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-xs text-gray-400 font-mono">
                  {formatTime(duration)}
                </span>
              </div>
            </div>

            <button
              onClick={handleClear}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
              title="Clear"
            >
              <Square className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {/* Analysis Result */}
          {result && (
            <div
              className="p-4 rounded-xl"
              style={{ backgroundColor: `${dominantColor}15` }}
            >
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">{dominantEmoji}</span>
                <div>
                  <p
                    className="text-xl font-bold capitalize"
                    style={{ color: dominantColor }}
                  >
                    {dominantEmotion}
                  </p>
                  <p className="text-sm text-gray-400">
                    {(result.confidence * 100).toFixed(1)}% confidence
                  </p>
                </div>
                <Check className="w-6 h-6 ml-auto text-green-400" />
              </div>

              {/* All emotions */}
              <div className="grid grid-cols-2 gap-2">
                {EMOTION_LABELS.map((emotion) => {
                  const value = result.emotions[emotion] || 0;
                  const color = EMOTION_COLORS[emotion];
                  const emoji = EMOTION_EMOJIS[emotion];
                  const percentage = (value * 100).toFixed(1);

                  return (
                    <div
                      key={emotion}
                      className="flex items-center gap-2 p-2 rounded-lg bg-black/20"
                    >
                      <span className="text-sm">{emoji}</span>
                      <span className="text-xs text-gray-300 capitalize flex-1">
                        {emotion}
                      </span>
                      <span className="text-xs font-mono" style={{ color }}>
                        {percentage}%
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Inference time */}
              <p className="text-xs text-gray-500 mt-3 text-center">
                Analyzed in {result.inferenceTime?.toFixed(0) || 0}ms
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>
      )}

      {/* Error in drop zone */}
      {error && !audioBuffer && (
        <div className="flex items-center gap-2 p-3 mt-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
