/**
 * Auth Store - Zustand store for Node.js/Prisma authentication
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authApi, sessionsApi, predictionsApi, getAuthToken } from "../lib/api";

const initialState = {
  user: null,
  isLoading: true,
  isAuthenticated: false,
  error: null,
  // Session tracking
  currentSession: null,
  pendingPredictions: [],
};

export const useAuthStore = create(
  persist(
    (set, get) => ({
      ...initialState,

      // Initialize auth state from stored token
      initialize: async () => {
        try {
          set({ isLoading: true });

          // Check if we have a stored token
          const token = getAuthToken();

          if (token) {
            try {
              const { user } = await authApi.getMe();
              set({
                user,
                isAuthenticated: true,
                isLoading: false,
                error: null,
              });
            } catch (error) {
              // Token invalid or expired
              authApi.signOut();
              set({
                user: null,
                isAuthenticated: false,
                isLoading: false,
              });
            }
          } else {
            set({
              user: null,
              isAuthenticated: false,
              isLoading: false,
            });
          }

          return true;
        } catch (error) {
          set({ error: error.message, isLoading: false });
          return false;
        }
      },

      // Sign up with email and password
      signUp: async (email, password, name) => {
        try {
          set({ isLoading: true, error: null });

          const { user } = await authApi.signUp(email, password, name);

          set({
            user,
            isAuthenticated: true,
            isLoading: false,
          });

          return { success: true };
        } catch (error) {
          set({ error: error.message, isLoading: false });
          return { success: false, error: error.message };
        }
      },

      // Sign in with email and password
      signIn: async (email, password) => {
        try {
          set({ isLoading: true, error: null });

          const { user } = await authApi.signIn(email, password);

          set({
            user,
            isAuthenticated: true,
            isLoading: false,
          });

          return { success: true };
        } catch (error) {
          set({ error: error.message, isLoading: false });
          return { success: false, error: error.message };
        }
      },

      // Sign out
      signOut: () => {
        authApi.signOut();
        set({
          user: null,
          isAuthenticated: false,
          currentSession: null,
          pendingPredictions: [],
          error: null,
        });
      },

      // Change password
      changePassword: async (currentPassword, newPassword) => {
        try {
          set({ isLoading: true, error: null });

          await authApi.changePassword(currentPassword, newPassword);

          set({ isLoading: false });

          return { success: true };
        } catch (error) {
          set({ error: error.message, isLoading: false });
          return { success: false, error: error.message };
        }
      },

      // Clear error
      clearError: () => {
        set({ error: null });
      },

      // Session management
      startSession: async (name, description) => {
        const { isAuthenticated } = get();

        if (!isAuthenticated) {
          // Offline mode - create local session
          const localSession = {
            id: `local-${Date.now()}`,
            name: name || `Session ${new Date().toLocaleString()}`,
            description,
            startTime: new Date().toISOString(),
            isLocal: true,
          };
          set({ currentSession: localSession, pendingPredictions: [] });
          return localSession;
        }

        try {
          const { session } = await sessionsApi.create({ name, description });
          set({ currentSession: session, pendingPredictions: [] });
          return session;
        } catch (error) {
          console.error("Failed to create session:", error);
          // Fall back to local session
          const localSession = {
            id: `local-${Date.now()}`,
            name: name || `Session ${new Date().toLocaleString()}`,
            description,
            startTime: new Date().toISOString(),
            isLocal: true,
          };
          set({ currentSession: localSession, pendingPredictions: [] });
          return localSession;
        }
      },

      endSession: async () => {
        const { currentSession, pendingPredictions, isAuthenticated } = get();

        if (!currentSession) return null;

        // If authenticated and online session, sync predictions and end it
        if (isAuthenticated && !currentSession.isLocal) {
          try {
            // Batch upload any pending predictions
            if (pendingPredictions.length > 0) {
              await predictionsApi.createBatch(
                currentSession.id,
                pendingPredictions
              );
            }

            // End the session
            const { session } = await sessionsApi.end(currentSession.id);
            set({ currentSession: null, pendingPredictions: [] });
            return session;
          } catch (error) {
            console.error("Failed to end session:", error);
          }
        }

        set({ currentSession: null, pendingPredictions: [] });
        return currentSession;
      },

      // Add prediction to current session
      addPrediction: async (prediction) => {
        const { currentSession, isAuthenticated, pendingPredictions } = get();

        if (!currentSession) return;

        const predictionData = {
          dominant: prediction.dominant,
          confidence: prediction.confidence,
          emotions: prediction.emotions,
          inferenceTime: prediction.inferenceTime,
          timestamp: new Date().toISOString(),
        };

        // Add to pending predictions
        const newPending = [...pendingPredictions, predictionData];
        set({ pendingPredictions: newPending });

        // Batch upload every 10 predictions if authenticated
        if (
          isAuthenticated &&
          !currentSession.isLocal &&
          newPending.length >= 10
        ) {
          try {
            await predictionsApi.createBatch(currentSession.id, newPending);
            set({ pendingPredictions: [] });
          } catch (error) {
            console.error("Failed to upload predictions:", error);
          }
        }
      },
    }),
    {
      name: "audio-emotion-auth",
      partialize: (state) => ({
        // Only persist minimal state
        isAuthenticated: state.isAuthenticated,
        user: state.user,
      }),
    }
  )
);
