
import React, { useMemo, useRef } from 'react';
import { 
  format, 
  endOfMonth, 
  endOfWeek,
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths,
  isBefore
} from 'date-fns';
// Fix: Import startOfMonth and startOfWeek from specific paths to resolve missing exported member errors
import startOfMonth from 'date-fns/startOfMonth';
import startOfWeek from 'date-fns/startOfWeek';
// Fix: Import locales from specific paths to resolve missing exported member errors
import es from 'date-fns/locale/es';
import { clsx } from 'clsx';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { Workout, Exercise } from '../types';
import { parseLocalDate, getCanonicalId } from '../utils';
import { useExercises } from '../contexts/ExerciseContext';
import { isCalisthenic, calculateSetVolume } from '../services/workoutProcessor/helpers';

interface CalendarViewProps {
  viewDate: Date;
  onViewDateChange: (date: Date) => void;
  workouts: Workout[];
  selectedFriendsWorkouts?: { userId: string; color: string; workouts: Workout[] }[];
  onSelectDate: (date: Date) => void;
  selectedDate: Date;
  onSummaryClick: () => void;
}

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']; 

export const CalendarView: React.FC<CalendarViewProps> = ({ 
  viewDate,
  onViewDateChange,
  workouts, 
  selectedFriendsWorkouts = [],
  onSelectDate,
  selectedDate,
}) => {
  const dateLocale = es;
  const { catalog } = useExercises();
  
  // Cache para almacenar volúmenes de meses anteriores (que no cambiarán)
  const monthlyVolumeCache = useRef<Map<string, number>>(new Map());
  const currentMonthKey = useRef<string>('');
  const currentDate = new Date();
  const currentMonthStart = startOfMonth(currentDate);

  const { calendarDays, monthStart, trainingDaysInMonth, monthlyVolume } = useMemo(() => {
    const monthStart = startOfMonth(viewDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
    
    const daysInMonth = workouts.filter(w => isSameMonth(parseLocalDate(w.date), monthStart));
    const uniqueTrainingDays = new Set(daysInMonth.map(w => w.date)).size;
    
    // Clave para identificar el mes (YYYY-MM)
    const monthKey = format(monthStart, 'yyyy-MM');
    const isCurrentMonth = isSameMonth(monthStart, currentMonthStart);
    const isPastMonth = isBefore(monthStart, currentMonthStart);
    
    // Calcular volumen mensual
    let volume = 0;
    
    // Si es un mes pasado y ya está en cache, usar el cache
    if (isPastMonth && monthlyVolumeCache.current.has(monthKey)) {
      volume = monthlyVolumeCache.current.get(monthKey) || 0;
    } else {
      // Calcular volumen solo para el mes actual o si no está en cache
      const monthWorkouts = workouts.filter(w => {
        const workoutDate = parseLocalDate(w.date);
        return isSameMonth(workoutDate, monthStart);
      });
      
      for (const workout of monthWorkouts) {
        const userWeight = workout.user_weight || 80;
        const structuredData = workout.structured_data;
        
        if (!structuredData || !structuredData.exercises || !Array.isArray(structuredData.exercises)) continue;
        
        for (const exercise of structuredData.exercises) {
          if (!exercise.name || !exercise.sets || !Array.isArray(exercise.sets)) continue;
          
          // Obtener información del ejercicio del catálogo
          const canonicalId = getCanonicalId(exercise.name, catalog);
          const exerciseDef = catalog.find(e => e.id === canonicalId);
          const exerciseType = exerciseDef?.type || 'strength';
          
          // Solo procesar ejercicios de fuerza
          if (exerciseType !== 'strength') continue;
          
          const isCalis = isCalisthenic(canonicalId);
          const isUnilateral = exercise.unilateral || false;
          
          // Determinar si es ejercicio de peso corporal
          const category = exerciseDef?.category || exercise.category || 'General';
          const hasOnlyZeroWeightSets = exercise.sets.every(s => !s.weight || s.weight === 0);
          const isCoreOrGeneral = category === 'Core' || category === 'General';
          const isBodyweightExercise = isCalis || (hasOnlyZeroWeightSets && isCoreOrGeneral && exerciseType === 'strength');
          
          // Calcular volumen de cada set
          for (const set of exercise.sets) {
            const weight = set.weight || 0;
            const reps = set.reps || 0;
            const unit = set.unit || 'kg';
            
            if (reps === 0) continue;
            
            // Calcular volumen usando la misma función que se usa en recordsService
            const setVolume = calculateSetVolume(reps, weight, unit, userWeight, isBodyweightExercise, isUnilateral);
            volume += setVolume;
          }
        }
      }
      
      // Guardar en cache si es un mes pasado (no cambiará más)
      if (isPastMonth) {
        monthlyVolumeCache.current.set(monthKey, volume);
      } else if (isCurrentMonth) {
        // Si cambió el mes actual, limpiar cache de meses futuros (por si acaso)
        currentMonthKey.current = monthKey;
      }
    }

    return {
      calendarDays: eachDayOfInterval({ start: startDate, end: endDate }),
      monthStart,
      trainingDaysInMonth: uniqueTrainingDays,
      monthlyVolume: volume
    };
  }, [viewDate, workouts, catalog]);

  const handlePrevMonth = () => onViewDateChange(addMonths(viewDate, -1));
  const handleNextMonth = () => onViewDateChange(addMonths(viewDate, 1));
  
  const isCurrentMonth = isSameMonth(viewDate, new Date());
  
  return (
    <div className="w-full bg-surface border border-border rounded-[2rem] overflow-hidden shadow-2xl relative transition-colors duration-300">
      <div className="p-5 flex items-center justify-between border-b border-border bg-surfaceHighlight/30">
        <button onClick={handlePrevMonth} className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-white">
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center">
            <h2 className="text-sm font-black text-text tracking-widest uppercase italic leading-none">
                {format(viewDate, 'MMMM yyyy', { locale: dateLocale })}
            </h2>
            <div className="flex flex-col items-center gap-1.5 mt-1.5">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></div>
                    <span className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em]">
                        {trainingDaysInMonth} Días Registrados
                    </span>
                </div>
                {monthlyVolume > 0 && (
                    <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.15em]">
                            {Math.round(monthlyVolume).toLocaleString('es-ES')} kg
                        </span>
                    </div>
                )}
            </div>
        </div>

        <button onClick={handleNextMonth} className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-white">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
      
      {!isCurrentMonth && (
         <button 
           onClick={() => { const now = new Date(); onViewDateChange(now); onSelectDate(now); }}
           className="absolute top-5 right-16 p-2 text-primary hover:bg-primary/10 rounded-full transition-colors"
           title="Today"
         >
           <RotateCcw className="w-4 h-4" />
         </button>
      )}

      <div className="p-5">
        <div className="grid grid-cols-7 mb-4">
          {WEEKDAYS.map((day, i) => (
            <div key={i} className="text-center text-[10px] font-black text-subtext opacity-50 uppercase">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-3 gap-x-2">
          {calendarDays.map((day) => {
            const parsedDay = day.getTime();
            const hasMyWorkout = workouts.some(w => isSameDay(parseLocalDate(w.date), day));
            const friendDots = selectedFriendsWorkouts
                .filter(fw => fw.workouts.some(w => isSameDay(parseLocalDate(w.date), day)))
                .map(fw => fw.color);

            const isSelected = isSameDay(day, selectedDate);
            const isMonthDay = isSameMonth(day, monthStart);
            const isToday = isSameDay(day, new Date());

            return (
              <button
                key={parsedDay}
                onClick={() => {
                  onSelectDate(day);
                  if (!isMonthDay) onViewDateChange(day);
                }}
                className={clsx(
                  'relative h-12 w-full flex flex-col items-center justify-center rounded-2xl transition-all duration-300 border-2',
                  !isMonthDay ? 'opacity-10 border-transparent' : '',
                  isSelected 
                    ? 'border-primary bg-primary/10 scale-105 z-10 shadow-[0_0_15px_rgba(212,255,0,0.2)]' 
                    : isToday 
                        ? 'border-text/40' 
                        : 'border-transparent bg-white/5',
                  !isSelected && isMonthDay && 'hover:bg-white/10'
                )}
              >
                <span className={clsx(
                    "text-xs font-black transition-colors", 
                    isSelected ? "text-primary" : "text-text"
                )}>
                    {format(day, 'd')}
                </span>
                
                <div className="flex gap-0.5 justify-center flex-wrap px-0.5 w-full absolute bottom-1.5">
                    {hasMyWorkout && (
                        <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-glow"></div>
                    )}
                    {friendDots.map((color, i) => (
                        <div key={i} className="w-1 h-1 rounded-full" style={{ backgroundColor: color }}></div>
                    ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
