/**
 * Layout Component - Main app layout with sidebar navigation
 */

import { NavLink, Outlet } from "react-router-dom";
import {
  Mic,
  History,
  Settings,
  LogOut,
  LogIn,
  AudioWaveform,
  User,
} from "lucide-react";
import { useAuthStore } from "../stores/authStore";
import { useEmotionStore } from "../stores/emotionStore";
import { EMOTION_COLORS } from "../utils/emotions";

export default function Layout() {
  const { user, signOut, isAuthenticated } = useAuthStore();
  const { dominantEmotion, isInferenceRunning } = useEmotionStore();

  const currentColor =
    EMOTION_COLORS[dominantEmotion] || EMOTION_COLORS.neutral;

  const handleSignOut = async () => {
    await signOut();
  };

  const navItems = [
    { to: "/", icon: Mic, label: "Live Analysis" },
    { to: "/history", icon: History, label: "Session History" },
    { to: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Ambient background glow */}
      <div
        className="fixed inset-0 pointer-events-none transition-all duration-1000 ease-out"
        style={{
          background: isInferenceRunning
            ? `radial-gradient(ellipse at 30% 50%, ${currentColor}15 0%, transparent 50%)`
            : "none",
        }}
      />

      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-deep-card/50 backdrop-blur-xl border-r border-white/5 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500"
              style={{
                boxShadow: isInferenceRunning
                  ? `0 0 20px ${currentColor}50`
                  : "0 0 20px rgba(99, 102, 241, 0.3)",
              }}
            >
              <AudioWaveform className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">AudioEmotion</h1>
              <p className="text-xs text-gray-500">Speech Emotion AI</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        {isAuthenticated ? (
          <div className="p-4 border-t border-white/5">
            <div className="flex items-center gap-3 mb-3 px-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {user?.email?.split("@")[0] || "User"}
                </p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="nav-item w-full text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              <LogOut className="w-5 h-5" />
              <span>Sign Out</span>
            </button>
          </div>
        ) : (
          <div className="p-4 border-t border-white/5">
            <NavLink
              to="/login"
              className="nav-item w-full text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10"
            >
              <LogIn className="w-5 h-5" />
              <span>Sign In</span>
            </NavLink>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
