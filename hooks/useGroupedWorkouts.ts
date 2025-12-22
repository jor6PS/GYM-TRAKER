import { useMemo } from 'react';
import { Workout, User } from '../types';
import { isSameDay } from 'date-fns';
import { parseLocalDate } from '../utils';

interface ActiveFriend {
  userId: string;
  name: string;
  color: string;
}

interface FriendsWorkout {
  userId: string;
  workouts: Workout[];
}

interface GroupedLog {
  id: string;
  name: string;
  isMe: boolean;
  color: string;
  workouts: Workout[];
}

export const useGroupedWorkouts = (
  workouts: Workout[],
  friendsWorkouts: FriendsWorkout[],
  activeFriends: ActiveFriend[],
  selectedDate: Date,
  currentUser: User | null
): GroupedLog[] => {
  return useMemo(() => {
    if (!currentUser) return [];

    const myWorkouts = workouts.filter(w => 
      isSameDay(parseLocalDate(w.date), selectedDate)
    );

    const friendsWorkoutsForDate = activeFriends.flatMap(f => {
      const friendWorkouts = friendsWorkouts.find(fw => fw.userId === f.userId)?.workouts || [];
      return friendWorkouts
        .filter(w => isSameDay(parseLocalDate(w.date), selectedDate))
        .map(w => ({
          ...w,
          _friendColor: f.color,
          _friendId: f.userId,
          _friendName: f.name
        }));
    });

    const groups: GroupedLog[] = [];
    
    if (myWorkouts.length > 0) {
      groups.push({
        id: currentUser.id,
        name: currentUser.name,
        isMe: true,
        color: '#D4FF00',
        workouts: myWorkouts
      });
    }

    const friendsMap = new Map<string, GroupedLog>();
    friendsWorkoutsForDate.forEach(w => {
      const friendId = (w as any)._friendId;
      if (!friendsMap.has(friendId)) {
        friendsMap.set(friendId, {
          id: friendId,
          name: (w as any)._friendName,
          isMe: false,
          color: (w as any)._friendColor,
          workouts: []
        });
      }
      friendsMap.get(friendId)!.workouts.push(w);
    });

    return [...groups, ...Array.from(friendsMap.values())];
  }, [workouts, friendsWorkouts, activeFriends, selectedDate, currentUser]);
};

