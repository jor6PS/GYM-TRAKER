import React, { useState, useMemo } from 'react';
import { X, Plus, Trash2, Save, Search, Dumbbell, ChevronRight, Gauge } from 'lucide-react';
import { WorkoutData, Exercise, Set } from '../types';
import { EXERCISE_DB } from '../data/exerciseDb';
import { useLanguage } from '../contexts/LanguageContext';

interface StructuredEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWorkoutProcessed: (data: WorkoutData) => void;
}

export const StructuredEntryModal: React.FC<StructuredEntryModalProps> = ({ isOpen, onClose, onWorkoutProcessed }) => {
  const [addedExercises, setAddedExercises] = useState<Exercise[]>([]);
  const [workoutNotes, setWorkoutNotes] = useState('');
  
  // Exercise Builder State
  const [isBuilding, setIsBuilding] = useState(false); // Are we currently adding a specific exercise?
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDbExercise, setSelectedDbExercise] = useState<string | null>(null);
  
  // Sets Builder State
  const [currentSets, setCurrentSets] = useState<Set[]>([{ reps: 10, weight: 0, unit: 'kg' }]);

  const { t, language } = useLanguage();

  if (!isOpen) return null;

  // --- HELPER LOGIC ---

  const filteredExercises = useMemo(() => {
    if (!searchTerm) return [];
    const term = searchTerm.toLowerCase();
    const langKey = language === 'es' ? 'es' : 'en';

    return EXERCISE_DB
      .filter(ex => ex[langKey].toLowerCase().includes(term))
      .map(ex => ex[langKey])
      .slice(0, 5);
  }, [searchTerm, language]);

  const handleStartBuilding = (exerciseName: string) => {
      setSelectedDbExercise(exerciseName);
      setSearchTerm('');
      setIsBuilding(true);
      // Reset sets to 1 default set
      setCurrentSets([{ reps: 10, weight: 0, unit: 'kg' }]);
  };

  const handleSetChange = (index: number, field: keyof Set, value: string | number) => {
      const newSets = [...currentSets];
      newSets[index] = { ...newSets[index], [field]: value };
      setCurrentSets(newSets);
  };

  const addSetRow = () => {
      const lastSet = currentSets[currentSets.length - 1];
      setCurrentSets([...currentSets, { 
          reps: lastSet ? lastSet.reps : 10, 
          weight: lastSet ? lastSet.weight : 0, 
          unit: 'kg',
          rpe: lastSet ? lastSet.rpe : undefined 
      }]);
  };

  const removeSetRow = (index: number) => {
      if (currentSets.length <= 1) return;
      const newSets = [...currentSets];
      newSets.splice(index, 1);
      setCurrentSets(newSets);
  };

  const confirmExercise = () => {
      if (!selectedDbExercise) return;
      const newExercise: Exercise = {
          name: selectedDbExercise,
          sets: currentSets
      };
      setAddedExercises([...addedExercises, newExercise]);
      
      // Reset Builder
      setIsBuilding(false);
      setSelectedDbExercise(null);
      setCurrentSets([{ reps: 10, weight: 0, unit: 'kg' }]);
  };

  const cancelBuilding = () => {
      setIsBuilding(false);
      setSelectedDbExercise(null);
  };

  const removeAddedExercise = (index: number) => {
      const newCtx = [...addedExercises];
      newCtx.splice(index, 1);
      setAddedExercises(newCtx);
  };

  const handleSubmitWorkout = () => {
      if (addedExercises.length === 0) return;
      
      const data: WorkoutData = {
          exercises: addedExercises,
          notes: workoutNotes.trim() || undefined
      };
      
      onWorkoutProcessed(data);
      
      // Reset All
      setAddedExercises([]);
      setWorkoutNotes('');
      onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/90 backdrop-blur-sm transition-opacity" onClick={onClose} />

      {/* Modal Content */}
      <div className="relative w-full max-w-lg bg-surface border-t sm:border border-white/10 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col h-[90vh] sm:h-[85vh] animate-in slide-in-from-bottom-10 duration-300">
        
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-zinc-900 rounded-t-3xl sm:rounded-t-2xl">
           <div>
               <h3 className="text-lg font-bold text-white uppercase tracking-wide flex items-center gap-2">
                   <Dumbbell className="w-5 h-5 text-primary" /> {t('manual_entry')}
               </h3>
           </div>
           <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors">
               <X className="w-5 h-5" />
           </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 bg-black">
            
            {/* VIEW 1: EXERCISE LIST (If not building) */}
            {!isBuilding && (
                <div className="space-y-6">
                    {/* Added Exercises List */}
                    <div className="space-y-3">
                        {addedExercises.length === 0 ? (
                            <div className="text-center py-10 border-2 border-dashed border-white/10 rounded-xl bg-white/5">
                                <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-3 text-zinc-500">
                                    <Dumbbell className="w-6 h-6" />
                                </div>
                                <p className="text-sm text-zinc-500">{t('no_exercises_added')}</p>
                                <p className="text-xs text-zinc-600 mt-1">{t('start_adding_below')}</p>
                            </div>
                        ) : (
                            addedExercises.map((ex, idx) => (
                                <div key={idx} className="bg-zinc-900 border border-white/10 rounded-xl p-3 relative group">
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="font-bold text-white text-sm">{ex.name}</h4>
                                        <button onClick={() => removeAddedExercise(idx)} className="text-zinc-600 hover:text-red-500">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {ex.sets.map((s, sIdx) => (
                                            <div key={sIdx} className="bg-black border border-white/10 rounded px-2 py-1 text-xs text-zinc-400 font-mono">
                                                <span className="text-primary font-bold">{s.weight}</span>kg x {s.reps}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Search / Add New Bar */}
                    <div className="relative">
                        <div className="relative">
                            <Search className="absolute left-3 top-3 w-5 h-5 text-zinc-500" />
                            <input 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder={t('search_exercise')}
                                className="w-full bg-zinc-900 border border-white/20 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-primary/50 placeholder:text-zinc-600"
                            />
                        </div>

                        {/* Search Results */}
                        {searchTerm && (
                            <div className="absolute left-0 right-0 top-full mt-2 bg-zinc-900 border border-white/20 rounded-xl shadow-2xl z-20 overflow-hidden max-h-60 overflow-y-auto">
                                {filteredExercises.length > 0 ? (
                                    filteredExercises.map((ex, i) => (
                                        <button
                                            key={i}
                                            onClick={() => handleStartBuilding(ex)}
                                            className="w-full text-left px-4 py-3 text-sm text-white hover:bg-primary/20 hover:text-primary transition-colors border-b border-white/5 flex justify-between items-center group"
                                        >
                                            {ex}
                                            <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </button>
                                    ))
                                ) : (
                                    <button 
                                        onClick={() => handleStartBuilding(searchTerm)}
                                        className="w-full text-left px-4 py-3 text-sm text-primary hover:bg-white/5 transition-colors italic flex items-center gap-2"
                                    >
                                        <Plus className="w-4 h-4" /> {t('add_custom')}: "{searchTerm}"
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* VIEW 2: EXERCISE BUILDER (If building) */}
            {isBuilding && selectedDbExercise && (
                <div className="space-y-4 animate-in slide-in-from-right-10 duration-300">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xl font-black text-primary truncate">{selectedDbExercise}</h4>
                        <button onClick={cancelBuilding} className="text-xs text-zinc-500 hover:text-white underline">{t('cancel')}</button>
                    </div>

                    {/* Sets Editor */}
                    <div className="space-y-2">
                        <div className="grid grid-cols-12 gap-2 text-[10px] text-zinc-500 font-mono uppercase text-center">
                            <div className="col-span-1">#</div>
                            <div className="col-span-3">KG</div>
                            <div className="col-span-3">REPS</div>
                            <div className="col-span-3">RPE</div>
                            <div className="col-span-2"></div>
                        </div>

                        {currentSets.map((set, idx) => (
                            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                                <div className="col-span-1 flex justify-center">
                                    <span className="w-6 h-6 rounded bg-zinc-800 flex items-center justify-center text-xs font-mono text-zinc-400">
                                        {idx + 1}
                                    </span>
                                </div>
                                <div className="col-span-3">
                                    <input 
                                        type="number" 
                                        value={set.weight === 0 ? '' : set.weight} 
                                        onChange={(e) => handleSetChange(idx, 'weight', Number(e.target.value))}
                                        className="w-full bg-zinc-900 border border-white/10 rounded p-2 text-center text-sm font-bold text-white focus:border-primary focus:outline-none"
                                        placeholder="0"
                                    />
                                </div>
                                <div className="col-span-3">
                                    <input 
                                        type="number" 
                                        value={set.reps === 0 ? '' : set.reps} 
                                        onChange={(e) => handleSetChange(idx, 'reps', Number(e.target.value))}
                                        className="w-full bg-zinc-900 border border-white/10 rounded p-2 text-center text-sm text-white focus:border-primary focus:outline-none"
                                        placeholder="0"
                                    />
                                </div>
                                <div className="col-span-3 relative">
                                    <input 
                                        type="number" min="1" max="10" value={set.rpe || ''} onChange={(e) => handleSetChange(idx, 'rpe', e.target.value ? Number(e.target.value) : '')} placeholder="-"
                                        className="w-full bg-zinc-900 border border-white/10 rounded p-2 text-center text-sm text-zinc-400 focus:border-primary focus:outline-none"
                                    />
                                </div>
                                <div className="col-span-2 flex justify-center">
                                    <button onClick={() => removeSetRow(idx)} disabled={currentSets.length === 1} className="text-zinc-600 hover:text-red-500 disabled:opacity-30">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}

                        <button onClick={addSetRow} className="w-full py-3 mt-2 border border-dashed border-white/10 rounded-xl flex items-center justify-center gap-2 text-xs text-zinc-500 hover:text-primary hover:border-primary/50 transition-colors">
                            <Plus className="w-4 h-4" /> {t('add_set')}
                        </button>
                    </div>

                    <div className="pt-4 border-t border-white/10">
                        <button onClick={confirmExercise} className="w-full bg-primary text-black font-bold py-3 rounded-xl shadow-glow active:scale-95 transition-transform uppercase text-sm">
                            {t('confirm_exercise')}
                        </button>
                    </div>
                </div>
            )}

        </div>

        {/* Footer */}
        {!isBuilding && (
            <div className="p-4 border-t border-white/10 bg-zinc-900 rounded-b-2xl space-y-4">
                <textarea 
                    value={workoutNotes}
                    onChange={(e) => setWorkoutNotes(e.target.value)}
                    placeholder={t('notes_placeholder')}
                    className="w-full bg-black border border-white/10 rounded-xl p-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 h-20 resize-none"
                />
                
                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold text-xs text-zinc-400 hover:text-white uppercase transition-colors">
                        {t('cancel')}
                    </button>
                    <button 
                        onClick={handleSubmitWorkout}
                        disabled={addedExercises.length === 0}
                        className="flex-[2] bg-primary disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-bold py-3 rounded-xl shadow-glow disabled:shadow-none transition-all uppercase text-sm flex items-center justify-center gap-2"
                    >
                        <Save className="w-4 h-4" /> {t('finish_workout')}
                    </button>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};