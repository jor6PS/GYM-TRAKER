import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Plus, Trash2, Gauge, Activity, Dumbbell } from 'lucide-react';
import { Exercise, Set, MetricType } from '../types';
import { getCanonicalId } from '../utils';
import { EXERCISE_DB } from '../data/exerciseDb';
import { useLanguage } from '../contexts/LanguageContext';

interface EditExerciseModalProps {
  isOpen: boolean;
  onClose: () => void;
  exercise: Exercise;
  onSave: (updatedExercise: Exercise) => void;
}

export const EditExerciseModal: React.FC<EditExerciseModalProps> = ({ isOpen, onClose, exercise, onSave }) => {
  const { t } = useLanguage();

  // FIX: Initialize state directly from props using lazy initializer to prevent crash on first render
  // This avoids the "flash of undefined" that caused the black screen
  const [sets, setSets] = useState<Set[]>(() => {
    if (exercise && exercise.sets) {
        return exercise.sets.map(s => ({ ...s })); // Deep clone
    }
    return [];
  });

  // Determine Type
  const exerciseType: MetricType = useMemo(() => {
      if (!exercise) return 'strength';
      const id = getCanonicalId(exercise.name);
      const def = EXERCISE_DB.find(e => e.id === id);
      return def?.type || 'strength';
  }, [exercise]);

  // Sync if exercise prop changes while open (rare but safe)
  useEffect(() => {
    if (isOpen && exercise) {
      setSets(exercise.sets.map(s => ({ ...s })));
    }
  }, [exercise, isOpen]);

  // Scroll Lock Effect
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !exercise) return null;

  const handleSetChange = (index: number, field: keyof Set, value: string | number) => {
    const newSets = [...sets];
    newSets[index] = {
      ...newSets[index],
      [field]: value
    };
    setSets(newSets);
  };

  const addSet = () => {
    const lastSet = sets[sets.length - 1];
    const newSet: Set = { unit: lastSet?.unit || 'kg' };

    if (exerciseType === 'strength') {
        newSet.reps = lastSet?.reps || 10;
        newSet.weight = lastSet?.weight || 0;
        newSet.unit = 'kg';
    } else if (exerciseType === 'cardio') {
        newSet.distance = lastSet?.distance || 0;
        newSet.time = lastSet?.time || '';
        newSet.unit = 'km';
    }

    setSets([...sets, newSet]);
  };

  const removeSet = (index: number) => {
    if (sets.length <= 1) return;
    const newSets = [...sets];
    newSets.splice(index, 1);
    setSets(newSets);
  };

  const handleSave = () => {
    onSave({ ...exercise, sets: sets });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-md bg-surface border border-border rounded-xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-surfaceHighlight rounded-t-xl">
          <div>
            <div className="flex items-center gap-2 mb-1">
                {exerciseType === 'strength' && <Dumbbell className="w-3 h-3 text-primary" />}
                {exerciseType === 'cardio' && <Activity className="w-3 h-3 text-blue-400" />}
                <h3 className="text-xs font-bold text-subtext font-mono uppercase">{t('edit')}</h3>
            </div>
            <h2 className="text-lg font-bold text-text truncate max-w-[250px]">{exercise.name}</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:text-text text-subtext transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dynamic Sets List */}
        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto bg-background custom-scrollbar">
          
          {/* HEADERS */}
          <div className="grid grid-cols-12 gap-2 text-[10px] text-subtext font-mono uppercase text-center mb-1">
             <div className="col-span-1">#</div>
             
             {exerciseType === 'strength' && (
                 <>
                    <div className="col-span-3">Kg</div>
                    <div className="col-span-3">Reps</div>
                    <div className="col-span-3">RPE</div>
                 </>
             )}
             {exerciseType === 'cardio' && (
                 <>
                    <div className="col-span-4">Dist (km)</div>
                    <div className="col-span-5">Time</div>
                 </>
             )}

             <div className="col-span-2"></div>
          </div>
          
          {/* ROWS */}
          {sets.map((set, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
               <div className="col-span-1 flex justify-center">
                 <span className="w-6 h-6 rounded bg-surfaceHighlight flex items-center justify-center text-xs font-mono text-text">
                   {idx + 1}
                 </span>
               </div>
               
               {/* STRENGTH INPUTS */}
               {exerciseType === 'strength' && (
                   <>
                    <div className="col-span-3">
                        <input 
                        type="number"
                        value={set.weight === 0 ? '' : set.weight}
                        onChange={(e) => handleSetChange(idx, 'weight', Number(e.target.value))}
                        className="w-full bg-surface border border-border rounded p-2 text-center text-sm font-bold text-primary focus:border-primary focus:outline-none"
                        placeholder="0"
                        />
                    </div>
                    <div className="col-span-3">
                        <input 
                        type="number"
                        value={set.reps === 0 ? '' : set.reps}
                        onChange={(e) => handleSetChange(idx, 'reps', Number(e.target.value))}
                        className="w-full bg-surface border border-border rounded p-2 text-center text-sm text-text focus:border-primary focus:outline-none"
                        placeholder="0"
                        />
                    </div>
                    <div className="col-span-3">
                        <div className="relative">
                            <Gauge className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-subtext" />
                            <input 
                                type="number"
                                min="1" max="10"
                                value={set.rpe || ''}
                                placeholder="-"
                                onChange={(e) => handleSetChange(idx, 'rpe', e.target.value ? Number(e.target.value) : '')}
                                className="w-full bg-surface border border-border rounded p-2 pl-5 text-center text-sm text-text focus:border-primary focus:outline-none placeholder:text-subtext"
                            />
                        </div>
                    </div>
                   </>
               )}

               {/* CARDIO INPUTS */}
               {exerciseType === 'cardio' && (
                   <>
                    <div className="col-span-4">
                        <input 
                        type="number"
                        value={set.distance || ''}
                        onChange={(e) => handleSetChange(idx, 'distance', Number(e.target.value))}
                        className="w-full bg-surface border border-border rounded p-2 text-center text-sm font-bold text-blue-400 focus:border-blue-400 focus:outline-none"
                        placeholder="km"
                        />
                    </div>
                    <div className="col-span-5">
                        <input 
                        type="text"
                        value={set.time || ''}
                        onChange={(e) => handleSetChange(idx, 'time', e.target.value)}
                        className="w-full bg-surface border border-border rounded p-2 text-center text-sm text-text focus:border-blue-400 focus:outline-none"
                        placeholder="MM:SS"
                        />
                    </div>
                   </>
               )}

               <div className="col-span-2 flex justify-center">
                 <button 
                   onClick={() => removeSet(idx)}
                   disabled={sets.length === 1}
                   className="p-2 text-subtext hover:text-red-500 disabled:opacity-30 disabled:hover:text-subtext transition-colors"
                 >
                   <Trash2 className="w-4 h-4" />
                 </button>
               </div>
            </div>
          ))}

          <button 
            onClick={addSet}
            className="w-full py-3 mt-2 border border-dashed border-border rounded-xl flex items-center justify-center gap-2 text-xs text-subtext hover:text-primary hover:border-primary/50 transition-colors uppercase font-bold"
          >
            <Plus className="w-3 h-3" /> {t('add_set')}
          </button>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-surfaceHighlight rounded-b-xl flex justify-end gap-2">
          <button 
             onClick={onClose}
             className="px-4 py-3 rounded-xl text-xs font-mono font-bold text-subtext hover:text-text transition-colors uppercase"
          >
            {t('cancel')}
          </button>
          <button 
             onClick={handleSave}
             className="px-6 py-3 bg-primary hover:bg-primaryHover text-black font-bold font-mono text-xs uppercase rounded-xl shadow-glow transition-all flex items-center gap-2"
          >
            <Save className="w-4 h-4" /> {t('save')}
          </button>
        </div>

      </div>
    </div>
  );
};