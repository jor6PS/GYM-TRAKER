
import React, { useMemo, useState, useEffect } from 'react';
import { X, Trophy, TrendingUp, Search, Calendar, ChevronRight, ArrowLeft, Calculator, Activity, Hash, Scale, Zap, Target } from 'lucide-react';
import { Workout, PersonalRecord, MetricType } from '../types';
import { format } from 'date-fns';
import { getExerciseIcon, getCanonicalId, getLocalizedName } from '../utils';
import { useLanguage } from '../contexts/LanguageContext';
import { useExercises } from '../contexts/ExerciseContext';
import { getUserRecords, getUserTotalVolume, UserRecord } from '../services/recordsService';
import { supabase } from '../services/supabase';
import { isCalisthenic, calculateSetVolume } from '../services/workoutProcessor/helpers';
import { useScrollLock } from '../hooks/useScrollLock';

// Componente wrapper para lazy loading de recharts (reduce bundle inicial ~150KB)
const ChartWrapper: React.FC<{ exerciseHistory: any[], chartColor: string }> = ({ exerciseHistory, chartColor }) => {
  const [ChartComponents, setChartComponents] = useState<any>(null);
  
  useEffect(() => {
    import('recharts').then(recharts => {
      setChartComponents({
        ResponsiveContainer: recharts.ResponsiveContainer,
        AreaChart: recharts.AreaChart,
        XAxis: recharts.XAxis,
        YAxis: recharts.YAxis,
        CartesianGrid: recharts.CartesianGrid,
        Tooltip: recharts.Tooltip,
        Area: recharts.Area
      });
    });
  }, []);
  
  if (!ChartComponents) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }
  
  const { ResponsiveContainer, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, Area } = ChartComponents;
  
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={exerciseHistory} margin={{ top: 40, right: 0, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={chartColor} stopOpacity={0.3}/>
            <stop offset="95%" stopColor={chartColor} stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(val) => format(new Date(val), 'dd/MM')} stroke="#333" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} dy={10}/>
        <YAxis stroke="#333" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false}/>
        <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #333', borderRadius: '12px', fontSize: '12px', color: '#fff' }} labelFormatter={(label) => format(new Date(label), 'MMM do, yyyy')}/>
        <Area type="monotone" dataKey="value" stroke={chartColor} strokeWidth={4} fillOpacity={1} fill="url(#colorValue)"/>
      </AreaChart>
    </ResponsiveContainer>
  );
};

interface PRModalProps {
  isOpen: boolean;
  onClose: () => void;
  workouts: Workout[];
  initialExercise?: string | null;
  userId?: string | null;
}

interface PersonalRecordWithCategory extends PersonalRecord {
  category: string;
  isBodyweight: boolean;
  oneRM?: number;
  bestSingleSet?: {
    weight: number;
    reps: number;
    volume: number;
    date: string;
  };
  bestNearMax?: {
    weight: number;
    reps: number;
    date: string;
  };
}

interface HistoryPoint {
  date: string;
  value: number; 
  secondaryValue?: number; 
  unit: string;
  reps?: number;
  weight?: number; // Peso de la mejor serie
  label: string; 
  isBodyweight: boolean;
  allSets?: Array<{ weight: number; reps: number; unit: string }>; // Todas las series del día
}

const calculate1RM = (weight: number, reps: number) => {
    if (weight === 0 || reps === 0) return 0;
    if (reps === 1) return weight;
    const r = Math.min(reps, 30);
    return Math.round(weight / (1.0278 - 0.0278 * r));
};

const parseTimeToMinutes = (timeStr: string | undefined): number => {
    if (!timeStr) return 0;
    if (timeStr.includes(':')) {
        const parts = timeStr.split(':').map(Number);
        if (parts.length === 2) return parts[0] * 60 + parts[1]; // MM:SS -> minutos totales
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]; // HH:MM:SS
    }
    return parseFloat(timeStr) || 0;
};

export const PRModal: React.FC<PRModalProps> = ({ isOpen, onClose, workouts, initialExercise, userId }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [storedRecords, setStoredRecords] = useState<UserRecord[]>([]);
  const [useStoredRecords, setUseStoredRecords] = useState(true);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [totalVolume, setTotalVolume] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bestNearMaxWorkout, setBestNearMaxWorkout] = useState<Workout | null>(null);
  const [bestNearMaxExerciseName, setBestNearMaxExerciseName] = useState<string>('');
  
  useScrollLock(isOpen);
  const { t } = useLanguage();
  const { catalog } = useExercises();

  // Cargar records almacenados y volumen total
  useEffect(() => {
    if (isOpen) {
      setError(null);
      // Solo mostrar loading si realmente vamos a cargar datos
      if (userId && useStoredRecords) {
        setIsLoading(true);
        setIsInitialLoad(true);
        Promise.all([
          getUserRecords(userId),
          getUserTotalVolume(userId)
        ]).then(([records, volume]) => {
          setStoredRecords(records || []);
          setTotalVolume(volume || 0);
          setIsLoading(false);
          setIsInitialLoad(false);
        }).catch(error => {
          console.error('Error loading stored records, using fallback:', error);
          setError('Error al cargar records. Usando cálculo en tiempo real.');
          setUseStoredRecords(false);
          setStoredRecords([]);
          setTotalVolume(0);
          setIsLoading(false);
          setIsInitialLoad(false);
        });
      } else {
        // Si no hay userId o no usamos stored records, no mostrar loading
        setIsLoading(false);
        setIsInitialLoad(false);
      }
    } else {
      // Resetear estado cuando se cierra el modal
      setIsLoading(false);
      setIsInitialLoad(false);
      setError(null);
      setStoredRecords([]);
      setTotalVolume(0);
      setSelectedExerciseId(null);
    }
  }, [isOpen, userId, useStoredRecords]);

  // Recargar volumen total cuando cambien los workouts (para reflejar actualizaciones en tiempo real)
  useEffect(() => {
    if (isOpen && userId && useStoredRecords) {
      getUserTotalVolume(userId)
        .then(volume => {
          setTotalVolume(volume || 0);
        })
        .catch(error => {
          console.error('Error reloading total volume:', error);
        });
    }
  }, [workouts, isOpen, userId, useStoredRecords]);

  useEffect(() => {
    if (isOpen) {
        if (initialExercise && typeof initialExercise === 'string' && catalog && catalog.length > 0) {
          try {
            const canonicalId = getCanonicalId(initialExercise, catalog);
            setSelectedExerciseId(canonicalId);
          } catch (err) {
            console.error('Error getting canonical ID:', err);
            setSelectedExerciseId(null);
          }
        } else {
          // Si no hay initialExercise, mostrar la vista principal
          setSelectedExerciseId(null);
        }
        setSearchTerm('');
    } else {
      // Resetear cuando se cierra el modal
      setSelectedExerciseId(null);
      setSearchTerm('');
    }
  }, [isOpen, initialExercise, catalog]);

  // Cargar workout del mejor combo cuando se selecciona un ejercicio
  useEffect(() => {
    const loadBestNearMaxWorkout = async () => {
      if (!selectedExerciseId || !userId || !storedRecords.length) {
        setBestNearMaxWorkout(null);
        setBestNearMaxExerciseName('');
        return;
      }

      const selectedRecord = storedRecords.find(r => {
        // exercise_id ahora es el nombre exacto, obtener el canonicalId para comparar
        const recordExerciseId = getCanonicalId(r.exercise_id, catalog);
        return recordExerciseId === selectedExerciseId;
      });

      if (selectedRecord?.best_near_max_workout_id) {
        try {
          const { data: workoutData, error } = await supabase
            .from('workouts')
            .select('*')
            .eq('id', selectedRecord.best_near_max_workout_id)
            .single();

          if (!error && workoutData) {
            setBestNearMaxWorkout(workoutData as Workout);
            // Buscar el nombre del ejercicio en el workout
            const workout = workoutData as Workout;
            const exerciseData = workout.structured_data?.exercises?.find(ex => {
              if (!ex || !ex.name || typeof ex.name !== 'string') return false;
              const exId = getCanonicalId(ex.name, catalog);
              return exId === selectedExerciseId;
            });
            if (exerciseData) {
              setBestNearMaxExerciseName(exerciseData.name);
            } else {
              // Si no encontramos el ejercicio por canonicalId, intentar por nombre directo
              const exerciseByName = workout.structured_data?.exercises?.find(ex => 
                getLocalizedName(ex.name, catalog) === getLocalizedName(selectedExerciseId, catalog)
              );
              if (exerciseByName) {
                setBestNearMaxExerciseName(exerciseByName.name);
              }
            }
          } else {
            console.error('Error loading workout:', error);
            setBestNearMaxWorkout(null);
            setBestNearMaxExerciseName('');
          }
        } catch (error) {
          console.error('Error loading best near max workout:', error);
          setBestNearMaxWorkout(null);
          setBestNearMaxExerciseName('');
        }
      } else {
        setBestNearMaxWorkout(null);
        setBestNearMaxExerciseName('');
      }
    };

    loadBestNearMaxWorkout();
  }, [selectedExerciseId, storedRecords, userId, catalog]);

  const globalStats = useMemo(() => {
    try {
      if (!workouts || workouts.length === 0) {
        return {
          totalVolume: "0 kg",
          daysTrained: 0
        };
      }

      const uniqueDays = new Set(workouts.map(w => w.date.split('T')[0])).size;
      
      // Usar el totalVolume obtenido de getUserTotalVolume (suma de total_volume_kg de user_records)
      // Este valor viene de la tabla user_records y se actualiza cuando se guardan workouts
      const volumeKg = totalVolume || 0;

      return {
          totalVolume: Math.round(volumeKg).toLocaleString('es-ES') + " kg",
          daysTrained: uniqueDays
      };
    } catch (err) {
      console.error('Error calculating globalStats:', err);
      return {
        totalVolume: "0 kg",
        daysTrained: 0
      };
    }
  }, [workouts, totalVolume]);

  const selectedExerciseType: MetricType = useMemo(() => {
      if (!selectedExerciseId) return 'strength';
      const def = catalog.find(e => e.id === selectedExerciseId);
      return def?.type || 'strength';
  }, [selectedExerciseId, catalog]);

  // Fix: Added explicit return type to personalRecords useMemo to avoid unknown inference
  const personalRecords = useMemo<PersonalRecordWithCategory[]>(() => {
    try {
      // Si tenemos records almacenados y están disponibles, usarlos
      if (useStoredRecords && storedRecords && storedRecords.length > 0) {
      return storedRecords.map(record => {
        // exercise_id ahora es el nombre exacto, no el ID del catálogo
        const canonicalId = getCanonicalId(record.exercise_id, catalog);
        const exerciseName = getLocalizedName(canonicalId, catalog);
        const def = catalog.find(e => e.id === canonicalId);
        const category = record.category || def?.category || 'General';
        
        return {
          exerciseName,
          weight: record.is_bodyweight ? 0 : record.max_weight_kg,
          unit: record.unit || 'kg',
          reps: record.is_bodyweight ? record.max_reps : record.max_weight_reps,
          date: record.max_1rm_date || record.max_weight_date || record.max_reps_date || '',
          estimated1RM: record.max_1rm_kg || undefined,
          oneRM: record.max_1rm_kg || 0,
          value: record.is_bodyweight ? record.max_reps : record.max_weight_kg,
          displayValue: record.is_bodyweight 
            ? `${record.max_reps} reps` 
            : `${record.max_weight_kg}${record.unit || 'kg'}`,
          isBodyweight: record.is_bodyweight,
          category,
          bestSingleSet: record.best_single_set_weight_kg && record.best_single_set_reps ? {
            weight: record.best_single_set_weight_kg,
            reps: record.best_single_set_reps,
            volume: record.best_single_set_volume_kg || 0,
            date: record.best_single_set_date || ''
          } : undefined,
          bestNearMax: record.best_near_max_weight_kg && record.best_near_max_reps ? {
            weight: record.best_near_max_weight_kg,
            reps: record.best_near_max_reps,
            date: record.best_near_max_date || ''
          } : undefined
        };
      }).sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));
    }

    // Fallback: calcular en tiempo real desde workouts
    const recordsMap = new Map<string, PersonalRecordWithCategory>();

    workouts.forEach(workout => {
      // Validar que workout.structured_data y exercises existan
      if (!workout?.structured_data?.exercises || !Array.isArray(workout.structured_data.exercises)) {
        return; // Saltar workouts sin datos válidos
      }
      
      workout.structured_data.exercises.forEach(exercise => {
        if (!exercise || !exercise.name || typeof exercise.name !== 'string') return;
        const canonicalId = getCanonicalId(exercise.name, catalog);
        const def = catalog.find(e => e.id === canonicalId);
        const type = def?.type || 'strength';
        const category = def?.category || 'General';
        const isUnilateral = exercise.unilateral || false;
        
        exercise.sets.forEach(set => {
          let value = 0;
          let isBodyweight = false;
          let current1RM = 0;

          if (type === 'cardio') {
              const dist = set.distance || (set.unit === 'km' || set.unit === 'm' ? set.weight : 0) || 0;
              value = dist;
          } else {
              if (set.weight && set.weight > 0) {
                  // Considerar ejercicios unilaterales
                  const realWeight = isUnilateral ? set.weight * 2 : set.weight;
                  value = realWeight;
                  isBodyweight = false;
                  current1RM = calculate1RM(realWeight, set.reps || 0);
              } else {
                  value = set.reps || 0;
                  isBodyweight = true;
              }
          }

          const currentRecord = recordsMap.get(canonicalId);
          let isBetter = false;

          if (!currentRecord) isBetter = true;
          else if (type === 'cardio') { if (value > currentRecord.value) isBetter = true; }
          else {
              if (!isBodyweight && currentRecord.isBodyweight) isBetter = true;
              else if (!isBodyweight && !currentRecord.isBodyweight) { 
                  if (current1RM > (currentRecord.oneRM || 0)) isBetter = true;
                  else if (value > currentRecord.value) isBetter = true;
              }
              else if (isBodyweight && currentRecord.isBodyweight) { if (value > currentRecord.value) isBetter = true; }
          }

          if (isBetter) {
            recordsMap.set(canonicalId, {
              exerciseName: canonicalId,
              weight: isBodyweight ? 0 : value, 
              unit: set.unit,
              reps: set.reps || 0,
              date: workout.date,
              estimated1RM: (!isBodyweight && type === 'strength') ? current1RM : undefined,
              oneRM: current1RM,
              value: value,
              displayValue: isBodyweight ? `${value} reps` : `${value}${set.unit}`,
              isBodyweight: isBodyweight,
              category: category
            });
          }
        });
      });
    });

      return Array.from(recordsMap.entries()).map(([id, pr]) => ({
          ...pr,
          exerciseName: getLocalizedName(id, catalog)
      })).sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));
    } catch (err) {
      console.error('Error calculating personalRecords:', err);
      return [];
    }
  }, [workouts, storedRecords, useStoredRecords, catalog]);

  // Fix: Added explicit return type to filteredRecords useMemo
  const filteredRecords = useMemo<PersonalRecordWithCategory[]>(() => {
    return personalRecords.filter(pr => pr.exerciseName.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [personalRecords, searchTerm]);

  // Fix: Added explicit return type to groupedRecords useMemo
  const groupedRecords = useMemo<Record<string, PersonalRecordWithCategory[]>>(() => {
    if (!filteredRecords || filteredRecords.length === 0) {
      return {};
    }
    const groups: Record<string, PersonalRecordWithCategory[]> = {};
    filteredRecords.forEach(pr => {
      const cat = pr.category || 'General';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(pr);
    });
    // Ordenamos las categorías alfabéticamente
    return Object.keys(groups).sort().reduce((acc, key) => {
      acc[key] = groups[key];
      return acc;
    }, {} as Record<string, PersonalRecordWithCategory[]>);
  }, [filteredRecords]);

  // Fix: Added explicit return type to exerciseHistory useMemo to fix 'unknown' type errors on line 283
  const exerciseHistory = useMemo<HistoryPoint[]>(() => {
    if (!selectedExerciseId) return [];
    
    // Buscar el record almacenado para este ejercicio
    const selectedRecord = storedRecords.find(r => getCanonicalId(r.exercise_id, catalog) === selectedExerciseId);
    
    // Si tenemos un record con daily_max, usarlo para construir el historial
    if (selectedRecord?.daily_max && Array.isArray(selectedRecord.daily_max) && selectedRecord.daily_max.length > 0) {
      const history: HistoryPoint[] = [];
      const isBW = selectedRecord.is_bodyweight || false;
      const unit = selectedRecord.unit || 'kg';
      
      selectedRecord.daily_max.forEach((dayMax: { date: string; max_weight_kg: number; max_reps: number }) => {
        if (!dayMax.date) return;
        
        // Obtener todas las series del día desde los workouts
        const workoutForDate = workouts.find(w => w.date.split('T')[0] === dayMax.date);
        let allSets: Array<{ weight: number; reps: number; unit: string }> = [];
        
        if (workoutForDate?.structured_data?.exercises) {
          const exerciseData = workoutForDate.structured_data.exercises.find(e => {
            if (!e || !e.name) return false;
            return getCanonicalId(e.name, catalog) === selectedExerciseId;
          });
          
          if (exerciseData?.sets) {
            const isUnilateral = exerciseData.unilateral || false;
            allSets = exerciseData.sets
              .filter(set => (set.reps || 0) > 0) // Solo series con reps > 0
              .map(set => {
                const weight = set.weight || 0;
                const realWeight = isUnilateral ? weight * 2 : weight;
                return {
                  weight: realWeight,
                  reps: set.reps || 0,
                  unit: set.unit || unit
                };
              });
          }
        }
        
        const maxWeight = dayMax.max_weight_kg || 0;
        const maxReps = dayMax.max_reps || 0;
        let primaryVal = 0, secondaryVal = 0, label = "";
        
        // Siempre mostrar peso × reps cuando haya peso, o solo reps si no hay peso
        if (maxWeight > 0) {
          primaryVal = maxWeight;
          label = `${maxWeight}${unit} × ${maxReps} reps`;
          secondaryVal = calculate1RM(maxWeight, maxReps);
        } else {
          primaryVal = maxReps;
          label = `${maxReps} reps`;
        }
        
        history.push({
          date: dayMax.date,
          value: primaryVal,
          secondaryValue: secondaryVal,
          unit: unit,
          reps: maxReps,
          weight: maxWeight,
          label,
          isBodyweight: isBW,
          allSets
        });
      });
      
      return history.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }
    
    // Fallback: calcular desde workouts (método antiguo mejorado)
    const history: HistoryPoint[] = [];
    const dayMaxMap = new Map<string, { max_weight_kg: number; max_reps: number; unit: string; isBW: boolean; date: string; allSets?: Array<{ weight: number; reps: number; unit: string }> }>();
    
    workouts.forEach(workout => {
        // Validar que el workout tenga datos válidos
        if (!workout?.structured_data?.exercises || !Array.isArray(workout.structured_data.exercises)) {
          return; // Saltar workouts sin datos válidos
        }
        
        const exerciseData = workout.structured_data.exercises.find(e => {
          if (!e || !e.name || typeof e.name !== 'string') return false;
          return getCanonicalId(e.name, catalog) === selectedExerciseId;
        });
        
        if (exerciseData) {
          const workoutDateOnly = workout.date.split('T')[0];
          let dayMax = dayMaxMap.get(workoutDateOnly) || { max_weight_kg: 0, max_reps: 0, unit: 'kg', isBW: false, date: workoutDateOnly, allSets: [] };
          
          const isUnilateral = exerciseData.unilateral || false;
          
          exerciseData.sets.forEach(set => {
            const weight = set.weight || 0;
            const reps = set.reps || 0;
            const unit = set.unit || 'kg';
            
            // Guardar todas las series válidas
            if (reps > 0) {
              const realWeight = isUnilateral ? weight * 2 : weight;
              if (!dayMax.allSets) dayMax.allSets = [];
              dayMax.allSets.push({ weight: realWeight, reps, unit });
            }
            
            if (selectedExerciseType === 'cardio') {
              // Para cardio, usar tiempo
              const timeInMinutes = parseTimeToMinutes(set.time || '');
              if (timeInMinutes > (dayMax.max_reps || 0)) {
                dayMax = { ...dayMax, max_reps: timeInMinutes, unit };
              }
            } else {
              if (weight > 0) {
                const realWeight = isUnilateral ? weight * 2 : weight;
                if (realWeight > dayMax.max_weight_kg || (realWeight === dayMax.max_weight_kg && reps > dayMax.max_reps)) {
                  dayMax = { ...dayMax, max_weight_kg: realWeight, max_reps: reps, unit, isBW: false };
                }
              } else {
                if (reps > dayMax.max_reps) {
                  dayMax = { ...dayMax, max_reps: reps, isBW: true };
                }
              }
            }
          });
          
          dayMaxMap.set(workoutDateOnly, dayMax);
        }
    });
    
    // Convertir el mapa a array de HistoryPoint
    dayMaxMap.forEach((dayMax, date) => {
      const maxWeight = dayMax.max_weight_kg || 0;
      const maxReps = dayMax.max_reps || 0;
      let primaryVal = 0, secondaryVal = 0, label = "";
      
      if (selectedExerciseType === 'cardio') {
        primaryVal = dayMax.max_reps; // Para cardio, max_reps almacena minutos
        label = `${Math.floor(primaryVal)}:${String(Math.round((primaryVal % 1) * 60)).padStart(2, '0')}`;
      } else if (maxWeight > 0) {
        // Siempre mostrar peso × reps cuando haya peso
        primaryVal = maxWeight;
        label = `${maxWeight}${dayMax.unit} × ${maxReps} reps`;
        secondaryVal = calculate1RM(maxWeight, maxReps);
      } else {
        primaryVal = maxReps;
        label = `${maxReps} reps`;
      }
      
      history.push({
        date: dayMax.date,
        value: primaryVal,
        secondaryValue: secondaryVal,
        unit: dayMax.unit,
        reps: maxReps,
        weight: maxWeight,
        label,
        isBodyweight: dayMax.isBW,
        allSets: dayMax.allSets
      });
    });
    
    return history.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [selectedExerciseId, workouts, selectedExerciseType, catalog, storedRecords]);

  const isMostlyBodyweight = useMemo(() => {
      if (exerciseHistory.length === 0) return false;
      return exerciseHistory.filter(h => h.isBodyweight).length > exerciseHistory.length / 2;
  }, [exerciseHistory]);

  if (!isOpen) return null;
  
  // Asegurar que el catálogo esté cargado antes de renderizar
  if (!catalog || catalog.length === 0) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
          <p className="text-white text-sm font-bold uppercase tracking-wider">Cargando catálogo...</p>
        </div>
      </div>
    );
  }
  
  const displaySelectedName = selectedExerciseId ? getLocalizedName(selectedExerciseId, catalog) : '';
  let primaryLabel = "Mejor Levantamiento", unitLabel = "kg", chartColor = "#D4FF00";
  if (selectedExerciseType === 'cardio') { primaryLabel = "Mejor Tiempo"; unitLabel = "MM:SS"; chartColor = "#ef4444"; }
  else if (isMostlyBodyweight) { primaryLabel = "Máx Reps"; unitLabel = "reps"; chartColor = "#f472b6"; }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-zinc-900 border border-white/10 rounded-[2.5rem] shadow-2xl flex flex-col h-[85vh] overflow-hidden relative">
        {isLoading && isInitialLoad ? (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/95 backdrop-blur-sm z-50 rounded-[2.5rem]">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
              <p className="text-white text-sm font-bold uppercase tracking-wider">Cargando Records...</p>
            </div>
          </div>
        ) : null}
        {error && (
          <div className="absolute top-4 left-4 right-4 bg-yellow-500/20 border border-yellow-500/50 rounded-xl p-3 z-40">
            <p className="text-yellow-400 text-xs font-bold">{error}</p>
          </div>
        )}
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-zinc-900/50 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-4">
            {selectedExerciseId ? (
                <button onClick={() => setSelectedExerciseId(null)} className="p-2 -ml-2 rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors"><ArrowLeft className="w-5 h-5" /></button>
            ) : (
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-glow"><Trophy className="w-6 h-6 text-primary" /></div>
            )}
            <div>
                <h2 className="text-xl font-black text-white italic tracking-tighter uppercase">{selectedExerciseId ? displaySelectedName : 'Centro de Records'}</h2>
                {!selectedExerciseId && <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Auditoría de Marcas Personales</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8 bg-zinc-950">
            {!selectedExerciseId ? (
                <div className="space-y-8 animate-in fade-in slide-in-from-left-10 duration-300">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-zinc-900/80 border border-white/5 p-5 rounded-3xl relative overflow-hidden group">
                            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity"><Scale className="w-20 h-20 text-white" /></div>
                            <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1 flex items-center gap-2"><Scale className="w-3 h-3" /> Carga Histórica</div>
                            <div className="text-2xl font-black text-white font-mono tracking-tighter">{globalStats.totalVolume}</div>
                        </div>
                        <div className="bg-zinc-900/80 border border-white/5 p-5 rounded-3xl relative overflow-hidden group">
                            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity"><Calendar className="w-20 h-20 text-white" /></div>
                            <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1 flex items-center gap-2"><Activity className="w-3 h-3 text-primary" /> Días Entrenados</div>
                            <div className="text-2xl font-black text-white font-mono tracking-tighter">{globalStats.daysTrained} <span className="text-xs font-sans text-zinc-500 font-bold uppercase">SESIONES</span></div>
                        </div>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                        <input placeholder="Buscar marca en biblioteca..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-zinc-900/50 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm text-white focus:outline-none focus:border-primary/50 transition-all"/>
                    </div>

                    <div className="space-y-10">
                        {Object.keys(groupedRecords).length === 0 ? (
                            <div className="text-center py-12">
                                <Trophy className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
                                <p className="text-zinc-500 text-sm font-bold uppercase tracking-wider">No hay records registrados</p>
                                <p className="text-zinc-600 text-xs mt-2">Comienza a entrenar para ver tus marcas aquí</p>
                            </div>
                        ) : (
                            Object.entries(groupedRecords).map(([category, records]) => (
                            <div key={category} className="space-y-4">
                                <div className="flex items-center gap-2 px-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-glow"></div>
                                    <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.3em] italic">{category}</h3>
                                    <div className="flex-1 h-px bg-white/5"></div>
                                </div>
                                <div className="grid grid-cols-1 gap-3">
                                    {(records as PersonalRecordWithCategory[]).map((pr, idx) => (
                                        <button key={idx} onClick={() => {
                                          if (pr.exerciseName && typeof pr.exerciseName === 'string') {
                                            setSelectedExerciseId(getCanonicalId(pr.exerciseName, catalog));
                                          }
                                        }} className="flex items-center justify-between p-4 bg-zinc-900/40 border border-white/5 rounded-3xl hover:bg-zinc-800/60 hover:border-primary/20 transition-all group relative overflow-hidden">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-zinc-500 group-hover:text-primary transition-colors border border-white/5 group-hover:border-primary/20">
                                                    {getExerciseIcon(pr.exerciseName, catalog, "w-5 h-5")}
                                                </div>
                                                <div className="text-left">
                                                    <h3 className="font-bold text-white text-sm leading-none mb-1">{pr.exerciseName}</h3>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-[9px] text-zinc-600 font-mono uppercase tracking-wider">{format(new Date(pr.date), 'dd MMM')}</span>
                                                        {pr.estimated1RM && <span className="text-[8px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-black uppercase italic">1RM: {pr.estimated1RM}kg</span>}
                                                        {pr.bestSingleSet && <span className="text-[8px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded font-black uppercase italic">Best Set: {pr.bestSingleSet.weight}kg × {pr.bestSingleSet.reps}</span>}
                                                        {pr.bestNearMax && <span className="text-[8px] bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded font-black uppercase italic">Near Max: {pr.isBodyweight ? `${pr.bestNearMax.reps} reps` : `${pr.bestNearMax.weight}kg × ${pr.bestNearMax.reps}`}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-lg font-black text-white font-mono">{pr.displayValue}</div>
                                                {pr.reps > 1 && !pr.isBodyweight && <div className="text-[9px] text-zinc-600 font-bold uppercase italic">@{pr.reps} reps</div>}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))
                        )}
                    </div>
                </div>
            ) : (
                <div className="space-y-8 animate-in slide-in-from-right-10 fade-in duration-300">
                    {/* Obtener el record del ejercicio seleccionado para mostrar best single set y best combo */}
                    {(() => {
                        // exercise_id ahora es el nombre exacto, obtener el canonicalId para comparar
                        const selectedRecord = storedRecords.find(r => getCanonicalId(r.exercise_id, catalog) === selectedExerciseId);
                        return (
                            <>
                                <div className={`grid grid-cols-2 ${selectedExerciseType === 'strength' && !isMostlyBodyweight && selectedRecord && selectedRecord.total_volume_kg > 0 ? 'md:grid-cols-4' : selectedExerciseType === 'strength' && !isMostlyBodyweight ? 'md:grid-cols-3' : selectedRecord && selectedRecord.total_volume_kg > 0 ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
                                    <div className="bg-zinc-900/80 border border-white/5 p-5 rounded-3xl">
                                         <div className="flex items-center gap-2 mb-1">{isMostlyBodyweight ? <Hash className="w-3.5 h-3.5 text-pink-400" /> : <Trophy className="w-3.5 h-3.5" style={{ color: chartColor }} />}<span className="text-[10px] uppercase font-black text-zinc-500 tracking-widest">{primaryLabel}</span></div>
                                         <div className="text-2xl font-black text-white font-mono">
                                           {selectedRecord ? (selectedRecord.is_bodyweight ? selectedRecord.max_reps : selectedRecord.max_weight_kg) : (exerciseHistory.length > 0 ? Math.max(...exerciseHistory.map(h => h.value)) : 0)} 
                                           <span className="text-[10px] text-zinc-600 font-sans font-bold">{unitLabel}</span>
                                         </div>
                                    </div>
                                    {selectedExerciseType === 'strength' && !isMostlyBodyweight && (
                                        <div className="bg-primary/5 border border-primary/20 p-5 rounded-3xl relative overflow-hidden">
                                            <div className="absolute -right-2 -bottom-2 opacity-5"><Zap className="w-16 h-16 text-primary" /></div>
                                            <div className="flex items-center gap-2 mb-1"><Calculator className="w-3.5 h-3.5 text-primary" /><span className="text-[10px] uppercase font-black text-primary tracking-widest">PR Proyectado (1RM)</span></div>
                                            <div className="text-2xl font-black text-primary font-mono">
                                              {selectedRecord ? selectedRecord.max_1rm_kg : (exerciseHistory.length > 0 ? Math.max(...exerciseHistory.map(h => h.secondaryValue || 0)) : 0)} 
                                              <span className="text-[10px] text-zinc-600 font-sans font-bold">KG</span>
                                            </div>
                                        </div>
                                    )}
                                    <div className="bg-zinc-900/80 border border-white/5 p-5 rounded-3xl flex flex-col justify-center">
                                         <div className="flex items-center gap-2 mb-1"><Activity className="w-3.5 h-3.5 text-green-500" /><span className="text-[10px] uppercase font-black text-zinc-500 tracking-widest">Sesiones Totales</span></div>
                                         <div className="text-2xl font-black text-green-500 font-mono">{exerciseHistory.length}</div>
                                    </div>
                                    {selectedRecord && selectedRecord.total_volume_kg > 0 && (
                                        <div className="bg-zinc-900/80 border border-white/5 p-5 rounded-3xl flex flex-col justify-center">
                                            <div className="flex items-center gap-2 mb-1"><Scale className="w-3.5 h-3.5 text-blue-500" /><span className="text-[10px] uppercase font-black text-zinc-500 tracking-widest">Total kg</span></div>
                                            <div className="text-2xl font-black text-blue-500 font-mono">{Math.round(selectedRecord.total_volume_kg)}</div>
                                        </div>
                                    )}
                                </div>

                                {/* Best Single Set y Best Near Max */}
                                {(selectedRecord?.best_single_set_weight_kg || selectedRecord?.best_near_max_weight_kg) && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {selectedRecord.best_single_set_weight_kg && selectedRecord.best_single_set_reps && (
                                            <div className="bg-blue-500/10 border border-blue-500/20 p-5 rounded-3xl relative overflow-hidden">
                                                <div className="absolute -right-2 -bottom-2 opacity-5"><Trophy className="w-16 h-16 text-blue-400" /></div>
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Trophy className="w-4 h-4 text-blue-400" />
                                                    <span className="text-[10px] uppercase font-black text-blue-400 tracking-widest">Mejor Serie Individual</span>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="text-2xl font-black text-blue-400 font-mono">{selectedRecord.best_single_set_weight_kg}kg × {selectedRecord.best_single_set_reps} reps</div>
                                                    <div className="text-xs text-blue-300/80 font-mono">Volumen: {Math.round(selectedRecord.best_single_set_volume_kg || 0)}kg</div>
                                                    {selectedRecord.best_single_set_date && (
                                                        <div className="text-[9px] text-blue-400/60 font-mono uppercase tracking-wider">{format(new Date(selectedRecord.best_single_set_date), 'dd MMM yyyy')}</div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        {selectedRecord.best_near_max_weight_kg && selectedRecord.best_near_max_reps && (
                                            <div className="bg-green-500/10 border border-green-500/20 p-5 rounded-3xl relative overflow-hidden">
                                                <div className="absolute -right-2 -bottom-2 opacity-5"><Target className="w-16 h-16 text-green-400" /></div>
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Target className="w-4 h-4 text-green-400" />
                                                    <span className="text-[10px] uppercase font-black text-green-400 tracking-widest">Mejor Serie Cerca del Máximo</span>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="text-2xl font-black text-green-400 font-mono">
                                                        {selectedRecord.is_bodyweight 
                                                            ? `${selectedRecord.best_near_max_reps} reps`
                                                            : `${selectedRecord.best_near_max_weight_kg}kg × ${selectedRecord.best_near_max_reps} reps`
                                                        }
                                                    </div>
                                                    <div className="text-xs text-green-300/80 font-mono">
                                                        {selectedRecord.is_bodyweight
                                                            ? `Repeticiones cercanas al máximo (${selectedRecord.max_reps} reps)`
                                                            : `Peso cercano al máximo (${selectedRecord.max_weight_kg}kg)`
                                                        }
                                                    </div>
                                                    {selectedRecord.best_near_max_date && (
                                                        <div className="text-[9px] text-green-400/60 font-mono uppercase tracking-wider">{format(new Date(selectedRecord.best_near_max_date), 'dd MMM yyyy')}</div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        );
                    })()}

                    <div className="bg-zinc-900/30 border border-white/5 rounded-[2.5rem] p-6 h-80 w-full relative">
                        <div className="absolute top-4 left-6 text-[10px] font-black text-zinc-700 uppercase tracking-widest">Evolución de Intensidad</div>
                        {exerciseHistory.length > 1 ? (
                            <ChartWrapper exerciseHistory={exerciseHistory} chartColor={chartColor} />
                        ) : <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-800"><TrendingUp className="w-12 h-12 mb-2" /><span className="text-xs font-bold uppercase tracking-widest">Datos Insuficientes</span></div>}
                    </div>

                    <div className="space-y-3">
                         <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-4">Historial de Progresión</h4>
                         {/* Fix: exerciseHistory is now explicitly typed as HistoryPoint[], so .map is valid */}
                         {exerciseHistory.slice().reverse().map((h, i) => (
                             <div key={i} className="flex flex-col gap-2 p-4 bg-zinc-900/40 border border-white/5 rounded-2xl">
                                 <div className="flex items-center justify-between">
                                     <div className="flex items-center gap-4">
                                         <div className="text-xs font-mono text-zinc-600 font-bold">{format(new Date(h.date), 'dd/MM/yy')}</div>
                                         <div className="text-sm font-bold text-white">{h.label}</div>
                                     </div>
                                     {h.secondaryValue && h.secondaryValue > 0 && selectedExerciseType !== 'cardio' && (
                                         <div className="text-[10px] font-mono text-primary font-bold bg-primary/5 px-2 py-1 rounded border border-primary/10">1RM Est: {Math.round(h.secondaryValue)}kg</div>
                                     )}
                                 </div>
                                 {h.allSets && h.allSets.length > 0 && (
                                     <div className="flex flex-wrap gap-1.5 mt-1">
                                         {h.allSets.map((set, idx) => (
                                             <div key={idx} className="text-[9px] font-mono text-zinc-500 bg-zinc-800/50 px-2 py-0.5 rounded border border-zinc-700/30">
                                                 {set.weight > 0 ? `${set.weight}${set.unit}×${set.reps}` : `${set.reps} reps`}
                                             </div>
                                         ))}
                                     </div>
                                 )}
                             </div>
                         ))}
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
