
import React, { useState, useMemo, useEffect } from 'react';
import { X, Save, Clock, History, Edit3, ArrowRight, Search, Plus, Dumbbell, ChevronRight, Trash2, Layers, Activity, Pencil, Sparkles, Zap, CheckCircle } from 'lucide-react';
import type { WorkoutData, Exercise, Workout, Set, MetricType, WorkoutPlan } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useExercises } from '../contexts/ExerciseContext';
import { format } from 'date-fns';
import { getCanonicalId, normalizeText, getExerciseIcon } from '../utils';
import { EditExerciseModal } from './EditExerciseModal';
import { useScrollLock } from '../hooks/useScrollLock';

interface UnifiedEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWorkoutProcessed: (data: WorkoutData) => void;
  pastWorkouts: Workout[];
  plans: WorkoutPlan[];
  onOpenCreatePlan: () => void;
  onEditPlan?: (plan: WorkoutPlan) => void;
  onDeletePlan?: (planId: string) => void;
}

type Tab = 'overview' | 'library' | 'history' | 'routines';

export const UnifiedEntryModal: React.FC<UnifiedEntryModalProps> = ({ 
  isOpen, onClose, onWorkoutProcessed, pastWorkouts, plans, onOpenCreatePlan, onEditPlan, onDeletePlan
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('library');
  const [sessionExercises, setSessionExercises] = useState<Exercise[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { t } = useLanguage();
  const { catalog } = useExercises();
  
  useScrollLock(isOpen);

  const [libSearch, setLibSearch] = useState('');
  const [selectedLibExercise, setSelectedLibExercise] = useState<string | null>(null);
  const [selectedMetricType, setSelectedMetricType] = useState<MetricType>('strength');
  const [isHistoryBased, setIsHistoryBased] = useState(false); 
  const [setsConfig, setSetsConfig] = useState<Set[]>([{ reps: 10, weight: 0, unit: 'kg' }]);
  const [isUnilateral, setIsUnilateral] = useState(false);
  const [editingItem, setEditingItem] = useState<{ index: number; data: Exercise } | null>(null);
  const [pendingExercises, setPendingExercises] = useState<{ exercises: Exercise[]; source: 'routine' | 'history'; sourceName?: string } | null>(null);

  // Recuperar backup de ejercicios al abrir el modal si existe
  useEffect(() => {
    if (isOpen) {
      try {
        const backupKey = 'workout_session_backup';
        const backup = sessionStorage.getItem(backupKey);
        if (backup) {
          const parsed = JSON.parse(backup);
          // Restaurar ejercicios si el backup es reciente (menos de 1 hora) y no hay ejercicios actualmente
          if (parsed.exercises && Array.isArray(parsed.exercises) && parsed.exercises.length > 0) {
            if (Date.now() - parsed.timestamp < 3600000) {
              // Solo restaurar si realmente no hay ejercicios
              setSessionExercises((prev) => {
                if (prev.length === 0) {
                  setActiveTab('overview');
                  setSaveError('Se recuperaron ejercicios guardados temporalmente. Puedes intentar guardar de nuevo.');
                  console.log(`✅ Recuperados ${parsed.exercises.length} ejercicios del backup al abrir el modal`);
                  return parsed.exercises;
                }
                return prev;
              });
            } else {
              // Limpiar backup antiguo
              sessionStorage.removeItem(backupKey);
            }
          }
        }
      } catch (e) {
        console.warn('⚠️ Error al recuperar backup:', e);
      }
    }
  }, [isOpen]);

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
              setSetsConfig(match.sets.map(s => ({ ...s, reps: s.reps || 0, weight: s.weight || 0, distance: s.distance || 0, time: s.time || '', unit: s.unit || (type === 'cardio' ? 'min' : 'kg') })));
              setIsUnilateral(match.unilateral || false);
              historyFound = true; setIsHistoryBased(true); break;
          }
      }
      if (!historyFound) { setIsHistoryBased(false); setSetsConfig(type === 'cardio' ? [{ time: '', unit: 'min' }] : [{ reps: 10, weight: 0, unit: 'kg' }]); setIsUnilateral(false); }
  };

  const confirmAddExercise = () => { 
    if (!selectedLibExercise) return; 
    setSessionExercises([...sessionExercises, { 
      name: selectedLibExercise, 
      sets: setsConfig, 
      unilateral: isUnilateral || undefined 
    }]); 
    setSelectedLibExercise(null); 
    setLibSearch(''); 
    setIsUnilateral(false);
    setActiveTab('overview'); 
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-surface border-t sm:border border-white/10 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[90vh] sm:max-h-[85vh] animate-in slide-in-from-bottom-10 duration-300">
        <div className="bg-black border-b border-white/10 pt-2 px-2 shrink-0">
            <div className="flex items-center justify-between px-2 mb-3">
                 <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2"><Edit3 className="w-4 h-4 text-primary" /> {t('builder')}</h3>
                 <div className="flex items-center gap-3"><div className="text-xs font-mono text-zinc-500">{sessionExercises.length} {t('added')}</div><button onClick={onClose} className="p-1 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button></div>
            </div>
            <div className="flex gap-1">
                {['library', 'routines', 'history', 'overview'].map(tab => {
                    const isOverview = tab === 'overview';
                    return (
                        <button 
                            key={tab} 
                            onClick={() => setActiveTab(tab as Tab)} 
                            className={`flex-1 py-3 text-[10px] font-black uppercase rounded-t-lg transition-all border-t border-x ${
                                isOverview 
                                    ? activeTab === tab 
                                        ? 'bg-zinc-900 border-yellow-400/30 text-yellow-400 border-b-black translate-y-[1px]' 
                                        : 'bg-transparent border-transparent text-yellow-500/80 hover:text-yellow-400'
                                    : activeTab === tab 
                                        ? 'bg-zinc-900 border-white/10 text-primary border-b-black translate-y-[1px]' 
                                        : 'bg-transparent border-transparent text-zinc-600 hover:text-zinc-400'
                            }`}
                        >
                            {t(tab as any)} {tab === 'overview' && sessionExercises.length > 0 && <span className="bg-yellow-400 text-black text-[9px] px-1 rounded-full">{sessionExercises.length}</span>}
                        </button>
                    );
                })}
            </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-zinc-900 p-4 custom-scrollbar">
            {activeTab === 'library' && (
                <div className="space-y-4 h-full flex flex-col">
                    {!selectedLibExercise ? (
                        <>
                            <div className="relative shrink-0"><Search className="absolute left-3 top-3.5 w-5 h-5 text-zinc-500" /><input value={libSearch} onChange={(e) => setLibSearch(e.target.value)} placeholder={t('search_db')} className="w-full bg-black border border-white/20 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:border-green-400/50 outline-none" autoFocus /></div>
                            <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">{filteredLibrary.map((ex, i) => <button key={i} onClick={() => handleSelectExercise(ex.es)} className="w-full text-left px-4 py-3 bg-black/40 border border-white/5 hover:border-green-400/30 rounded-xl text-sm text-zinc-300 flex items-center justify-between group"><div className="flex items-center gap-3">{ex.type === 'cardio' ? <Activity className="w-4 h-4 text-red-500" /> : <Dumbbell className="w-4 h-4 text-zinc-600" />}{ex.es}</div><Plus className="w-4 h-4 opacity-0 group-hover:opacity-100 text-green-400" /></button>)}</div>
                        </>
                    ) : (
                        <div className="animate-in slide-in-from-right-10 duration-200 flex flex-col h-full">
                            <div className="flex items-center gap-2 mb-4"><button onClick={() => setSelectedLibExercise(null)} className="text-zinc-500 text-xs font-bold uppercase flex items-center gap-1"><ChevronRight className="w-4 h-4 rotate-180" /> {t('back')}</button><div className="h-4 w-px bg-white/10" /><h3 className="text-white font-bold truncate flex-1">{selectedLibExercise}</h3>{isHistoryBased && <div className="ml-auto text-[8px] bg-yellow-500/10 text-yellow-500 px-1.5 py-0.5 rounded border border-yellow-500/20 font-black tracking-widest uppercase">Auto-filled</div>}</div>
                            <div className="bg-black border border-white/10 rounded-2xl p-4 flex-1 overflow-y-auto custom-scrollbar">
                                {selectedMetricType === 'strength' ? (
                                    <>
                                        {setsConfig.map((set, idx) => (
                                            <div key={idx} className="grid grid-cols-12 gap-2 items-center mb-2">
                                                <div className="col-span-1 text-[10px] font-mono text-zinc-600 text-center">{idx+1}</div>
                                                <div className="col-span-4"><input type="number" value={set.weight || ''} onChange={e => { const n = [...setsConfig]; n[idx].weight = Number(e.target.value); setSetsConfig(n); }} className="w-full bg-zinc-900 border border-white/5 rounded p-2 text-center text-white font-bold text-sm" placeholder="Kg" /></div>
                                                <div className="col-span-4"><input type="number" value={set.reps || ''} onChange={e => { const n = [...setsConfig]; n[idx].reps = Number(e.target.value); setSetsConfig(n); }} className="w-full bg-zinc-900 border border-white/5 rounded p-2 text-center text-white font-bold text-sm" placeholder="Reps" /></div>
                                                <div className="col-span-2 flex justify-center"><button onClick={() => { if(setsConfig.length > 1) { const n = [...setsConfig]; n.splice(idx, 1); setSetsConfig(n); } }} className="text-zinc-700 hover:text-red-500"><Trash2 className="w-4 h-4" /></button></div>
                                            </div>
                                        ))}
                                    </>
                                ) : (
                                    <>
                                        {setsConfig.map((set, idx) => (
                                            <div key={idx} className="grid grid-cols-12 gap-2 items-center mb-2">
                                                <div className="col-span-1 text-[10px] font-mono text-zinc-600 text-center">{idx+1}</div>
                                                <div className="col-span-8"><input type="text" value={set.time || ''} onChange={e => { const n = [...setsConfig]; n[idx].time = e.target.value; setSetsConfig(n); }} className="w-full bg-zinc-900 border border-red-500/30 rounded p-2 text-center text-white font-bold text-sm placeholder:text-red-500/50" placeholder="MM:SS" /></div>
                                                <div className="col-span-2 flex justify-center"><button onClick={() => { if(setsConfig.length > 1) { const n = [...setsConfig]; n.splice(idx, 1); setSetsConfig(n); } }} className="text-zinc-700 hover:text-red-500"><Trash2 className="w-4 h-4" /></button></div>
                                            </div>
                                        ))}
                                    </>
                                )}
                                <button onClick={() => setSetsConfig([...setsConfig, { ...setsConfig[setsConfig.length-1] }])} className="w-full py-2 border border-dashed border-white/10 rounded-xl text-[10px] font-black uppercase text-zinc-500 flex items-center justify-center gap-2"><Plus className="w-3 h-3" /> {t('add_set')}</button>
                            </div>
                            {selectedMetricType === 'strength' && (
                                <div className="mt-3 p-3 bg-black/40 border border-white/10 rounded-xl">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={isUnilateral} 
                                            onChange={(e) => setIsUnilateral(e.target.checked)}
                                            className="w-4 h-4 rounded border-white/20 bg-zinc-900 text-primary focus:ring-primary focus:ring-offset-0"
                                        />
                                        <span className="text-xs text-zinc-300 font-bold uppercase tracking-wide">
                                            {t('unilateral') || 'Unilateral'} 
                                            <span className="text-[10px] text-zinc-500 ml-1 normal-case">({t('unilateral_hint') || 'Peso registrado es la mitad del real'})</span>
                                        </span>
                                    </label>
                                </div>
                            )}
                            <button onClick={confirmAddExercise} className="w-full mt-4 bg-green-400 text-black font-black py-4 rounded-xl shadow-glow text-xs uppercase flex items-center justify-center gap-2 shrink-0">{t('add_to_session')}</button>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'routines' && (
                <div className="flex flex-col h-full space-y-4">
                    <button onClick={onOpenCreatePlan} className="w-full py-4 border-2 border-dashed border-white/10 rounded-xl text-yellow-400 hover:bg-yellow-400/5 uppercase font-black text-[10px] flex items-center justify-center gap-2 shrink-0"><Plus className="w-4 h-4" /> {t('new')} {t('routines')}</button>
                    <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                        {plans.map((plan) => (
                            <div key={plan.id} className="w-full bg-black border border-white/10 p-4 rounded-xl flex items-center justify-between group">
                                <button onClick={() => {
                                    const exercisesToAdd = plan.exercises.map(e => ({ ...e, sets: e.sets.map(s => ({ ...s })) }));
                                    setPendingExercises({ exercises: exercisesToAdd, source: 'routine', sourceName: plan.name });
                                }} className="flex-1 text-left">
                                    <div className="text-white font-bold text-sm group-hover:text-yellow-400 transition-colors">{plan.name}</div>
                                    <div className="text-[10px] text-zinc-500 mt-1 uppercase font-mono tracking-widest">{plan.exercises.length} Ejercicios</div>
                                </button>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button onClick={() => onEditPlan?.(plan)} className="p-2 bg-white/5 hover:bg-primary/20 hover:text-primary rounded-lg text-zinc-500 transition-all"><Pencil className="w-4 h-4" /></button>
                                    <button onClick={() => onDeletePlan?.(plan.id)} className="p-2 bg-white/5 hover:bg-red-500/20 hover:text-red-500 rounded-lg text-zinc-500 transition-all"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'overview' && (
                <div className="flex flex-col h-full">
                    {sessionExercises.length === 0 ? <div className="flex-1 flex flex-col items-center justify-center text-zinc-700 font-black uppercase text-[10px] tracking-[0.2em]"><Layers className="w-12 h-12 mb-3 opacity-20" /><p>{t('session_empty')}</p></div> : (
                        <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                            {sessionExercises.map((ex, i) => (
                                <div key={i} className="bg-black border border-white/10 rounded-xl p-3 flex justify-between items-center group">
                                    <div className="min-w-0 flex-1">
                                        <h4 className="font-bold text-white text-sm truncate">{ex.name}</h4>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {ex.sets.map((s, idx) => {
                                                const exerciseId = getCanonicalId(ex.name, catalog);
                                                const exerciseDef = catalog.find(e => e.id === exerciseId);
                                                const isCardio = exerciseDef?.type === 'cardio';
                                                return (
                                                    <span key={idx} className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${isCardio ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-zinc-900 text-zinc-500'}`}>
                                                        {isCardio ? (s.time || '--:--') : `${s.weight || 0}×${s.reps || 0}`}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0 ml-2"><button onClick={() => setEditingItem({ index: i, data: ex })} className="p-2 text-zinc-700 hover:text-white"><Pencil className="w-3.5 h-3.5" /></button><button onClick={() => { const n = [...sessionExercises]; n.splice(i, 1); setSessionExercises(n); }} className="p-2 text-zinc-700 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button></div>
                                </div>
                            ))}
                        </div>
                    )}
                    {sessionExercises.length > 0 && (
                      <div className="pt-4 mt-auto border-t border-white/10 space-y-3">
                        {saveError && (
                          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-xs font-bold">
                            {saveError}
                          </div>
                        )}
                        <button 
                          onClick={async () => {
                            setIsSaving(true);
                            setSaveError(null);
                            
                            // Guardar backup en sessionStorage ANTES de intentar guardar
                            const backupKey = 'workout_session_backup';
                            try {
                              sessionStorage.setItem(backupKey, JSON.stringify({
                                exercises: sessionExercises,
                                timestamp: Date.now()
                              }));
                            } catch (e) {
                              console.warn('⚠️ No se pudo guardar backup en sessionStorage:', e);
                            }
                            
                            try {
                              // Validar antes de guardar
                              const validExercises = sessionExercises.filter(ex => {
                                if (!ex.name || !ex.name.trim()) {
                                  console.warn(`⚠️ Ejercicio sin nombre detectado:`, ex);
                                  return false;
                                }
                                if (!ex.sets || !Array.isArray(ex.sets) || ex.sets.length === 0) {
                                  console.warn(`⚠️ Ejercicio "${ex.name}" sin sets`);
                                  return false;
                                }
                                const hasValidSets = ex.sets.some(set => (set.reps || 0) > 0);
                                if (!hasValidSets) {
                                  console.warn(`⚠️ Ejercicio "${ex.name}" sin sets válidos (todas las reps son 0)`);
                                }
                                return hasValidSets;
                              });
                              
                              if (validExercises.length === 0) {
                                throw new Error('Los ejercicios no tienen series válidas. Añade repeticiones a las series antes de guardar.');
                              }
                              
                              console.log(`💾 Intentando guardar ${validExercises.length} ejercicios válidos...`);
                              
                              // Esperar a que el guardado se complete
                              await onWorkoutProcessed({ exercises: validExercises });
                              
                              console.log(`✅ Sesión guardada exitosamente`);
                              
                              // Limpiar backup solo si el guardado fue exitoso
                              try {
                                sessionStorage.removeItem(backupKey);
                              } catch (e) {
                                // Ignorar errores al limpiar
                              }
                              
                              // Solo limpiar y cerrar si el guardado fue exitoso
                              setSessionExercises([]);
                              setSaveError(null);
                              setIsSaving(false);
                              onClose();
                            } catch (error: any) {
                              console.error('❌ Error al guardar sesión:', error);
                              
                              // Si es un error de timeout, ofrecer recuperar el backup
                              const isTimeout = error?.message?.includes('Timeout') || error?.message?.includes('timeout');
                              let errorMessage = error?.message || 'Error al guardar la sesión. Por favor, intenta de nuevo.';
                              
                              if (isTimeout) {
                                errorMessage += ' Tus ejercicios están guardados temporalmente. Puedes intentar guardar de nuevo sin perderlos.';
                                
                                // Intentar recuperar backup si existe
                                try {
                                  const backup = sessionStorage.getItem(backupKey);
                                  if (backup) {
                                    const parsed = JSON.parse(backup);
                                    // Restaurar ejercicios si el backup es reciente (menos de 1 hora)
                                    if (parsed.exercises && Date.now() - parsed.timestamp < 3600000) {
                                      setSessionExercises(parsed.exercises);
                                      console.log('✅ Ejercicios recuperados del backup');
                                    }
                                  }
                                } catch (e) {
                                  console.warn('⚠️ No se pudo recuperar backup:', e);
                                }
                              }
                              
                              setSaveError(errorMessage);
                              setIsSaving(false);
                              // NO cerrar el modal si hay error para que el usuario vea el mensaje
                            }
                          }}
                          disabled={isSaving}
                          className="w-full bg-primary text-black font-black py-4 rounded-xl shadow-glow text-xs uppercase flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSaving ? (
                            <>
                              <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                              {t('saving')}
                            </>
                          ) : (
                            <>
                              <Save className="w-5 h-5" /> 
                              {t('save_session')}
                            </>
                          )}
                        </button>
                      </div>
                    )}
                </div>
            )}

            {activeTab === 'history' && (
                <div className="space-y-3 h-full overflow-y-auto custom-scrollbar">
                    {pastWorkouts.slice(0, 10).map((h, i) => (
                        <button 
                            key={i} 
                            onClick={() => {
                                const exercisesToAdd = h.structured_data.exercises.map(e => ({ ...e, sets: e.sets.map(s => ({ ...s })) }));
                                setPendingExercises({ exercises: exercisesToAdd, source: 'history', sourceName: format(new Date(h.date), 'dd MMM yyyy') });
                            }} 
                            className="w-full bg-black border border-white/10 hover:border-blue-400/30 p-4 rounded-xl text-left transition-all group"
                        >
                            <div className="flex justify-between items-center mb-2">
                                <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
                                    <Clock className="w-3 h-3" /> {format(new Date(h.date), 'dd MMM yyyy')}
                                </div>
                                <ArrowRight className="w-4 h-4 text-zinc-700 group-hover:text-blue-400" />
                            </div>
                            <div className="text-[10px] text-zinc-500 font-mono line-clamp-2 uppercase tracking-wide">{h.structured_data.exercises.map(e => e.name).join(', ')}</div>
                        </button>
                    ))}
                </div>
            )}
        </div>
      </div>
      
      {/* Modal de confirmación para ejercicios añadidos desde Rutina/Historia */}
      {pendingExercises && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-black/95 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-surface border border-primary/30 p-8 rounded-[2.5rem] max-w-md w-full text-center space-y-6 shadow-2xl scale-in-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto border border-primary/20">
              <CheckCircle className="w-8 h-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-white italic uppercase tracking-tight">
                {pendingExercises.source === 'routine' ? 'Añadir Rutina' : 'Añadir desde Historia'}
              </h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                {pendingExercises.source === 'routine' ? (
                  <>¿Añadir <span className="text-primary font-bold">{pendingExercises.sourceName}</span> con <span className="text-primary font-bold">{pendingExercises.exercises.length} ejercicios</span> a tu sesión?</>
                ) : (
                  <>¿Añadir <span className="text-primary font-bold">{pendingExercises.exercises.length} ejercicios</span> del entrenamiento del <span className="text-primary font-bold">{pendingExercises.sourceName}</span> a tu sesión?</>
                )}
              </p>
            </div>
            <div className="flex flex-col gap-3 pt-2">
              <button 
                onClick={() => {
                  setSessionExercises([...sessionExercises, ...pendingExercises.exercises]);
                  setPendingExercises(null);
                  setActiveTab('overview');
                }} 
                className="w-full py-4 bg-primary text-black font-black rounded-2xl text-sm uppercase shadow-lg shadow-primary/20 active:scale-95 transition-all"
              >
                Aceptar
              </button>
              <button 
                onClick={() => setPendingExercises(null)} 
                className="w-full py-4 bg-zinc-900 text-zinc-500 font-black rounded-2xl text-sm uppercase hover:text-zinc-300 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {editingItem && <EditExerciseModal isOpen={!!editingItem} onClose={() => setEditingItem(null)} exercise={editingItem.data} onSave={(upd) => { const n = [...sessionExercises]; n[editingItem.index] = upd; setSessionExercises(n); setEditingItem(null); }} />}
    </div>
  );
};
