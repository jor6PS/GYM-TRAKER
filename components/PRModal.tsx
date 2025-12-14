import React, { useMemo, useState, useEffect } from 'react';
import { X, Trophy, TrendingUp, Search, Calendar, ChevronRight, ArrowLeft, Calculator } from 'lucide-react';
import { Workout, PersonalRecord } from '../types';
import { format } from 'date-fns';
import { getExerciseIcon } from '../utils';
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
  weight: number;
  unit: string;
  reps: number;
  estimated1RM: number;
}

// Epley Formula: 1RM = Weight * (1 + Reps/30)
const calculate1RM = (weight: number, reps: number) => {
    if (reps === 1) return weight;
    return Math.round(weight * (1 + reps / 30));
};

export const PRModal: React.FC<PRModalProps> = ({ isOpen, onClose, workouts, initialExercise }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedExercise, setSelectedExercise] = useState<string | null>(initialExercise || null);

  // Sync initialExercise when the modal opens
  useEffect(() => {
    if (isOpen) {
        setSelectedExercise(initialExercise || null);
        setSearchTerm(''); // Clear search on open
    }
  }, [isOpen, initialExercise]);

  const personalRecords = useMemo(() => {
    const recordsMap = new Map<string, PersonalRecord>();

    workouts.forEach(workout => {
      workout.structured_data.exercises.forEach(exercise => {
        const normalizedName = exercise.name.trim().toLowerCase();
        exercise.sets.forEach(set => {
          const estimated1RM = calculate1RM(set.weight, set.reps);
          const currentRecord = recordsMap.get(normalizedName);
          
          // Logic: Keep record with highest weight moved. 
          if (!currentRecord || set.weight > currentRecord.weight) {
            recordsMap.set(normalizedName, {
              exerciseName: exercise.name, 
              weight: set.weight,
              unit: set.unit,
              reps: set.reps,
              date: workout.date,
              estimated1RM: estimated1RM
            });
          }
        });
      });
    });

    return Array.from(recordsMap.values()).sort((a, b) => 
      a.exerciseName.localeCompare(b.exerciseName)
    );
  }, [workouts]);

  const filteredRecords = useMemo(() => {
    return personalRecords.filter(pr => 
      pr.exerciseName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [personalRecords, searchTerm]);

  // History Data for Chart
  const exerciseHistory = useMemo(() => {
    if (!selectedExercise) return [];
    
    const history: HistoryPoint[] = [];
    const normalizedSelected = selectedExercise.trim().toLowerCase();

    workouts.forEach(workout => {
        const exerciseData = workout.structured_data.exercises.find(
            e => e.name.trim().toLowerCase() === normalizedSelected
        );

        if (exerciseData) {
            // Find max effort set in this workout based on 1RM
            let maxSet = exerciseData.sets[0];
            let max1RM = 0;

            exerciseData.sets.forEach(set => {
                const e1rm = calculate1RM(set.weight, set.reps);
                if (e1rm > max1RM) {
                    max1RM = e1rm;
                    maxSet = set;
                }
            });

            if (maxSet) {
                history.push({
                    date: workout.date,
                    weight: maxSet.weight,
                    unit: maxSet.unit,
                    reps: maxSet.reps,
                    estimated1RM: max1RM
                });
            }
        }
    });

    // Sort by date ascending
    return history.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [selectedExercise, workouts]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-surface border border-border rounded-3xl shadow-2xl flex flex-col h-[85vh] overflow-hidden relative">
        
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-surface/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-3">
            {selectedExercise ? (
                <button 
                  onClick={() => setSelectedExercise(null)}
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
                <h2 className="text-lg font-bold text-text tracking-tight">
                    {selectedExercise ? selectedExercise : 'Personal Records'}
                </h2>
                {selectedExercise && (
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
            {selectedExercise ? (
                <div className="space-y-6 animate-in slide-in-from-right-10 fade-in duration-300">
                    {/* Stats Summary */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-surfaceHighlight border border-border p-4 rounded-2xl">
                             <div className="flex items-center gap-2 mb-1">
                                <Trophy className="w-3.5 h-3.5 text-yellow-500" />
                                <span className="text-[10px] uppercase font-mono text-subtext font-bold tracking-wider">Best Lift</span>
                             </div>
                             <div className="text-2xl font-bold text-text">
                                {Math.max(...exerciseHistory.map(h => h.weight))} <span className="text-sm text-subtext font-normal">kg</span>
                             </div>
                        </div>
                        <div className="bg-surfaceHighlight border border-border p-4 rounded-2xl">
                             <div className="flex items-center gap-2 mb-1">
                                <Calculator className="w-3.5 h-3.5 text-primary" />
                                <span className="text-[10px] uppercase font-mono text-subtext font-bold tracking-wider">Est. 1RM</span>
                             </div>
                             <div className="text-2xl font-bold text-primary">
                                {Math.max(...exerciseHistory.map(h => h.estimated1RM))} <span className="text-sm text-primary/70 font-normal">kg</span>
                             </div>
                        </div>
                    </div>

                    {/* Chart */}
                    <div className="bg-surface border border-border rounded-2xl p-4 h-72 w-full relative">
                        <h3 className="text-xs font-bold text-subtext mb-4 flex items-center gap-2">
                             <TrendingUp className="w-3 h-3" /> PROGRESS OVER TIME
                        </h3>
                        {exerciseHistory.length > 1 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={exerciseHistory} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#D4FF00" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#D4FF00" stopOpacity={0}/>
                                        </linearGradient>
                                        <linearGradient id="color1RM" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
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
                                    />
                                    
                                    {/* Estimated 1RM Line (Blue) */}
                                    <Area 
                                        type="monotone" 
                                        dataKey="estimated1RM" 
                                        stroke="#3b82f6" 
                                        strokeWidth={2}
                                        strokeDasharray="4 4"
                                        fillOpacity={1} 
                                        fill="url(#color1RM)" 
                                        name="Est. 1RM"
                                    />

                                    {/* Actual Weight Line (Primary) */}
                                    <Area 
                                        type="monotone" 
                                        dataKey="weight" 
                                        stroke="#D4FF00" 
                                        strokeWidth={3}
                                        fillOpacity={1} 
                                        fill="url(#colorWeight)" 
                                        name="Weight"
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
                                            {point.weight} <span className="text-subtext text-xs font-normal">{point.unit}</span>
                                        </div>
                                        <div className="text-[10px] text-subtext font-mono">
                                            {point.reps} reps • 1RM: {point.estimated1RM}
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
                            filteredRecords.map((pr, index) => (
                                <button
                                    key={index}
                                    onClick={() => setSelectedExercise(pr.exerciseName)}
                                    className="flex items-center justify-between p-4 bg-surface border border-border rounded-2xl hover:border-primary/30 hover:bg-surfaceHighlight transition-all group text-left shadow-sm"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="p-2.5 bg-surfaceHighlight rounded-xl text-subtext group-hover:text-primary transition-colors border border-border">
                                            {getExerciseIcon(pr.exerciseName)}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-text text-sm group-hover:text-primary transition-colors line-clamp-1">
                                                {pr.exerciseName}
                                            </h3>
                                            <p className="text-xs text-subtext font-mono flex items-center gap-2 mt-0.5">
                                                <Calendar className="w-3 h-3" /> {format(new Date(pr.date), 'MMM d, yyyy')}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="text-right">
                                        <div className="text-lg font-bold text-text font-mono tracking-tight">
                                            {pr.weight}<span className="text-xs text-subtext ml-0.5">{pr.unit}</span>
                                        </div>
                                        {pr.estimated1RM && (
                                            <div className="text-[10px] text-blue-400 font-mono font-bold bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 inline-block">
                                                1RM: {pr.estimated1RM}
                                            </div>
                                        )}
                                    </div>
                                </button>
                            ))
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