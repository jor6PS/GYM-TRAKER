
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
  // New fields for PR tracking
  value: number; // Generic value for sorting (weight or distance)
  displayValue: string; // Formatted string
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

export interface ComparisonRow {
  exercise: string;
  results: { userName: string; value: number; display: string }[];
  winnerName: string;
  metric: string; // 'kg', 'km', 'mins'
}

export interface RankingEntry {
  name: string;
  rank: number;
  reason: string; // Short AI reason like "Highest Volume" or "Skipped Leg Day"
}

export interface UserStatsProfile {
    name: string;
    stats: {
        exercise: string;
        display: string;
        metric: string; // 'kg', 'km', 'mins'
        value: number;
    }[];
}

export interface Highlight {
    title: string; // "Titan Lift"
    value: string; // "140kg Deadlift"
    description: string; // "Moved a small car."
    type: 'strength' | 'consistency'; // Removed 'cardio' as highlight type preference
}

export interface MonthlyMaxEntry {
    exercise: string;
    weight: number;
    unit: string;
}

export interface GlobalReportData {
  // Section 1: Global Fun Facts (Volume Only)
  totalVolumeKg: number;
  volumeComparison: string; 
  volumeType: string; // 'car' | 'animal' | 'building' | 'plane' | 'rocket' | 'mountain' | 'default'
  globalVerdict: string; 

  // Section 2: Monthly Comparison
  monthName: string;
  monthlyAnalysisText: string;
  
  // Section 3: Highlights
  highlights: Highlight[];

  // Section 4: Monthly Maxes List
  monthlyMaxes: MonthlyMaxEntry[];
}

export interface GroupAnalysisData {
  winner: string; // From AI judgment (Alpha)
  loser: string; // From AI judgment (Beta)
  rankings: RankingEntry[]; // Full ordered list
  roast: string; // From AI
  comparison_table: ComparisonRow[]; // Calculated Locally
  points_table: { name: string; points: number }[]; // Calculated Locally
  individual_records: UserStatsProfile[]; // New Top 10 per user
}
