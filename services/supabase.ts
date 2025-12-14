import { createClient } from '@supabase/supabase-js';
import { Friend, Workout } from '../types';

// --- CONFIGURATION ---
const env = (import.meta as any).env;

// Retrieve from Environment Variables
const SUPABASE_URL = env?.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = env?.VITE_SUPABASE_ANON_KEY;

// Check configuration
export const isConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!isConfigured) {
  console.error("🚨 CRITICAL: Supabase keys are completely missing from environment variables.");
}

// Create the client
// If keys are missing, we initialize with placeholders to prevent a crash on import.
// The App component uses `isConfigured` to block the UI and show the error message.
export const supabase = createClient(
    SUPABASE_URL || 'https://placeholder.supabase.co', 
    SUPABASE_ANON_KEY || 'placeholder'
);

// Helper for Profile fetching
export const getCurrentProfile = async () => {
  if (!isConfigured) return null;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      // Ignore error if it's just "row not found" (new user)
      if (error.code !== 'PGRST116') {
        console.warn("Profile fetch warning:", error.message);
      }
      return null;
    }
    return data;
  } catch (e) {
    console.error("Error fetching profile:", e);
    return null;
  }
};

/**
 * Securely resolves an email address from a username or email input.
 */
export const resolveUserEmail = async (identifier: string): Promise<string> => {
  const cleanId = identifier.trim();
  
  // If it looks like an email, return it directly
  if (cleanId.includes('@')) {
    return cleanId;
  }

  if (!isConfigured) {
      throw new Error("Database not connected. Please use a valid Email Address.");
  }

  // 1. Try RPC (Secure Method)
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_email_by_username', { 
      username_input: cleanId 
    });

    if (!rpcError && rpcData) {
      return rpcData as string;
    }
  } catch (e) {
    console.warn("RPC get_email_by_username skipped:", e);
  }

  // 2. Fallback to Table Select (requires 'profiles' table to be readable)
  const { data: tableData, error: tableError } = await supabase
    .from('profiles')
    .select('email')
    .ilike('name', cleanId)
    .maybeSingle();

  if (tableError) {
    // FIX: Use JSON.stringify to ensure [object Object] is not printed in console
    console.error("User resolution error details:", JSON.stringify(tableError, null, 2));
    
    // Handle "Relation does not exist" specifically (Error 42P01)
    if (tableError.code === '42P01') {
        throw new Error("System Error: Database table 'profiles' is missing. Please run the SQL setup script.");
    }

    throw new Error("Unable to verify username. Please use your full email address.");
  }

  if (!tableData?.email) {
    throw new Error(`Username "${cleanId}" not found. Check spelling or use email.`);
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

    if (uploadError) throw uploadError;

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
    if (!isConfigured) return [];
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    try {
        const { data, error } = await supabase.rpc('search_users', { 
            search_term: term,
            current_user_id: user.id 
        });

        if (!error && data) return data;
    } catch (e) {
        // Silent fail on RPC
    }

    const { data: fallbackData, error: fallbackError } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .or(`email.ilike.%${term}%,name.ilike.%${term}%`)
        .neq('id', user.id)
        .limit(5);

    if (fallbackError) {
        console.error("User search failed:", JSON.stringify(fallbackError, null, 2));
        return [];
    }

    return fallbackData || [];
};

export const sendFriendRequest = async (friendId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not logged in");

    // Check if exists
    const { data: existing, error: selectError } = await supabase
        .from('friendships')
        .select('*')
        .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`)
        .single();

    if (selectError && selectError.code !== 'PGRST116') {
        if (selectError.code === '42P01') throw new Error("Database Error: Table 'friendships' missing.");
        throw selectError;
    }

    if (existing) {
        if (existing.status === 'pending') throw new Error("Request already pending.");
        if (existing.status === 'accepted') throw new Error("Already friends.");
    }

    const { error } = await supabase
        .from('friendships')
        .insert({ user_id: user.id, friend_id: friendId, status: 'pending' });

    if (error) {
        if (error.code === '42P01') throw new Error("Database Error: Table 'friendships' missing.");
        throw error;
    }
    return true;
};

export const getFriendships = async (): Promise<Friend[]> => {
    if (!isConfigured) return [];
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('friendships')
        .select(`id, status, user_id, friend_id`)
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

    if (error) {
        console.error("Error fetching friends:", error);
        return [];
    }
    
    if (!data) return [];

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

export const getPendingRequestsCount = async (): Promise<number> => {
    if (!isConfigured) return 0;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;
    
    const { count, error } = await supabase
        .from('friendships')
        .select('*', { count: 'exact', head: true })
        .eq('friend_id', user.id)
        .eq('status', 'pending');
    
    if (error) return 0;
    return count || 0;
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
        .limit(100);

    if (error) return [];
    return data as Workout[];
};