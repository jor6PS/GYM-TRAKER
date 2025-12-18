
import React, { useMemo, useState, useEffect } from 'react';
import { X, Trophy, TrendingUp, Search, Calendar, ChevronRight, ArrowLeft, Calculator, Activity, Hash, Scale, Zap, Layers } from 'lucide-react';
import { Workout, PersonalRecord, MetricType } from '../types';
import { format } from 'date-fns';
import { getExerciseIcon, getCanonicalId, getLocalizedName } from '../utils';
import { useLanguage } from '../contexts/LanguageContext';
import { useExercises } from '../contexts/ExerciseContext';
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
}

interface PersonalRecordWithCategory extends PersonalRecord {
  category: string;
  isBodyweight: boolean;
  oneRM?: number;
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
        if (parts.length === 2) return parts[0]; 
        if (parts.length === 3) return parts[0] * 60 + parts[1];
    }
    return parseFloat(timeStr) || 0;
};

export const PRModal: React.FC<PRModalProps> = ({ isOpen, onClose, workouts, initialExercise }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const { language, t } = useLanguage();
  const { catalog } = useExercises();

  useEffect(() => {
    if (isOpen) {
        if (initialExercise) setSelectedExerciseId(getCanonicalId(initialExercise, catalog));
        else setSelectedExerciseId(null);
        setSearchTerm('');
    }
  }, [isOpen, initialExercise, catalog]);

  const globalStats = useMemo(() => {
    let volumeKg = 0;
    const uniqueDays = new Set(workouts.map(w => w.date)).size;
    
    workouts.forEach(w => {
        const historicWeight = w.user_weight || 80;
        w.structured_data.exercises.forEach(ex => {
            const id = getCanonicalId(ex.name, catalog);
            ex.sets.forEach(s => {
                let wVal = (s.weight && s.weight > 0) ? s.weight : 0;
                if (s.unit === 'lbs') wVal *= 0.453592;
                const weightToUse = (id.includes('pull_up') || id.includes('dips') || id.includes('muscle_up')) 
                  ? (historicWeight + wVal) 
                  : (wVal === 0 ? historicWeight : wVal);
                volumeKg += (weightToUse * (s.reps || 0));
            });
        });
    });

    return {
        totalVolume: Math.round(volumeKg).toLocaleString('en-US') + " kg",
        daysTrained: uniqueDays
    };
  }, [workouts, catalog]);

  const selectedExerciseType: MetricType = useMemo(() => {
      if (!selectedExerciseId) return 'strength';
      const def = catalog.find(e => e.id === selectedExerciseId);
      return def?.type || 'strength';
  }, [selectedExerciseId, catalog]);

  // Fix: Added explicit return type to personalRecords useMemo to avoid unknown inference
  const personalRecords = useMemo<PersonalRecordWithCategory[]>(() => {
    const recordsMap = new Map<string, PersonalRecordWithCategory>();

    workouts.forEach(workout => {
      workout.structured_data.exercises.forEach(exercise => {
        const canonicalId = getCanonicalId(exercise.name, catalog);
        const def = catalog.find(e => e.id === canonicalId);
        const type = def?.type || 'strength';
        const category = def?.category || 'General';
        
        exercise.sets.forEach(set => {
          let value = 0;
          let isBodyweight = false;
          let current1RM = 0;

          if (type === 'cardio') {
              const dist = set.distance || (set.unit === 'km' || set.unit === 'm' ? set.weight : 0) || 0;
              value = dist;
          } else {
              if (set.weight && set.weight > 0) {
                  value = set.weight;
                  isBodyweight = false;
                  current1RM = calculate1RM(value, set.reps || 0);
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
        exerciseName: getLocalizedName(id, catalog, language as 'es' | 'en')
    })).sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));

  }, [workouts, language, catalog]);

  // Fix: Added explicit return type to filteredRecords useMemo
  const filteredRecords = useMemo<PersonalRecordWithCategory[]>(() => {
    return personalRecords.filter(pr => pr.exerciseName.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [personalRecords, searchTerm]);

  // Fix: Added explicit return type to groupedRecords useMemo
  const groupedRecords = useMemo<Record<string, PersonalRecordWithCategory[]>>(() => {
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
        const exerciseData = workout.structured_data.exercises.find(e => getCanonicalId(e.name, catalog) === selectedExerciseId);
        if (exerciseData) {
            let bestSet = exerciseData.sets[0];
            let bestScore = -1;
            let isBW = false;
            exerciseData.sets.forEach(set => {
                let score = 0;
                if (selectedExerciseType === 'cardio') score = set.distance || 0;
                else {
                    if (set.weight && set.weight > 0) score = calculate1RM(set.weight, set.reps || 0);
                    else { score = set.reps || 0; isBW = true; }
                }
                if (score > bestScore) { bestScore = score; bestSet = set; isBW = !set.weight || set.weight === 0; }
            });
            if (bestSet && bestScore > 0) {
                let primaryVal = 0, secondaryVal = 0, label = "";
                if (selectedExerciseType === 'cardio') {
                    primaryVal = bestSet.distance || 0; secondaryVal = parseTimeToMinutes(bestSet.time); label = `${primaryVal}km`;
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
  const displaySelectedName = selectedExerciseId ? getLocalizedName(selectedExerciseId, catalog, language as 'es' | 'en') : '';
  let primaryLabel = "Mejor Levantamiento", unitLabel = "kg", chartColor = "#D4FF00";
  if (selectedExerciseType === 'cardio') { primaryLabel = "Mejor Distancia"; unitLabel = "km"; chartColor = "#60a5fa"; }
  else if (isMostlyBodyweight) { primaryLabel = "Máx Reps"; unitLabel = "reps"; chartColor = "#f472b6"; }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-surface border border-white/10 rounded-[2.5rem] shadow-2xl flex flex-col h-[85vh] overflow-hidden relative">
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

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8 bg-[#050505]">
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
                        {Object.entries(groupedRecords).map(([category, records]) => (
                            <div key={category} className="space-y-4">
                                <div className="flex items-center gap-2 px-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-glow"></div>
                                    <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.3em] italic">{category}</h3>
                                    <div className="flex-1 h-px bg-white/5"></div>
                                </div>
                                <div className="grid grid-cols-1 gap-3">
                                    {(records as PersonalRecordWithCategory[]).map((pr, idx) => (
                                        <button key={idx} onClick={() => setSelectedExerciseId(getCanonicalId(pr.exerciseName, catalog))} className="flex items-center justify-between p-4 bg-zinc-900/40 border border-white/5 rounded-3xl hover:bg-zinc-800/60 hover:border-primary/20 transition-all group relative overflow-hidden">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-zinc-500 group-hover:text-primary transition-colors border border-white/5 group-hover:border-primary/20">
                                                    {getExerciseIcon(pr.exerciseName, catalog, "w-5 h-5")}
                                                </div>
                                                <div className="text-left">
                                                    <h3 className="font-bold text-white text-sm leading-none mb-1">{pr.exerciseName}</h3>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[9px] text-zinc-600 font-mono uppercase tracking-wider">{format(new Date(pr.date), 'dd MMM')}</span>
                                                        {pr.estimated1RM && <span className="text-[8px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-black uppercase italic">PRO: {pr.estimated1RM}kg</span>}
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
                        ))}
                    </div>
                </div>
            ) : (
                <div className="space-y-8 animate-in slide-in-from-right-10 fade-in duration-300">
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
