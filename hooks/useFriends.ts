import { useState, useCallback, useEffect, useRef } from 'react';
import { Workout } from '../types';
import { getFriendWorkouts, supabase } from '../services/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

// Paleta de colores para amigos (debe coincidir con SocialModal)
const FRIEND_COLORS = [
  '#38bdf8', '#f472b6', '#a78bfa', '#fb923c', '#2dd4bf', '#fbbf24', '#34d399',
  '#60a5fa', '#f87171', '#c084fc', '#22d3ee', '#f97316', '#14b8a6', '#8b5cf6',
  '#ec4899', '#06b6d4', '#3b82f6', '#ef4444', '#10b981', '#6366f1', '#84cc16',
  '#eab308', '#06b6d4', '#a855f7'
];

interface ActiveFriend {
  userId: string;
  name: string;
  color: string;
}

interface FriendsWorkout {
  userId: string;
  workouts: Workout[];
}

interface UseFriendsReturn {
  activeFriends: ActiveFriend[];
  friendsWorkouts: FriendsWorkout[];
  toggleFriend: (friendId: string, friendName: string, color: string) => Promise<void>;
  toggleAllFriends: (allFriends: { id: string; name: string }[]) => Promise<void>;
  clearFriends: () => void;
}

export const useFriends = (): UseFriendsReturn => {
  const [activeFriends, setActiveFriends] = useState<ActiveFriend[]>([]);
  const [friendsWorkouts, setFriendsWorkouts] = useState<FriendsWorkout[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const activeFriendsIdsRef = useRef<Set<string>>(new Set());

  // Función para actualizar workouts de un amigo específico
  const refreshFriendWorkouts = useCallback(async (friendId: string) => {
    try {
      const workouts = await getFriendWorkouts([friendId]);
      setFriendsWorkouts(prev => {
        const existing = prev.find(fw => fw.userId === friendId);
        // Solo actualizar si hay cambios
        const existingIds = new Set(existing?.workouts.map(w => w.id) || []);
        const newIds = new Set(workouts.map(w => w.id));
        const hasChanges = newIds.size > existingIds.size || 
                          Array.from(newIds).some(id => !existingIds.has(id));
        
        if (!existing || hasChanges) {
          return [
            ...prev.filter(fw => fw.userId !== friendId),
            { userId: friendId, workouts }
          ];
        }
        return prev;
      });
    } catch (error) {
      console.error(`Error refreshing workouts for friend ${friendId}:`, error);
    }
  }, []);

  // Función para actualizar workouts de todos los amigos activos
  const refreshAllFriendsWorkouts = useCallback(async () => {
    if (activeFriends.length === 0) return;

    try {
      const friendIds = activeFriends.map(f => f.userId);
      const allWorkouts = await getFriendWorkouts(friendIds);
      
      // Agrupar workouts por userId
      const workoutsByFriend = new Map<string, Workout[]>();
      allWorkouts.forEach(workout => {
        if (!workoutsByFriend.has(workout.user_id)) {
          workoutsByFriend.set(workout.user_id, []);
        }
        workoutsByFriend.get(workout.user_id)!.push(workout);
      });

      // Actualizar workouts, siempre creando un nuevo array para que React detecte cambios
      setFriendsWorkouts(prev => {
        const updated: FriendsWorkout[] = [];
        
        activeFriends.forEach(friend => {
          const newWorkouts = workoutsByFriend.get(friend.userId) || [];
          const existing = prev.find(fw => fw.userId === friend.userId);
          
          // Comparar usando Set de IDs para detectar cambios independientemente del orden
          const existingIds = new Set(existing?.workouts.map(w => w.id) || []);
          const newIds = new Set(newWorkouts.map(w => w.id));
          
          const hasNewWorkouts = newIds.size > existingIds.size || 
                                 Array.from(newIds).some(id => !existingIds.has(id));
          
          if (!existing || hasNewWorkouts) {
            // Crear nuevo objeto con nuevos workouts
            updated.push({ userId: friend.userId, workouts: newWorkouts });
          } else {
            // Mantener referencia existente si no hay cambios (optimización)
            updated.push(existing);
          }
        });
        
        // Siempre retornar nuevo array para que React detecte cambios
        return updated;
      });
    } catch (error) {
      console.error('Error refreshing friends workouts:', error);
    }
  }, [activeFriends]);

  // Actualizar ref cuando cambian los amigos activos
  useEffect(() => {
    activeFriendsIdsRef.current = new Set(activeFriends.map(f => f.userId));
  }, [activeFriends]);

  // Configurar Realtime subscription cuando hay amigos activos
  useEffect(() => {
    // Limpiar suscripción anterior si existe
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // Si hay amigos activos, configurar Realtime subscription
    if (activeFriends.length > 0) {
      // Cargar workouts inicialmente
      refreshAllFriendsWorkouts();

      // Suscribirse a cambios en la tabla workouts
      // Nota: Supabase Realtime no soporta filtros 'in' directamente,
      // así que nos suscribimos a todos los INSERTs y filtramos en el callback
      const channel = supabase
        .channel(`friends-workouts-changes-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'workouts'
          },
          (payload) => {
            // Cuando se inserta un nuevo workout, verificar si es de uno de nuestros amigos
            const newWorkout = payload.new as Workout;
            const friendId = newWorkout.user_id;
            
            // Usar el ref para verificar si el amigo sigue activo (evita problemas de closure)
            if (activeFriendsIdsRef.current.has(friendId)) {
              console.log(`🔔 Nuevo workout detectado para amigo ${friendId}`);
              refreshFriendWorkouts(friendId);
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('✅ Suscrito a cambios de workouts de amigos');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ Error en suscripción Realtime');
          } else if (status === 'TIMED_OUT') {
            console.warn('⏱️ Timeout en suscripción Realtime');
          } else if (status === 'CLOSED') {
            console.log('🔌 Canal Realtime cerrado');
          }
        });

      channelRef.current = channel;
    }

    // Limpiar al desmontar o cuando cambien los amigos
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [activeFriends, refreshAllFriendsWorkouts, refreshFriendWorkouts]);

  const toggleFriend = useCallback(async (friendId: string, friendName: string, color: string) => {
    const existingFriend = activeFriends.find(f => f.userId === friendId);
    
    if (existingFriend) {
      // Remove friend
      setActiveFriends(prev => prev.filter(f => f.userId !== friendId));
      setFriendsWorkouts(prev => prev.filter(fw => fw.userId !== friendId));
    } else {
      // Add friend
      const workouts = await getFriendWorkouts([friendId]);
      setFriendsWorkouts(prev => [
        ...prev.filter(p => p.userId !== friendId),
        { userId: friendId, workouts }
      ]);
      setActiveFriends(prev => [...prev, { userId: friendId, name: friendName, color }]);
    }
  }, [activeFriends]);

  const toggleAllFriends = useCallback(async (allFriends: { id: string; name: string }[]) => {
    // Si todos los amigos ya están activos, deseleccionarlos todos
    const allActive = allFriends.length > 0 && 
                      allFriends.every(friend => activeFriends.some(af => af.userId === friend.id));
    
    if (allActive) {
      // Deseleccionar todos
      setActiveFriends([]);
      setFriendsWorkouts([]);
    } else {
      // Seleccionar todos los amigos que no estén ya activos
      const friendsToAdd = allFriends.filter(
        friend => !activeFriends.some(af => af.userId === friend.id)
      );
      
      if (friendsToAdd.length > 0) {
        // Cargar workouts de todos los amigos a agregar
        const friendIds = friendsToAdd.map(f => f.id);
        const allWorkouts = await getFriendWorkouts(friendIds);
        
        // Agrupar workouts por userId
        const workoutsByFriend = new Map<string, Workout[]>();
        allWorkouts.forEach(workout => {
          if (!workoutsByFriend.has(workout.user_id)) {
            workoutsByFriend.set(workout.user_id, []);
          }
          workoutsByFriend.get(workout.user_id)!.push(workout);
        });
        
        // Agregar todos los amigos con sus colores
        const newActiveFriends: ActiveFriend[] = friendsToAdd.map((friend, idx) => {
          // Usar el índice relativo a todos los amigos para asignar colores consistentes
          const allFriendsIndex = allFriends.findIndex(f => f.id === friend.id);
          const color = FRIEND_COLORS[allFriendsIndex % FRIEND_COLORS.length];
          return {
            userId: friend.id,
            name: friend.name,
            color
          };
        });
        
        const newFriendsWorkouts: FriendsWorkout[] = friendsToAdd.map(friend => ({
          userId: friend.id,
          workouts: workoutsByFriend.get(friend.id) || []
        }));
        
        setActiveFriends(prev => [...prev, ...newActiveFriends]);
        setFriendsWorkouts(prev => [...prev, ...newFriendsWorkouts]);
      }
    }
  }, [activeFriends]);

  const clearFriends = useCallback(() => {
    setActiveFriends([]);
    setFriendsWorkouts([]);
    // Limpiar suscripción cuando se limpian los amigos
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  return {
    activeFriends,
    friendsWorkouts,
    toggleFriend,
    toggleAllFriends,
    clearFriends
  };
};

