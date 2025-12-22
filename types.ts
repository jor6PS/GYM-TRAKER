

export type MetricType = 'strength' | 'cardio';

export interface Set {
  reps?: number;
  weight?: number;
  unit: string; 
  distance?: number;
  time?: string; 
  rpe?: number; 
}

export interface Exercise {
  name: string;
  category?: string; // Nuevo: Músculo objetivo (Chest, Back, etc.)
  type?: MetricType; // Nuevo: Tipo de carga (Strength, Cardio)
  sets: Set[];
  unilateral?: boolean; // Indica si el ejercicio se ejecutó de manera unilateral (peso registrado es la mitad del real)
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
  user_weight?: number; 
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
  weight?: number;
  height?: number;
  age?: number;
}

export interface Friend {
  id: string;
  friendship_id: string;
  name: string;
  avatar_url?: string;
  status: 'pending' | 'accepted' | 'rejected';
  is_sender: boolean;
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

export interface MaxComparisonEntry {
    exercise: string;
    monthlyMax: number;
    globalMax: number;
    unit: string;
    isBodyweight: boolean;
}

export interface GlobalReportData {
  totalVolumeKg: number;
  volumeEquivalentGlobal: string; 
  monthlyVolumeKg: number;
  volumeEquivalentMonthly: string;
  monthName: string;
  monthlyAnalysisText: string;
  efficiencyScore: number;
  maxComparison: MaxComparisonEntry[];
}

// Added GroupAnalysisData and supporting interfaces for Arena mode
export interface RankingEntry {
  rank: number;
  name: string;
  reason: string;
}

export interface VolumeEntry {
  name: string;
  total_volume_kg: number;
}

export interface PointsEntry {
  name: string;
  points: number;
}

export interface ComparisonResult {
  userName: string;
  display: string;
}

export interface ComparisonEntry {
  exercise: string;
  winnerName: string;
  results: ComparisonResult[];
}

export interface IndividualStat {
  exercise: string;
  display: string;
  metric: string;
}

export interface IndividualRecord {
  name: string;
  stats: IndividualStat[];
}

export interface GroupAnalysisData {
  winner: string | 'DRAW';
  loser?: string;
  rankings: RankingEntry[];
  volume_table: VolumeEntry[];
  volume_verdict: string;
  points_table: PointsEntry[];
  comparison_table: ComparisonEntry[];
  individual_records: IndividualRecord[];
  roast: string;
}
