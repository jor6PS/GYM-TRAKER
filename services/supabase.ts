import { createClient } from '@supabase/supabase-js';

// --- CONFIGURATION ---
// We use environment variables for production, but fallback to hardcoded values
// for development/preview environments where env vars might not be set yet.
const FALLBACK_URL = 'https://hjmttgdlxsqnkequnacz.supabase.co';
const FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqbXR0Z2RseHNxbmtlcXVuYWN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1OTc1NzQsImV4cCI6MjA4MTE3MzU3NH0.A6exntms4j0o6hNFON4gLhltLmbccEjDxpL_GcQmeE0';

// Using type assertion to bypass TypeScript error with ImportMeta
const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || FALLBACK_URL;
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || FALLBACK_KEY;

if (SUPABASE_URL === FALLBACK_URL) {
  console.log("ℹ️ Using fallback Supabase credentials (Dev Mode)");
}

// Create the real client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper for Profile fetching
export const getCurrentProfile = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    // Gracefully handle case where profile doesn't exist yet
    return null;
  }
  return data;
};