/**
 * Supabase Client Configuration
 */

import { createClient } from "@supabase/supabase-js";

// Supabase configuration - Replace with your actual values
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || "https://your-project.supabase.co";
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || "your-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

/**
 * Database Schema (for reference)
 *
 * -- Sessions table
 * CREATE TABLE sessions (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
 *   name TEXT NOT NULL,
 *   duration_ms INTEGER DEFAULT 0,
 *   emotion_summary JSONB DEFAULT '{}',
 *   dominant_emotion TEXT DEFAULT 'neutral',
 *   average_confidence FLOAT DEFAULT 0,
 *   audio_path TEXT,
 *   created_at TIMESTAMPTZ DEFAULT NOW()
 * );
 *
 * -- Enable RLS
 * ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
 *
 * -- RLS Policies
 * CREATE POLICY "Users can view own sessions" ON sessions
 *   FOR SELECT USING (auth.uid() = user_id);
 *
 * CREATE POLICY "Users can insert own sessions" ON sessions
 *   FOR INSERT WITH CHECK (auth.uid() = user_id);
 *
 * CREATE POLICY "Users can delete own sessions" ON sessions
 *   FOR DELETE USING (auth.uid() = user_id);
 *
 * -- Storage bucket for recordings
 * -- Create bucket 'session-recordings' in Supabase Dashboard
 *
 * -- Storage RLS Policy (SQL in Supabase Dashboard)
 * -- Users can only access their own folder
 * CREATE POLICY "Users can upload own recordings" ON storage.objects
 *   FOR INSERT WITH CHECK (
 *     bucket_id = 'session-recordings'
 *     AND auth.uid()::text = (storage.foldername(name))[1]
 *   );
 *
 * CREATE POLICY "Users can read own recordings" ON storage.objects
 *   FOR SELECT USING (
 *     bucket_id = 'session-recordings'
 *     AND auth.uid()::text = (storage.foldername(name))[1]
 *   );
 *
 * CREATE POLICY "Users can delete own recordings" ON storage.objects
 *   FOR DELETE USING (
 *     bucket_id = 'session-recordings'
 *     AND auth.uid()::text = (storage.foldername(name))[1]
 *   );
 */
