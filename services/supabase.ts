
import { createClient } from '@supabase/supabase-js';
import { Friend, Workout } from '../types';

// --- CONFIGURATION ---
const SUPABASE_URL = 'https://hjmttgdlxsqnkequnacz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqbXR0Z2RseHNxbmtlcXVuYWN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1OTc1NzQsImV4cCI6MjA4MTE3MzU3NH0.A6exntms4j0o6hNFON4gLhltLmbccEjDxpL_GcQmeE0';

export const isConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = createClient(
    SUPABASE_URL || 'https://placeholder.supabase.co', 
    SUPABASE_ANON_KEY || 'placeholder',
    {
      auth: { persistSession: true, autoRefreshToken: true },
      global: { headers: { 'x-application-name': 'gym-tracker-ai' } }
    }
);

/**
 * Resuelve un nombre de usuario o un email a un email válido para el login.
 * Utiliza una función RPC segura en el servidor para evitar exponer la tabla de perfiles.
 */
export const resolveUserEmail = async (identifier: string): Promise<string> => {
  const cleanId = identifier.trim();
  if (cleanId.includes('@')) return cleanId; // Ya es un email
  
  if (!isConfigured) throw new Error("Base de datos no configurada.");
  
  try {
    // Llamamos a la función RPC segura definida en Postgres
    // Retorna una lista de filas con la columna 'email_out'
    const { data, error } = await supabase.rpc('get_email_by_username', { 
        username_input: cleanId 
    });

    if (error) {
        console.error("Error en RPC resolveUserEmail:", error);
        throw new Error("Error de comunicación con el servidor de seguridad.");
    }
    
    // Verificamos si data es un array y tiene al menos un resultado con email_out
    if (!data || !Array.isArray(data) || data.length === 0 || !data[0].email_out) {
        throw new Error(`El usuario "${cleanId}" no existe. Verifica el nombre o usa tu email.`);
    }
    
    return data[0].email_out;
  } catch (e: any) {
    throw new Error(e.message || "No se pudo validar el usuario.");
  }
};

/**
 * Recupera el perfil del usuario actual de forma segura.
 */
export const getCurrentProfile = async () => {
  if (!isConfigured) return null;
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return null;

    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    
    if (data) return data;

    const newProfile = {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || user.email?.split('@')[0] || 'Atleta',
        role: 'user',
        created_at: new Date().toISOString()
    };

    const { data: created, error: insertError } = await supabase
        .from('profiles')
        .insert(newProfile)
        .select()
        .maybeSingle();

    if (insertError) {
        const { data: retry } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
        return retry || newProfile;
    }

    return created || newProfile;
  } catch (e) { 
    return null; 
  }
};

// --- CATALOG SERVICES ---

export const getExerciseCatalog = async () => {
  if (!isConfigured) return [];
  try {
    const { data, error } = await supabase.from('exercise_catalog').select('*').order('es', { ascending: true });
    if (error) return (error.code === 'PGRST116' || error.message.includes('not find')) ? null : [];
    return data;
  } catch (e) { return []; }
};

// --- RESTO DE SERVICIOS ---

export const uploadAvatar = async (file: File, userId: string): Promise<string | null> => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Math.random()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file);
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
    return data.publicUrl;
  } catch (error) { return null; }
};

export const updateUserProfile = async (userId: string, updates: { name?: string; avatar_url?: string; weight?: number; height?: number }) => {
  const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
  if (error) throw error;
  return { success: true };
};

export const updateUserPassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    return { success: true };
};

export const sendPasswordResetEmail = async (email: string) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  if (error) throw error;
  return { success: true };
};

export const searchUsers = async (term: string) => {
    if (!isConfigured) return [];
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase.from('profiles').select('id, name, avatar_url').ilike('name', `%${term}%`).neq('id', user.id).limit(10);
    if (error) return [];
    return data;
};

export const sendFriendRequest = async (friendId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not logged in");
    const { error } = await supabase.from('friendships').insert({ user_id: user.id, friend_id: friendId, status: 'pending' });
    if (error) throw error;
    return true;
};

export const getFriendships = async (): Promise<Friend[]> => {
    if (!isConfigured) return [];
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase.from('friendships').select(`id, status, user_id, friend_id`).or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);
    if (error || !data) return [];
    const friendPromises = data.map(async (f: any) => {
        const otherId = f.user_id === user.id ? f.friend_id : f.user_id;
        const { data: profile } = await supabase.from('profiles').select('name, avatar_url').eq('id', otherId).single();
        return { id: otherId, friendship_id: f.id, name: profile?.name || 'Usuario', avatar_url: profile?.avatar_url, status: f.status, is_sender: f.user_id === user.id } as Friend;
    });
    return Promise.all(friendPromises);
};

export const getPendingRequestsCount = async (): Promise<number> => {
    if (!isConfigured) return 0;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;
    const { count, error } = await supabase.from('friendships').select('*', { count: 'exact', head: true }).eq('friend_id', user.id).eq('status', 'pending');
    return count || 0;
};

export const respondToRequest = async (friendshipId: string, status: 'accepted' | 'rejected') => {
    const { error } = await supabase.from('friendships').update({ status }).eq('id', friendshipId);
    if (error) throw error;
};

export const getFriendWorkouts = async (friendIds: string[]) => {
    if (friendIds.length === 0) return [];
    const { data, error } = await supabase.from('workouts').select('*').in('user_id', friendIds).order('date', { ascending: false }).limit(50);
    if (error) return [];
    return data as Workout[];
};
