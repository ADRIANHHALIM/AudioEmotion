# AudioEmotion

A high-performance, **Local-First** Real-time Speech Emotion Recognition (SER) web application built with React and ONNX Runtime Web. The AI model runs entirely in the browser, ensuring privacy and low latency.

![AudioEmotion Demo](./docs/demo.png)

## Features

- 🎤 **Real-time Audio Capture** - Uses AudioWorklet for low-latency microphone input
- 🧠 **Client-side AI** - ONNX Runtime Web executes wav2vec2 model in browser
- 🎨 **8 Emotion Classes** - Detects angry, fearful, sad, happy, disgust, surprised, calm, neutral
- 📊 **Rich Visualizations** - Waveform, radar chart, and emotion timeline
- 🔒 **Privacy First** - All processing happens locally, no audio sent to servers
- 🌙 **Deep Dark UI** - Modern glassmorphism design with Plutchik's color system
- ☁️ **Supabase Integration** - Optional auth and session storage

## Architecture

The app implements a **Tri-Thread Model** for optimal performance:

```
┌─────────────────────────────────────────────────────────────────┐
│                      Thread A (Main/UI)                         │
│  React 18 + Zustand State Management + Visualization           │
└──────────────────────────┬──────────────────────────────────────┘
                           │ postMessage
          ┌────────────────┴────────────────┐
          │                                 │
          ▼                                 ▼
┌─────────────────────┐           ┌─────────────────────┐
│  Thread B (Audio)   │           │ Thread C (Inference)│
│  AudioWorklet       │──────────▶│ Web Worker + ONNX   │
│  Captures mic input │  Shared   │ Runs emotion model  │
│  Writes to buffer   │  Array    │ Reads from buffer   │
└─────────────────────┘  Buffer   └─────────────────────┘
```

## Tech Stack

- **Frontend:** React 18, Vite, Tailwind CSS, Lucide React
- **State:** Zustand (optimized for high-frequency updates)
- **AI Runtime:** onnxruntime-web (WASM backend)
- **Audio:** Web Audio API + AudioWorklet + SharedArrayBuffer
- **Backend:** Supabase (Auth & Storage)

## Getting Started

### Prerequisites

- Node.js 18+
- Modern browser with SharedArrayBuffer support (Chrome, Firefox, Edge)
- ONNX emotion model file

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/audio-emotion.git
cd audio-emotion

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Add your ONNX model
# Place your quantized wav2vec2 emotion model at:
# public/models/emotion_model.onnx

# Start development server
npm run dev
```

### Adding Your Model

1. Obtain or train a wav2vec2-based emotion classification model
2. Export to ONNX format (quantized INT8 recommended for web)
3. Place at `public/models/emotion_model.onnx`

Expected model specifications:

- Input: `[batch_size, sequence_length]` float32 audio samples at 16kHz
- Output: `[batch_size, 8]` logits for 8 emotion classes

### Supabase Setup (Optional)

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Run the database migrations:

```sql
-- Sessions table
CREATE TABLE sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  duration_ms INTEGER DEFAULT 0,
  emotion_summary JSONB DEFAULT '{}',
  dominant_emotion TEXT DEFAULT 'neutral',
  average_confidence FLOAT DEFAULT 0,
  audio_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own sessions" ON sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions" ON sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions" ON sessions
  FOR DELETE USING (auth.uid() = user_id);
```

3. Create a storage bucket named `session-recordings`
4. Update `.env.local` with your Supabase credentials

## Security Headers

The app requires specific security headers for SharedArrayBuffer:

```js
// Already configured in vite.config.js
{
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
}
```

For production deployment, configure these headers on your web server.

## Project Structure

```
audio-emotion/
├── public/
│   ├── audio-processor.js     # AudioWorklet processor
│   ├── models/                # ONNX model files
│   └── wasm/                  # ONNX Runtime WASM files
├── src/
│   ├── components/            # React components
│   │   ├── Layout.jsx
│   │   ├── Waveform.jsx
│   │   ├── EmotionDisplay.jsx
│   │   ├── RadarChart.jsx
│   │   ├── ControlPanel.jsx
│   │   └── EmotionHistory.jsx
│   ├── pages/                 # Route pages
│   │   ├── Dashboard.jsx
│   │   ├── History.jsx
│   │   ├── Settings.jsx
│   │   └── Login.jsx
│   ├── stores/                # Zustand stores
│   │   ├── audioStore.js
│   │   ├── emotionStore.js
│   │   ├── authStore.js
│   │   └── sessionStore.js
│   ├── workers/               # Web Workers
│   │   └── inference.js       # ONNX inference worker
│   ├── utils/                 # Utilities
│   │   ├── RingBuffer.js      # Lock-free circular buffer
│   │   ├── audio.js           # Audio utilities
│   │   └── emotions.js        # Emotion constants
│   ├── lib/
│   │   └── supabase.js        # Supabase client
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── vite.config.js             # Vite config with headers
├── tailwind.config.js         # Tailwind with custom theme
└── package.json
```

## Emotion Color System

Based on Plutchik's Wheel of Emotions:

| Emotion      | Hex Code  | Preview          |
| ------------ | --------- | ---------------- |
| 😡 Angry     | `#DC143C` | 🟥 Crimson       |
| 😨 Fearful   | `#228B22` | 🟩 Forest Green  |
| 😢 Sad       | `#4169E1` | 🟦 Royal Blue    |
| 😄 Happy     | `#FFD700` | 🟨 Gold          |
| 🤢 Disgust   | `#9370DB` | 🟪 Medium Purple |
| 😲 Surprised | `#87CEEB` | 🩵 Sky Blue       |
| 😌 Calm      | `#98FB98` | 🟢 Pale Green    |
| 😐 Neutral   | `#A9A9A9` | ⬜ Grey          |

## Performance

- **Latency:** ~100-200ms from speech to prediction
- **Inference:** ~50-100ms per 2-second audio window
- **Memory:** ~100-200MB for model + runtime
- **CPU:** Runs on WASM, works on most modern devices

## Browser Support

| Browser       | Supported | Notes                     |
| ------------- | --------- | ------------------------- |
| Chrome 92+    | ✅        | Full support              |
| Firefox 90+   | ✅        | Full support              |
| Edge 92+      | ✅        | Full support              |
| Safari 16.4+  | ⚠️        | Limited SharedArrayBuffer |
| Mobile Chrome | ✅        | Works on Android          |
| Mobile Safari | ❌        | No SharedArrayBuffer      |

## Development

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) - Microsoft's ML runtime
- [wav2vec 2.0](https://arxiv.org/abs/2006.11477) - Self-supervised speech representations
- [Plutchik's Wheel](https://en.wikipedia.org/wiki/Robert_Plutchik) - Emotion color theory
