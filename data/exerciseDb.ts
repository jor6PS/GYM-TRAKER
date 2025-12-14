export interface ExerciseDef {
  id: string;
  en: string;
  es: string;
  category?: string;
}

export const EXERCISE_DB: ExerciseDef[] = [
  // CHEST
  { id: 'bench_press_barbell', en: "Bench Press (Barbell)", es: "Press Banca (Barra)" },
  { id: 'bench_press_dumbbell', en: "Bench Press (Dumbbell)", es: "Press Banca (Mancuernas)" },
  { id: 'incline_bench_barbell', en: "Incline Bench Press (Barbell)", es: "Press Inclinado (Barra)" },
  { id: 'incline_bench_dumbbell', en: "Incline Bench Press (Dumbbell)", es: "Press Inclinado (Mancuernas)" },
  { id: 'decline_bench', en: "Decline Bench Press", es: "Press Declinado" },
  { id: 'chest_fly_dumbbell', en: "Chest Fly (Dumbbell)", es: "Aperturas (Mancuernas)" },
  { id: 'chest_fly_cable', en: "Chest Fly (Cable)", es: "Cruces en Polea" },
  { id: 'pec_deck', en: "Pec Deck Machine", es: "Máquina Contractora (Pec Deck)" },
  { id: 'chest_press_machine', en: "Chest Press Machine", es: "Press de Pecho en Máquina" },
  { id: 'push_ups', en: "Push Ups", es: "Flexiones" },
  { id: 'dips_chest', en: "Dips (Chest Focus)", es: "Fondos (Pecho)" },
  { id: 'pullover_dumbbell', en: "Pullover (Dumbbell)", es: "Pullover (Mancuerna)" },

  // BACK
  { id: 'deadlift', en: "Deadlift (Conventional)", es: "Peso Muerto (Convencional)" },
  { id: 'deadlift_sumo', en: "Deadlift (Sumo)", es: "Peso Muerto Sumo" },
  { id: 'pull_up', en: "Pull Up", es: "Dominadas" },
  { id: 'chin_up', en: "Chin Up", es: "Dominadas Supinas (Chin Ups)" },
  { id: 'lat_pulldown', en: "Lat Pulldown", es: "Jalón al Pecho" },
  { id: 'barbell_row', en: "Barbell Row", es: "Remo con Barra" },
  { id: 'dumbbell_row', en: "Dumbbell Row", es: "Remo con Mancuerna" },
  { id: 'cable_row', en: "Cable Row", es: "Remo en Polea Baja" },
  { id: 't_bar_row', en: "T-Bar Row", es: "Remo en Punta (T-Bar)" },
  { id: 'face_pull', en: "Face Pull", es: "Face Pull" },
  { id: 'back_extension', en: "Back Extension", es: "Extensiones Lumbares" },

  // LEGS
  { id: 'squat_barbell', en: "Barbell Squat", es: "Sentadilla (Barra)" },
  { id: 'front_squat', en: "Front Squat", es: "Sentadilla Frontal" },
  { id: 'goblet_squat', en: "Goblet Squat", es: "Sentadilla Goblet" },
  { id: 'leg_press', en: "Leg Press", es: "Prensa de Piernas" },
  { id: 'leg_extension', en: "Leg Extension", es: "Extensiones de Cuádriceps" },
  { id: 'lunges_dumbbell', en: "Lunges (Dumbbell)", es: "Zancadas (Mancuernas)" },
  { id: 'bulgarian_split_squat', en: "Bulgarian Split Squat", es: "Sentadilla Búlgara" },
  { id: 'rdl_barbell', en: "Romanian Deadlift (Barbell)", es: "Peso Muerto Rumano (Barra)" },
  { id: 'leg_curl_seated', en: "Leg Curl (Seated)", es: "Curl Femoral Sentado" },
  { id: 'leg_curl_lying', en: "Leg Curl (Lying)", es: "Curl Femoral Tumbado" },
  { id: 'hip_thrust', en: "Hip Thrust", es: "Hip Thrust" },
  { id: 'calf_raise_standing', en: "Calf Raise (Standing)", es: "Elevación de Gemelos (Pie)" },
  { id: 'calf_raise_seated', en: "Calf Raise (Seated)", es: "Elevación de Gemelos (Sentado)" },

  // SHOULDERS
  { id: 'overhead_press_barbell', en: "Overhead Press (Barbell)", es: "Press Militar (Barra)" },
  { id: 'overhead_press_dumbbell', en: "Overhead Press (Dumbbell)", es: "Press Militar (Mancuernas)" },
  { id: 'arnold_press', en: "Arnold Press", es: "Press Arnold" },
  { id: 'lateral_raise_dumbbell', en: "Lateral Raise (Dumbbell)", es: "Elevaciones Laterales" },
  { id: 'lateral_raise_cable', en: "Lateral Raise (Cable)", es: "Elevaciones Laterales (Polea)" },
  { id: 'front_raise', en: "Front Raise", es: "Elevaciones Frontales" },
  { id: 'rear_delt_fly', en: "Rear Delt Fly (Dumbbell)", es: "Pájaros (Posterior)" },
  { id: 'shrugs', en: "Shrugs", es: "Encogimientos (Trapecio)" },

  // ARMS
  { id: 'bicep_curl_barbell', en: "Bicep Curl (Barbell)", es: "Curl de Bíceps (Barra)" },
  { id: 'bicep_curl_dumbbell', en: "Bicep Curl (Dumbbell)", es: "Curl de Bíceps (Mancuernas)" },
  { id: 'hammer_curl', en: "Hammer Curl", es: "Curl Martillo" },
  { id: 'preacher_curl', en: "Preacher Curl", es: "Curl Predicador" },
  { id: 'tricep_pushdown', en: "Tricep Pushdown (Cable)", es: "Extensiones de Tríceps (Polea)" },
  { id: 'skullcrushers', en: "Skullcrushers", es: "Rompecráneos" },
  { id: 'dips_tricep', en: "Dips (Tricep Focus)", es: "Fondos (Tríceps)" },

  // ABS / CARDIO
  { id: 'plank', en: "Plank", es: "Plancha Abdominal" },
  { id: 'crunches', en: "Crunches", es: "Crunches" },
  { id: 'leg_raise_hanging', en: "Leg Raise (Hanging)", es: "Elevación de Piernas (Colgado)" },
  { id: 'russian_twist', en: "Russian Twist", es: "Giros Rusos" },
  { id: 'treadmill', en: "Treadmill Run", es: "Cinta de Correr" },
  { id: 'elliptical', en: "Elliptical", es: "Elíptica" },
  { id: 'bike', en: "Stationary Bike", es: "Bicicleta Estática" },
  { id: 'rowing', en: "Rowing Machine", es: "Remo (Máquina)" },
  { id: 'burpees', en: "Burpees", es: "Burpees" }
].sort((a, b) => a.en.localeCompare(b.en));