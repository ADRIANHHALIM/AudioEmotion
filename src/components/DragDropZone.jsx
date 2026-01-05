import { useState, useRef, useCallback } from "react";
import { Upload, FileAudio } from "lucide-react";

/**
 * Drag & Drop wrapper for the visualizer area
 * Wraps content and shows overlay when dragging audio files
 */
export default function DragDropZone({
  children,
  onFileSelected,
  className = "",
  disabled = false,
  showInstructions = false,
}) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const dragCounterRef = useRef(0);

  const handleFiles = useCallback(
    (files) => {
      if (!files || files.length === 0 || !onFileSelected) return;
      const file = files[0];
      // Validate audio file
      if (!file.type.startsWith("audio/")) {
        console.warn("[DragDropZone] Invalid file type:", file.type);
        return;
      }
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const handleDragEnter = (event) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) {
      setIsDragging(true);
    }
  };

  const handleDragOver = (event) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDragLeave = (event) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = (event) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    if (event.dataTransfer?.files?.length) {
      handleFiles(event.dataTransfer.files);
    }
  };

  const handleClick = (e) => {
    if (disabled) return;
    // Only trigger file input if clicking on the overlay area, not child controls
    if (showInstructions || isDragging) {
      fileInputRef.current?.click();
    }
  };

  const handleChange = (event) => {
    if (disabled) return;
    handleFiles(event.target.files);
    event.target.value = "";
  };

  return (
    <div
      className={`relative ${className}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />

      {/* Child content (Waveform) */}
      {children}

      {/* Drag overlay with glow effect */}
      {isDragging && (
        <div
          className="absolute inset-0 rounded-3xl z-20 flex flex-col items-center justify-center cursor-pointer transition-all duration-200"
          style={{
            background: "rgba(30, 33, 48, 0.95)",
            boxShadow:
              "inset 0 0 60px rgba(90, 122, 205, 0.4), 0 0 40px rgba(90, 122, 205, 0.3)",
            border: "2px dashed #5A7ACD",
          }}
        >
          <div className="p-4 rounded-full bg-[#5A7ACD]/20 border border-[#5A7ACD]/40 mb-4">
            <FileAudio className="w-10 h-10 text-[#5A7ACD]" />
          </div>
          <p className="text-xl font-semibold text-white mb-2">
            Drop Audio File
          </p>
          <p className="text-sm text-gray-400">Release to analyze</p>
        </div>
      )}

      {/* Instructions overlay (when no file is loaded and not recording) */}
      {showInstructions && !isDragging && (
        <div
          className="absolute inset-0 rounded-3xl z-10 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 hover:bg-black/40"
          style={{
            background: "rgba(0, 0, 0, 0.3)",
          }}
          onClick={handleClick}
        >
          <div className="p-4 rounded-full bg-black/40 border border-white/10 mb-4 transition-transform hover:scale-110">
            <Upload className="w-8 h-8 text-gray-300" />
          </div>
          <p className="text-lg font-medium text-white mb-1">
            Drop Audio File Here
          </p>
          <p className="text-sm text-gray-400">or click to browse</p>
          <p className="text-xs text-gray-500 mt-3">
            Supports MP3, WAV, M4A, OGG, FLAC
          </p>
        </div>
      )}
    </div>
  );
}
