import { useState, useCallback } from 'react';
import { Workout } from '../types';
import { getFriendWorkouts } from '../services/supabase';

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
  clearFriends: () => void;
}

export const useFriends = (): UseFriendsReturn => {
  const [activeFriends, setActiveFriends] = useState<ActiveFriend[]>([]);
  const [friendsWorkouts, setFriendsWorkouts] = useState<FriendsWorkout[]>([]);

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

  const clearFriends = useCallback(() => {
    setActiveFriends([]);
    setFriendsWorkouts([]);
  }, []);

  return {
    activeFriends,
    friendsWorkouts,
    toggleFriend,
    clearFriends
  };
};

