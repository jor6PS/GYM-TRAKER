
import { MetricType } from '../types';

export interface ExerciseDef {
  id: string;
  en: string;
  es: string;
  category: string; // Obligatorio para la auditoría
  type?: MetricType;
}

export const EXERCISE_DB: ExerciseDef[] = [
  // --- CHEST (Push / Anterior) ---
  { id: 'bench_press_barbell', en: "Barbell Bench Press", es: "Press Banca (Barra)", category: "Chest" },
  { id: 'bench_press_dumbbell', en: "Dumbbell Bench Press", es: "Press Banca (Mancuernas)", category: "Chest" },
  { id: 'incline_bench_barbell', en: "Incline Barbell Bench Press", es: "Press Inclinado (Barra)", category: "Chest" },
  { id: 'dips_chest', en: "Dips", es: "Fondos", category: "Chest" },
  { id: 'push_ups', en: "Push Ups", es: "Flexiones", category: "Chest" },
  { id: 'chest_press_machine', en: "Machine Chest Press", es: "Press de Pecho (Máquina)", category: "Chest" },

  // --- BACK (Pull / Posterior) ---
  { id: 'deadlift', en: "Deadlift", es: "Peso Muerto", category: "Back" },
  { id: 'pull_up', en: "Pull Up", es: "Dominadas", category: "Back" },
  { id: 'lat_pulldown_wide', en: "Lat Pulldown", es: "Jalón al Pecho", category: "Back" },
  { id: 'barbell_row', en: "Barbell Row", es: "Remo con Barra", category: "Back" },
  { id: 'cable_row', en: "Seated Cable Row", es: "Remo en Polea Baja", category: "Back" },
  { id: 'face_pull', en: "Face Pull", es: "Face Pull", category: "Shoulders" },

  // --- SHOULDERS (Push / Anterior-Medial) ---
  { id: 'overhead_press_barbell', en: "Barbell Overhead Press", es: "Press Militar (Barra)", category: "Shoulders" },
  { id: 'shoulder_press_machine', en: "Machine Shoulder Press", es: "Press de Hombros (Máquina)", category: "Shoulders" },
  { id: 'lateral_raise_dumbbell', en: "Dumbbell Lateral Raise", es: "Elevaciones Laterales", category: "Shoulders" },

  // --- LEGS (Anterior) ---
  { id: 'squat_barbell', en: "Barbell Squat", es: "Sentadilla (Barra)", category: "Quads" },
  { id: 'front_squat', en: "Front Squat", es: "Sentadilla Frontal", category: "Quads" },
  { id: 'leg_extension', en: "Leg Extension", es: "Extensiones de Cuádriceps", category: "Quads" },
  { id: 'leg_press', en: "Leg Press", es: "Prensa de Piernas", category: "Quads" },

  // --- LEGS (Posterior) ---
  { id: 'hip_thrust', en: "Hip Thrust", es: "Hip Thrust / Puente de Glúteo", category: "Gluteos" },
  { id: 'leg_curl_lying', en: "Lying Leg Curl", es: "Curl Femoral Tumbado", category: "Femorales" },
  { id: 'calf_raise_seated', en: "Seated Calf Raise", es: "Elevación de Gemelos Sentado", category: "Gemelos" },

  // --- ARMS ---
  { id: 'bicep_curl_barbell', en: "Barbell Curl", es: "Curl de Bíceps (Barra)", category: "Biceps" },
  { id: 'curl_dumbbell', en: "Dumbbell Curl", es: "Curl con Mancuernas", category: "Biceps" },
  { id: 'overhead_tricep_extension', en: "Overhead Tricep Extension", es: "Extensión de Tríceps sobre cabeza", category: "Triceps" },

  // --- CORE ---
  { id: 'ab_wheel', en: "Ab Wheel", es: "Rueda Abdominal", category: "Abs" }
].sort((a, b) => a.es.localeCompare(b.es));
