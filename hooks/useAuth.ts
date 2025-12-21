import { useState, useEffect, useCallback } from 'react';
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

  const fetchUserProfile = useCallback(async (userId: string) => {
    try {
      const profile = await getCurrentProfile();
      if (profile) {
        setCurrentUser(profile as User);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
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
      setSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await fetchUserProfile(session.user.id);
      } else {
        setSessionLoading(false);
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true);
      }
      
      if (session) {
        if (!currentUser) {
          fetchUserProfile(session.user.id);
        }
      } else {
        setCurrentUser(null);
        setRealAdminUser(null);
        setSessionLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [currentUser, fetchUserProfile]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setRealAdminUser(null);
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

