import { createClient } from '@supabase/supabase-js';
import { Friend, Workout } from '../types';

// --- CONFIGURATION ---
// We use environment variables for production, but fallback to hardcoded values
// for development/preview environments where env vars might not be set yet.
const FALLBACK_URL = 'https://hjmttgdlxsqnkequnacz.supabase.co';
const FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqbXR0Z2RseHNxbmtlcXVuYWN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1OTc1NzQsImV4cCI6MjA4MTE3MzU3NH0.A6exntms4j0o6hNFON4gLhltLmbccEjDxpL_GcQmeE0';

// Using type assertion to bypass TypeScript error with ImportMeta in some bundlers
const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || FALLBACK_URL;
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || FALLBACK_KEY;

if (SUPABASE_URL === FALLBACK_URL) {
  console.log("ℹ️ Using fallback Supabase credentials");
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

/**
 * Securely resolves an email address from a username or email input.
 */
export const resolveUserEmail = async (identifier: string): Promise<string> => {
  const cleanId = identifier.trim();
  
  if (cleanId.includes('@')) {
    return cleanId;
  }

  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_email_by_username', { 
      username_input: cleanId 
    });

    if (!rpcError && rpcData) {
      return rpcData as string;
    }
  } catch (e) {
    console.warn("RPC get_email_by_username failed or not defined, trying direct query.");
  }

  const { data: tableData, error: tableError } = await supabase
    .from('profiles')
    .select('email')
    .ilike('name', cleanId)
    .maybeSingle();

  if (tableError) {
    console.error("User resolution error:", tableError);
    throw new Error("Unable to verify username. Please use your email.");
  }

  if (!tableData?.email) {
    throw new Error(`Username "${cleanId}" not found. Please check spelling or use email.`);
  }

  return tableData.email;
};

// --- PROFILE MANAGEMENT SERVICES ---

export const uploadAvatar = async (file: File, userId: string): Promise<string | null> => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Math.random()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file);

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
    return data.publicUrl;
  } catch (error) {
    console.error('Error uploading avatar:', error);
    return null;
  }
};

export const updateUserProfile = async (userId: string, updates: { name?: string; avatar_url?: string }) => {
  try {
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId);

    if (error) throw error;
    
    // Also update auth metadata for name if provided
    if (updates.name) {
       await supabase.auth.updateUser({
         data: { name: updates.name }
       });
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating profile:', error);
    throw error;
  }
};

export const updateUserPassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    return { success: true };
};

export const sendPasswordResetEmail = async (email: string) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
  return { success: true };
};

// --- SOCIAL SERVICES ---

export const searchUsers = async (term: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // Try to use RPC if available for secure search
    const { data, error } = await supabase.rpc('search_users', { 
        search_term: term,
        current_user_id: user.id 
    });

    if (!error && data) return data;

    // Fallback: Direct select (requires RLS to allow reading basic profile info)
    const { data: fallbackData } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .or(`email.ilike.%${term}%,name.ilike.%${term}%`)
        .neq('id', user.id)
        .limit(5);

    return fallbackData || [];
};

export const sendFriendRequest = async (friendId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not logged in");

    // Check if exists
    const { data: existing } = await supabase
        .from('friendships')
        .select('*')
        .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`)
        .single();

    if (existing) {
        if (existing.status === 'pending') throw new Error("Request already pending.");
        if (existing.status === 'accepted') throw new Error("Already friends.");
    }

    const { error } = await supabase
        .from('friendships')
        .insert({ user_id: user.id, friend_id: friendId, status: 'pending' });

    if (error) throw error;
    return true;
};

export const getFriendships = async (): Promise<Friend[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('friendships')
        .select(`
            id,
            status,
            user_id,
            friend_id
        `)
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

    if (error || !data) return [];

    // Fetch details for the *other* person
    const friendPromises = data.map(async (f: any) => {
        const isSender = f.user_id === user.id;
        const otherId = isSender ? f.friend_id : f.user_id;
        
        const { data: profile } = await supabase
            .from('profiles')
            .select('name, avatar_url')
            .eq('id', otherId)
            .single();

        return {
            id: otherId,
            friendship_id: f.id,
            name: profile?.name || 'Unknown User',
            avatar_url: profile?.avatar_url,
            status: f.status,
            is_sender: isSender
        } as Friend;
    });

    return Promise.all(friendPromises);
};

export const respondToRequest = async (friendshipId: string, status: 'accepted' | 'rejected') => {
    const { error } = await supabase
        .from('friendships')
        .update({ status })
        .eq('id', friendshipId);
    
    if (error) throw error;
};

export const getFriendWorkouts = async (friendIds: string[]) => {
    if (friendIds.length === 0) return [];
    
    const { data, error } = await supabase
        .from('workouts')
        .select('*')
        .in('user_id', friendIds)
        .order('date', { ascending: false })
        .limit(100); // Limit to recent history for performance

    if (error) return [];
    return data as Workout[];
};