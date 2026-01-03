import { useState, useEffect, useCallback, useRef } from 'react';
import { User } from '../types';
import { supabase, getCurrentProfile } from '../services/supabase';

interface UseAuthReturn {
  currentUser: User | null;
  realAdminUser: User | null;
  sessionLoading: boolean;
  isRecoveryMode: boolean;
  setCurrentUser: (user: User | null) => void;
  setRealAdminUser: (user: User | null) => void;
  setIsRecoveryMode: (mode: boolean) => void;
  logout: () => Promise<void>;
}

export const useAuth = (): UseAuthReturn => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [realAdminUser, setRealAdminUser] = useState<User | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const initialCheckDoneRef = useRef(false);
  const isMountedRef = useRef(true);

  const fetchUserProfile = useCallback(async (userId: string) => {
    if (!isMountedRef.current) return;
    try {
      const profile = await getCurrentProfile();
      if (profile && isMountedRef.current) {
        setCurrentUser(profile as User);
      } else if (isMountedRef.current) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && isMountedRef.current) {
          setCurrentUser({
            id: user.id,
            email: user.email || '',
            name: user.user_metadata?.name || 'Atleta',
            role: 'user',
            created_at: user.created_at,
            weight: 80,
            height: 180
          });
        }
      }
    } catch (e) {
      console.error('Error fetching user profile:', e);
    } finally {
      if (isMountedRef.current) {
        setSessionLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    let isMounted = true;
    
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        initialCheckDoneRef.current = true;
        if (session && isMounted) {
          await fetchUserProfile(session.user.id);
        } else if (isMounted) {
          setSessionLoading(false);
        }
      } catch (error) {
        console.error('Error checking session:', error);
        initialCheckDoneRef.current = true;
        if (isMounted) {
          setSessionLoading(false);
        }
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted || !initialCheckDoneRef.current) return;
      
      console.log('🔐 Auth state changed:', event);
      
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true);
      }
      
      if (event === 'SIGNED_OUT') {
        console.log('🚪 Usuario cerró sesión, limpiando estado...');
        setCurrentUser(null);
        setRealAdminUser(null);
        setSessionLoading(false);
        return;
      }
      
      if (session) {
        await fetchUserProfile(session.user.id);
      } else {
        // Si no hay sesión pero no es un SIGNED_OUT explícito, también limpiar
        setCurrentUser(null);
        setRealAdminUser(null);
        setSessionLoading(false);
      }
    });

    return () => {
      isMounted = false;
      isMountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [fetchUserProfile]);

  const logout = useCallback(async () => {
    try {
      console.log('🚪 Iniciando cierre de sesión...');
      
      // CRÍTICO: Limpiar estados inmediatamente para una respuesta visual rápida
      setCurrentUser(null);
      setRealAdminUser(null);
      setSessionLoading(false); // Establecer a false para que muestre LoginScreen inmediatamente
      
      // Hacer signOut de Supabase - esto disparará el evento SIGNED_OUT en onAuthStateChange
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error('❌ Error al cerrar sesión:', error);
        // Aun así, el estado ya está limpiado arriba
      } else {
        console.log('✅ Sesión cerrada exitosamente en Supabase');
        // El evento SIGNED_OUT en onAuthStateChange manejará cualquier limpieza adicional
      }
    } catch (error) {
      console.error('❌ Error inesperado al cerrar sesión:', error);
      // El estado ya está limpiado arriba, así que la UI debería actualizarse
    }
  }, []);

  return {
    currentUser,
    realAdminUser,
    sessionLoading,
    isRecoveryMode,
    setCurrentUser,
    setRealAdminUser,
    setIsRecoveryMode,
    logout
  };
};

