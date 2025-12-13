import React, { useState, useEffect } from 'react';
import { X, Save, Plus, Trash2 } from 'lucide-react';
import { Exercise, Set } from '../types';

interface EditExerciseModalProps {
  isOpen: boolean;
  onClose: () => void;
  exercise: Exercise;
  onSave: (updatedExercise: Exercise) => void;
}

export const EditExerciseModal: React.FC<EditExerciseModalProps> = ({ isOpen, onClose, exercise, onSave }) => {
  // Deep copy sets to avoid mutating props directly
  const [sets, setSets] = useState<Set[]>([]);

  useEffect(() => {
    if (isOpen && exercise) {
      setSets(exercise.sets.map(s => ({ ...s }))); // Deep clone
    }
  }, [isOpen, exercise]);

  if (!isOpen) return null;

  const handleSetChange = (index: number, field: keyof Set, value: string | number) => {
    const newSets = [...sets];
    newSets[index] = {
      ...newSets[index],
      [field]: value
    };
    setSets(newSets);
  };

  const addSet = () => {
    // Copy last set values or default
    const lastSet = sets[sets.length - 1];
    setSets([...sets, { 
      reps: lastSet ? lastSet.reps : 10, 
      weight: lastSet ? lastSet.weight : 0, 
      unit: lastSet ? lastSet.unit : 'kg' 
    }]);
  };

  const removeSet = (index: number) => {
    if (sets.length <= 1) return; // Prevent deleting last set (optional UX choice)
    const newSets = [...sets];
    newSets.splice(index, 1);
    setSets(newSets);
  };

  const handleSave = () => {
    onSave({
      ...exercise,
      sets: sets
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-sm bg-surface border border-white/10 rounded-lg shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black rounded-t-lg">
          <div>
            <h3 className="text-sm font-bold text-subtext font-mono uppercase">Editing Log</h3>
            <h2 className="text-lg font-bold text-primary truncate max-w-[200px]">{exercise.name}</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:text-white text-subtext transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sets List */}
        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-12 gap-2 text-[10px] text-subtext font-mono uppercase text-center mb-1">
             <div className="col-span-2">Set</div>
             <div className="col-span-4">Weight (kg)</div>
             <div className="col-span-4">Reps</div>
             <div className="col-span-2"></div>
          </div>
          
          {sets.map((set, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
               <div className="col-span-2 flex justify-center">
                 <span className="w-6 h-6 rounded bg-white/5 flex items-center justify-center text-xs font-mono text-white">
                   {idx + 1}
                 </span>
               </div>
               
               <div className="col-span-4">
                 <input 
                   type="number"
                   value={set.weight}
                   onChange={(e) => handleSetChange(idx, 'weight', Number(e.target.value))}
                   className="w-full bg-black border border-white/10 rounded p-2 text-center text-sm font-bold text-primary focus:border-primary focus:outline-none"
                 />
               </div>

               <div className="col-span-4">
                 <input 
                   type="number"
                   value={set.reps}
                   onChange={(e) => handleSetChange(idx, 'reps', Number(e.target.value))}
                   className="w-full bg-black border border-white/10 rounded p-2 text-center text-sm text-text focus:border-primary focus:outline-none"
                 />
               </div>

               <div className="col-span-2 flex justify-center">
                 <button 
                   onClick={() => removeSet(idx)}
                   disabled={sets.length === 1}
                   className="p-2 text-zinc-600 hover:text-red-500 disabled:opacity-30 disabled:hover:text-zinc-600 transition-colors"
                 >
                   <Trash2 className="w-4 h-4" />
                 </button>
               </div>
            </div>
          ))}

          <button 
            onClick={addSet}
            className="w-full py-2 mt-2 border border-dashed border-white/10 rounded flex items-center justify-center gap-2 text-xs text-subtext hover:text-primary hover:border-primary/50 transition-colors"
          >
            <Plus className="w-3 h-3" /> Add Set
          </button>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-black rounded-b-lg flex justify-end gap-2">
          <button 
             onClick={onClose}
             className="px-4 py-2 rounded text-xs font-mono font-bold text-subtext hover:text-white transition-colors uppercase"
          >
            Cancel
          </button>
          <button 
             onClick={handleSave}
             className="px-4 py-2 bg-primary hover:bg-primaryHover text-black font-bold font-mono text-xs uppercase rounded shadow-glow transition-all flex items-center gap-2"
          >
            <Save className="w-4 h-4" /> Save Changes
          </button>
        </div>

      </div>
    </div>
  );
};