import React from 'react';
import { 
  Footprints,
  Dumbbell as LucideDumbbell
} from 'lucide-react';
import { Workout } from './types';
import { EXERCISE_DB } from './data/exerciseDb';

// --- Shared Helpers ---

/**
 * Helper for consistent date parsing.
 * Forces Local Time instead of UTC to prevent off-by-one day errors.
 * Appends T00:00:00 to force local time interpretation in most browsers.
 */
export const parseLocalDate = (dateStr: string) => {
    if (!dateStr) return new Date();
    return new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
};

/**
 * Converts a Workout object into a string representation readable by the local parser.
 * Format: "Exercise Name SetsxReps Weight(unit)"
 */
export const formatWorkoutToString = (workout: Workout): string => {
  if (!workout.structured_data || !workout.structured_data.exercises) return "";

  return workout.structured_data.exercises.map(ex => {
    const firstSet = ex.sets[0];
    const setsCount = ex.sets.length;
    return `${ex.name} ${setsCount}x${firstSet.reps} ${firstSet.weight}${firstSet.unit}`;
  }).join('\n');
};

// --- NORMALIZATION HELPERS (Multi-language Support) ---

/**
 * Takes any exercise name (English or Spanish, or loose input) and tries to find
 * its unique ID in the EXERCISE_DB.
 * Returns the ID (e.g., 'bench_press_barbell') if found, or the normalized input string if not.
 */
export const getCanonicalId = (name: string): string => {
    const n = name.trim().toLowerCase();
    
    // 1. Exact or Partial match in DB
    const match = EXERCISE_DB.find(ex => 
        ex.en.toLowerCase() === n || 
        ex.es.toLowerCase() === n ||
        ex.en.toLowerCase().includes(n) || // Fallback for loose matches
        ex.es.toLowerCase().includes(n)
    );

    return match ? match.id : n;
};

/**
 * Returns the display name for a given ID (or raw name) in the requested language.
 */
export const getLocalizedName = (idOrName: string, lang: 'es' | 'en'): string => {
    const match = EXERCISE_DB.find(ex => ex.id === idOrName);
    
    if (match) {
        return lang === 'es' ? match.es : match.en;
    }
    
    // If not found by ID, try to see if the input was already a name in the DB
    const reverseMatch = EXERCISE_DB.find(ex => 
        ex.en.toLowerCase() === idOrName.toLowerCase() || 
        ex.es.toLowerCase() === idOrName.toLowerCase()
    );

    if (reverseMatch) {
         return lang === 'es' ? reverseMatch.es : reverseMatch.en;
    }

    // Fallback: Capitalize raw input
    return idOrName.charAt(0).toUpperCase() + idOrName.slice(1);
};

// --- Custom SVG Components ---

export const AppLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <defs>
       <linearGradient id="voltGradient" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#D4FF00" />
        <stop offset="100%" stopColor="#B8E600" />
      </linearGradient>
    </defs>
    <path 
      d="M21 2.5 A 2.5 2.5 0 0 1 21 7.5 A 3.5 3.5 0 0 0 21 2.5 Z" 
      fill="currentColor" 
      className="opacity-90 shadow-glow" 
    />
    <path 
      d="M2.5 15L8.5 6L13 13" 
      stroke="currentColor" 
      strokeOpacity="0.7"
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
    />
    <path 
      d="M12 15L16 9L21.5 15" 
      stroke="currentColor" 
      strokeOpacity="0.5"
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
    />
    <path d="M7 17H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path 
      d="M3 14L2 17L3 20H5L6 17L5 14H3Z" 
      fill="currentColor" 
    />
    <path 
      d="M19 14L18 17L19 20H21L22 17L21 14H19Z" 
      fill="currentColor" 
    />
    <path d="M4 16V18" stroke="#D4FF00" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M20 16V18" stroke="#D4FF00" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const BenchIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M2 15h20" />
    <path d="M5 15v4" />
    <path d="M19 15v4" />
    <path d="M7 15v-5" />
    <path d="M17 15v-5" />
    <path d="M4 6h16" />
    <path d="M4 6v2" />
    <path d="M20 6v2" />
  </svg>
);

const BarbellIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M2 12h20" />
    <path d="M6 9v6" />
    <path d="M18 9v6" />
    <path d="M4 7v10" />
    <path d="M2 8v8" />
    <path d="M20 7v10" />
    <path d="M22 8v8" />
  </svg>
);

const PullUpBarIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 20v-9" />
    <path d="M20 20v-9" />
    <path d="M2 6h20" />
    <path d="M6 6v3" />
    <path d="M18 6v3" />
  </svg>
);

const MachineIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="6" y="4" width="12" height="16" rx="2" />
    <path d="M8 8h8" />
    <path d="M8 12h8" />
    <path d="M8 16h8" />
    <path d="M12 4V2" />
    <path d="M12 2h6" />
  </svg>
);

const BodyweightIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="5" r="2" />
    <path d="M12 7v5" />
    <path d="M8 9l4-2 4 2" />
    <path d="M8 17l4-5 4 5" />
  </svg>
);

const KettlebellIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M6 20h12a2 2 0 0 0 2-2V12a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2z" />
    <path d="M8 10V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v4" />
  </svg>
);

export const getExerciseIcon = (name: string, className: string = "w-5 h-5") => {
  const n = name.toLowerCase();
  
  if (n.includes('bench') || n.includes('chest press') || n.includes('incline') || n.includes('decline') || n.includes('banca') || n.includes('pecho')) {
    if (n.includes('dumbbell') || n.includes('mancuernas')) return <LucideDumbbell className={className} />;
    return <BenchIcon className={className} />;
  }

  if (n.includes('squat') || n.includes('sentadilla') || n.includes('deadlift') || n.includes('peso muerto') || n.includes('row') || n.includes('remo') || n.includes('hip thrust')) {
    if (n.includes('dumbbell') || n.includes('mancuerna') || n.includes('kettlebell')) return <LucideDumbbell className={className} />;
    return <BarbellIcon className={className} />;
  }
  
  if (n.includes('pull up') || n.includes('dominada') || n.includes('chin up') || n.includes('lat') || n.includes('jalón') || n.includes('colgado')) {
    return <PullUpBarIcon className={className} />;
  }

  if (n.includes('cable') || n.includes('polea') || n.includes('machine') || n.includes('máquina') || n.includes('extension') || n.includes('pushdown') || n.includes('fly') || n.includes('aperturas') || n.includes('pec deck')) {
    if (n.includes('dumbbell') || n.includes('mancuernas')) return <LucideDumbbell className={className} />;
    return <MachineIcon className={className} />;
  }
  
  if (n.includes('run') || n.includes('correr') || n.includes('cardio') || n.includes('treadmill') || n.includes('cinta') || n.includes('elliptical') || n.includes('elíptica') || n.includes('bike') || n.includes('bici')) {
    return <Footprints className={className} />;
  }

  if (n.includes('push up') || n.includes('flexiones') || n.includes('dip') || n.includes('fondos') || n.includes('sit up') || n.includes('crunch') || n.includes('plank') || n.includes('plancha') || n.includes('burpee')) {
    return <BodyweightIcon className={className} />;
  }
  
  if (n.includes('kettlebell') || n.includes('swing')) {
    return <KettlebellIcon className={className} />;
  }

  return <LucideDumbbell className={className} />;
};