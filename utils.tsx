
import React from 'react';
import { Workout, WorkoutData, Exercise } from './types';
import { ExerciseDef } from './contexts/ExerciseContext';
import { 
  Dumbbell, 
  Activity, 
  Timer, 
  Zap, 
  Flame, 
  Target, 
  ArrowUp, 
  ChevronRight,
  Footprints,
  Heart,
  Scale,
  TriangleAlert
} from 'lucide-react';

export const parseLocalDate = (dateStr: string) => {
    if (!dateStr) return new Date();
    return new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
};

export const normalizeText = (text: string | null | undefined): string => {
    if (!text || typeof text !== 'string') return '';
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

export const getCanonicalId = (name: string | null | undefined, catalog: ExerciseDef[]): string => {
    if (!name || typeof name !== 'string') return name || '';
    const n = normalizeText(name).trim();
    if (!n) return name;

    const exact = catalog.find(ex => ex.es && normalizeText(ex.es) === n);
    if (exact) return exact.id;

    const startsWith = catalog.find(ex => ex.es && normalizeText(ex.es).startsWith(n));
    if (startsWith) return startsWith.id;

    const partial = catalog.find(ex => ex.es && normalizeText(ex.es).includes(n));
    return partial ? partial.id : name.trim(); 
};

export const getLocalizedName = (idOrName: string, catalog: ExerciseDef[]): string => {
    const match = catalog.find(ex => ex.id === idOrName);
    if (match) return match.es;
    return idOrName.charAt(0).toUpperCase() + idOrName.slice(1);
};

export const sanitizeWorkoutData = (data: WorkoutData, catalog: ExerciseDef[]): WorkoutData => {
    const enrichedExercises: Exercise[] = [];
    
    if (data.exercises) {
        data.exercises.forEach(ex => {
            // CRÍTICO: Validar que el ejercicio tenga nombre
            if (!ex.name || !ex.name.trim()) {
                console.warn('⚠️ Ejercicio sin nombre detectado, saltando:', ex);
                return;
            }
            
            // CRÍTICO: Validar que tenga sets
            if (!ex.sets || !Array.isArray(ex.sets) || ex.sets.length === 0) {
                console.warn(`⚠️ Ejercicio "${ex.name}" sin sets, saltando`);
                return;
            }
            
            // Obtener información del ejercicio del catálogo primero
            const id = getCanonicalId(ex.name, catalog);
            const def = catalog.find(d => d.id === id);
            const isCardio = def?.type === 'cardio';
            
            // CRÍTICO: Validar sets según el tipo de ejercicio
            // Para cardio: validar que tenga tiempo válido
            // Para strength: validar que tenga reps > 0
            let hasValidSets;
            if (isCardio) {
              hasValidSets = ex.sets.some(set => {
                const time = set.time;
                if (!time) return false;
                // Aceptar números (minutos) o strings con formato de tiempo
                if (typeof time === 'number' && time > 0) return true;
                if (typeof time === 'string') {
                  const trimmed = time.trim();
                  // Formato numérico simple (ej: "30" para 30 minutos)
                  if (/^\d+$/.test(trimmed)) return true;
                  // Formato tiempo "MM:SS" o "HH:MM:SS"
                  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) return true;
                }
                return false;
              });
            } else {
              hasValidSets = ex.sets.some(set => (set.reps || 0) > 0);
            }
            
            if (!hasValidSets) {
              console.warn(`⚠️ Ejercicio "${ex.name}" sin sets válidos (${isCardio ? 'sin tiempo' : 'todas las reps son 0'}), saltando`);
              return;
            }
            
            enrichedExercises.push({
                ...ex,
                name: def ? def.es : ex.name,
                category: def ? def.category : 'General',
                type: def ? (def.type || 'strength') : 'strength'
            });
        });
    }
    
    return { ...data, exercises: enrichedExercises };
};

/**
 * LOGO: Bulldog mordiendo una mancuerna, compartido con los iconos PWA.
 */
export const AppLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <defs>
      <linearGradient id="gymLogoBg" x1="74" y1="54" x2="438" y2="462" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#1f2937" />
        <stop offset="0.5" stopColor="#111827" />
        <stop offset="1" stopColor="#020617" />
      </linearGradient>
      <linearGradient id="gymLogoFur" x1="156" y1="122" x2="352" y2="387" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#f3f4f6" />
        <stop offset="0.42" stopColor="#cbd5e1" />
        <stop offset="1" stopColor="#64748b" />
      </linearGradient>
      <linearGradient id="gymLogoSteel" x1="84" y1="277" x2="428" y2="277" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#94a3b8" />
        <stop offset="0.18" stopColor="#f8fafc" />
        <stop offset="0.5" stopColor="#cbd5e1" />
        <stop offset="0.82" stopColor="#f8fafc" />
        <stop offset="1" stopColor="#94a3b8" />
      </linearGradient>
      <filter id="gymLogoShadow" x="-15%" y="-15%" width="130%" height="135%" colorInterpolationFilters="sRGB">
        <feDropShadow dx="0" dy="18" stdDeviation="16" floodColor="#000000" floodOpacity="0.45" />
      </filter>
    </defs>

    <rect width="512" height="512" rx="120" fill="url(#gymLogoBg)" />
    <path d="M81 368c42 66 130 92 207 72 74-19 132-79 146-152 17-88-29-177-109-213-80-37-178-14-233 55-55 70-59 168-11 238Z" fill="#0f172a" opacity="0.85" />

    <g filter="url(#gymLogoShadow)">
      <path d="M109 250h294" stroke="#334155" strokeWidth="42" strokeLinecap="round" />
      <path d="M109 250h294" stroke="url(#gymLogoSteel)" strokeWidth="24" strokeLinecap="round" />
      <g fill="#d4ff00">
        <rect x="61" y="190" width="38" height="120" rx="16" />
        <rect x="101" y="172" width="36" height="156" rx="16" />
        <rect x="375" y="172" width="36" height="156" rx="16" />
        <rect x="413" y="190" width="38" height="120" rx="16" />
      </g>
      <path d="M154 213c-20-62 14-97 55-66 18-44 71-45 92 0 43-28 77 9 56 67 43 26 57 86 31 133-27 50-82 78-132 78s-105-28-132-78c-25-47-12-108 30-134Z" fill="url(#gymLogoFur)" />
      <path d="M172 151c7-39 34-54 66-34l-32 70c-27-5-39-16-34-36Z" fill="#111827" />
      <path d="M340 151c-7-39-34-54-66-34l32 70c27-5 39-16 34-36Z" fill="#111827" />
      <path d="M173 220c-34 13-53 43-48 79 8 59 64 105 131 105s123-46 131-105c5-36-14-66-48-79-15 25-46 41-83 41s-68-16-83-41Z" fill="#e5e7eb" />
      <path d="M166 284c23 23 55 35 90 35s67-12 90-35" fill="none" stroke="#111827" strokeWidth="17" strokeLinecap="round" />
      <path d="M256 209c34 0 55 18 48 41-6 20-27 33-48 33s-42-13-48-33c-7-23 14-41 48-41Z" fill="#0f172a" />
      <path d="M232 258c9 12 39 12 48 0" fill="none" stroke="#f8fafc" strokeWidth="10" strokeLinecap="round" />
      <path d="M209 222c-17-17-39-17-55-2" stroke="#111827" strokeWidth="14" strokeLinecap="round" />
      <path d="M303 222c17-17 39-17 55-2" stroke="#111827" strokeWidth="14" strokeLinecap="round" />
      <circle cx="190" cy="244" r="12" fill="#d4ff00" />
      <circle cx="322" cy="244" r="12" fill="#d4ff00" />
      <path d="M201 334c22 20 88 20 110 0" fill="none" stroke="#111827" strokeWidth="18" strokeLinecap="round" />
      <path d="M197 319l19 35 20-37m40 0 20 37 19-35" fill="#f8fafc" stroke="#111827" strokeWidth="10" strokeLinejoin="round" />
      <path d="M170 313c-18-7-31-18-39-33m211 33c18-7 31-18 39-33" fill="none" stroke="#94a3b8" strokeWidth="11" strokeLinecap="round" />
      <path d="M206 164c13 20 34 31 50 31s37-11 50-31" fill="none" stroke="#94a3b8" strokeWidth="12" strokeLinecap="round" />
    </g>
    <path d="M117 405c72 39 203 39 278 0" fill="none" stroke="#d4ff00" strokeWidth="12" strokeLinecap="round" opacity="0.35" />
  </svg>
);

export const getExerciseIcon = (name: string, catalog: ExerciseDef[], className: string = "w-4 h-4") => {
    const id = getCanonicalId(name, catalog);
    const n = normalizeText(name);
    const def = catalog.find(ex => ex.id === id);
    const cat = def?.category || '';

    if (cat === 'Chest') return <Dumbbell className={`${className} text-blue-400`} />;
    if (cat === 'Back') return <Target className={`${className} text-orange-400`} />;
    if (cat === 'Legs' || cat === 'Quads' || cat === 'Femorales' || cat === 'Gluteos') return <Footprints className={`${className} text-green-400`} />;
    if (cat === 'Shoulders') return <Zap className={`${className} text-yellow-400`} />;
    if (cat === 'Arms' || cat === 'Biceps' || cat === 'Triceps') return <Activity className={`${className} text-purple-400`} />;
    if (def?.type === 'cardio') return <Heart className={`${className} text-red-500`} />;
    
    // Fallbacks dinámicos
    if (n.includes('banca') || n.includes('bench')) return <Dumbbell className={className} />;
    if (n.includes('correr') || n.includes('run') || n.includes('cardio')) return <Heart className={`${className} text-red-500`} />;
    
    return <Dumbbell className={className} />;
};
