
import { MetricType } from '../types';

export interface ExerciseDef {
  id: string;
  en: string;
  es: string;
  category?: string;
  type?: MetricType; // Defaults to 'strength' if undefined
}

const entries: ExerciseDef[] = [
  // --- CARDIO & ENDURANCE (Gym Focused) ---
  { id: 'treadmill', en: "Treadmill Run", es: "Cinta de Correr", type: 'cardio' },
  { id: 'running_outdoor', en: "Running", es: "Correr (Aire Libre)", type: 'cardio' },
  { id: 'cycling_outdoor', en: "Cycling", es: "Ciclismo", type: 'cardio' },
  { id: 'indoor_cycling', en: "Indoor Cycling", es: "Spinning / Bici Estática", type: 'cardio' },
  { id: 'elliptical', en: "Elliptical", es: "Elíptica", type: 'cardio' },
  { id: 'stair_climber', en: "Stair Climber", es: "Escaladora / Stepper", type: 'cardio' },
  { id: 'rowing', en: "Rowing Machine", es: "Remo (Máquina)", type: 'cardio' },
  { id: 'jump_rope', en: "Jump Rope", es: "Saltar a la Comba", type: 'cardio' },
  { id: 'hiit', en: "HIIT Workout", es: "Entrenamiento HIIT", type: 'cardio' },
  { id: 'assault_bike', en: "Assault Bike", es: "Assault Bike / Air Bike", type: 'cardio' },
  { id: 'ski_erg', en: "SkiErg", es: "SkiErg", type: 'cardio' },

  // --- CROSSFIT & OLYMPIC LIFTING ---
  { id: 'clean_and_jerk', en: "Clean and Jerk", es: "Dos Tiempos (Clean & Jerk)" },
  { id: 'snatch', en: "Snatch", es: "Arrancada (Snatch)" },
  { id: 'power_clean', en: "Power Clean", es: "Cargada de Potencia" },
  { id: 'thruster', en: "Thruster", es: "Thruster" },
  { id: 'wall_ball', en: "Wall Ball Shots", es: "Lanzamiento de Balón (Wall Ball)" },
  { id: 'box_jump', en: "Box Jump", es: "Salto al Cajón" },
  { id: 'rope_climb', en: "Rope Climb", es: "Subida a Cuerda" },
  { id: 'burpees', en: "Burpees", es: "Burpees", type: 'cardio' },
  { id: 'kettlebell_swing', en: "Kettlebell Swing", es: "Swing con Kettlebell" },

  // --- CALISTHENICS ---
  { id: 'muscle_up', en: "Muscle Up", es: "Muscle Up" },
  { id: 'pull_up', en: "Pull Up", es: "Dominadas" },
  { id: 'chin_up', en: "Chin Up", es: "Dominadas Supinas" },
  { id: 'dips_chest', en: "Dips", es: "Fondos" },
  { id: 'push_ups', en: "Push Ups", es: "Flexiones" },
  { id: 'handstand_pushup', en: "Handstand Pushup", es: "Flexiones de Pino" },

  // --- CHEST ---
  { id: 'bench_press_barbell', en: "Barbell Bench Press", es: "Press Banca (Barra)" },
  { id: 'bench_press_dumbbell', en: "Dumbbell Bench Press", es: "Press Banca (Mancuernas)" },
  { id: 'incline_bench_barbell', en: "Incline Barbell Bench Press", es: "Press Inclinado (Barra)" },
  { id: 'incline_bench_dumbbell', en: "Incline Dumbbell Bench Press", es: "Press Inclinado (Mancuernas)" },
  { id: 'decline_bench_press', en: "Decline Bench Press", es: "Press Declinado" },
  { id: 'chest_fly_cable', en: "Cable Chest Fly", es: "Cruces en Polea" },
  { id: 'chest_fly_dumbbell', en: "Dumbbell Fly", es: "Aperturas con Mancuernas" },
  { id: 'pec_deck', en: "Pec Deck", es: "Contractora (Pec Deck)" },
  { id: 'chest_press_machine', en: "Machine Chest Press", es: "Press de Pecho (Máquina)" },
  { id: 'hammer_strength_chest', en: "Hammer Strength Chest Press", es: "Press de Pecho (Hammer)" },
  { id: 'pullover_dumbbell', en: "Dumbbell Pullover", es: "Pullover con Mancuerna" },

  // --- BACK ---
  { id: 'deadlift', en: "Deadlift", es: "Peso Muerto" },
  { id: 'sumo_deadlift', en: "Sumo Deadlift", es: "Peso Muerto Sumo" },
  { id: 'lat_pulldown_wide', en: "Lat Pulldown", es: "Jalón al Pecho" },
  { id: 'lat_pulldown_close', en: "Close Grip Lat Pulldown", es: "Jalón al Pecho (Agarre Cerrado)" },
  { id: 'barbell_row', en: "Barbell Row", es: "Remo con Barra" },
  { id: 'dumbbell_row', en: "Dumbbell Row", es: "Remo con Mancuerna" },
  { id: 'cable_row', en: "Seated Cable Row", es: "Remo en Polea Baja" },
  { id: 'face_pull', en: "Face Pull", es: "Face Pull" },
  { id: 't_bar_row', en: "T-Bar Row", es: "Remo en Punta (Barra T)" },
  { id: 'hyperextensions', en: "Back Extensions", es: "Hiperextensiones" },
  { id: 'machine_row', en: "Machine Row", es: "Remo en Máquina" },

  // --- LEGS ---
  { id: 'squat_barbell', en: "Barbell Squat", es: "Sentadilla (Barra)" },
  { id: 'smith_machine_squat', en: "Smith Machine Squat", es: "Sentadilla en Multipower" },
  { id: 'front_squat', en: "Front Squat", es: "Sentadilla Frontal" },
  { id: 'goblet_squat', en: "Goblet Squat", es: "Sentadilla Goblet" },
  { id: 'leg_press', en: "Leg Press", es: "Prensa de Piernas" },
  { id: 'lunges_dumbbell', en: "Dumbbell Lunges", es: "Zancadas con Mancuernas" },
  { id: 'lunges_barbell', en: "Barbell Lunges", es: "Zancadas con Barra" },
  { id: 'bulgarian_split_squat', en: "Bulgarian Split Squat", es: "Sentadilla Búlgara" },
  { id: 'rdl_barbell', en: "Romanian Deadlift", es: "Peso Muerto Rumano" },
  { id: 'rdl_dumbbell', en: "Dumbbell Romanian Deadlift", es: "Peso Muerto Rumano (Mancuernas)" },
  { id: 'leg_curl_seated', en: "Seated Leg Curl", es: "Curl Femoral Sentado" },
  { id: 'leg_curl_lying', en: "Lying Leg Curl", es: "Curl Femoral Tumbado" },
  { id: 'leg_extension', en: "Leg Extension", es: "Extensiones de Cuádriceps" },
  { id: 'calf_raise_standing', en: "Standing Calf Raise", es: "Elevación de Gemelos De Pie" },
  { id: 'calf_raise_seated', en: "Seated Calf Raise", es: "Elevación de Gemelos Sentado" },
  { id: 'hip_thrust', en: "Hip Thrust", es: "Hip Thrust / Puente de Glúteo" },
  { id: 'hack_squat', en: "Hack Squat", es: "Sentadilla Hack" },

  // --- SHOULDERS ---
  { id: 'overhead_press_barbell', en: "Barbell Overhead Press", es: "Press Militar (Barra)" },
  { id: 'shoulder_press_dumbbell', en: "Dumbbell Shoulder Press", es: "Press de Hombros (Mancuernas)" },
  { id: 'shoulder_press_machine', en: "Machine Shoulder Press", es: "Press de Hombros (Máquina)" },
  { id: 'lateral_raise_dumbbell', en: "Dumbbell Lateral Raise", es: "Elevaciones Laterales" },
  { id: 'lateral_raise_cable', en: "Cable Lateral Raise", es: "Elevaciones Laterales en Polea" },
  { id: 'front_raise', en: "Front Raise", es: "Elevaciones Frontales" },
  { id: 'rear_delt_fly_dumbbell', en: "Dumbbell Rear Delt Fly", es: "Pájaros / Deltoides Posterior" },
  { id: 'rear_delt_fly_machine', en: "Machine Reverse Fly", es: "Pájaros en Máquina" },
  { id: 'upright_row', en: "Upright Row", es: "Remo al Mentón" },
  { id: 'shrugs', en: "Shrugs", es: "Encogimientos (Trapecio)" },
  { id: 'arnold_press', en: "Arnold Press", es: "Press Arnold" },

  // --- ARMS ---
  { id: 'bicep_curl_barbell', en: "Barbell Curl", es: "Curl de Bíceps (Barra)" },
  { id: 'bicep_curl_dumbbell', en: "Dumbbell Curl", es: "Curl con Mancuernas" },
  { id: 'hammer_curl', en: "Hammer Curl", es: "Curl Martillo" },
  { id: 'preacher_curl', en: "Preacher Curl", es: "Curl Predicador" },
  { id: 'concentration_curl', en: "Concentration Curl", es: "Curl Concentrado" },
  { id: 'bayesian_curl', en: "Bayesian Curl", es: "Curl Bayesiano (Polea)" },
  { id: 'tricep_pushdown_rope', en: "Rope Tricep Pushdown", es: "Extensión de Tríceps (Cuerda)" },
  { id: 'tricep_pushdown_bar', en: "Bar Tricep Pushdown", es: "Extensión de Tríceps (Barra)" },
  { id: 'skullcrushers', en: "Skullcrushers", es: "Press Francés (Rompecráneos)" },
  { id: 'dips_triceps', en: "Tricep Dips", es: "Fondos de Tríceps" },
  { id: 'overhead_tricep_extension', en: "Overhead Tricep Extension", es: "Extensión de Tríceps sobre cabeza" },

  // --- ABS & CORE ---
  { id: 'plank', en: "Plank", es: "Plancha Abdominal", type: 'cardio' }, // Treated as time-based
  { id: 'crunches', en: "Crunches", es: "Crunches / Abdominales" },
  { id: 'leg_raise_hanging', en: "Hanging Leg Raise", es: "Elevación de Piernas" },
  { id: 'russian_twist', en: "Russian Twist", es: "Giros Rusos" },
  { id: 'ab_wheel', en: "Ab Wheel", es: "Rueda Abdominal" },
  { id: 'cable_crunch', en: "Cable Crunch", es: "Crunch en Polea" }
];

export const EXERCISE_DB: ExerciseDef[] = entries.sort((a, b) => a.en.localeCompare(b.en));
