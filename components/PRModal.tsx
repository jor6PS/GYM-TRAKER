import React, { useMemo, useState, useEffect } from 'react';
import { X, Trophy, TrendingUp, Search, Calendar, ChevronRight, ArrowLeft } from 'lucide-react';
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
}

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
          const currentRecord = recordsMap.get(normalizedName);
          if (!currentRecord || set.weight > currentRecord.weight) {
            recordsMap.set(normalizedName, {
              exerciseName: exercise.name, 
              weight: set.weight,
              unit: set.unit,
              reps: set.reps,
              date: workout.date
            });
          }
        });
      });
    });

    return Array.from(recordsMap.values()).sort((a, b) => 
      a.exerciseName.localeCompare(b.exerciseName)
    );
  }, [workouts]);

  const exerciseHistory = useMemo(() => {
    if (!selectedExercise) return [];

    const history: HistoryPoint[] = [];
    const normalizedSelected = selectedExercise.trim().toLowerCase();

    workouts.forEach(workout => {
      workout.structured_data.exercises.forEach(exercise => {
        if (exercise.name.trim().toLowerCase() === normalizedSelected) {
          let sessionMax = 0;
          let sessionReps = 0;
          let sessionUnit = 'kg';

          exercise.sets.forEach(set => {
            if (set.weight > sessionMax) {
              sessionMax = set.weight;
              sessionReps = set.reps;
              sessionUnit = set.unit;
            }
          });

          if (sessionMax > 0) {
            history.push({
              date: workout.date,
              weight: sessionMax,
              reps: sessionReps,
              unit: sessionUnit
            });
          }
        }
      });
    });

    return history.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [workouts, selectedExercise]);

  const filteredRecords = personalRecords.filter(pr => 
    pr.exerciseName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedExercisePR = personalRecords.find(pr => 
    pr.exerciseName.trim().toLowerCase() === selectedExercise?.trim().toLowerCase()
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6">
      <div 
        className="absolute inset-0 bg-black/90 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg bg-surface border border-white/10 rounded shadow-[0_0_30px_rgba(250,204,21,0.1)] overflow-hidden flex flex-col h-[85vh] animate-in zoom-in-95 duration-200">
        
        {/* --- Header --- */}
        <div className="flex flex-col border-b border-white/10 bg-black z-10 shrink-0">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              {selectedExercise ? (
                <button 
                  onClick={() => setSelectedExercise(null)}
                  className="p-1 -ml-2 hover:bg-white/10 rounded transition-colors text-primary"
                >
                  <ArrowLeft className="w-6 h-6" />
                </button>
              ) : (
                <Trophy className="w-6 h-6 text-primary" />
              )}
              
              <h3 className="text-xl font-bold font-mono text-text truncate max-w-[200px] uppercase tracking-wider">
                {selectedExercise || "PERSONAL_RECORDS"}
              </h3>
            </div>
            <button 
              onClick={onClose}
              className="p-1 hover:bg-white/10 rounded transition-colors text-subtext hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {!selectedExercise && (
            <div className="px-4 pb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
                <input 
                  type="text" 
                  placeholder="SEARCH_DB..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-black border border-white/20 rounded py-2 pl-10 pr-4 text-sm font-mono text-primary placeholder:text-zinc-700 focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>
          )}
        </div>

        {/* --- Content Area --- */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-black">
          
          {selectedExercise ? (
            // === DETAIL VIEW (CHART) ===
            <div className="p-4 space-y-6">
              
              {/* Stat Card */}
              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-surface border border-white/10 rounded p-4 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-8 h-8 bg-primary/10 rounded-bl-full"></div>
                    <div className="text-zinc-500 text-[10px] uppercase font-mono tracking-widest mb-1">Current Max</div>
                    <div className="text-3xl font-bold font-mono text-primary">
                       {selectedExercisePR?.weight} <span className="text-sm font-medium text-white/50">{selectedExercisePR?.unit}</span>
                    </div>
                 </div>
                 <div className="bg-surface border border-white/10 rounded p-4">
                    <div className="text-zinc-500 text-[10px] uppercase font-mono tracking-widest mb-1">Total Logs</div>
                    <div className="text-3xl font-bold font-mono text-text">
                       {exerciseHistory.length}
                    </div>
                 </div>
              </div>

              {/* Chart */}
              <div className="h-64 w-full bg-surface/50 border border-white/10 rounded p-2 pt-6 overflow-hidden">
                 {exerciseHistory.length > 0 ? (
                   <ResponsiveContainer width="99%" height="100%">
                     <AreaChart data={exerciseHistory} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <defs>
                          <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#FACC15" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#FACC15" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                        <XAxis 
                          dataKey="date" 
                          stroke="#71717a" 
                          fontSize={10} 
                          fontFamily="monospace"
                          tickFormatter={(str) => {
                            try {
                              // Ensure local date parsing from YYYY-MM-DD
                              const d = new Date(str.includes('T') ? str : str + 'T00:00:00');
                              return format(d, 'MM/dd')
                            } catch (e) {
                              return str;
                            }
                          }}
                          tickMargin={10}
                        />
                        <YAxis 
                          stroke="#71717a" 
                          fontSize={10} 
                          fontFamily="monospace"
                          domain={['auto', 'auto']}
                          tickFormatter={(val) => `${val}`}
                          width={30}
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#000', borderColor: '#FACC15', borderRadius: '4px', color: '#FACC15', fontFamily: 'monospace' }}
                          itemStyle={{ color: '#FACC15' }}
                          formatter={(value: any) => [`${value} kg`, 'WEIGHT']}
                          labelFormatter={(label) => {
                            try {
                              const d = new Date(label.includes('T') ? label : label + 'T00:00:00');
                              return format(d, 'yyyy-MM-dd');
                            } catch (e) {
                              return label;
                            }
                          }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="weight" 
                          stroke="#FACC15" 
                          strokeWidth={2}
                          fillOpacity={1} 
                          fill="url(#colorWeight)" 
                          activeDot={{ r: 4, fill: '#000', stroke: '#FACC15', strokeWidth: 2 }}
                        />
                     </AreaChart>
                   </ResponsiveContainer>
                 ) : (
                    <div className="h-full flex flex-col items-center justify-center text-subtext text-sm font-mono">
                       <TrendingUp className="w-8 h-8 mb-2 opacity-50" />
                       INSUFFICIENT_DATA
                    </div>
                 )}
              </div>

              {/* History List */}
              <div>
                <h4 className="text-xs font-bold text-subtext mb-3 uppercase tracking-widest font-mono border-b border-white/10 pb-1">Log History</h4>
                <div className="space-y-2">
                  {[...exerciseHistory].reverse().map((entry, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-surface border border-white/5 hover:border-primary/30 rounded transition-colors">
                      <div className="flex items-center gap-2 text-xs text-subtext font-mono">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(entry.date + 'T00:00:00'), 'yyyy-MM-dd')}
                      </div>
                      <div className="flex items-baseline gap-2">
                         <span className="text-primary font-bold font-mono">{entry.weight}{entry.unit}</span>
                         <span className="text-zinc-600 text-xs font-mono">x {entry.reps}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          ) : (
            // === LIST OVERVIEW ===
            <div className="p-4 space-y-3">
              {filteredRecords.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-dashed border-white/10">
                    <TrendingUp className="w-8 h-8 text-zinc-700" />
                  </div>
                  <p className="text-subtext font-mono text-sm">NO_RECORDS_FOUND</p>
                </div>
              ) : (
                filteredRecords.map((pr, idx) => (
                  <button 
                    key={idx} 
                    onClick={() => setSelectedExercise(pr.exerciseName)}
                    className="w-full bg-surface/50 border border-white/5 rounded p-4 flex items-center justify-between group hover:border-primary hover:bg-white/5 transition-all text-left"
                  >
                    <div className="flex items-center flex-1 min-w-0 mr-4">
                       {/* Icon Container */}
                       <div className="mr-4 p-2 bg-black border border-white/10 rounded-lg text-primary/70 group-hover:text-primary group-hover:border-primary/50 transition-all shadow-glow-sm">
                          {getExerciseIcon(pr.exerciseName)}
                       </div>
                       
                       <div className="min-w-0">
                          <h4 className="font-bold text-text truncate mb-1 text-sm uppercase tracking-wide group-hover:text-primary transition-colors">{pr.exerciseName}</h4>
                          <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
                            <Calendar className="w-3 h-3" />
                            <span>{format(new Date(pr.date + 'T00:00:00'), 'MM-dd-yyyy')}</span>
                          </div>
                       </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-lg font-bold text-primary font-mono tabular-nums shadow-glow-sm px-2 rounded bg-primary/10">
                          {pr.weight}
                          <span className="text-xs font-medium text-primary/70 ml-0.5">{pr.unit}</span>
                        </div>
                        <div className="text-[10px] text-zinc-600 font-mono mt-1">
                          {pr.reps} reps
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-700 group-hover:text-primary transition-colors" />
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};