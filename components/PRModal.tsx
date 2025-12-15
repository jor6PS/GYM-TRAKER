
import React, { useMemo, useState, useEffect } from 'react';
import { X, Trophy, TrendingUp, Search, Calendar, ChevronRight, ArrowLeft, Calculator, Activity } from 'lucide-react';
import { Workout, PersonalRecord, MetricType } from '../types';
import { format } from 'date-fns';
import { getExerciseIcon, getCanonicalId, getLocalizedName } from '../utils';
import { EXERCISE_DB } from '../data/exerciseDb';
import { useLanguage } from '../contexts/LanguageContext';
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

interface HistoryPoint {
  date: string;
  value: number; // Weight (kg), Distance (km)
  secondaryValue?: number; // 1RM or Time (for cardio)
  unit: string;
  reps?: number;
  label: string; // "80kg", "5km"
}

// Epley Formula: 1RM = Weight * (1 + Reps/30)
const calculate1RM = (weight: number, reps: number) => {
    if (reps === 1) return weight;
    return Math.round(weight * (1 + reps / 30));
};

// Helper to parse time string "90" or "1:30" to minutes number
const parseTimeToMinutes = (timeStr: string | undefined): number => {
    if (!timeStr) return 0;
    // If format is MM:SS or HH:MM
    if (timeStr.includes(':')) {
        const parts = timeStr.split(':').map(Number);
        if (parts.length === 2) return parts[0]; // Treat as MM:SS, return minutes roughly
        if (parts.length === 3) return parts[0] * 60 + parts[1]; // HH:MM:SS
    }
    return parseFloat(timeStr) || 0;
};

export const PRModal: React.FC<PRModalProps> = ({ isOpen, onClose, workouts, initialExercise }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const { language, t } = useLanguage();

  // Normalize initial exercise to ID if provided
  useEffect(() => {
    if (isOpen) {
        if (initialExercise) {
            setSelectedExerciseId(getCanonicalId(initialExercise));
        } else {
            setSelectedExerciseId(null);
        }
        setSearchTerm('');
    }
  }, [isOpen, initialExercise]);

  // Determine the type of the currently selected exercise
  const selectedExerciseType: MetricType = useMemo(() => {
      if (!selectedExerciseId) return 'strength';
      const def = EXERCISE_DB.find(e => e.id === selectedExerciseId);
      return def?.type || 'strength';
  }, [selectedExerciseId]);

  const personalRecords = useMemo(() => {
    // Map using Canonical ID -> PersonalRecord
    const recordsMap = new Map<string, PersonalRecord>();

    workouts.forEach(workout => {
      workout.structured_data.exercises.forEach(exercise => {
        const canonicalId = getCanonicalId(exercise.name);
        const def = EXERCISE_DB.find(e => e.id === canonicalId);
        const type = def?.type || 'strength';
        
        exercise.sets.forEach(set => {
          let value = 0;
          let displayValue = '';
          let comparisonValue = 0; // Value used to determine if it's a "better" record

          if (type === 'cardio') {
              // CARDIO PR: Max Distance
              const dist = set.distance || (set.unit === 'km' || set.unit === 'm' ? set.weight : 0) || 0;
              value = dist;
              displayValue = `${dist}km`;
              comparisonValue = dist;
          } else {
              // STRENGTH PR: Max Weight
              value = set.weight || 0;
              displayValue = `${value}${set.unit}`;
              comparisonValue = value;
          }

          const currentRecord = recordsMap.get(canonicalId);
          
          // Logic: Keep record with highest comparison value
          if (!currentRecord || comparisonValue > currentRecord.value) {
            recordsMap.set(canonicalId, {
              exerciseName: canonicalId, // Store ID internally
              weight: value, // Reuse 'weight' prop as generic value holder for compatibility
              unit: set.unit,
              reps: set.reps || 0,
              date: workout.date,
              estimated1RM: type === 'strength' ? calculate1RM(value, set.reps || 0) : undefined,
              value: comparisonValue,
              displayValue: displayValue
            });
          }
        });
      });
    });

    return Array.from(recordsMap.entries()).map(([id, pr]) => ({
        ...pr,
        // Override the ID name with the localized name for display
        exerciseName: getLocalizedName(id, language as 'es' | 'en')
    })).sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));

  }, [workouts, language]);

  const filteredRecords = useMemo(() => {
    return personalRecords.filter(pr => 
      pr.exerciseName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [personalRecords, searchTerm]);

  // History Data for Chart
  const exerciseHistory = useMemo(() => {
    if (!selectedExerciseId) return [];
    
    const history: HistoryPoint[] = [];

    workouts.forEach(workout => {
        const exerciseData = workout.structured_data.exercises.find(
            e => getCanonicalId(e.name) === selectedExerciseId
        );

        if (exerciseData) {
            // Find max effort set in this workout based on Type
            let bestSet = exerciseData.sets[0];
            let bestVal = 0;

            exerciseData.sets.forEach(set => {
                let val = 0;
                if (selectedExerciseType === 'cardio') {
                    val = set.distance || 0;
                } else {
                    // Strength: use 1RM to find best set, but plot weight
                    val = calculate1RM(set.weight || 0, set.reps || 0);
                }

                if (val > bestVal) {
                    bestVal = val;
                    bestSet = set;
                }
            });

            if (bestSet) {
                let primaryVal = 0;
                let secondaryVal = 0;
                let label = "";

                if (selectedExerciseType === 'cardio') {
                    primaryVal = bestSet.distance || 0;
                    secondaryVal = parseTimeToMinutes(bestSet.time);
                    label = `${primaryVal}km`;
                } else {
                    primaryVal = bestSet.weight || 0;
                    secondaryVal = calculate1RM(primaryVal, bestSet.reps || 0);
                    label = `${primaryVal}${bestSet.unit}`;
                }

                if (primaryVal > 0) {
                    history.push({
                        date: workout.date,
                        value: primaryVal,
                        secondaryValue: secondaryVal,
                        unit: bestSet.unit,
                        reps: bestSet.reps || 0,
                        label
                    });
                }
            }
        }
    });

    // Sort by date ascending
    return history.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [selectedExerciseId, workouts, selectedExerciseType]);

  if (!isOpen) return null;

  const displaySelectedName = selectedExerciseId ? getLocalizedName(selectedExerciseId, language as 'es' | 'en') : '';

  // Dynamic Labels based on Type
  let primaryLabel = "Best Lift";
  let secondaryLabel = "Est. 1RM";
  let unitLabel = "kg";
  let chartColor = "#D4FF00"; // Primary Yellow

  if (selectedExerciseType === 'cardio') {
      primaryLabel = "Best Distance";
      secondaryLabel = "Time";
      unitLabel = "km";
      chartColor = "#60a5fa"; // Blue
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-surface border border-border rounded-3xl shadow-2xl flex flex-col h-[85vh] overflow-hidden relative">
        
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-surface/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-3">
            {selectedExerciseId ? (
                <button 
                  onClick={() => setSelectedExerciseId(null)}
                  className="p-2 -ml-2 rounded-full hover:bg-surfaceHighlight text-subtext hover:text-text transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
            ) : (
                <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center border border-yellow-500/20">
                    <Trophy className="w-5 h-5 text-yellow-500" />
                </div>
            )}
            <div>
                <h2 className="text-lg font-bold text-text tracking-tight truncate max-w-[200px]">
                    {selectedExerciseId ? displaySelectedName : 'Records'}
                </h2>
                {selectedExerciseId && (
                    <p className="text-xs text-subtext font-mono">
                        {exerciseHistory.length} sessions logged
                    </p>
                )}
            </div>
          </div>
          
          <button onClick={onClose} className="p-2 hover:bg-surfaceHighlight rounded-full transition-colors text-subtext hover:text-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 bg-background">
            
            {/* VIEW 1: DETAILS & CHART (When an exercise is selected) */}
            {selectedExerciseId ? (
                <div className="space-y-6 animate-in slide-in-from-right-10 fade-in duration-300">
                    {/* Stats Summary */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-surfaceHighlight border border-border p-4 rounded-2xl">
                             <div className="flex items-center gap-2 mb-1">
                                <Trophy className="w-3.5 h-3.5" style={{ color: chartColor }} />
                                <span className="text-[10px] uppercase font-mono text-subtext font-bold tracking-wider">{primaryLabel}</span>
                             </div>
                             <div className="text-2xl font-bold text-text">
                                {Math.max(...exerciseHistory.map(h => h.value))} <span className="text-sm text-subtext font-normal">{unitLabel}</span>
                             </div>
                        </div>
                        
                        {/* Secondary Stat (Only for Strength currently, maybe average pace for others later) */}
                        {selectedExerciseType === 'strength' && (
                            <div className="bg-surfaceHighlight border border-border p-4 rounded-2xl">
                                <div className="flex items-center gap-2 mb-1">
                                    <Calculator className="w-3.5 h-3.5 text-blue-400" />
                                    <span className="text-[10px] uppercase font-mono text-subtext font-bold tracking-wider">{secondaryLabel}</span>
                                </div>
                                <div className="text-2xl font-bold text-blue-400">
                                    {Math.max(...exerciseHistory.map(h => h.secondaryValue || 0))} <span className="text-sm text-blue-400/70 font-normal">kg</span>
                                </div>
                            </div>
                        )}
                        {selectedExerciseType !== 'strength' && (
                             <div className="bg-surfaceHighlight border border-border p-4 rounded-2xl flex flex-col justify-center">
                                 <div className="flex items-center gap-2 mb-1">
                                    <Activity className="w-3.5 h-3.5 text-green-500" />
                                    <span className="text-[10px] uppercase font-mono text-subtext font-bold tracking-wider">Sessions</span>
                                 </div>
                                 <div className="text-2xl font-bold text-green-500">
                                    {exerciseHistory.length}
                                 </div>
                             </div>
                        )}
                    </div>

                    {/* Chart */}
                    <div className="bg-surface border border-border rounded-2xl p-4 h-72 w-full relative">
                        <h3 className="text-xs font-bold text-subtext mb-4 flex items-center gap-2">
                             <TrendingUp className="w-3 h-3" /> PROGRESS ({unitLabel.toUpperCase()})
                        </h3>
                        {exerciseHistory.length > 1 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={exerciseHistory} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={chartColor} stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor={chartColor} stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                    <XAxis 
                                        dataKey="date" 
                                        tickFormatter={(val) => format(new Date(val), 'MM/dd')}
                                        stroke="var(--subtext)"
                                        fontSize={10}
                                        tickLine={false}
                                        axisLine={false}
                                        dy={10}
                                    />
                                    <YAxis 
                                        stroke="var(--subtext)"
                                        fontSize={10}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--text)' }}
                                        itemStyle={{ padding: 0 }}
                                        labelFormatter={(label) => format(new Date(label), 'MMM do, yyyy')}
                                        formatter={(value: any) => [`${value} ${unitLabel}`, primaryLabel]}
                                    />
                                    
                                    {/* Main Metric Line */}
                                    <Area 
                                        type="monotone" 
                                        dataKey="value" 
                                        stroke={chartColor} 
                                        strokeWidth={3}
                                        fillOpacity={1} 
                                        fill="url(#colorValue)" 
                                        name={primaryLabel}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-subtext">
                                <TrendingUp className="w-8 h-8 mb-2 opacity-20" />
                                <span className="text-xs">Not enough data to graph</span>
                            </div>
                        )}
                    </div>

                    {/* History List */}
                    <div className="space-y-2">
                        <h3 className="text-xs font-bold text-subtext uppercase tracking-wider mb-2">History Log</h3>
                        {exerciseHistory.slice().reverse().map((point, i) => (
                            <div key={i} className="flex items-center justify-between p-3 bg-surfaceHighlight border border-border rounded-xl">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center text-subtext text-[10px] font-bold border border-border">
                                        {format(new Date(point.date), 'dd/MM')}
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-text">
                                            {point.label}
                                        </div>
                                        <div className="text-[10px] text-subtext font-mono flex gap-2">
                                            {selectedExerciseType === 'strength' && <span>{point.reps} reps</span>}
                                            {selectedExerciseType === 'cardio' && point.secondaryValue && <span>{point.secondaryValue}m</span>}
                                            {selectedExerciseType === 'strength' && <span>1RM: {point.secondaryValue}</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-subtext">
                                    <ChevronRight className="w-4 h-4" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                /* VIEW 2: LIST OF ALL PRs (Default View) */
                <div className="space-y-4 animate-in fade-in slide-in-from-left-10 duration-300">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtext" />
                        <input 
                            placeholder="Search exercise..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-surfaceHighlight border border-border rounded-xl py-3 pl-10 pr-4 text-sm text-text focus:outline-none focus:border-primary/50 placeholder:text-subtext transition-all"
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                        {filteredRecords.length > 0 ? (
                            filteredRecords.map((pr, index) => {
                                const canonicalId = getCanonicalId(pr.exerciseName);
                                const def = EXERCISE_DB.find(e => e.id === canonicalId);
                                const type = def?.type || 'strength';
                                
                                return (
                                <button
                                    key={index}
                                    onClick={() => setSelectedExerciseId(canonicalId)}
                                    className="flex items-center justify-between p-4 bg-surface border border-border rounded-2xl hover:border-primary/30 hover:bg-surfaceHighlight transition-all group text-left shadow-sm"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="p-2.5 bg-surfaceHighlight rounded-xl text-subtext group-hover:text-primary transition-colors border border-border">
                                            {getExerciseIcon(pr.exerciseName)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-bold text-text text-sm group-hover:text-primary transition-colors truncate">
                                                {pr.exerciseName}
                                            </h3>
                                            <p className="text-xs text-subtext font-mono flex items-center gap-2 mt-0.5">
                                                <Calendar className="w-3 h-3" /> {format(new Date(pr.date), 'MMM d')}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="text-right pl-2">
                                        <div className="text-lg font-bold text-text font-mono tracking-tight">
                                            {pr.displayValue}
                                        </div>
                                        {type === 'strength' && pr.estimated1RM && (
                                            <div className="text-[10px] text-blue-400 font-mono font-bold bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 inline-block">
                                                1RM: {pr.estimated1RM}
                                            </div>
                                        )}
                                        {type === 'cardio' && (
                                            <div className="text-[10px] text-green-500 font-mono font-bold bg-green-500/10 px-1.5 py-0.5 rounded border border-green-500/20 inline-block">
                                                DIST
                                            </div>
                                        )}
                                    </div>
                                </button>
                            )})
                        ) : (
                            <div className="text-center py-10 text-subtext flex flex-col items-center">
                                <Trophy className="w-12 h-12 mb-3 opacity-20" />
                                <p>No records found.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>
      </div>
    </div>
  );
};
