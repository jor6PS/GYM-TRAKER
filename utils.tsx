
import React, { createContext } from 'react';
import { Workout, WorkoutData, Exercise } from './types';
import { EXERCISE_DB } from './data/exerciseDb';

// --- Shared Helpers ---

export const parseLocalDate = (dateStr: string) => {
    if (!dateStr) return new Date();
    return new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
};

// Helper to remove accents and lowercase text for searching
// e.g. "Pádel" -> "padel", "Fútbol" -> "futbol"
export const normalizeText = (text: string): string => {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

export const formatWorkoutToString = (workout: Workout): string => {
  if (!workout.structured_data || !workout.structured_data.exercises) return "";

  return workout.structured_data.exercises.map(ex => {
    const setsCount = ex.sets.length;
    // Inspect first set to determine format
    const first = ex.sets[0];
    
    if (first.distance || first.unit === 'km' || first.unit === 'm') {
        return `${ex.name} ${first.distance}km in ${first.time}`;
    }
    if (first.time && first.unit === 'mins') {
        return `${ex.name} for ${first.time}mins`;
    }
    
    return `${ex.name} ${setsCount}x${first.reps} ${first.weight}${first.unit}`;
  }).join('\n');
};

// --- NORMALIZATION & SANITIZATION HELPERS ---

export const getCanonicalId = (name: string): string => {
    const n = normalizeText(name).trim();
    if (!n) return name;

    // 1. Exact Match (Highest Priority)
    const exact = EXERCISE_DB.find(ex => 
        normalizeText(ex.en) === n || 
        normalizeText(ex.es) === n
    );
    if (exact) return exact.id;

    // 2. Starts With (Medium Priority)
    const startsWith = EXERCISE_DB.find(ex => 
        normalizeText(ex.en).startsWith(n) || 
        normalizeText(ex.es).startsWith(n)
    );
    if (startsWith) return startsWith.id;

    // 3. Partial Match (Lowest Priority)
    const partial = EXERCISE_DB.find(ex => 
        normalizeText(ex.en).includes(n) || 
        normalizeText(ex.es).includes(n)
    );
    return partial ? partial.id : name.trim(); 
};

// MODIFIED: Ignores lang param and always tries to return Spanish if found
export const getLocalizedName = (idOrName: string, lang: 'es' | 'en' = 'es'): string => {
    const match = EXERCISE_DB.find(ex => ex.id === idOrName);
    if (match) {
        return match.es; // Always return Spanish
    }
    // Fallback: Check if it's already a name in DB (English or Spanish)
    const reverseMatch = EXERCISE_DB.find(ex => 
        ex.en.toLowerCase() === idOrName.toLowerCase() || 
        ex.es.toLowerCase() === idOrName.toLowerCase()
    );
    if (reverseMatch) {
         return reverseMatch.es; // Always return Spanish
    }
    // Capitalize fallback
    return idOrName.charAt(0).toUpperCase() + idOrName.slice(1);
};

/**
 * Enforces Strict Catalog Validation.
 * 1. Tries to match every exercise to the DB.
 * 2. If matched, updates name to standard Spanish name (for consistency).
 * 3. If NOT matched, removes it (prevents non-existent exercises).
 */
export const sanitizeWorkoutData = (data: WorkoutData): WorkoutData => {
    const validExercises: Exercise[] = [];

    if (data.exercises) {
        data.exercises.forEach(ex => {
            const id = getCanonicalId(ex.name);
            const def = EXERCISE_DB.find(d => d.id === id);

            if (def) {
                // Match Found: Use the official Spanish Name
                validExercises.push({
                    ...ex,
                    name: def.es 
                });
            } else {
                console.warn(`Exercise "${ex.name}" removed: Not found in catalog.`);
            }
        });
    }

    return {
        ...data,
        exercises: validExercises
    };
};

// ... (Rest of SVG components remain unchanged) ...
// --- Custom SVG Components (ILLUSTRATIVE & INTUITIVE) ---

export const AppLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M21 2.5 A 2.5 2.5 0 0 1 21 7.5 A 3.5 3.5 0 0 0 21 2.5 Z" fill="currentColor" className="opacity-90 shadow-glow" />
    <path d="M2.5 15L8.5 6L13 13" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 15L16 9L21.5 15" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 17H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M3 14L2 17L3 20H5L6 17L5 14H3Z" fill="currentColor" />
    <path d="M19 14L18 17L19 20H21L22 17L21 14H19Z" fill="currentColor" />
    <path d="M4 16V18" stroke="#D4FF00" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M20 16V18" stroke="#D4FF00" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// --- GIMNASIO (GYM EQUIPMENT & ANATOMY) ---

const IconBench = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 14h16" /> 
    <path d="M7 14v4" />
    <path d="M17 14v4" />
    <path d="M2 8h20" />
    <path d="M6 6v4" />
    <path d="M18 6v4" />
  </svg>
);

const IconDeadlift = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="4" cy="17" r="3" />
    <circle cx="20" cy="17" r="3" />
    <path d="M7 17h10" />
    <path d="M12 17v-8" strokeDasharray="2 2" />
    <path d="M9 12l3-3 3 3" />
  </svg>
);

const IconSquat = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 4v4" />
    <path d="M5 13l3-3 4 4 4-4 3 3" /> 
    <path d="M8 20l-1-4" />
    <path d="M16 20l1-4" />
    <path d="M4 7h16" />
  </svg>
);

const IconDumbbell = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M6.5 6.5h11" />
    <path d="M6.5 17.5h11" />
    <path d="M6 4v16" />
    <path d="M18 4v16" />
    <path d="M9 12h6" strokeWidth="3" />
  </svg>
);

const IconKettlebell = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M6 4h12v2c0 2-2 4-4 4H10c-2 0-4-2-4-4V4z" />
    <path d="M4 10h16v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-8z" />
  </svg>
);

const IconPullUp = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 5h18" /> 
    <path d="M7 5v5l5 3 5-3V5" /> 
  </svg>
);

const IconArm = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 16h5v-5h-5z" />
    <path d="M9 11c0-4 3-6 6-6s6 2 6 6v3h-12" />
    <path d="M15 11v3" />
  </svg>
);

const IconAbs = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="6" y="4" width="12" height="16" rx="3" />
    <path d="M6 9h12" />
    <path d="M6 14h12" />
    <path d="M12 4v16" />
  </svg>
);

const IconCardio = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);

const IconRunning = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 16v-2a3 3 0 0 1 1-2.5c2-1 4-2 7-2 1 0 2 1 3 1s3-2 3-2l3 2v6h-6l-2-2-2 2H4z" />
    <path d="M8 17h.01" strokeWidth="3" />
    <path d="M12 17h.01" strokeWidth="3" />
    <path d="M4 20h17" />
  </svg>
);

// --- MAIN ICON LOGIC ---

export const getExerciseIcon = (name: string, className: string = "w-5 h-5") => {
  const n = normalizeText(name);

  // --- CARDIO SPECIFIC ---
  if (n.includes('run') || n.includes('correr') || n.includes('carrera') || n.includes('sprint') || n.includes('treadmill') || n.includes('cinta')) {
    return <IconRunning className={className} />;
  }
  if (n.includes('cardio') || n.includes('hiit') || n.includes('jump rope') || n.includes('comba') || n.includes('bike') || n.includes('bici') || n.includes('elliptical') || n.includes('eliptica') || n.includes('rowing') || n.includes('remo') || n.includes('swim') || n.includes('natacion')) {
    return <IconCardio className={className} />;
  }

  // --- GYM SPECIFIC ---

  // Bench Press Family
  if (n.includes('bench') || (n.includes('press') && n.includes('banca')) || (n.includes('chest') && n.includes('press')) || n.includes('incline') || n.includes('decline')) {
    return <IconBench className={className} />;
  }
  
  // Deadlift Family
  if (n.includes('deadlift') || n.includes('peso muerto') || n.includes('rack pull') || n.includes('row')) {
    return <IconDeadlift className={className} />;
  }

  // Squat Family & Legs
  if (n.includes('squat') || n.includes('sentadilla') || n.includes('leg press') || n.includes('prensa') || n.includes('lunge') || n.includes('zancada') || n.includes('hack')) {
    return <IconSquat className={className} />;
  }

  // Pullup Family
  if (n.includes('pull up') || n.includes('dominada') || n.includes('chin up') || n.includes('jalon') || n.includes('lat pull')) {
    return <IconPullUp className={className} />;
  }

  // Arms Specific
  if (n.includes('curl') || n.includes('bicep') || n.includes('tricep') || n.includes('extension') || n.includes('skull') || n.includes('martillo') || n.includes('brazo')) {
    return <IconArm className={className} />;
  }

  // Abs Specific
  if (n.includes('crunch') || n.includes('plank') || n.includes('plancha') || n.includes('sit up') || n.includes('russian') || n.includes('leg raise') || n.includes('abdominal') || n.includes('core') || n.includes('hollow')) {
    return <IconAbs className={className} />;
  }

  // CrossFit/Functional
  if (n.includes('kettlebell') || n.includes('swing') || n.includes('snatch') || n.includes('clean') || n.includes('thruster') || n.includes('wall ball') || n.includes('burpee') || n.includes('sled') || n.includes('farmer')) {
    return <IconKettlebell className={className} />;
  }

  // Fallback
  return <IconDumbbell className={className} />;
};
