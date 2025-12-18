
import React, { useState, useMemo, useEffect } from 'react';
import { X, Save, Clock, History, Edit3, ArrowRight, Search, Plus, Dumbbell, ChevronRight, Trash2, Layers, Activity, Pencil, Sparkles, Zap, AlertTriangle } from 'lucide-react';
import type { WorkoutData, Exercise, Workout, Set, MetricType, WorkoutPlan } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useExercises } from '../contexts/ExerciseContext';
import { format } from 'date-fns';
import { parseLocalDate, getCanonicalId, normalizeText } from '../utils';
import { EditExerciseModal } from './EditExerciseModal';

interface UnifiedEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWorkoutProcessed: (data: WorkoutData) => void;
  pastWorkouts: Workout[];
  plans: WorkoutPlan[];
  onOpenCreatePlan: () => void;
}

type Tab = 'overview' | 'library' | 'history' | 'routines';

export const UnifiedEntryModal: React.FC<UnifiedEntryModalProps> = ({ 
  isOpen, 
  onClose, 
  onWorkoutProcessed,
  pastWorkouts,
  plans,
  onOpenCreatePlan
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('library');
  const [sessionExercises, setSessionExercises] = useState<Exercise[]>([]);
  const { t } = useLanguage();
  const { catalog } = useExercises();

  const [libSearch, setLibSearch] = useState('');
  const [selectedLibExercise, setSelectedLibExercise] = useState<string | null>(null);
  const [selectedMetricType, setSelectedMetricType] = useState<MetricType>('strength');
  const [isHistoryBased, setIsHistoryBased] = useState(false); 
  const [setsConfig, setSetsConfig] = useState<Set[]>([{ reps: 10, weight: 0, unit: 'kg' }]);
  const [editingItem, setEditingItem] = useState<{ index: number; data: Exercise } | null>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, editingItem]);

  const filteredLibrary = useMemo(() => {
      const term = normalizeText(libSearch);
      if (!term) return catalog.slice(0, 20);
      return catalog.filter(ex => normalizeText(ex.es).includes(term) || normalizeText(ex.en).includes(term)).slice(0, 20);
  }, [libSearch, catalog]);

  const handleSelectExercise = (name: string) => {
      setSelectedLibExercise(name);
      const targetId = getCanonicalId(name, catalog);
      const dbMatch = catalog.find(ex => ex.es === name || ex.en === name || ex.id === targetId);
      const type = dbMatch?.type || 'strength';
      setSelectedMetricType(type);

      let historyFound = false;
      const sortedHistory = [...pastWorkouts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      for (const workout of sortedHistory) {
          const match = workout.structured_data.exercises.find(ex => getCanonicalId(ex.name, catalog) === targetId);
          if (match && match.sets.length > 0) {
              const historySets = match.sets.map(s => ({
                  ...s,
                  reps: s.reps || 0, weight: s.weight || 0, distance: s.distance || 0, time: s.time || '', unit: s.unit || (type === 'cardio' ? 'km' : 'kg')
              }));
              setSetsConfig(historySets);
              historyFound = true;
              setIsHistoryBased(true);
              break;
          }
      }

      if (!historyFound) {
          setIsHistoryBased(false);
          if (type === 'cardio') {
              setSetsConfig([{ distance: 0, time: '', unit: 'km' }]);
          } else {
              setSetsConfig([{ reps: 10, weight: 0, unit: 'kg' }]);
          }
      }
  };

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

  const handleUpdateSet = (index: number, field: keyof Set, value: string | number) => {
      const newSets = [...setsConfig];
      newSets[index] = { ...newSets[index], [field]: value };
      setSetsConfig(newSets);
  };

  const confirmAddExercise = () => {
      if (!selectedLibExercise) return;
      const newExercise: Exercise = { name: selectedLibExercise, sets: setsConfig };
      setSessionExercises([...sessionExercises, newExercise]);
      setSelectedLibExercise(null);
      setLibSearch('');
      setActiveTab('overview');
  };

  const removeSessionExercise = (index: number) => {
      const newSession = [...sessionExercises];
      newSession.splice(index, 1);
      setSessionExercises(newSession);
  };

  const handleEditSessionExercise = (updatedExercise: Exercise) => {
      if (editingItem) {
          const newSession = [...sessionExercises];
          newSession[editingItem.index] = updatedExercise;
          setSessionExercises(newSession);
          setEditingItem(null);
      }
  };

  const handleCloneGroup = (exercises: Exercise[]) => {
      const clonedExercises = exercises.map(ex => ({ name: ex.name, sets: ex.sets.map(s => ({ ...s })) }));
      setSessionExercises(prev => [...prev, ...clonedExercises]);
      setActiveTab('overview');
  };

  const handleSaveSession = () => {
      if (sessionExercises.length === 0) return;
      const data: WorkoutData = { exercises: sessionExercises, notes: "Manual Session" };
      onWorkoutProcessed(data);
      setSessionExercises([]);
      onClose();
  };

  const historyOptions = useMemo(() => {
    const groupedMap = new Map<string, { date: string, exercises: Exercise[] }>();
    pastWorkouts.forEach(w => {
        const dateKey = w.date;
        if (!groupedMap.has(dateKey)) groupedMap.set(dateKey, { date: dateKey, exercises: [] });
        const entry = groupedMap.get(dateKey)!;
        entry.exercises.push(...w.structured_data.exercises);
    });
    return Array.from(groupedMap.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
  }, [pastWorkouts]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-surface border-t sm:border border-white/10 rounded-t-3xl sm:rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col h-[90vh] sm:max-h-[85vh] animate-in slide-in-from-bottom-10 duration-300">
        
        <div className="bg-black border-b border-white/10 pt-2 px-2 shrink-0">
            <div className="flex items-center justify-between px-2 mb-3">
                 <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-primary" /> {t('builder')}
                 </h3>
                 <div className="flex items-center gap-3">
                    <div className="text-xs font-mono text-zinc-500">{sessionExercises.length} {t('added')}</div>
                    <button onClick={onClose} className="p-1 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
                 </div>
            </div>
            
            <div className="flex gap-1">
                <button onClick={() => setActiveTab('library')} className={`flex-1 py-3 text-xs font-bold uppercase rounded-t-lg transition-colors border-t border-x flex items-center justify-center gap-2 ${activeTab === 'library' ? 'bg-zinc-900 border-white/10 text-green-400 border-b-black translate-y-[1px]' : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}><Search className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{t('library')}</span></button>
                <button onClick={() => setActiveTab('routines')} className={`flex-1 py-3 text-xs font-bold uppercase rounded-t-lg transition-colors border-t border-x flex items-center justify-center gap-2 ${activeTab === 'routines' ? 'bg-zinc-900 border-white/10 text-yellow-400 border-b-black translate-y-[1px]' : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}><Zap className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{t('routines')}</span></button>
                <button onClick={() => setActiveTab('overview')} className={`flex-1 py-3 text-xs font-bold uppercase rounded-t-lg transition-colors border-t border-x flex items-center justify-center gap-2 ${activeTab === 'overview' ? 'bg-zinc-900 border-white/10 text-primary border-b-black translate-y-[1px]' : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}><Layers className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{t('overview')}</span>{sessionExercises.length > 0 && <span className="bg-primary text-black text-[9px] px-1.5 rounded-full">{sessionExercises.length}</span>}</button>
                <button onClick={() => setActiveTab('history')} className={`flex-1 py-3 text-xs font-bold uppercase rounded-t-lg transition-colors border-t border-x flex items-center justify-center gap-2 ${activeTab === 'history' ? 'bg-zinc-900 border-white/10 text-blue-400 border-b-black translate-y-[1px]' : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}><History className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{t('history')}</span></button>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-zinc-900 p-4 custom-scrollbar">
            {activeTab === 'library' && (
                <div className="space-y-4 h-full flex flex-col">
                    {!selectedLibExercise ? (
                        <>
                            <div className="relative shrink-0">
                                <Search className="absolute left-3 top-3.5 w-5 h-5 text-zinc-500" />
                                <input value={libSearch} onChange={(e) => setLibSearch(e.target.value)} placeholder={t('search_db')} className="w-full bg-black border border-white/20 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-green-400/50" autoFocus />
                            </div>
                            <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar pr-1">
                                {filteredLibrary.map((ex, i) => {
                                    const Icon = ex.type === 'cardio' ? Activity : Dumbbell;
                                    return (
                                    <button key={i} onClick={() => handleSelectExercise(ex.es)} className="w-full text-left px-4 py-3 bg-black/40 border border-white/5 hover:border-green-400/30 hover:bg-white/5 rounded-xl text-sm text-zinc-300 hover:text-white transition-all flex items-center justify-between group">
                                        <div className="flex items-center gap-3"><Icon className="w-4 h-4 text-zinc-600 group-hover:text-green-400 transition-colors" />{ex.es}</div><Plus className="w-4 h-4 opacity-0 group-hover:opacity-100 text-green-400 transition-opacity" />
                                    </button>
                                )})}
                                {filteredLibrary.length === 0 && <div className="text-center py-8 text-zinc-500 text-xs border border-dashed border-white/10 rounded-xl mt-4">{t('no_matches')}</div>}
                            </div>
                        </>
                    ) : (
                        <div className="animate-in slide-in-from-right-10 duration-200 flex flex-col h-full">
                            <div className="flex items-center gap-2 mb-4 shrink-0">
                                <button onClick={() => setSelectedLibExercise(null)} className="text-zinc-500 hover:text-white text-xs uppercase font-bold flex items-center gap-1"><ChevronRight className="w-4 h-4 rotate-180" /> {t('back')}</button>
                                <div className="h-4 w-px bg-white/10"></div>
                                <h3 className="text-white font-bold truncate flex-1 text-lg">{selectedLibExercise}</h3>
                                {selectedMetricType === 'cardio' && <Activity className="w-4 h-4 text-blue-400" />}
                                {isHistoryBased && <div className="ml-auto flex items-center gap-1 bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded border border-yellow-500/20 text-[10px] font-mono animate-in fade-in"><Sparkles className="w-3 h-3" /> Auto-filled</div>}
                            </div>
                            
                            <div className="bg-black border border-white/10 rounded-2xl p-4 flex-1 overflow-y-auto custom-scrollbar">
                                <div className="space-y-2">
                                    {setsConfig.map((set, idx) => (
                                        <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                                            <div className="col-span-2 flex justify-center"><div className="w-6 h-6 rounded bg-zinc-800 flex items-center justify-center text-xs font-mono text-zinc-400">{idx + 1}</div></div>
                                            {selectedMetricType === 'strength' ? (
                                                <>
                                                    <div className="col-span-4"><input type="number" value={set.weight === 0 ? '' : set.weight} onChange={(e) => handleUpdateSet(idx, 'weight', Number(e.target.value))} className="w-full bg-zinc-900 border border-white/10 rounded p-2 text-center text-white font-bold text-lg focus:border-green-400 focus:outline-none" placeholder="0" /></div>
                                                    <div className="col-span-4"><input type="number" value={set.reps === 0 ? '' : set.reps} onChange={(e) => handleUpdateSet(idx, 'reps', Number(e.target.value))} className="w-full bg-zinc-900 border border-white/10 rounded p-2 text-center text-white font-bold text-lg focus:border-green-400 focus:outline-none" placeholder="0" /></div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="col-span-4"><input type="number" value={set.distance || ''} onChange={(e) => handleUpdateSet(idx, 'distance', Number(e.target.value))} className="w-full bg-zinc-900 border border-white/10 rounded p-2 text-center text-white font-bold text-lg focus:border-blue-400 focus:outline-none" placeholder="km" /></div>
                                                    <div className="col-span-4"><input type="text" value={set.time || ''} onChange={(e) => handleUpdateSet(idx, 'time', e.target.value)} className="w-full bg-zinc-900 border border-white/10 rounded p-2 text-center text-white font-bold text-sm focus:border-blue-400 focus:outline-none" placeholder="25m / 25:00" /></div>
                                                </>
                                            )}
                                            <div className="col-span-2 flex justify-center"><button onClick={() => handleRemoveSet(idx)} disabled={setsConfig.length === 1} className="text-zinc-600 hover:text-red-500 disabled:opacity-30"><Trash2 className="w-5 h-5" /></button></div>
                                        </div>
                                    ))}
                                </div>
                                <button onClick={handleAddSet} className="w-full mt-4 py-3 border border-dashed border-white/10 rounded-xl text-xs text-zinc-500 hover:text-white hover:border-white/30 transition-colors uppercase font-bold flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> {t('add_set')}</button>
                            </div>
                            <button onClick={confirmAddExercise} className="w-full mt-4 bg-green-400 text-black font-bold py-4 rounded-xl shadow-glow active:scale-95 transition-all text-sm uppercase flex items-center justify-center gap-2 shrink-0"><Plus className="w-5 h-5" /> {t('add_to_session')}</button>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'routines' && (
                <div className="flex flex-col h-full space-y-4">
                    <button onClick={onOpenCreatePlan} className="w-full py-4 border-2 border-dashed border-white/10 rounded-xl text-yellow-400 hover:bg-yellow-400/5 hover:border-yellow-400/30 transition-colors uppercase font-bold text-xs flex items-center justify-center gap-2 shrink-0"><Plus className="w-4 h-4" /> {t('new')} {t('routines')}</button>
                    <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                        {plans.length === 0 ? <div className="text-center py-10 text-zinc-500 text-xs border border-dashed border-white/10 rounded-xl"><Zap className="w-8 h-8 mx-auto mb-2 text-zinc-700" /> No routines yet.</div> : (
                            plans.map((plan) => (
                                <button key={plan.id} onClick={() => handleCloneGroup(plan.exercises)} className="w-full bg-black border border-white/10 hover:border-yellow-400/30 p-4 rounded-xl text-left transition-all group flex justify-between items-center">
                                    <div><div className="text-white font-bold text-sm group-hover:text-yellow-400 transition-colors">{plan.name}</div><div className="text-xs text-zinc-500 mt-1">{plan.exercises.length} Exercises</div></div><Plus className="w-5 h-5 text-zinc-600 group-hover:text-yellow-400" />
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'overview' && (
                <div className="flex flex-col h-full">
                    {sessionExercises.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-zinc-500"><Layers className="w-12 h-12 mb-3 opacity-20" /><p className="text-sm">{t('session_empty')}</p><button onClick={() => setActiveTab('library')} className="mt-4 text-xs font-bold text-green-400 hover:underline">{t('go_to_lib')}</button></div>
                    ) : (
                        <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                            {sessionExercises.map((ex, i) => (
                                <div key={i} className="bg-black border border-white/10 rounded-xl p-3 relative group hover:border-primary/30 transition-colors">
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="font-bold text-white text-sm">{ex.name}</h4>
                                        <div className="flex gap-2"><button onClick={() => setEditingItem({ index: i, data: ex })} className="text-zinc-600 hover:text-white p-1"><Pencil className="w-3.5 h-3.5" /></button><button onClick={() => removeSessionExercise(i)} className="text-zinc-600 hover:text-red-500 p-1"><Trash2 className="w-3.5 h-3.5" /></button></div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {ex.sets.map((s, idx) => (
                                            <div key={idx} className="bg-zinc-900 border border-white/5 rounded px-2 py-1 text-[10px] text-zinc-400 font-mono">
                                                {s.distance ? <span>{s.distance}km {s.time}</span> : <span><span className="text-white font-bold">{s.weight}</span>kg x {s.reps}</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            <button onClick={() => setActiveTab('library')} className="w-full py-3 border border-dashed border-white/10 rounded-xl text-xs text-zinc-500 hover:text-white transition-colors uppercase font-bold flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> {t('add_another')}</button>
                        </div>
                    )}
                    {sessionExercises.length > 0 && (
                        <div className="pt-4 mt-auto border-t border-white/10 shrink-0">
                            <button onClick={handleSaveSession} className="w-full bg-primary text-black font-bold py-4 rounded-xl shadow-glow active:scale-95 transition-transform uppercase text-sm flex items-center justify-center gap-2"><Save className="w-5 h-5" /> {t('save_session')}</button>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'history' && (
                <div className="space-y-3 h-full overflow-y-auto custom-scrollbar">
                    {historyOptions.map((h, i) => (
                        <button key={i} onClick={() => handleCloneGroup(h.exercises)} className="w-full bg-black border border-white/10 hover:border-blue-400/30 p-4 rounded-xl text-left transition-all group">
                            <div className="flex justify-between items-center mb-2"><div className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2"><Clock className="w-3 h-3" /> {format(new Date(h.date), 'MMM do, yyyy')}</div><ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-blue-400 transition-colors" /></div>
                            <div className="text-sm text-zinc-400 line-clamp-2">{h.exercises.map(e => e.name).join(', ')}</div>
                        </button>
                    ))}
                    {historyOptions.length === 0 && <div className="text-center py-10 text-zinc-500 text-xs">No history found.</div>}
                </div>
            )}
        </div>
      </div>

      {editingItem && (
          <EditExerciseModal 
            isOpen={!!editingItem} 
            onClose={() => setEditingItem(null)} 
            exercise={editingItem.data} 
            onSave={handleEditSessionExercise} 
          />
      )}
    </div>
  );
};
