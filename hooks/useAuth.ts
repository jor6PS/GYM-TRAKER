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
      
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true);
      }
      
      if (session) {
        await fetchUserProfile(session.user.id);
      } else {
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

