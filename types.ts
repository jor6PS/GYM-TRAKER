export interface Set {
  reps: number;
  weight: number;
  unit: string;
  rpe?: number; // Rate of Perceived Exertion (1-10)
}

export interface Exercise {
  name: string;
  sets: Set[];
}

export interface WorkoutData {
  exercises: Exercise[];
  notes?: string;
}

export interface Workout {
  id: string;
  user_id: string;
  date: string;
  structured_data: WorkoutData;
  source: 'web' | 'audio' | 'manual';
  created_at: string;
}

export interface WorkoutPlan {
  id: string;
  user_id?: string;
  name: string;
  exercises: Exercise[];
}

export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  created_at: string;
  avatar_url?: string;
}

export interface PersonalRecord {
  exerciseName: string;
  weight: number;
  unit: string;
  reps: number;
  date: string;
  estimated1RM?: number;
}

// --- SOCIAL TYPES ---

export type FriendshipStatus = 'pending' | 'accepted' | 'rejected';

export interface Friend {
  id: string; // The friend's user ID
  friendship_id: string;
  name: string;
  avatar_url?: string;
  status: FriendshipStatus;
  is_sender: boolean; // Did I send the request?
  color?: string; // UI Color assignment
}

export interface GroupAnalysisData {
  winner: string;
  loser: string;
  roast: string;
  comparison_table: {
      exercise: string;
      details: string[];
  }[];
}