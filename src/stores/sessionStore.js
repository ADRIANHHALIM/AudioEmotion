/**
 * Session Store - Zustand store for recording sessions
 * Handles saving and loading session data from Node.js/Prisma backend
 */

import { create } from "zustand";
import { sessionsApi } from "../lib/api";
import { EMOTION_LABELS } from "../utils/emotions";

const initialState = {
  sessions: [],
  currentSession: null,
  isLoading: false,
  isSaving: false,
  error: null,
};

export const useSessionStore = create((set, get) => ({
  ...initialState,

  // Fetch user's sessions
  fetchSessions: async () => {
    try {
      set({ isLoading: true, error: null });

      const { sessions } = await sessionsApi.getAll();

      set({ sessions: sessions || [], isLoading: false });

      return { success: true, data: sessions };
    } catch (error) {
      set({ error: error.message, isLoading: false });
      return { success: false, error: error.message };
    }
  },

  // Create a new session
  createSession: async (sessionData = {}) => {
    try {
      set({ isSaving: true, error: null });

      const { session } = await sessionsApi.create({
        name: sessionData.name || `Session ${new Date().toLocaleString()}`,
        description: sessionData.description,
      });

      set((state) => ({
        sessions: [session, ...state.sessions],
        currentSession: session,
        isSaving: false,
      }));

      return { success: true, data: session };
    } catch (error) {
      set({ error: error.message, isSaving: false });
      return { success: false, error: error.message };
    }
  },

  // End current session
  endSession: async (sessionId) => {
    try {
      set({ isSaving: true, error: null });

      const { session } = await sessionsApi.end(sessionId);

      set((state) => ({
        sessions: state.sessions.map((s) => (s.id === sessionId ? session : s)),
        currentSession: null,
        isSaving: false,
      }));

      return { success: true, data: session };
    } catch (error) {
      set({ error: error.message, isSaving: false });
      return { success: false, error: error.message };
    }
  },

  // Delete a session
  deleteSession: async (sessionId) => {
    try {
      set({ isLoading: true, error: null });

      await sessionsApi.delete(sessionId);

      set((state) => ({
        sessions: state.sessions.filter((s) => s.id !== sessionId),
        isLoading: false,
      }));

      return { success: true };
    } catch (error) {
      set({ error: error.message, isLoading: false });
      return { success: false, error: error.message };
    }
  },

  // Set current session
  setCurrentSession: (session) => {
    set({ currentSession: session });
  },

  // Clear current session
  clearCurrentSession: () => {
    set({ currentSession: null });
  },

  // Calculate session statistics
  getSessionStats: (session) => {
    if (!session?.emotionSummary) {
      return {
        dominantEmotions: [],
        totalDuration: 0,
        formattedDuration: "0:00",
      };
    }

    // Sort emotions by average value
    const sortedEmotions = EMOTION_LABELS.map((label) => ({
      label,
      value: session.emotionSummary[label] || 0,
    })).sort((a, b) => b.value - a.value);

    // Format duration
    const totalSeconds = session.duration || 0;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const formattedDuration = `${minutes}:${seconds
      .toString()
      .padStart(2, "0")}`;

    return {
      dominantEmotions: sortedEmotions.slice(0, 3),
      totalDuration: totalSeconds * 1000,
      formattedDuration,
    };
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },

  // Reset store
  reset: () => {
    set(initialState);
  },
}));
