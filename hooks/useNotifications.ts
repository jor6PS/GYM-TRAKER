import { useState, useEffect, useCallback, useRef } from 'react';
import { Workout } from '../types';
import { format, isToday, parseISO } from 'date-fns';

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
  const lastCheckedWorkoutIdsRef = useRef<Set<string>>(new Set());
  const isInitializedRef = useRef(false);

  // Cargar notificaciones al iniciar
  useEffect(() => {
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
    
    isInitializedRef.current = true;
  }, []);

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

