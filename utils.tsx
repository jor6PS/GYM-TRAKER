
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
            const id = getCanonicalId(ex.name, catalog);
            const def = catalog.find(d => d.id === id);
            
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
 * LOGO: "Iron Beast V2" - Perro feroz detallado en marrón con mancuerna gigante.
 */
export const AppLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <defs>
      <linearGradient id="furGradient" x1="50" y1="20" x2="50" y2="80" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#8D6E63" />
        <stop offset="50%" stopColor="#5D4037" />
        <stop offset="100%" stopColor="#3E2723" />
      </linearGradient>
      <linearGradient id="chromeGradient" x1="0" y1="50" x2="100" y2="50" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#BDBDBD" />
        <stop offset="50%" stopColor="#F5F5F5" />
        <stop offset="100%" stopColor="#757575" />
      </linearGradient>
    </defs>

    {/* Hombros/Cuello Musculoso */}
    <path d="M15 85C15 70 25 55 50 55C75 55 85 70 85 85H15Z" fill="url(#furGradient)" opacity="0.8" />
    
    {/* Cabeza Principal */}
    <path d="M25 45C25 28 35 18 50 18C65 18 75 28 75 45V55C75 68 65 78 50 78C35 78 25 68 25 55V45Z" fill="url(#furGradient)" />
    
    {/* Orejas Agresivas (Cortadas/Hacia atrás) */}
    <path d="M25 25L18 15L28 22Z" fill="#3E2723" />
    <path d="M75 25L82 15L72 22Z" fill="#3E2723" />

    {/* Arrugas de la Frente */}
    <path d="M40 25C43 23 57 23 60 25" stroke="#3E2723" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M38 28C42 26 58 26 62 28" stroke="#3E2723" strokeWidth="1" strokeLinecap="round" />

    {/* Ojos Feroces (Amarillo Brillante) */}
    <path d="M35 35L45 40" stroke="#FFD600" strokeWidth="3" strokeLinecap="round" />
    <path d="M65 35L55 40" stroke="#FFD600" strokeWidth="3" strokeLinecap="round" />
    <circle cx="42" cy="38" r="1" fill="white" />
    <circle cx="58" cy="38" r="1" fill="white" />

    {/* Hocico y Arrugas de Expresión */}
    <path d="M35 55C35 48 40 45 50 45C60 45 65 48 65 55" fill="#4E342E" stroke="#3E2723" strokeWidth="1" />
    <circle cx="50" cy="50" r="2.5" fill="black" /> {/* Nariz */}

    {/* Mancuerna Gigante Cromada */}
    {/* Barra */}
    <rect x="10" y="52" width="80" height="7" rx="2" fill="url(#chromeGradient)" stroke="#424242" strokeWidth="0.5" />
    {/* Discos Grandes (Pesados) */}
    <rect x="2" y="42" width="12" height="28" rx="2" fill="#424242" />
    <rect x="5" y="45" width="4" height="22" rx="1" fill="#616161" />
    <rect x="86" y="42" width="12" height="28" rx="2" fill="#424242" />
    <rect x="91" y="45" width="4" height="22" rx="1" fill="#616161" />

    {/* Mandíbula Inferior (Muerde la barra) */}
    <path d="M32 62C32 72 40 78 50 78C60 78 68 72 68 62" fill="url(#furGradient)" stroke="#3E2723" strokeWidth="2" />
    
    {/* Dientes/Colmillos (Blancos y afilados) */}
    <path d="M38 52L40 58" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M62 52L60 58" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M45 59L46 63" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M55 59L54 63" stroke="white" strokeWidth="1.5" strokeLinecap="round" />

    {/* Babeo Estilizado (Cian muy pálido) */}
    <path d="M35 60C35 65 33 68 33 72" stroke="#B3E5FC" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
    <circle cx="33" cy="74" r="1.5" fill="#B3E5FC" opacity="0.6" />
    <path d="M65 60C65 65 67 68 67 72" stroke="#B3E5FC" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
    <circle cx="67" cy="74" r="1.5" fill="#B3E5FC" opacity="0.6" />
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
