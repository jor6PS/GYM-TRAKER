
import { createClient } from '@supabase/supabase-js';
import { Friend, Workout } from '../types';

// --- CONFIGURATION ---
// Las credenciales se cargan desde variables de entorno para mayor seguridad
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

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
 */
export const resolveUserEmail = async (identifier: string): Promise<string> => {
  const cleanId = identifier.trim();
  if (cleanId.includes('@')) return cleanId;
  
  if (!isConfigured) throw new Error("Base de datos no configurada.");
  
  try {
    const { data, error } = await supabase.rpc('get_email_by_username', { 
        username_input: cleanId 
    });

    if (error) throw new Error("Error de comunicación con el servidor.");
    if (!data || !Array.isArray(data) || data.length === 0 || !data[0].email_out) {
        throw new Error(`El usuario "${cleanId}" no existe.`);
    }
    
    return data[0].email_out;
  } catch (e: any) {
    throw new Error(e.message || "No se pudo validar el usuario.");
  }
};

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

    const { data: created } = await supabase.from('profiles').insert(newProfile).select().maybeSingle();
    return created || newProfile;
  } catch (e) { return null; }
};

export const getExerciseCatalog = async () => {
  if (!isConfigured) return [];
  try {
    const { data } = await supabase.from('exercise_catalog').select('*').order('es', { ascending: true });
    return data || [];
  } catch (e) { return []; }
};

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

export const updateUserProfile = async (userId: string, updates: { name?: string; avatar_url?: string; weight?: number; height?: number; age?: number }) => {
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

/**
 * Envía una solicitud de amistad evitando duplicados.
 * Si ya existe una solicitud inversa pendiente, la acepta automáticamente.
 */
export const sendFriendRequest = async (friendId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not logged in");

    // 1. Verificar si ya existe alguna relación (en cualquier dirección)
    const { data: existing } = await supabase
        .from('friendships')
        .select('*')
        .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`)
        .maybeSingle();

    if (existing) {
        if (existing.status === 'accepted') throw new Error("Ya sois amigos.");
        if (existing.user_id === user.id) throw new Error("Solicitud ya enviada.");
        
        // Si el otro nos había enviado una solicitud, la aceptamos automáticamente al intentar agregarle nosotros
        const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', existing.id);
        if (error) throw error;
        return true;
    }

    // 2. Si no existe nada, crear nueva solicitud
    const { error } = await supabase.from('friendships').insert({ 
        user_id: user.id, 
        friend_id: friendId, 
        status: 'pending' 
    });
    if (error) throw error;
    return true;
};

export const getFriendships = async (): Promise<Friend[]> => {
    if (!isConfigured) return [];
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase.from('friendships')
        .select(`id, status, user_id, friend_id`)
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);
    
    if (error || !data) return [];

    const friendPromises = data.map(async (f: any) => {
        const otherId = f.user_id === user.id ? f.friend_id : f.user_id;
        const { data: profile } = await supabase.from('profiles').select('name, avatar_url').eq('id', otherId).single();
        return { 
            id: otherId, 
            friendship_id: f.id, 
            name: profile?.name || 'Usuario', 
            avatar_url: profile?.avatar_url, 
            status: f.status, 
            is_sender: f.user_id === user.id 
        } as Friend;
    });

    const results = await Promise.all(friendPromises);
    
    // Deduplicar por ID de amigo por si acaso hay inconsistencias en la DB
    const uniqueMap = new Map<string, Friend>();
    results.forEach(res => {
        const existing = uniqueMap.get(res.id);
        // Si hay duplicados, preferimos la que esté 'accepted'
        if (!existing || res.status === 'accepted') {
            uniqueMap.set(res.id, res);
        }
    });

    return Array.from(uniqueMap.values());
};

export const getPendingRequestsCount = async (): Promise<number> => {
    if (!isConfigured) return 0;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;
    const { count } = await supabase.from('friendships').select('*', { count: 'exact', head: true }).eq('friend_id', user.id).eq('status', 'pending');
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
