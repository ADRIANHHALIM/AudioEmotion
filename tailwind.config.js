/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Deep Dark Theme
        deep: {
          bg: "#0F1115",
          card: "#16181D",
          border: "#1E2028",
          surface: "#1A1C22",
        },
        // Plutchik's Emotion Color System
        emotion: {
          angry: "#DC143C", // Crimson
          fearful: "#228B22", // Forest Green
          sad: "#4169E1", // Royal Blue
          happy: "#FFD700", // Gold
          disgust: "#9370DB", // Medium Purple
          surprised: "#87CEEB", // Sky Blue
          calm: "#98FB98", // Pale Green
          neutral: "#A9A9A9", // Grey
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      backdropBlur: {
        xs: "2px",
      },
      animation: {
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        waveform: "waveform 1.5s ease-in-out infinite",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-in": "slide-in 0.3s ease-out",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: 0.4, transform: "scale(1)" },
          "50%": { opacity: 0.8, transform: "scale(1.05)" },
        },
        waveform: {
          "0%, 100%": { transform: "scaleY(0.5)" },
          "50%": { transform: "scaleY(1)" },
        },
        "fade-in": {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
        "slide-in": {
          "0%": { opacity: 0, transform: "translateX(-10px)" },
          "100%": { opacity: 1, transform: "translateX(0)" },
        },
      },
    },
  },
  plugins: [],
};
