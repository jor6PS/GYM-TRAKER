export interface Set {
  reps: number;
  weight: number;
  unit: string;
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
  user_id: string; // Changed to match Supabase column
  date: string;
  structured_data: WorkoutData;
  source: 'web' | 'audio' | 'manual';
  created_at: string;
}

export interface WorkoutPlan {
  id: string;
  user_id?: string; // Changed to match Supabase column
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
}