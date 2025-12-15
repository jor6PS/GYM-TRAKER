
import { createClient } from '@supabase/supabase-js';
import { Friend, Workout } from '../types';

// --- CONFIGURATION ---
const env = (import.meta as any).env;

// Retrieve from Environment Variables
// PRIORITY: Vite Env Vars -> Process Env (Fallback)
const SUPABASE_URL = 'https://hjmttgdlxsqnkequnacz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqbXR0Z2RseHNxbmtlcXVuYWN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1OTc1NzQsImV4cCI6MjA4MTE3MzU3NH0.A6exntms4j0o6hNFON4gLhltLmbccEjDxpL_GcQmeE0';

// Check configuration
export const isConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!isConfigured) {
  console.warn("⚠️ Supabase keys are missing. The app will start in a limited state.");
}

// Create the client with optimizations
export const supabase = createClient(
    SUPABASE_URL || 'https://placeholder.supabase.co', 
    SUPABASE_ANON_KEY || 'placeholder',
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
      // Cache optimization for global select queries if needed
      global: {
        headers: { 'x-application-name': 'gym-tracker-ai' },
      }
    }
);

// Helper for Profile fetching with error handling
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
      // PGRST116: JSON object requested, multiple (or no) rows returned
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
    // Silent fail on RPC
  }

  // 2. Fallback to Table Select
  const { data: tableData, error: tableError } = await supabase
    .from('profiles')
    .select('email')
    .ilike('name', cleanId)
    .maybeSingle();

  if (tableError) {
    if (tableError.code === '42P01') {
        throw new Error("System Error: Database table 'profiles' is missing.");
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

    const cleanTerm = term.trim();
    if (!cleanTerm) return [];

    // 1. Try RPC
    try {
        const { data, error } = await supabase.rpc('search_users', { 
            search_term: cleanTerm,
            current_user_id: user.id 
        });

        if (!error && data) return data;
    } catch (e) {
        // Silent fail
    }

    // 2. Fallback
    try {
        const [emailRes, nameRes] = await Promise.all([
            supabase
                .from('profiles')
                .select('id, name, avatar_url')
                .ilike('email', `%${cleanTerm}%`)
                .neq('id', user.id)
                .limit(5),
            supabase
                .from('profiles')
                .select('id, name, avatar_url')
                .ilike('name', `%${cleanTerm}%`)
                .neq('id', user.id)
                .limit(5)
        ]);

        const matches = [...(emailRes.data || []), ...(nameRes.data || [])];
        
        // Deduplicate
        const uniqueUsersMap = new Map();
        matches.forEach(u => {
            if (!uniqueUsersMap.has(u.id)) {
                uniqueUsersMap.set(u.id, u);
            }
        });

        return Array.from(uniqueUsersMap.values()).slice(0, 5);

    } catch (error) {
        console.error("User search failed:", error);
        return [];
    }
};

export const sendFriendRequest = async (friendId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not logged in");

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
    if (!isConfigured) return [];
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('friendships')
        .select(`id, status, user_id, friend_id`)
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

    if (error || !data) return [];

    // Optimize: Could be done with a view or join, but keeping client-side for now to avoid SQL migrations
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
