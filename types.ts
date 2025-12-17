
export type MetricType = 'strength' | 'cardio';

export interface Set {
  reps?: number;
  weight?: number;
  unit: string; // 'kg', 'lbs', 'km', 'm', 'mins'
  distance?: number;
  time?: string; // Format "MM:SS" or raw minutes string
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
  value: number; 
  displayValue: string; 
}

export type FriendshipStatus = 'pending' | 'accepted' | 'rejected';

export interface Friend {
  id: string; 
  friendship_id: string;
  name: string;
  avatar_url?: string;
  status: FriendshipStatus;
  is_sender: boolean; 
  color?: string; 
}

export interface ComparisonRow {
  exercise: string;
  results: { userName: string; value: number; display: string }[];
  winnerName: string;
  metric: string; 
}

export interface RankingEntry {
  name: string;
  rank: number;
  reason: string; 
}

export interface UserStatsProfile {
    name: string;
    stats: {
        exercise: string;
        display: string;
        metric: string; 
        value: number;
    }[];
}

export interface Highlight {
    title: string;
    value: string;
    description: string;
    type: 'strength' | 'consistency';
}

export interface MonthlyMaxEntry {
    exercise: string;
    value: number;
    unit: string; 
    isBodyweight: boolean;
}

export interface GlobalReportData {
  totalVolumeKg: number;
  volumeComparison: string; 
  volumeType: string;
  monthlyVolumeKg: number;
  monthlyVolumeComparison: string;
  monthlyVolumeType: string;
  monthName: string;
  monthlyAnalysisText: string;
  efficiencyScore: number;
  monthlyMaxes: MonthlyMaxEntry[];
}

export interface GroupAnalysisData {
  winner: string; 
  loser: string; 
  rankings: RankingEntry[]; 
  roast: string; 
  comparison_table: ComparisonRow[]; 
  points_table: { name: string; points: number }[]; 
  volume_table: { name: string; total_volume_kg: number }[]; 
  volume_verdict: string; 
  individual_records: UserStatsProfile[]; 
}
