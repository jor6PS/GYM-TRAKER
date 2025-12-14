import React, { useState, useMemo, useEffect } from 'react';
import { X, Plus, Trash2, Save, Search } from 'lucide-react';
import { WorkoutPlan, Exercise } from '../types';
import { EXERCISE_DB } from '../data/exerciseDb';
import { useLanguage } from '../contexts/LanguageContext';

interface CreatePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (plan: WorkoutPlan) => void;
  initialPlan?: WorkoutPlan | null; // Added prop for editing
}

export const CreatePlanModal: React.FC<CreatePlanModalProps> = ({ isOpen, onClose, onSave, initialPlan }) => {
  const [name, setName] = useState('');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  
  // Exercise adding state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDbExercise, setSelectedDbExercise] = useState<string | null>(null);
  
  const [newExSets, setNewExSets] = useState(3);
  const [newExReps, setNewExReps] = useState(10);
  const [newExWeight, setNewExWeight] = useState(0);

  const { language } = useLanguage();

  // Effect to load initial plan data if editing
  useEffect(() => {
    if (isOpen) {
      if (initialPlan) {
        setName(initialPlan.name);
        setExercises(initialPlan.exercises);
      } else {
        // Reset if creating new
        setName('');
        setExercises([]);
      }
      // Reset add form
      setSearchTerm('');
      setNewExSets(3);
      setNewExReps(10);
      setNewExWeight(0);
    }
  }, [isOpen, initialPlan]);

  // Filter exercises based on search
  const filteredExercises = useMemo(() => {
    if (!searchTerm) return [];
    const term = searchTerm.toLowerCase();
    const langKey = language === 'es' ? 'es' : 'en';

    return EXERCISE_DB
      .filter(ex => ex[langKey].toLowerCase().includes(term))
      .map(ex => ex[langKey])
      .slice(0, 5);
  }, [searchTerm, language]);

  if (!isOpen) return null;

  const addExercise = () => {
    const exerciseName = selectedDbExercise || searchTerm.trim();
    if (!exerciseName) return;

    const newExercise: Exercise = {
      name: exerciseName,
      sets: Array(newExSets).fill({
        reps: newExReps,
        weight: newExWeight,
        unit: 'kg'
      })
    };

    setExercises([...exercises, newExercise]);
    
    // Reset form
    setSearchTerm('');
    setSelectedDbExercise(null);
  };

  const removeExercise = (index: number) => {
    const updated = [...exercises];
    updated.splice(index, 1);
    setExercises(updated);
  };

  const handleSave = () => {
    if (!name.trim() || exercises.length === 0) return;

    const plan: WorkoutPlan = {
      id: initialPlan ? initialPlan.id : crypto.randomUUID(), // Preserve ID if editing
      user_id: initialPlan?.user_id || '', // Fix: Provide user_id (will be overwritten by parent if needed)
      name,
      exercises
    };

    onSave(plan);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-lg bg-surface border border-white/10 rounded-lg shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black">
          <h3 className="text-lg font-bold text-primary font-mono uppercase tracking-widest">
            {initialPlan ? 'Edit Routine' : 'Create Routine'}
          </h3>
          <button onClick={onClose} className="p-1 hover:text-white text-subtext transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          
          {/* Plan Name */}
          <div>
            <label className="block text-xs font-mono text-subtext mb-1 uppercase">Routine Name</label>
            <input 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pull Day A"
              className="w-full bg-black border border-white/20 rounded p-2 text-text font-mono focus:border-primary focus:outline-none"
            />
          </div>

          {/* List of Added Exercises */}
          <div className="space-y-2">
            <div className="text-xs font-mono text-subtext uppercase flex justify-between">
               <span>Exercises in Routine ({exercises.length})</span>
            </div>
            
            {exercises.length === 0 ? (
              <div className="text-center py-4 border border-dashed border-white/10 rounded bg-white/5">
                <span className="text-xs text-subtext">No exercises added yet.</span>
              </div>
            ) : (
              exercises.map((ex, idx) => (
                <div key={idx} className="flex items-center justify-between bg-zinc-900/50 p-2 rounded border border-white/5">
                   <div>
                     <div className="font-bold text-sm text-text">{ex.name}</div>
                     <div className="text-xs text-subtext font-mono">
                       {ex.sets.length} sets x {ex.sets[0].reps} reps {ex.sets[0].weight > 0 && `@ ${ex.sets[0].weight}kg`}
                     </div>
                   </div>
                   <button 
                     onClick={() => removeExercise(idx)}
                     className="text-zinc-600 hover:text-red-500 transition-colors p-1"
                   >
                     <Trash2 className="w-4 h-4" />
                   </button>
                </div>
              ))
            )}
          </div>

          {/* Add New Exercise Form */}
          <div className="bg-black/40 p-3 rounded border border-white/10 space-y-3 relative">
             <div className="text-xs font-bold text-primary font-mono uppercase">Add Exercise to Routine</div>
             
             {/* Search Input */}
             <div className="relative">
               <div className="relative">
                  <Search className="absolute left-2 top-2.5 w-4 h-4 text-zinc-500" />
                  <input 
                    value={selectedDbExercise || searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setSelectedDbExercise(null); // Clear selection if typing
                    }}
                    placeholder="Search Exercise Database..."
                    className={`w-full bg-surface border ${selectedDbExercise ? 'border-primary text-primary font-bold' : 'border-white/10'} rounded p-2 pl-8 text-sm focus:border-primary/50 focus:outline-none`}
                  />
                  {selectedDbExercise && (
                    <button 
                      onClick={() => { setSelectedDbExercise(null); setSearchTerm(''); }}
                      className="absolute right-2 top-2.5"
                    >
                      <X className="w-4 h-4 text-zinc-500 hover:text-white" />
                    </button>
                  )}
               </div>

               {/* Suggestions Dropdown */}
               {searchTerm && !selectedDbExercise && filteredExercises.length > 0 && (
                 <div className="absolute left-0 right-0 top-full mt-1 bg-zinc-900 border border-white/10 rounded shadow-xl z-10 max-h-40 overflow-y-auto">
                    {filteredExercises.map((ex, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setSelectedDbExercise(ex);
                          setSearchTerm('');
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-text hover:bg-primary/20 hover:text-primary transition-colors border-b border-white/5 last:border-0"
                      >
                        {ex}
                      </button>
                    ))}
                 </div>
               )}
             </div>

             <div className="grid grid-cols-3 gap-2">
                 <div>
                    <label className="text-[10px] text-subtext uppercase">Sets</label>
                    <input type="number" value={newExSets} onChange={e => setNewExSets(Number(e.target.value))} className="w-full bg-surface border border-white/10 rounded p-1 text-center text-sm" />
                 </div>
                 <div>
                    <label className="text-[10px] text-subtext uppercase">Target Reps</label>
                    <input type="number" value={newExReps} onChange={e => setNewExReps(Number(e.target.value))} className="w-full bg-surface border border-white/10 rounded p-1 text-center text-sm" />
                 </div>
                 <div>
                    <label className="text-[10px] text-subtext uppercase">Default Kg</label>
                    <input type="number" value={newExWeight} onChange={e => setNewExWeight(Number(e.target.value))} className="w-full bg-surface border border-white/10 rounded p-1 text-center text-sm" />
                 </div>
             </div>

             <button 
               onClick={addExercise}
               disabled={!selectedDbExercise && !searchTerm.trim()}
               className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold uppercase rounded transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
             >
               <Plus className="w-3 h-3" /> Add to List
             </button>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-black flex justify-end gap-2">
          <button 
             onClick={onClose}
             className="px-4 py-2 rounded text-xs font-mono font-bold text-subtext hover:text-white transition-colors uppercase"
          >
            Cancel
          </button>
          <button 
             onClick={handleSave}
             disabled={exercises.length === 0 || !name}
             className="px-4 py-2 bg-primary hover:bg-primaryHover text-black font-bold font-mono text-xs uppercase rounded shadow-glow disabled:opacity-50 disabled:shadow-none transition-all flex items-center gap-2"
          >
            <Save className="w-4 h-4" /> {initialPlan ? 'Update Routine' : 'Save Routine'}
          </button>
        </div>

      </div>
    </div>
  );
};