
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
 * LOGO: imagen principal compartida con el favicon y los iconos PWA.
 */
export const AppLogo = ({ className }: { className?: string }) => (
  <img
    src="/logo.png"
    alt="Gym.AI bulldog logo"
    className={className}
    draggable={false}
  />
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
