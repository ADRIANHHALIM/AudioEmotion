/**
 * Session History Page
 * View and manage past recording sessions
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calendar,
  Clock,
  Trash2,
  Loader2,
  FileAudio,
  BarChart3,
  LogIn,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { useSessionStore } from "../stores/sessionStore";
import { useAuthStore } from "../stores/authStore";
import { EMOTION_COLORS, EMOTION_EMOJIS } from "../utils/emotions";

export default function History() {
  const navigate = useNavigate();

  const { user, isAuthenticated } = useAuthStore();
  const {
    sessions,
    isLoading,
    error,
    fetchSessions,
    deleteSession,
    getSessionStats,
  } = useSessionStore();

  useEffect(() => {
    if (!isAuthenticated) return;

    fetchSessions();
  }, [isAuthenticated, fetchSessions]);

  const handleRefresh = async () => {
    if (isAuthenticated) {
      await fetchSessions();
    }
  };

  const handleDelete = async (sessionId) => {
    if (window.confirm("Are you sure you want to delete this session?")) {
      await deleteSession(sessionId);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // 3. Update bagian Auth Check
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="text-center bg-[#161920] p-8 rounded-2xl border border-white/10 shadow-xl max-w-md w-full">
          <FileAudio className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">
            Sign in Required
          </h2>
          <p className="text-gray-400 mb-8">
            Please sign in to view your past emotion analysis sessions and
            recordings.
          </p>

          <button
            onClick={() => navigate("/login")}
            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-full text-white bg-[#5A7ACD] hover:bg-[#4a69bd] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#5A7ACD] transition-all duration-200 shadow-[0_0_20px_rgba(90,122,205,0.3)] hover:shadow-[0_0_30px_rgba(90,122,205,0.5)]"
          >
            <span className="absolute left-0 inset-y-0 flex items-center pl-3">
              <LogIn className="h-5 w-5 text-indigo-200 group-hover:text-white transition-colors" />
            </span>
            Sign In to Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white">Session History</h1>
        <p className="text-gray-400 mt-1">
          Review your past emotion analysis sessions
        </p>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className="btn-secondary text-sm flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </header>

      {/* Error state */}
      {error && (
        <div className="glass-card p-4 mb-6 border border-red-500/30 bg-red-500/5">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-300">
                Unable to load your session history. Please make sure the server
                is running.
              </p>
              <p className="text-xs text-red-200/80 mt-2 break-words">
                {error}
              </p>
            </div>
            <button
              onClick={handleRefresh}
              className="btn-ghost text-sm text-red-300 hover:text-red-200"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && sessions.length === 0 && (
        <div className="glass-card p-12 text-center">
          <BarChart3 className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">
            No Sessions Yet
          </h2>
          <p className="text-gray-400 max-w-md mx-auto">
            Start a new recording session from the Live Analysis page to begin
            tracking your emotional patterns.
          </p>
        </div>
      )}

      {/* Sessions list */}
      {!isLoading && sessions.length > 0 && (
        <div className="space-y-4">
          {sessions.map((session) => {
            const stats = getSessionStats(session);
            const dominantColor =
              EMOTION_COLORS[session.dominantEmotion] || EMOTION_COLORS.neutral;
            const dominantEmoji =
              EMOTION_EMOJIS[session.dominantEmotion] || EMOTION_EMOJIS.neutral;

            return (
              <div
                key={session.id}
                className="glass-card-hover p-6"
                style={{
                  borderLeftColor: dominantColor,
                  borderLeftWidth: "3px",
                }}
              >
                <div className="flex items-start justify-between">
                  {/* Session info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{dominantEmoji}</span>
                      <div>
                        <h3 className="text-lg font-semibold text-white">
                          {session.name}
                        </h3>
                        <div className="flex items-center gap-4 text-sm text-gray-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {formatDate(session.startTime)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {formatTime(session.startTime)}
                          </span>
                          <span>Duration: {stats.formattedDuration}</span>
                        </div>
                      </div>
                    </div>

                    {/* Emotion summary bars */}
                    <div className="mt-4 flex gap-1 h-2 rounded-full overflow-hidden bg-white/5">
                      {stats.dominantEmotions.map(({ label, value }) => (
                        <div
                          key={label}
                          className="h-full transition-all duration-300"
                          style={{
                            width: `${value * 100}%`,
                            backgroundColor: EMOTION_COLORS[label],
                          }}
                          title={`${label}: ${Math.round(value * 100)}%`}
                        />
                      ))}
                    </div>

                    {/* Top emotions */}
                    <div className="mt-3 flex gap-2">
                      {stats.dominantEmotions.map(({ label, value }) => (
                        <span
                          key={label}
                          className="emotion-badge"
                          style={{
                            backgroundColor: `${EMOTION_COLORS[label]}20`,
                            color: EMOTION_COLORS[label],
                          }}
                        >
                          {EMOTION_EMOJIS[label]} {label}{" "}
                          {Math.round(value * 100)}%
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => handleDelete(session.id)}
                      className="btn-icon hover:bg-red-500/10"
                      title="Delete session"
                    >
                      <Trash2 className="w-5 h-5 text-gray-400 hover:text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
