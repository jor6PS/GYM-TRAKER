import React, { useState, useMemo } from 'react';
import { X, Save, Zap, Clock, History, Edit3, ArrowRight, AlertCircle, Search, Plus, Dumbbell, ChevronRight } from 'lucide-react';
import { WorkoutData, Exercise, Workout } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { formatWorkoutToString, parseLocalDate } from '../utils';
import { EXERCISE_DB } from '../data/exerciseDb';
import { format } from 'date-fns';

interface UnifiedEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWorkoutProcessed: (data: WorkoutData) => void;
  pastWorkouts: Workout[]; // For history cloning
}

type Tab = 'write' | 'history' | 'library';

export const UnifiedEntryModal: React.FC<UnifiedEntryModalProps> = ({ 
  isOpen, 
  onClose, 
  onWorkoutProcessed,
  pastWorkouts 
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('write');
  const [text, setText] = useState('');
  const { t } = useLanguage();

  // --- LIBRARY STATE ---
  const [libSearch, setLibSearch] = useState('');
  const [selectedLibExercise, setSelectedLibExercise] = useState<string | null>(null);
  const [libSets, setLibSets] = useState(3);
  const [libReps, setLibReps] = useState(10);
  const [libWeight, setLibWeight] = useState(0);

  // --- LOCAL PARSER LOGIC (OFFLINE + STANDARDIZATION) ---
  const localData = useMemo<WorkoutData | null>(() => {
    if (!text.trim()) return null;

    const lines = text.split(/\n/);
    const detectedExercises: Exercise[] = [];

    for (const line of lines) {
        const cleanLine = line.trim();
        if (!cleanLine) continue;

        // 1. Detect Sets/Reps
        const setRepRegex = /(\d+)\s*(?:x|\*|sets?|series?)\s*(\d+)/i;
        const setRepMatch = cleanLine.match(setRepRegex);

        // 2. Detect Weight
        const weightRegex = /(\d+(?:\.\d+)?)\s*(kg|lbs|lb|kilos)?/i;
        let lineWithoutSets = cleanLine;
        if (setRepMatch) {
            lineWithoutSets = cleanLine.replace(setRepMatch[0], '');
        }
        const weightMatch = lineWithoutSets.match(weightRegex);

        // 3. Extract Name
        let rawName = cleanLine;
        if (setRepMatch) rawName = rawName.replace(setRepMatch[0], '');
        if (weightMatch) rawName = rawName.replace(weightMatch[0], '');
        
        rawName = rawName.replace(/[-–:;]/g, '').trim();

        if (rawName.length > 2 && (setRepMatch || weightMatch)) {
            const sets = setRepMatch ? parseInt(setRepMatch[1]) : 3; 
            const reps = setRepMatch ? parseInt(setRepMatch[2]) : 10; 
            const weight = weightMatch ? parseFloat(weightMatch[1]) : 0;
            const unit = weightMatch && weightMatch[2] ? weightMatch[2].toLowerCase() : 'kg';
            const finalUnit = unit.includes('lb') ? 'lbs' : 'kg';

            // --- STANDARDIZATION MAGIC ---
            // Try to find the closest match in EXERCISE_DB to force consistent naming
            const lowerRaw = rawName.toLowerCase();
            const exactMatch = EXERCISE_DB.find(dbEx => dbEx.toLowerCase() === lowerRaw);
            const partialMatch = !exactMatch ? EXERCISE_DB.find(dbEx => dbEx.toLowerCase().includes(lowerRaw)) : null;
            
            // Priority: Exact Match > Partial Match > Raw Input (Capitalized)
            const finalName = exactMatch || partialMatch || (rawName.charAt(0).toUpperCase() + rawName.slice(1));

            detectedExercises.push({
                name: finalName,
                sets: Array(sets).fill({
                    reps: reps,
                    weight: weight,
                    unit: finalUnit
                })
            });
        }
    }

    if (detectedExercises.length === 0) return null;

    return {
        exercises: detectedExercises,
        notes: "Offline Auto-Parse"
    };
  }, [text]);

  // --- HISTORY LOGIC ---
  const historyOptions = useMemo(() => {
    const groupedMap = new Map<string, { date: string, exercises: Exercise[] }>();
    pastWorkouts.forEach(w => {
        const dateKey = w.date;
        if (!groupedMap.has(dateKey)) {
            groupedMap.set(dateKey, { date: dateKey, exercises: [] });
        }
        const entry = groupedMap.get(dateKey)!;
        entry.exercises.push(...w.structured_data.exercises);
    });
    return Array.from(groupedMap.values())
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5);
  }, [pastWorkouts]);

  // --- LIBRARY FILTER LOGIC ---
  const filteredLibrary = useMemo(() => {
      if (!libSearch) return EXERCISE_DB.slice(0, 20); // Show top 20 by default
      return EXERCISE_DB.filter(ex => ex.toLowerCase().includes(libSearch.toLowerCase())).slice(0, 20);
  }, [libSearch]);

  // --- HANDLERS ---

  const handleCloneGroup = (group: { date: string, exercises: Exercise[] }) => {
      const tempWorkout: Workout = {
          id: 'temp', user_id: '', date: group.date, source: 'manual', created_at: '',
          structured_data: { exercises: group.exercises }
      };
      const stringified = formatWorkoutToString(tempWorkout);
      setText(prev => prev ? prev + '\n' + stringified : stringified);
      setActiveTab('write');
  };

  const handleAddFromLibrary = () => {
      if (!selectedLibExercise) return;
      // Construct the text line: "ExerciseName SetsxReps Weightkg"
      const line = `${selectedLibExercise} ${libSets}x${libReps} ${libWeight}kg`;
      
      // Append to text area
      setText(prev => {
          const cleanPrev = prev.trim();
          return cleanPrev ? cleanPrev + '\n' + line : line;
      });

      // Reset library selection but keep search for flow
      setSelectedLibExercise(null);
      
      // Optional: Switch to write tab to show user what happened, or stay to add more
      setActiveTab('write');
  };

  const handleSave = () => {
      if (localData) {
          onWorkoutProcessed(localData);
          setText('');
          onClose();
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-surface border border-white/10 rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-10 duration-300">
        
        {/* Header & Tabs */}
        <div className="bg-black border-b border-white/10 pt-2 px-2">
            <div className="flex items-center justify-between px-2 mb-2">
                 <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-primary" /> {t('input_log')}
                 </h3>
                 <button onClick={onClose} className="p-1 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="flex gap-1">
                <button 
                    onClick={() => setActiveTab('write')}
                    className={`flex-1 py-2 text-xs font-bold uppercase rounded-t-lg transition-colors border-t border-x ${
                        activeTab === 'write' 
                            ? 'bg-zinc-900 border-white/10 text-primary border-b-black translate-y-[1px]' 
                            : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                    }`}
                >
                    Write
                </button>
                <button 
                    onClick={() => setActiveTab('library')}
                    className={`flex-1 py-2 text-xs font-bold uppercase rounded-t-lg transition-colors border-t border-x flex items-center justify-center gap-1 ${
                        activeTab === 'library' 
                            ? 'bg-zinc-900 border-white/10 text-green-400 border-b-black translate-y-[1px]' 
                            : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                    }`}
                >
                    <Dumbbell className="w-3 h-3" /> Library
                </button>
                <button 
                    onClick={() => setActiveTab('history')}
                    className={`flex-1 py-2 text-xs font-bold uppercase rounded-t-lg transition-colors border-t border-x flex items-center justify-center gap-1 ${
                        activeTab === 'history' 
                            ? 'bg-zinc-900 border-white/10 text-blue-400 border-b-black translate-y-[1px]' 
                            : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                    }`}
                >
                    <History className="w-3 h-3" /> History
                </button>
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto bg-zinc-900 p-4 min-h-[300px]">
            
            {/* --- TAB 1: WRITE --- */}
            {activeTab === 'write' && (
                <div className="space-y-4 h-full flex flex-col">
                    <div className="relative group flex-1">
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="Type here...&#10;> Bench Press 3x10 80kg&#10;> Squat 4x12"
                            className="w-full h-full min-h-[200px] bg-black border border-white/10 rounded-xl p-4 text-white placeholder:text-zinc-700 font-mono text-sm focus:outline-none focus:border-primary/50 resize-none"
                            autoFocus
                        />
                    </div>

                    {/* LIVE PREVIEW (OFFLINE ENGINE) */}
                    {localData ? (
                        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 animate-in fade-in slide-in-from-top-2">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2 text-[10px] font-bold text-primary uppercase tracking-wider">
                                    <Zap className="w-3 h-3 fill-current" />
                                    Detected & Standardized
                                </div>
                            </div>
                            <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                                {localData.exercises.map((ex, idx) => (
                                    <div key={idx} className="flex items-center gap-2 text-xs text-zinc-300">
                                        <div className="w-1 h-1 bg-primary rounded-full"></div>
                                        <span className="font-bold text-white">{ex.name}</span>
                                        <span className="font-mono text-zinc-500">
                                            {ex.sets.length}x{ex.sets[0].reps} {ex.sets[0].weight > 0 && `@ ${ex.sets[0].weight}${ex.sets[0].unit}`}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : text.trim().length > 0 && (
                        <div className="flex items-center gap-2 justify-center text-[10px] text-zinc-500 font-mono bg-zinc-900/50 p-2 rounded animate-in fade-in">
                            <AlertCircle className="w-3 h-3 text-red-400" />
                            <span>Format: "Exercise SetsxReps Weight"</span>
                        </div>
                    )}
                </div>
            )}

            {/* --- TAB 2: LIBRARY (SEARCH) --- */}
            {activeTab === 'library' && (
                <div className="space-y-4 h-full flex flex-col">
                    {!selectedLibExercise ? (
                        <>
                            <div className="relative">
                                <Search className="absolute left-3 top-3 w-5 h-5 text-zinc-500" />
                                <input 
                                    value={libSearch}
                                    onChange={(e) => setLibSearch(e.target.value)}
                                    placeholder="Search standard exercises..."
                                    className="w-full bg-black border border-white/20 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-green-400/50"
                                    autoFocus
                                />
                            </div>
                            <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar pr-1">
                                {filteredLibrary.map((ex, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setSelectedLibExercise(ex)}
                                        className="w-full text-left px-4 py-3 bg-black/40 border border-white/5 hover:border-green-400/30 hover:bg-white/5 rounded-xl text-sm text-zinc-300 hover:text-white transition-all flex items-center justify-between group"
                                    >
                                        {ex}
                                        <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 text-green-400 transition-opacity" />
                                    </button>
                                ))}
                                {filteredLibrary.length === 0 && (
                                    <div className="text-center py-8 text-zinc-500 text-xs">
                                        No matches found in database.
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="animate-in slide-in-from-right-10 duration-200 flex flex-col h-full">
                            <div className="flex items-center gap-2 mb-4">
                                <button onClick={() => setSelectedLibExercise(null)} className="text-zinc-500 hover:text-white text-xs uppercase font-bold flex items-center gap-1">
                                    <ChevronRight className="w-4 h-4 rotate-180" /> Back
                                </button>
                                <div className="h-4 w-px bg-white/10"></div>
                                <h3 className="text-white font-bold truncate flex-1">{selectedLibExercise}</h3>
                            </div>
                            
                            <div className="bg-black border border-white/10 rounded-2xl p-6 space-y-6 flex-1">
                                <div className="space-y-4">
                                    {/* SETS */}
                                    <div>
                                        <div className="flex justify-between text-xs text-zinc-500 uppercase font-bold mb-2">
                                            <span>Sets</span>
                                            <span className="text-white">{libSets}</span>
                                        </div>
                                        <input 
                                            type="range" min="1" max="10" step="1" 
                                            value={libSets} onChange={(e) => setLibSets(Number(e.target.value))}
                                            className="w-full accent-green-400 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>

                                    {/* REPS */}
                                    <div>
                                        <div className="flex justify-between text-xs text-zinc-500 uppercase font-bold mb-2">
                                            <span>Reps</span>
                                            <span className="text-white">{libReps}</span>
                                        </div>
                                        <input 
                                            type="range" min="1" max="50" step="1" 
                                            value={libReps} onChange={(e) => setLibReps(Number(e.target.value))}
                                            className="w-full accent-green-400 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>

                                    {/* WEIGHT */}
                                    <div>
                                        <div className="flex justify-between text-xs text-zinc-500 uppercase font-bold mb-2">
                                            <span>Weight (kg)</span>
                                            <span className="text-white">{libWeight}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => setLibWeight(Math.max(0, libWeight - 2.5))} className="p-2 bg-zinc-800 rounded text-zinc-400 hover:text-white">-</button>
                                            <input 
                                                type="number" 
                                                value={libWeight} onChange={(e) => setLibWeight(Number(e.target.value))}
                                                className="flex-1 bg-zinc-800 border-none rounded py-2 text-center text-white font-bold"
                                            />
                                            <button onClick={() => setLibWeight(libWeight + 2.5)} className="p-2 bg-zinc-800 rounded text-zinc-400 hover:text-white">+</button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={handleAddFromLibrary}
                                className="w-full mt-4 bg-green-400 text-black font-bold py-3 rounded-xl shadow-glow active:scale-95 transition-all text-sm uppercase flex items-center justify-center gap-2"
                            >
                                <Plus className="w-4 h-4" /> Add to Session
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* --- TAB 3: HISTORY --- */}
            {activeTab === 'history' && (
                <div className="space-y-3">
                    <div className="text-xs text-zinc-500 font-mono uppercase text-center mb-2">
                        Select a past day to clone
                    </div>
                    {historyOptions.length === 0 ? (
                        <div className="text-center py-10 border border-dashed border-white/10 rounded-xl">
                            <History className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                            <p className="text-zinc-500 text-xs">No history found yet.</p>
                        </div>
                    ) : (
                        historyOptions.map((group, idx) => (
                            <button
                                key={`${group.date}-${idx}`}
                                onClick={() => handleCloneGroup(group)}
                                className="w-full bg-black border border-white/10 hover:border-primary/30 hover:bg-white/5 rounded-xl p-4 text-left group transition-all"
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <div className="text-sm font-bold text-white group-hover:text-primary transition-colors flex items-center gap-2">
                                        <Clock className="w-3.5 h-3.5 text-zinc-500" />
                                        {format(parseLocalDate(group.date), 'EEEE, MMM d')}
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-primary opacity-0 group-hover:opacity-100 transition-all" />
                                </div>
                                <div className="text-xs text-zinc-500 font-mono line-clamp-2">
                                    {/* Deduplicate and join names */}
                                    {Array.from(new Set(group.exercises.map(e => e.name))).join(', ')}
                                </div>
                            </button>
                        ))
                    )}
                </div>
            )}

        </div>

        {/* Footer Actions (Only for Write Tab as others have their own flow/buttons) */}
        {activeTab === 'write' && (
            <div className="p-4 border-t border-white/10 bg-black">
                <button
                    onClick={handleSave}
                    disabled={!localData}
                    className="w-full bg-primary text-black font-bold py-3 rounded-xl shadow-glow active:scale-95 transition-all text-xs uppercase flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                >
                    <Save className="w-4 h-4" /> {t('save')}
                </button>
            </div>
        )}
      </div>
    </div>
  );
};