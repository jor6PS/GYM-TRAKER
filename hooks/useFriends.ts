import { useState, useCallback, useEffect, useRef } from 'react';
import { Workout } from '../types';
import { getFriendWorkouts, isConfigured, supabase } from '../services/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

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

  const refreshFriendWorkouts = useCallback(async (friendId: string) => {
    try {
      const workouts = await getFriendWorkouts([friendId]);
      setFriendsWorkouts(prev => {
        const existing = prev.find(fw => fw.userId === friendId);
        const existingIds = new Set(existing?.workouts.map(w => w.id) || []);
        const newIds = new Set(workouts.map(w => w.id));
        const hasChanges =
          newIds.size > existingIds.size || Array.from(newIds).some(id => !existingIds.has(id));

        if (!existing || hasChanges) {
          return [...prev.filter(fw => fw.userId !== friendId), { userId: friendId, workouts }];
        }
        return prev;
      });
    } catch (error) {
      console.error(`Error refreshing workouts for friend ${friendId}:`, error);
    }
  }, []);

  const refreshAllFriendsWorkouts = useCallback(async () => {
    if (!isConfigured || activeFriends.length === 0) return;

    try {
      const friendIds = activeFriends.map(f => f.userId);
      const allWorkouts = await getFriendWorkouts(friendIds);

      const workoutsByFriend = new Map<string, Workout[]>();
      allWorkouts.forEach(workout => {
        if (!workoutsByFriend.has(workout.user_id)) {
          workoutsByFriend.set(workout.user_id, []);
        }
        workoutsByFriend.get(workout.user_id)!.push(workout);
      });

      setFriendsWorkouts(prev => {
        const updated: FriendsWorkout[] = [];

        activeFriends.forEach(friend => {
          const newWorkouts = workoutsByFriend.get(friend.userId) || [];
          const existing = prev.find(fw => fw.userId === friend.userId);
          const existingIds = new Set(existing?.workouts.map(w => w.id) || []);
          const newIds = new Set(newWorkouts.map(w => w.id));

          const hasNewWorkouts =
            newIds.size > existingIds.size || Array.from(newIds).some(id => !existingIds.has(id));

          if (!existing || hasNewWorkouts) {
            updated.push({ userId: friend.userId, workouts: newWorkouts });
          } else {
            updated.push(existing);
          }
        });

        return updated;
      });
    } catch (error) {
      console.error('Error refreshing friends workouts:', error);
    }
  }, [activeFriends]);

  useEffect(() => {
    activeFriendsIdsRef.current = new Set(activeFriends.map(f => f.userId));
  }, [activeFriends]);

  useEffect(() => {
    if (!isConfigured) {
      setActiveFriends([]);
      setFriendsWorkouts([]);
      return;
    }

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    if (activeFriends.length > 0) {
      refreshAllFriendsWorkouts();

      const channel = supabase
        .channel(`friends-workouts-changes-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'workouts'
          },
          payload => {
            const newWorkout = payload.new as Workout;
            const friendId = newWorkout.user_id;

            if (activeFriendsIdsRef.current.has(friendId)) {
              console.log(`New workout detected for friend ${friendId}`);
              refreshFriendWorkouts(friendId);
            }
          }
        )
        .subscribe(status => {
          if (status === 'SUBSCRIBED') {
            console.log('Subscribed to friends workout changes');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('Realtime subscription error');
          } else if (status === 'TIMED_OUT') {
            console.warn('Realtime subscription timed out');
          } else if (status === 'CLOSED') {
            console.log('Realtime channel closed');
          }
        });

      channelRef.current = channel;
    }

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [activeFriends, refreshAllFriendsWorkouts, refreshFriendWorkouts]);

  const toggleFriend = useCallback(async (friendId: string, friendName: string, color: string) => {
    if (!isConfigured) return;

    const existingFriend = activeFriends.find(f => f.userId === friendId);

    if (existingFriend) {
      setActiveFriends(prev => prev.filter(f => f.userId !== friendId));
      setFriendsWorkouts(prev => prev.filter(fw => fw.userId !== friendId));
    } else {
      const workouts = await getFriendWorkouts([friendId]);
      setFriendsWorkouts(prev => [
        ...prev.filter(p => p.userId !== friendId),
        { userId: friendId, workouts }
      ]);
      setActiveFriends(prev => [...prev, { userId: friendId, name: friendName, color }]);
    }
  }, [activeFriends]);

  const toggleAllFriends = useCallback(async (allFriends: { id: string; name: string }[]) => {
    if (!isConfigured) return;

    const allActive =
      allFriends.length > 0 && allFriends.every(friend => activeFriends.some(af => af.userId === friend.id));

    if (allActive) {
      setActiveFriends([]);
      setFriendsWorkouts([]);
    } else {
      const friendsToAdd = allFriends.filter(friend => !activeFriends.some(af => af.userId === friend.id));

      if (friendsToAdd.length > 0) {
        const friendIds = friendsToAdd.map(f => f.id);
        const allWorkouts = await getFriendWorkouts(friendIds);

        const workoutsByFriend = new Map<string, Workout[]>();
        allWorkouts.forEach(workout => {
          if (!workoutsByFriend.has(workout.user_id)) {
            workoutsByFriend.set(workout.user_id, []);
          }
          workoutsByFriend.get(workout.user_id)!.push(workout);
        });

        const newActiveFriends: ActiveFriend[] = friendsToAdd.map(friend => {
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
