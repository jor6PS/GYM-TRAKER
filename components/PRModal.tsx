
import React, { useMemo, useState, useEffect } from 'react';
import { X, Trophy, TrendingUp, Search, Calendar, ChevronRight, ArrowLeft, Calculator, Activity, Hash, Scale, Zap, Layers } from 'lucide-react';
import { Workout, PersonalRecord, MetricType } from '../types';
import { format } from 'date-fns';
import { getExerciseIcon, getCanonicalId, getLocalizedName } from '../utils';
import { useLanguage } from '../contexts/LanguageContext';
import { useExercises } from '../contexts/ExerciseContext';
import { getUserRecords, getUserTotalVolume, UserRecord } from '../services/recordsService';
import { supabase } from '../services/supabase';
import { isCalisthenic, calculateSetVolume } from '../services/workoutProcessor/helpers';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';

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
  bestSetCombination?: {
    volume: number;
    sets: number;
    avgReps: number;
    weight: number;
    consistency: number;
    date: string;
  };
}

interface HistoryPoint {
  date: string;
  value: number; 
  secondaryValue?: number; 
  unit: string;
  reps?: number;
  label: string; 
  isBodyweight: boolean; 
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
  const [bestComboWorkout, setBestComboWorkout] = useState<Workout | null>(null);
  const [bestComboExerciseName, setBestComboExerciseName] = useState<string>('');
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
    const loadBestComboWorkout = async () => {
      if (!selectedExerciseId || !userId || !storedRecords.length) {
        setBestComboWorkout(null);
        setBestComboExerciseName('');
        return;
      }

      const selectedRecord = storedRecords.find(r => {
        const recordExerciseId = getCanonicalId(getLocalizedName(r.exercise_id, catalog), catalog);
        return recordExerciseId === selectedExerciseId;
      });

      if (selectedRecord?.best_set_combination_workout_id) {
        try {
          const { data: workoutData, error } = await supabase
            .from('workouts')
            .select('*')
            .eq('id', selectedRecord.best_set_combination_workout_id)
            .single();

          if (!error && workoutData) {
            setBestComboWorkout(workoutData as Workout);
            // Buscar el nombre del ejercicio en el workout
            const workout = workoutData as Workout;
            const exerciseData = workout.structured_data?.exercises?.find(ex => {
              if (!ex || !ex.name || typeof ex.name !== 'string') return false;
              const exId = getCanonicalId(ex.name, catalog);
              return exId === selectedExerciseId;
            });
            if (exerciseData) {
              setBestComboExerciseName(exerciseData.name);
            } else {
              // Si no encontramos el ejercicio por canonicalId, intentar por nombre directo
              const exerciseByName = workout.structured_data?.exercises?.find(ex => 
                getLocalizedName(ex.name, catalog) === getLocalizedName(selectedExerciseId, catalog)
              );
              if (exerciseByName) {
                setBestComboExerciseName(exerciseByName.name);
              }
            }
          } else {
            console.error('Error loading workout:', error);
            setBestComboWorkout(null);
            setBestComboExerciseName('');
          }
        } catch (error) {
          console.error('Error loading best combo workout:', error);
          setBestComboWorkout(null);
          setBestComboExerciseName('');
        }
      } else {
        setBestComboWorkout(null);
        setBestComboExerciseName('');
      }
    };

    loadBestComboWorkout();
  }, [selectedExerciseId, storedRecords, userId, catalog]);

  const globalStats = useMemo(() => {
    try {
      const uniqueDays = new Set(workouts.map(w => w.date)).size;
      
      // ✅ CORRECCIÓN: Siempre recalcular desde workouts para asegurar que esté actualizado
      // El valor de records puede estar desactualizado si hay nuevos workouts
      let volumeKg = 0;
      
      workouts.forEach(w => {
        // Validar que el workout tenga datos válidos
        if (!w?.structured_data?.exercises || !Array.isArray(w.structured_data.exercises)) {
          return; // Saltar workouts sin datos válidos
        }
        
        const historicWeight = w.user_weight || 80;
        const workoutData = w.structured_data;
        
        workoutData.exercises.forEach(ex => {
          if (!ex || !ex.name || typeof ex.name !== 'string') return;
          const id = getCanonicalId(ex.name, catalog);
          const exerciseDef = catalog.find(e => e.id === id);
          const exerciseType = exerciseDef?.type || 'strength';
          
          // Solo procesar ejercicios de fuerza (igual que en recordsService)
          if (exerciseType !== 'strength') return;
          
          const isBodyweightExercise = isCalisthenic(id);
          const isUnilateral = ex.unilateral || false;
          
          ex.sets.forEach(s => {
            const reps = s.reps || 0;
            if (reps === 0) return;
            
            // Usar la misma función calculateSetVolume que se usa en recordsService
            const setVolume = calculateSetVolume(reps, s.weight, s.unit, historicWeight, isBodyweightExercise, isUnilateral);
            volumeKg += setVolume;
          });
        });
      });

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
  }, [workouts, catalog]);

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
        const exerciseName = getLocalizedName(record.exercise_id, catalog);
        const def = catalog.find(e => e.id === record.exercise_id);
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
          bestSetCombination: record.best_set_combination_volume_kg && record.best_set_combination_sets_count ? {
            volume: record.best_set_combination_volume_kg,
            sets: record.best_set_combination_sets_count,
            avgReps: record.best_set_combination_avg_reps || 0,
            weight: record.best_set_combination_weight_kg || 0,
            consistency: record.best_set_combination_consistency_score || 0,
            date: record.best_set_combination_date || ''
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
    const history: HistoryPoint[] = [];
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
            let bestSet = exerciseData.sets[0];
            let bestScore = -1;
            let isBW = false;
            exerciseData.sets.forEach(set => {
                let score = 0;
                if (selectedExerciseType === 'cardio') {
                    // Para cardio, usar tiempo como métrica principal (convertir MM:SS a minutos)
                    const timeInMinutes = parseTimeToMinutes(set.time || '');
                    score = timeInMinutes;
                }
                else {
                    if (set.weight && set.weight > 0) score = calculate1RM(set.weight, set.reps || 0);
                    else { score = set.reps || 0; isBW = true; }
                }
                if (score > bestScore) { bestScore = score; bestSet = set; isBW = !set.weight || set.weight === 0; }
            });
            if (bestSet && bestScore > 0) {
                let primaryVal = 0, secondaryVal = 0, label = "";
                if (selectedExerciseType === 'cardio') {
                    primaryVal = parseTimeToMinutes(bestSet.time || '');
                    label = bestSet.time || '--:--';
                    // Para cardio, el valor primario es el tiempo en minutos
                } else {
                    if (isBW) { primaryVal = bestSet.reps || 0; label = `${primaryVal} reps`; }
                    else { primaryVal = bestSet.weight || 0; secondaryVal = calculate1RM(primaryVal, bestSet.reps || 0); label = `${primaryVal}${bestSet.unit}`; }
                }
                history.push({ date: workout.date, value: primaryVal, secondaryValue: secondaryVal, unit: bestSet.unit, reps: bestSet.reps || 0, label, isBodyweight: isBW });
            }
        }
    });
    return history.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [selectedExerciseId, workouts, selectedExerciseType, catalog]);

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
                                                        {pr.bestSetCombination && <span className="text-[8px] bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded font-black uppercase italic">Best Combo: {Math.round(pr.bestSetCombination.volume)}kg</span>}
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
                        const selectedRecord = storedRecords.find(r => getCanonicalId(getLocalizedName(r.exercise_id, catalog), catalog) === selectedExerciseId);
                        return (
                            <>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <div className="bg-zinc-900/80 border border-white/5 p-5 rounded-3xl">
                                         <div className="flex items-center gap-2 mb-1">{isMostlyBodyweight ? <Hash className="w-3.5 h-3.5 text-pink-400" /> : <Trophy className="w-3.5 h-3.5" style={{ color: chartColor }} />}<span className="text-[10px] uppercase font-black text-zinc-500 tracking-widest">{primaryLabel}</span></div>
                                         <div className="text-2xl font-black text-white font-mono">{Math.max(...exerciseHistory.map(h => h.value))} <span className="text-[10px] text-zinc-600 font-sans font-bold">{unitLabel}</span></div>
                                    </div>
                                    {selectedExerciseType === 'strength' && !isMostlyBodyweight && (
                                        <div className="bg-primary/5 border border-primary/20 p-5 rounded-3xl relative overflow-hidden">
                                            <div className="absolute -right-2 -bottom-2 opacity-5"><Zap className="w-16 h-16 text-primary" /></div>
                                            <div className="flex items-center gap-2 mb-1"><Calculator className="w-3.5 h-3.5 text-primary" /><span className="text-[10px] uppercase font-black text-primary tracking-widest">PR Proyectado (1RM)</span></div>
                                            <div className="text-2xl font-black text-primary font-mono">{Math.max(...exerciseHistory.map(h => h.secondaryValue || 0))} <span className="text-[10px] text-zinc-600 font-sans font-bold">KG</span></div>
                                        </div>
                                    )}
                                    <div className="bg-zinc-900/80 border border-white/5 p-5 rounded-3xl flex flex-col justify-center">
                                         <div className="flex items-center gap-2 mb-1"><Activity className="w-3.5 h-3.5 text-green-500" /><span className="text-[10px] uppercase font-black text-zinc-500 tracking-widest">Sesiones Totales</span></div>
                                         <div className="text-2xl font-black text-green-500 font-mono">{exerciseHistory.length}</div>
                                    </div>
                                </div>

                                {/* Best Single Set y Best Set Combination */}
                                {(selectedRecord?.best_single_set_weight_kg || selectedRecord?.best_set_combination_volume_kg) && (
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
                                        {selectedRecord.best_set_combination_volume_kg && selectedRecord.best_set_combination_sets_count && (
                                            <div className="bg-green-500/10 border border-green-500/20 p-5 rounded-3xl relative overflow-hidden">
                                                <div className="absolute -right-2 -bottom-2 opacity-5"><Layers className="w-16 h-16 text-green-400" /></div>
                                                <div className="flex items-center gap-2 mb-3">
                                                    <Layers className="w-4 h-4 text-green-400" />
                                                    <span className="text-[10px] uppercase font-black text-green-400 tracking-widest">Mejor Combinación de Series</span>
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="text-2xl font-black text-green-400 font-mono">{Math.round(selectedRecord.best_set_combination_volume_kg)}kg</div>
                                                    
                                                    {/* Mostrar detalles de cada serie si tenemos el workout */}
                                                    {bestComboWorkout && (() => {
                                                        // Buscar el ejercicio en el workout
                                                        let exerciseData = bestComboWorkout.structured_data?.exercises?.find(ex => {
                                                            if (!ex || !ex.name || typeof ex.name !== 'string') return false;
                                                            const exId = getCanonicalId(ex.name, catalog);
                                                            return exId === selectedExerciseId;
                                                        });
                                                        
                                                        // Si no lo encontramos por canonicalId, intentar por nombre directo
                                                        if (!exerciseData) {
                                                            exerciseData = bestComboWorkout.structured_data?.exercises?.find(ex => 
                                                                getLocalizedName(ex.name, catalog) === getLocalizedName(selectedExerciseId, catalog)
                                                            );
                                                        }
                                                        
                                                        if (exerciseData && exerciseData.sets && exerciseData.sets.length > 0) {
                                                            return (
                                                                <div className="space-y-1.5 mt-3 pt-3 border-t border-green-500/20">
                                                                    <div className="text-[9px] text-green-400/80 font-black uppercase tracking-wider mb-2">Detalles de las Series:</div>
                                                                    <div className="space-y-1">
                                                                        {exerciseData.sets.map((set, idx) => {
                                                                            const weightInKg = set.unit === 'lbs' ? (set.weight || 0) * 0.453592 : (set.weight || 0);
                                                                            const isUnilateral = exerciseData.unilateral || false;
                                                                            const realWeight = isUnilateral ? weightInKg * 2 : weightInKg;
                                                                            
                                                                            return (
                                                                                <div key={idx} className="flex items-center justify-between text-xs font-mono text-green-300/90 bg-green-500/5 px-2 py-1.5 rounded border border-green-500/10">
                                                                                    <span className="text-green-400/60 font-bold">Serie {idx + 1}:</span>
                                                                                    <span className="font-black">
                                                                                        {realWeight.toFixed(1)}kg × {set.reps || 0} reps
                                                                                        {isUnilateral && <span className="text-[10px] text-green-400/60 ml-1">(×2)</span>}
                                                                                        {set.unit === 'lbs' && !isUnilateral && <span className="text-[10px] text-green-400/60 ml-1">({set.weight}lbs)</span>}
                                                                                    </span>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                    <div className="text-[9px] text-green-400/60 font-mono uppercase tracking-wider mt-2 pt-2 border-t border-green-500/10">
                                                                        Total: {exerciseData.sets.length} series • Volumen: {Math.round(selectedRecord.best_set_combination_volume_kg || 0)}kg
                                                                        {selectedRecord.best_set_combination_consistency_score !== undefined && selectedRecord.best_set_combination_consistency_score > 0 && ` • Consistencia: ${Math.round(selectedRecord.best_set_combination_consistency_score * 100)}%`}
                                                                    </div>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                    
                                                    {/* Fallback si no tenemos el workout */}
                                                    {!bestComboWorkout && (
                                                        <>
                                                            <div className="text-xs text-green-300/80 font-mono">
                                                                {selectedRecord.best_set_combination_sets_count} sets × {Math.round(selectedRecord.best_set_combination_avg_reps || 0)} reps avg
                                                                {selectedRecord.best_set_combination_weight_kg !== undefined && selectedRecord.best_set_combination_weight_kg > 0 && ` @ ${selectedRecord.best_set_combination_weight_kg}kg`}
                                                            </div>
                                                            {selectedRecord.best_set_combination_consistency_score !== undefined && selectedRecord.best_set_combination_consistency_score > 0 && (
                                                                <div className="text-[9px] text-green-400/60 font-mono uppercase tracking-wider">Consistencia: {Math.round(selectedRecord.best_set_combination_consistency_score * 100)}%</div>
                                                            )}
                                                        </>
                                                    )}
                                                    
                                                    {selectedRecord.best_set_combination_date && (
                                                        <div className="text-[9px] text-green-400/60 font-mono uppercase tracking-wider">{format(new Date(selectedRecord.best_set_combination_date), 'dd MMM yyyy')}</div>
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
                            <ResponsiveContainer width="100%" height="100%"><AreaChart data={exerciseHistory} margin={{ top: 40, right: 0, left: -20, bottom: 0 }}><defs><linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={chartColor} stopOpacity={0.3}/><stop offset="95%" stopColor={chartColor} stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} /><XAxis dataKey="date" tickFormatter={(val) => format(new Date(val), 'dd/MM')} stroke="#333" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} dy={10}/><YAxis stroke="#333" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false}/><Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #333', borderRadius: '12px', fontSize: '12px', color: '#fff' }} labelFormatter={(label) => format(new Date(label), 'MMM do, yyyy')}/><Area type="monotone" dataKey="value" stroke={chartColor} strokeWidth={4} fillOpacity={1} fill="url(#colorValue)"/></AreaChart></ResponsiveContainer>
                        ) : <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-800"><TrendingUp className="w-12 h-12 mb-2" /><span className="text-xs font-bold uppercase tracking-widest">Datos Insuficientes</span></div>}
                    </div>

                    <div className="space-y-3">
                         <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-4">Historial de Progresión</h4>
                         {/* Fix: exerciseHistory is now explicitly typed as HistoryPoint[], so .map is valid */}
                         {exerciseHistory.slice().reverse().map((h, i) => (
                             <div key={i} className="flex items-center justify-between p-4 bg-zinc-900/40 border border-white/5 rounded-2xl">
                                 <div className="flex items-center gap-4">
                                     <div className="text-xs font-mono text-zinc-600 font-bold">{format(new Date(h.date), 'dd/MM/yy')}</div>
                                     <div className="text-sm font-bold text-white">{h.label}</div>
                                 </div>
                                 {h.secondaryValue && h.secondaryValue > 0 && (
                                     <div className="text-[10px] font-mono text-primary font-bold bg-primary/5 px-2 py-1 rounded border border-primary/10">1RM Est: {h.secondaryValue}kg</div>
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
