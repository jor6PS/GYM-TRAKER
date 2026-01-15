import { useState, useEffect, useCallback, useRef } from 'react';
import { Workout } from '../types';
import { format, isToday, parseISO } from 'date-fns';
import { supabase, getFriendships } from '../services/supabase';
import { getFriendWorkouts } from '../services/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

// Paleta de colores para amigos (debe coincidir con SocialModal y useFriends)
const FRIEND_COLORS = [
  '#38bdf8', '#f472b6', '#a78bfa', '#fb923c', '#2dd4bf', '#fbbf24', '#34d399',
  '#60a5fa', '#f87171', '#c084fc', '#22d3ee', '#f97316', '#14b8a6', '#8b5cf6',
  '#ec4899', '#06b6d4', '#3b82f6', '#ef4444', '#10b981', '#6366f1', '#84cc16',
  '#eab308', '#06b6d4', '#a855f7'
];

export interface Notification {
  id: string;
  friendId: string;
  friendName: string;
  friendColor: string;
  workoutId: string;
  workoutDate: string;
  exerciseCount: number;
  createdAt: string;
  read: boolean;
}

const NOTIFICATIONS_STORAGE_KEY = 'gym_tracker_notifications';
const LAST_CHECK_STORAGE_KEY = 'gym_tracker_last_check';

interface UseNotificationsReturn {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (notificationId: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  checkForNewNotifications: (friendsWorkouts: { userId: string; workouts: Workout[] }[], activeFriends: { userId: string; name: string; color: string }[]) => void;
}

// Obtener notificaciones desde localStorage
const getStoredNotifications = (): Notification[] => {
  try {
    const stored = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    if (!stored) return [];
    const notifications = JSON.parse(stored) as Notification[];
    // Limpiar notificaciones antiguas (más de 7 días)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return notifications.filter(n => new Date(n.createdAt) > sevenDaysAgo);
  } catch {
    return [];
  }
};

// Guardar notificaciones en localStorage
const saveNotifications = (notifications: Notification[]) => {
  try {
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications));
  } catch (error) {
    console.error('Error saving notifications:', error);
  }
};

// Obtener último timestamp de verificación
const getLastCheckTime = (): Date => {
  try {
    const stored = localStorage.getItem(LAST_CHECK_STORAGE_KEY);
    if (!stored) return new Date(0); // Si no hay timestamp, usar fecha muy antigua
    return new Date(stored);
  } catch {
    return new Date(0);
  }
};

// Guardar último timestamp de verificación
const saveLastCheckTime = () => {
  try {
    localStorage.setItem(LAST_CHECK_STORAGE_KEY, new Date().toISOString());
  } catch (error) {
    console.error('Error saving last check time:', error);
  }
};

export const useNotifications = (): UseNotificationsReturn => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const lastCheckedWorkoutIdsRef = useRef<Set<string>>(new Set());
  const isInitializedRef = useRef(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const allFriendsRef = useRef<Map<string, { name: string; color: string }>>(new Map());

  // Función para crear una notificación desde un workout
  const createNotificationFromWorkout = useCallback((workout: Workout, friendId: string, friendName: string, friendColor: string) => {
    if (!isInitializedRef.current) return;

    const workoutId = workout.id;
    
    // Verificar si ya hemos notificado sobre este workout
    if (lastCheckedWorkoutIdsRef.current.has(workoutId)) {
      return;
    }

    // Verificar si ya existe una notificación para este workout
    setNotifications(prev => {
      const existingNotification = prev.find(
        n => n.workoutId === workoutId && n.friendId === friendId
      );
      if (existingNotification) {
        return prev;
      }

      // Verificar que el workout es de hoy
      try {
        const workoutDate = typeof workout.date === 'string' ? parseISO(workout.date) : new Date(workout.date);
        if (!isToday(workoutDate)) {
          return prev;
        }
      } catch {
        return prev;
      }

      // Obtener cantidad de ejercicios
      const exerciseCount = workout.structured_data?.exercises?.length || 0;
      if (exerciseCount === 0) return prev;

      // Crear nueva notificación
      let workoutDateStr: string;
      const workoutDate = workout.date as any;
      if (typeof workoutDate === 'string') {
        workoutDateStr = workoutDate;
      } else if (workoutDate instanceof Date) {
        workoutDateStr = workoutDate.toISOString();
      } else {
        workoutDateStr = new Date(workoutDate).toISOString();
      }
      
      const notification: Notification = {
        id: `${workoutId}-${friendId}-${Date.now()}`,
        friendId,
        friendName,
        friendColor,
        workoutId,
        workoutDate: workoutDateStr,
        exerciseCount,
        createdAt: new Date().toISOString(),
        read: false
      };

      lastCheckedWorkoutIdsRef.current.add(workoutId);
      
      // Guardar IDs procesados
      try {
        localStorage.setItem(
          'gym_tracker_processed_workouts',
          JSON.stringify(Array.from(lastCheckedWorkoutIdsRef.current))
        );
      } catch (error) {
        console.error('Error saving processed workouts:', error);
      }

      return [notification, ...prev];
    });
  }, []);

  // Cargar notificaciones y configurar Realtime al iniciar
  useEffect(() => {
    const initialize = async () => {
      // Cargar notificaciones guardadas
      const stored = getStoredNotifications();
      setNotifications(stored);
      
      // Cargar IDs de workouts ya procesados
      const storedIds = localStorage.getItem('gym_tracker_processed_workouts');
      if (storedIds) {
        try {
          lastCheckedWorkoutIdsRef.current = new Set(JSON.parse(storedIds));
        } catch {
          lastCheckedWorkoutIdsRef.current = new Set();
        }
      }

      // Marcar inicialización antes de procesar workouts
      isInitializedRef.current = true;
      setIsInitialized(true);

      // Obtener lista de todos los amigos aceptados
      try {
        const friends = await getFriendships();
        const acceptedFriends = friends.filter(f => f.status === 'accepted');
        
        // Crear mapa de amigos con colores
        const friendsMap = new Map<string, { name: string; color: string }>();
        acceptedFriends.forEach((friend, idx) => {
          const color = FRIEND_COLORS[idx % FRIEND_COLORS.length];
          friendsMap.set(friend.id, { name: friend.name, color });
        });
        allFriendsRef.current = friendsMap;

        // Verificar workouts existentes de hoy que aún no se han notificado
        if (acceptedFriends.length > 0) {
          const friendIds = acceptedFriends.map(f => f.id);
          try {
            const allWorkouts = await getFriendWorkouts(friendIds);
            const todayWorkouts = allWorkouts.filter(workout => {
              try {
                const workoutDate = typeof workout.date === 'string' ? parseISO(workout.date) : new Date(workout.date);
                return isToday(workoutDate);
              } catch {
                return false;
              }
            });

            // Crear notificaciones para workouts de hoy que aún no se han procesado
            todayWorkouts.forEach(workout => {
              const friendInfo = allFriendsRef.current.get(workout.user_id);
              if (friendInfo) {
                createNotificationFromWorkout(workout, workout.user_id, friendInfo.name, friendInfo.color);
              }
            });
          } catch (error) {
            console.error('Error verificando workouts existentes:', error);
          }
        }

        // Configurar suscripción Realtime para escuchar cambios de todos los amigos
        if (acceptedFriends.length > 0) {
          // Limpiar suscripción anterior si existe
          if (channelRef.current) {
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
          }

          const channel = supabase
            .channel(`notifications-workouts-${Date.now()}`)
            .on(
              'postgres_changes',
              {
                event: 'INSERT',
                schema: 'public',
                table: 'workouts'
              },
              async (payload) => {
                // Cuando se inserta un nuevo workout, verificar si es de uno de nuestros amigos
                const newWorkout = payload.new as Workout;
                const friendId = newWorkout.user_id;
                
                // Verificar si es un amigo aceptado
                const friendInfo = allFriendsRef.current.get(friendId);
                if (friendInfo) {
                  console.log(`🔔 Nuevo workout detectado para amigo ${friendInfo.name} (${friendId})`);
                  
                  // El payload de Realtime puede no incluir structured_data completo
                  // Hacer una consulta para obtener el workout completo
                  try {
                    const { data: fullWorkout, error } = await supabase
                      .from('workouts')
                      .select('*')
                      .eq('id', newWorkout.id)
                      .single();
                    
                    if (error || !fullWorkout) {
                      console.error('Error obteniendo workout completo:', error);
                      return;
                    }

                    const workout = fullWorkout as Workout;
                    const exerciseCount = workout.structured_data?.exercises?.length || 0;
                    if (exerciseCount > 0) {
                      const workoutDate = typeof workout.date === 'string' 
                        ? parseISO(workout.date) 
                        : new Date(workout.date);
                      if (isToday(workoutDate)) {
                        createNotificationFromWorkout(workout, friendId, friendInfo.name, friendInfo.color);
                      }
                    }
                  } catch (error) {
                    console.error('Error procesando nuevo workout:', error);
                  }
                }
              }
            )
            .subscribe((status) => {
              if (status === 'SUBSCRIBED') {
                console.log('✅ Suscrito a cambios de workouts para notificaciones');
              } else if (status === 'CHANNEL_ERROR') {
                console.error('❌ Error en suscripción Realtime de notificaciones');
              }
            });

          channelRef.current = channel;
        }
      } catch (error) {
        console.error('Error inicializando notificaciones:', error);
      }
      
    };

    initialize();

    // Limpiar al desmontar
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [createNotificationFromWorkout]);

  // Actualizar lista de amigos periódicamente para detectar nuevos amigos
  useEffect(() => {
    if (!isInitialized) return;

    const updateFriendsList = async () => {
      try {
        const friends = await getFriendships();
        const acceptedFriends = friends.filter(f => f.status === 'accepted');
        
        // Actualizar mapa de amigos
        const friendsMap = new Map<string, { name: string; color: string }>();
        acceptedFriends.forEach((friend, idx) => {
          const color = FRIEND_COLORS[idx % FRIEND_COLORS.length];
          friendsMap.set(friend.id, { name: friend.name, color });
        });
        allFriendsRef.current = friendsMap;

        // Verificar workouts recientes para notificaciones (fallback si Realtime falla)
        if (acceptedFriends.length > 0) {
          try {
            const friendIds = acceptedFriends.map(f => f.id);
            const allWorkouts = await getFriendWorkouts(friendIds);
            const todayWorkouts = allWorkouts.filter(workout => {
              try {
                const workoutDate = typeof workout.date === 'string' ? parseISO(workout.date) : new Date(workout.date);
                return isToday(workoutDate);
              } catch {
                return false;
              }
            });

            todayWorkouts.forEach(workout => {
              const friendInfo = allFriendsRef.current.get(workout.user_id);
              if (friendInfo) {
                createNotificationFromWorkout(workout, workout.user_id, friendInfo.name, friendInfo.color);
              }
            });
          } catch (error) {
            console.error('Error verificando workouts recientes:', error);
          }
        }

        // Si hay nuevos amigos y no hay suscripción activa, crear una nueva
        if (acceptedFriends.length > 0 && !channelRef.current) {
          const channel = supabase
            .channel(`notifications-workouts-${Date.now()}`)
            .on(
              'postgres_changes',
              {
                event: 'INSERT',
                schema: 'public',
                table: 'workouts'
              },
              async (payload) => {
                const newWorkout = payload.new as Workout;
                const friendId = newWorkout.user_id;
                const friendInfo = allFriendsRef.current.get(friendId);
                if (friendInfo) {
                  console.log(`🔔 Nuevo workout detectado para amigo ${friendInfo.name} (${friendId})`);
                  const exerciseCount = newWorkout.structured_data?.exercises?.length || 0;
                  if (exerciseCount > 0) {
                    try {
                      const workoutDate = typeof newWorkout.date === 'string' 
                        ? parseISO(newWorkout.date) 
                        : new Date(newWorkout.date);
                      if (isToday(workoutDate)) {
                        createNotificationFromWorkout(newWorkout, friendId, friendInfo.name, friendInfo.color);
                      }
                    } catch (error) {
                      console.error('Error procesando fecha del workout:', error);
                    }
                  }
                }
              }
            )
            .subscribe((status) => {
              if (status === 'SUBSCRIBED') {
                console.log('✅ Suscrito a cambios de workouts para notificaciones');
              }
            });
          channelRef.current = channel;
        }
      } catch (error) {
        console.error('Error actualizando lista de amigos:', error);
      }
    };

    // Actualizar inmediatamente y luego cada minuto (fallback sin Realtime)
    updateFriendsList();
    const interval = setInterval(updateFriendsList, 60 * 1000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        updateFriendsList();
      }
    };

    window.addEventListener('focus', updateFriendsList);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', updateFriendsList);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [createNotificationFromWorkout, isInitialized]);

  // Guardar notificaciones cuando cambian
  useEffect(() => {
    if (isInitializedRef.current) {
      saveNotifications(notifications);
    }
  }, [notifications]);

  const checkForNewNotifications = useCallback((
    friendsWorkouts: { userId: string; workouts: Workout[] }[],
    activeFriends: { userId: string; name: string; color: string }[]
  ) => {
    if (!isInitializedRef.current) return;

    const friendMap = new Map(activeFriends.map(f => [f.userId, f]));
    const newNotifications: Notification[] = [];

    friendsWorkouts.forEach(({ userId, workouts }) => {
      const friend = friendMap.get(userId);
      if (!friend) return;

      // Filtrar workouts del día actual
      const todayWorkouts = workouts.filter(workout => {
        try {
          const workoutDate = typeof workout.date === 'string' ? parseISO(workout.date) : new Date(workout.date);
          return isToday(workoutDate);
        } catch {
          return false;
        }
      });

      todayWorkouts.forEach(workout => {
        const workoutId = workout.id;
        
        // Verificar si ya hemos notificado sobre este workout
        if (lastCheckedWorkoutIdsRef.current.has(workoutId)) {
          return;
        }

        // Verificar si ya existe una notificación para este workout
        const existingNotification = notifications.find(
          n => n.workoutId === workoutId && n.friendId === userId
        );
        if (existingNotification) {
          return;
        }

        // Obtener cantidad de ejercicios
        const exerciseCount = workout.structured_data?.exercises?.length || 0;
        if (exerciseCount === 0) return;

        // Crear nueva notificación
        let workoutDateStr: string;
        const workoutDate = workout.date as any;
        if (typeof workoutDate === 'string') {
          workoutDateStr = workoutDate;
        } else if (workoutDate instanceof Date) {
          workoutDateStr = workoutDate.toISOString();
        } else {
          workoutDateStr = new Date(workoutDate).toISOString();
        }
        
        const notification: Notification = {
          id: `${workoutId}-${userId}-${Date.now()}`,
          friendId: userId,
          friendName: friend.name,
          friendColor: friend.color,
          workoutId,
          workoutDate: workoutDateStr,
          exerciseCount,
          createdAt: new Date().toISOString(),
          read: false
        };

        newNotifications.push(notification);
        lastCheckedWorkoutIdsRef.current.add(workoutId);
      });
    });

    if (newNotifications.length > 0) {
      setNotifications(prev => [...newNotifications, ...prev]);
      
      // Guardar IDs procesados
      try {
        localStorage.setItem(
          'gym_tracker_processed_workouts',
          JSON.stringify(Array.from(lastCheckedWorkoutIdsRef.current))
        );
      } catch (error) {
        console.error('Error saving processed workouts:', error);
      }
    }

    // Limpiar IDs antiguos (más de 7 días) para evitar crecimiento infinito
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const idsToKeep = new Set<string>();
    
    friendsWorkouts.forEach(({ workouts }) => {
      workouts.forEach(workout => {
        try {
          const workoutDate = typeof workout.date === 'string' ? parseISO(workout.date) : new Date(workout.date);
          if (workoutDate.getTime() > sevenDaysAgo) {
            idsToKeep.add(workout.id);
          }
        } catch {
          // Ignorar workouts con fechas inválidas
        }
      });
    });

    // Limpiar IDs que ya no existen en los workouts actuales
    lastCheckedWorkoutIdsRef.current = new Set(
      Array.from(lastCheckedWorkoutIdsRef.current).filter(id => idsToKeep.has(id))
    );

    // Guardar IDs actualizados
    try {
      localStorage.setItem(
        'gym_tracker_processed_workouts',
        JSON.stringify(Array.from(lastCheckedWorkoutIdsRef.current))
      );
    } catch (error) {
      console.error('Error saving processed workouts:', error);
    }
  }, [notifications]);

  const markAsRead = useCallback((notificationId: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === notificationId ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    lastCheckedWorkoutIdsRef.current.clear();
    try {
      localStorage.removeItem(NOTIFICATIONS_STORAGE_KEY);
      localStorage.removeItem('gym_tracker_processed_workouts');
    } catch (error) {
      console.error('Error clearing notifications:', error);
    }
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearNotifications,
    checkForNewNotifications
  };
};

