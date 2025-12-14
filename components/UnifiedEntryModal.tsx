import React, { useState, useMemo } from 'react';
import { X, Save, Clock, History, Edit3, ArrowRight, Search, Plus, Dumbbell, ChevronRight, Trash2, Layers } from 'lucide-react';
import type { WorkoutData, Exercise, Workout, Set } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { EXERCISE_DB } from '../data/exerciseDb';
import { format } from 'date-fns';
import { parseLocalDate } from '../utils';

interface UnifiedEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWorkoutProcessed: (data: WorkoutData) => void;
  pastWorkouts: Workout[];
}

type Tab = 'overview' | 'library' | 'history';

export const UnifiedEntryModal: React.FC<UnifiedEntryModalProps> = ({ 
  isOpen, 
  onClose, 
  onWorkoutProcessed,
  pastWorkouts 
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('library');
  const [sessionExercises, setSessionExercises] = useState<Exercise[]>([]);
  const { t, language } = useLanguage();

  // --- LIBRARY STATE ---
  const [libSearch, setLibSearch] = useState('');
  const [selectedLibExercise, setSelectedLibExercise] = useState<string | null>(null);
  
  // Builder State for selected exercise
  const [setsConfig, setSetsConfig] = useState<Set[]>([{ reps: 10, weight: 0, unit: 'kg' }]);

  // --- LIBRARY FILTER (Localized) ---
  const filteredLibrary = useMemo(() => {
      const term = libSearch.toLowerCase().trim();
      
      // Filter based on the CURRENT language preference
      const langKey = language === 'es' ? 'es' : 'en';

      if (!term) return EXERCISE_DB.slice(0, 20);
      
      return EXERCISE_DB.filter(ex => 
          ex[langKey].toLowerCase().includes(term)
      ).slice(0, 20);
  }, [libSearch, language]);

  // --- HANDLERS ---

  const handleAddSet = () => {
      const last = setsConfig[setsConfig.length - 1];
      setSetsConfig([...setsConfig, { ...last }]);
  };

  const handleRemoveSet = (index: number) => {
      if (setsConfig.length <= 1) return;
      const newSets = [...setsConfig];
      newSets.splice(index, 1);
      setSetsConfig(newSets);
  };

  const handleUpdateSet = (index: number, field: keyof Set, value: number) => {
      const newSets = [...setsConfig];
      newSets[index] = { ...newSets[index], [field]: value };
      setSetsConfig(newSets);
  };

  const confirmAddExercise = () => {
      if (!selectedLibExercise) return;

      const newExercise: Exercise = {
          name: selectedLibExercise,
          sets: setsConfig
      };

      setSessionExercises([...sessionExercises, newExercise]);
      
      // Reset and go to overview
      setSelectedLibExercise(null);
      setSetsConfig([{ reps: 10, weight: 0, unit: 'kg' }]);
      setLibSearch('');
      setActiveTab('overview');
  };

  const removeSessionExercise = (index: number) => {
      const newSession = [...sessionExercises];
      newSession.splice(index, 1);
      setSessionExercises(newSession);
  };

  const handleCloneGroup = (group: { date: string, exercises: Exercise[] }) => {
      const clonedExercises = group.exercises.map(ex => ({
          name: ex.name,
          sets: ex.sets.map(s => ({ ...s }))
      }));
      
      setSessionExercises(prev => [...prev, ...clonedExercises]);
      setActiveTab('overview');
  };

  const handleSaveSession = () => {
      if (sessionExercises.length === 0) return;
      
      const data: WorkoutData = {
          exercises: sessionExercises,
          notes: "Manual Session"
      };
      
      onWorkoutProcessed(data);
      setSessionExercises([]);
      onClose();
  };

  // --- HISTORY DATA PREP ---
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

  if (!isOpen) return null;

  const langKey = language === 'es' ? 'es' : 'en';

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-surface border-t sm:border border-white/10 rounded-t-3xl sm:rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col h-[90vh] sm:max-h-[85vh] animate-in slide-in-from-bottom-10 duration-300">
        
        {/* Header & Tabs */}
        <div className="bg-black border-b border-white/10 pt-2 px-2 shrink-0">
            <div className="flex items-center justify-between px-2 mb-3">
                 <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-primary" /> {t('builder')}
                 </h3>
                 <div className="flex items-center gap-3">
                    <div className="text-xs font-mono text-zinc-500">
                        {sessionExercises.length} {t('added')}
                    </div>
                    <button onClick={onClose} className="p-1 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
                 </div>
            </div>
            
            <div className="flex gap-1">
                <button 
                    onClick={() => setActiveTab('library')}
                    className={`flex-1 py-3 text-xs font-bold uppercase rounded-t-lg transition-colors border-t border-x flex items-center justify-center gap-2 ${
                        activeTab === 'library' 
                            ? 'bg-zinc-900 border-white/10 text-green-400 border-b-black translate-y-[1px]' 
                            : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                    }`}
                >
                    <Search className="w-3.5 h-3.5" /> {t('library')}
                </button>
                <button 
                    onClick={() => setActiveTab('overview')}
                    className={`flex-1 py-3 text-xs font-bold uppercase rounded-t-lg transition-colors border-t border-x flex items-center justify-center gap-2 ${
                        activeTab === 'overview' 
                            ? 'bg-zinc-900 border-white/10 text-primary border-b-black translate-y-[1px]' 
                            : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                    }`}
                >
                    <Layers className="w-3.5 h-3.5" /> {t('overview')}
                    {sessionExercises.length > 0 && <span className="bg-primary text-black text-[9px] px-1.5 rounded-full">{sessionExercises.length}</span>}
                </button>
                <button 
                    onClick={() => setActiveTab('history')}
                    className={`flex-1 py-3 text-xs font-bold uppercase rounded-t-lg transition-colors border-t border-x flex items-center justify-center gap-2 ${
                        activeTab === 'history' 
                            ? 'bg-zinc-900 border-white/10 text-blue-400 border-b-black translate-y-[1px]' 
                            : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                    }`}
                >
                    <History className="w-3.5 h-3.5" /> {t('history')}
                </button>
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto bg-zinc-900 p-4 custom-scrollbar">
            
            {/* --- TAB: LIBRARY (SEARCH & BUILD) --- */}
            {activeTab === 'library' && (
                <div className="space-y-4 h-full flex flex-col">
                    {!selectedLibExercise ? (
                        <>
                            <div className="relative shrink-0">
                                <Search className="absolute left-3 top-3.5 w-5 h-5 text-zinc-500" />
                                <input 
                                    value={libSearch}
                                    onChange={(e) => setLibSearch(e.target.value)}
                                    placeholder={t('search_db')}
                                    className="w-full bg-black border border-white/20 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-green-400/50"
                                    autoFocus
                                />
                            </div>
                            <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar pr-1">
                                {filteredLibrary.map((ex, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setSelectedLibExercise(ex[langKey])}
                                        className="w-full text-left px-4 py-3 bg-black/40 border border-white/5 hover:border-green-400/30 hover:bg-white/5 rounded-xl text-sm text-zinc-300 hover:text-white transition-all flex items-center justify-between group"
                                    >
                                        {ex[langKey]}
                                        <Plus className="w-4 h-4 opacity-0 group-hover:opacity-100 text-green-400 transition-opacity" />
                                    </button>
                                ))}
                                {filteredLibrary.length === 0 && (
                                    <div className="text-center py-8 text-zinc-500 text-xs border border-dashed border-white/10 rounded-xl mt-4">
                                        {t('no_matches')}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="animate-in slide-in-from-right-10 duration-200 flex flex-col h-full">
                            {/* Exercise Config Header */}
                            <div className="flex items-center gap-2 mb-4 shrink-0">
                                <button onClick={() => setSelectedLibExercise(null)} className="text-zinc-500 hover:text-white text-xs uppercase font-bold flex items-center gap-1">
                                    <ChevronRight className="w-4 h-4 rotate-180" /> {t('back')}
                                </button>
                                <div className="h-4 w-px bg-white/10"></div>
                                <h3 className="text-white font-bold truncate flex-1 text-lg">{selectedLibExercise}</h3>
                            </div>
                            
                            {/* Sets Builder */}
                            <div className="bg-black border border-white/10 rounded-2xl p-4 flex-1 overflow-y-auto custom-scrollbar">
                                <div className="grid grid-cols-12 gap-2 text-[10px] text-zinc-500 font-mono uppercase text-center mb-2 sticky top-0 bg-black z-10 py-2">
                                    <div className="col-span-2">{t('sets').slice(0,3)}</div>
                                    <div className="col-span-4">KG</div>
                                    <div className="col-span-4">REPS</div>
                                    <div className="col-span-2"></div>
                                </div>
                                <div className="space-y-2">
                                    {setsConfig.map((set, idx) => (
                                        <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                                            <div className="col-span-2 flex justify-center">
                                                <div className="w-6 h-6 rounded bg-zinc-800 flex items-center justify-center text-xs font-mono text-zinc-400">{idx + 1}</div>
                                            </div>
                                            <div className="col-span-4">
                                                <input 
                                                    type="number" value={set.weight} onChange={(e) => handleUpdateSet(idx, 'weight', Number(e.target.value))}
                                                    className="w-full bg-zinc-900 border border-white/10 rounded p-2 text-center text-white font-bold text-lg focus:border-green-400 focus:outline-none"
                                                />
                                            </div>
                                            <div className="col-span-4">
                                                <input 
                                                    type="number" value={set.reps} onChange={(e) => handleUpdateSet(idx, 'reps', Number(e.target.value))}
                                                    className="w-full bg-zinc-900 border border-white/10 rounded p-2 text-center text-white font-bold text-lg focus:border-green-400 focus:outline-none"
                                                />
                                            </div>
                                            <div className="col-span-2 flex justify-center">
                                                <button onClick={() => handleRemoveSet(idx)} disabled={setsConfig.length === 1} className="text-zinc-600 hover:text-red-500 disabled:opacity-30">
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <button onClick={handleAddSet} className="w-full mt-4 py-3 border border-dashed border-white/10 rounded-xl text-xs text-zinc-500 hover:text-white hover:border-white/30 transition-colors uppercase font-bold flex items-center justify-center gap-2">
                                    <Plus className="w-4 h-4" /> {t('add_set')}
                                </button>
                            </div>

                            <button 
                                onClick={confirmAddExercise}
                                className="w-full mt-4 bg-green-400 text-black font-bold py-4 rounded-xl shadow-glow active:scale-95 transition-all text-sm uppercase flex items-center justify-center gap-2 shrink-0"
                            >
                                <Plus className="w-5 h-5" /> {t('add_to_session')}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* --- TAB: OVERVIEW (THE CART) --- */}
            {activeTab === 'overview' && (
                <div className="space-y-4 h-full flex flex-col">
                    {sessionExercises.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 border-2 border-dashed border-white/5 rounded-2xl bg-black/20 m-4">
                            <div className="w-16 h-16 bg-zinc-800/50 rounded-full flex items-center justify-center text-zinc-600">
                                <Dumbbell className="w-8 h-8" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-zinc-500 font-bold">{t('session_empty')}</p>
                                <p className="text-xs text-zinc-600">{t('go_to_lib')}</p>
                            </div>
                            <button onClick={() => setActiveTab('library')} className="bg-white/5 hover:bg-white/10 text-white px-6 py-2 rounded-full text-xs font-bold uppercase transition-colors">
                                {t('open_library')}
                            </button>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                            {sessionExercises.map((ex, idx) => (
                                <div key={idx} className="bg-black border border-white/10 rounded-xl p-4 relative group animate-in slide-in-from-bottom-2 duration-300">
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center text-xs font-bold text-zinc-500 border border-white/5">
                                                {idx + 1}
                                            </div>
                                            <h4 className="font-bold text-white text-base">{ex.name}</h4>
                                        </div>
                                        <button onClick={() => removeSessionExercise(idx)} className="p-2 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2 pl-11">
                                        {ex.sets.map((s, sIdx) => (
                                            <div key={sIdx} className="bg-zinc-900 border border-white/10 rounded px-2.5 py-1.5 text-xs text-zinc-400 font-mono">
                                                <span className="text-primary font-bold text-sm">{s.weight}</span>
                                                <span className="text-[10px] ml-0.5 mr-1.5">{s.unit}</span>
                                                <span className="text-zinc-600">x</span>
                                                <span className="text-white font-bold ml-1.5">{s.reps}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            
                            <button 
                                onClick={() => setActiveTab('library')}
                                className="w-full py-4 border-2 border-dashed border-white/10 rounded-xl text-zinc-500 hover:text-green-400 hover:border-green-400/30 transition-colors uppercase font-bold text-xs flex items-center justify-center gap-2"
                            >
                                <Plus className="w-4 h-4" /> {t('add_another')}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* --- TAB: HISTORY --- */}
            {activeTab === 'history' && (
                <div className="space-y-3">
                    <div className="text-xs text-zinc-500 font-mono uppercase text-center mb-2">
                        {t('history_clone')}
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

        {/* Footer Actions (Global Save) */}
        {activeTab === 'overview' && (
            <div className="p-4 border-t border-white/10 bg-black shrink-0">
                <button
                    onClick={handleSaveSession}
                    disabled={sessionExercises.length === 0}
                    className="w-full bg-primary text-black font-bold py-4 rounded-xl shadow-glow active:scale-95 transition-all text-sm uppercase flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                >
                    <Save className="w-5 h-5" /> {t('save_session')} ({sessionExercises.length})
                </button>
            </div>
        )}
      </div>
    </div>
  );
};