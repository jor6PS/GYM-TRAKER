
import React, { useState, useEffect, useRef, Suspense, lazy, useCallback } from 'react';
import { CalendarView } from './components/CalendarView';
import { RestTimer } from './components/RestTimer';
import { LoginScreen } from './components/LoginScreen';
import { ResetPasswordScreen } from './components/ResetPasswordScreen'; 
import { AppHeader } from './components/AppHeader';
import { ActionDock } from './components/ActionDock';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { Workout, WorkoutData, WorkoutPlan, Exercise, User } from './types';
import { supabase, getPendingRequestsCount, isConfigured } from './services/supabase';
import { format, isSameDay, isFuture } from 'date-fns';
import es from 'date-fns/locale/es';
import { getExerciseIcon, getCanonicalId } from './utils';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { ExerciseProvider, useExercises, ExerciseDef } from './contexts/ExerciseContext';
import { useAuth } from './hooks/useAuth';
import { useWorkouts } from './hooks/useWorkouts';
import { useFriends } from './hooks/useFriends';
import { useModals } from './hooks/useModals';
import { useGroupedWorkouts } from './hooks/useGroupedWorkouts';
import { Pencil, EyeOff, Activity, Swords, Trash2, Loader2, AlertTriangle, Move } from 'lucide-react';

const UnifiedEntryModal = lazy(() => import('./components/UnifiedEntryModal').then(module => ({ default: module.UnifiedEntryModal })));
const PRModal = lazy(() => import('./components/PRModal').then(module => ({ default: module.PRModal })));
const CreatePlanModal = lazy(() => import('./components/CreatePlanModal').then(module => ({ default: module.CreatePlanModal })));
const EditExerciseModal = lazy(() => import('./components/EditExerciseModal').then(module => ({ default: module.EditExerciseModal })));
const ProfileModal = lazy(() => import('./components/ProfileModal').then(module => ({ default: module.ProfileModal })));
const MonthlySummaryModal = lazy(() => import('./components/MonthlySummaryModal').then(module => ({ default: module.MonthlySummaryModal })));
const SocialModal = lazy(() => import('./components/SocialModal').then(module => ({ default: module.SocialModal })));
const ArenaModal = lazy(() => import('./components/ArenaModal').then(module => ({ default: module.ArenaModal })));
import { AdminPanel } from './components/AdminPanel';

export default function AppWrapper() {
  return (
    <LanguageProvider><ExerciseProvider><App /></ExerciseProvider></LanguageProvider>
  );
}

function App() {
  const { t } = useLanguage();
  const { catalog, isLoading: catalogLoading } = useExercises();
  
  // Auth hook
  const { 
    currentUser, 
    realAdminUser, 
    sessionLoading, 
    isRecoveryMode, 
    setCurrentUser, 
    setRealAdminUser, 
    setIsRecoveryMode,
    logout 
  } = useAuth();
  
  // Workouts hook
  const {
    workouts,
    plans,
    handleWorkoutProcessed: baseHandleWorkoutProcessed,
    confirmDeleteWorkout: baseConfirmDeleteWorkout,
    confirmDeletePlan: baseConfirmDeletePlan,
    handleSavePlan,
    updatePlan,
    updateExercise,
    deleteExercise
  } = useWorkouts(currentUser?.id || null);
  
  // Friends hook
  const { activeFriends, friendsWorkouts, toggleFriend } = useFriends();
  
  // Modals hook
  const {
    showUnifiedEntry,
    showPRModal,
    showCreatePlan,
    showProfileModal,
    showMonthlySummary,
    showSocialModal,
    showArenaModal,
    openUnifiedEntry,
    closeUnifiedEntry,
    openPRModal,
    closePRModal,
    openCreatePlan,
    closeCreatePlan,
    openProfileModal,
    closeProfileModal,
    openMonthlySummary,
    closeMonthlySummary,
    openSocialModal,
    closeSocialModal,
    openArenaModal,
    closeArenaModal,
    editingPlan,
    setEditingPlan,
    editingExercise,
    setEditingExercise,
    selectedHistoryExercise,
    setSelectedHistoryExercise,
    deleteWorkoutId,
    setDeleteWorkoutId,
    deletePlanId,
    setDeletePlanId,
    deleteExerciseInfo,
    setDeleteExerciseInfo
  } = useModals();
  
  // Local state
  const [viewDate, setViewDate] = useState(new Date()); 
  const [selectedDate, setSelectedDate] = useState(new Date()); 
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  // Grouped workouts
  const groupedLogs = useGroupedWorkouts(
    workouts,
    friendsWorkouts,
    activeFriends,
    selectedDate,
    currentUser
  );

  // Procesar workouts existentes para actualizar records si el usuario no tiene records
  // Usar useRef para evitar procesar múltiples veces
  const processedUsersRef = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    const processExistingWorkouts = async () => {
      if (!currentUser?.id || !catalog || catalog.length === 0 || workouts.length === 0) return;
      
      // Evitar procesar el mismo usuario múltiples veces
      if (processedUsersRef.current.has(currentUser.id)) return;
      
      try {
        const { getUserRecords } = await import('./services/recordsService');
        const existingRecords = await getUserRecords(currentUser.id);
        
        // Si el usuario no tiene records, procesar todos sus workouts
        if (existingRecords.length === 0 && workouts.length > 0) {
          console.log(`Usuario ${currentUser.name} no tiene records. Procesando ${workouts.length} workouts...`);
          processedUsersRef.current.add(currentUser.id); // Marcar como procesado
          const { recalculateUserRecords } = await import('./services/recordsService');
          await recalculateUserRecords(currentUser.id, workouts, catalog);
          console.log(`Records actualizados para ${currentUser.name}`);
        } else if (existingRecords.length > 0) {
          // Si ya tiene records, marcar como procesado para no volver a verificar
          processedUsersRef.current.add(currentUser.id);
        }
      } catch (error) {
        console.error('Error procesando workouts existentes:', error);
      }
    };
    
    // Solo procesar una vez cuando se cargan los workouts y el catalog
    if (currentUser?.id && catalog && catalog.length > 0 && workouts.length > 0) {
      processExistingWorkouts();
    }
    
    // Limpiar el set cuando cambia el usuario
    return () => {
      if (currentUser?.id) {
        // No limpiar aquí, solo cuando cambie el usuario
      }
    };
  }, [currentUser?.id, catalog, workouts.length]); // Solo cuando cambian estos valores clave
  
  // Limpiar el set cuando cambia el usuario
  useEffect(() => {
    processedUsersRef.current.clear();
  }, [currentUser?.id]);

  // Effects
  useEffect(() => {
    if (currentUser) {
      checkPendingRequests();
    }
  }, [currentUser]);

  const checkPendingRequests = useCallback(async () => {
    if (!currentUser) return;
    setPendingRequestsCount(await getPendingRequestsCount());
  }, [currentUser]);

  // Handlers
  const handleWorkoutProcessed = useCallback(async (rawData: WorkoutData) => {
    if (!currentUser) {
      throw new Error('Usuario no autenticado');
    }
    
    try {
      await baseHandleWorkoutProcessed(
        rawData,
        selectedDate,
        currentUser.weight || 80,
        catalog
      );
    } catch (error: any) {
      console.error('Error al procesar workout:', error);
      // Re-lanzar el error para que el componente que llama pueda manejarlo
      throw error;
    }
  }, [currentUser, selectedDate, catalog, baseHandleWorkoutProcessed]);

  const handleToggleFriend = useCallback(async (friendId: string, friendName: string, color: string) => {
    await toggleFriend(friendId, friendName, color);
  }, [toggleFriend]);

  const confirmDeleteWorkout = useCallback(async () => {
    if (!deleteWorkoutId) return;
    const workoutIdToDelete = deleteWorkoutId;
    setDeleteWorkoutId(null); // Cerrar el modal inmediatamente
    try {
      await baseConfirmDeleteWorkout(workoutIdToDelete, catalog);
      console.log('✅ Workout eliminado exitosamente');
    } catch (error: any) {
      console.error('❌ Error eliminando workout:', error);
      // Mostrar error al usuario (podrías usar un toast o alert aquí)
      alert(`Error al eliminar el registro: ${error.message || 'Error desconocido'}`);
      // Forzar recarga de datos para sincronizar estado
      // El estado local podría estar desincronizado si falló
    }
  }, [deleteWorkoutId, baseConfirmDeleteWorkout, catalog]);

  const confirmDeletePlan = useCallback(async () => {
    if (!deletePlanId) return;
    const planIdToDelete = deletePlanId;
    setDeletePlanId(null); // Cerrar el modal inmediatamente
    try {
      await baseConfirmDeletePlan(planIdToDelete);
    } catch (error) {
      console.error('Error deleting plan:', error);
      // El modal ya está cerrado, pero podríamos mostrar un error si es necesario
    }
  }, [deletePlanId, baseConfirmDeletePlan]);

  const confirmDeleteExercise = useCallback(async () => {
    if (!deleteExerciseInfo) return;
    const { workoutId, exerciseIndex } = deleteExerciseInfo;
    setDeleteExerciseInfo(null); // Cerrar el modal inmediatamente
    try {
      await deleteExercise(workoutId, exerciseIndex, catalog);
    } catch (error) {
      console.error('Error deleting exercise:', error);
    }
  }, [deleteExerciseInfo, deleteExercise, catalog]);

  const canEdit = !isFuture(selectedDate);

  const [pendingProfileUser, setPendingProfileUser] = useState<User | null>(null);

  const handleViewAsUser = useCallback((user: User) => {
    console.log('=== INICIANDO CAMBIO DE USUARIO ===');
    console.log('Usuario seleccionado:', user.name, user.id);
    console.log('currentUser actual:', currentUser?.name, currentUser?.id);
    console.log('realAdminUser actual:', realAdminUser?.name, realAdminUser?.id);
    
    if (currentUser && currentUser.role === 'admin') {
      // Guardar el usuario admin actual si no está guardado
      if (!realAdminUser) {
        console.log('Guardando admin user:', currentUser);
        setRealAdminUser(currentUser);
      }
      
      // Cambiar al usuario seleccionado
      console.log('Cambiando currentUser a:', user.name, user.id);
      setCurrentUser(user);
      
      // Forzar scroll después de un momento para ver el cambio
      setTimeout(() => {
        console.log('Verificando estado después del cambio...');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 300);
    } else {
      console.warn('No se puede cambiar de usuario - currentUser no es admin:', currentUser);
    }
  }, [currentUser, realAdminUser, setCurrentUser, setRealAdminUser]);

  const handleViewProfile = useCallback((user: User) => {
    if (currentUser && currentUser.role === 'admin') {
      // Guardar el usuario admin actual si no está guardado
      const adminUser = realAdminUser || currentUser;
      if (!realAdminUser) {
        setRealAdminUser(adminUser);
      }
      // Cambiar al usuario seleccionado
      console.log('Admin cambiando a usuario para ver perfil:', user.name, user.id);
      setCurrentUser(user);
      // Abrir el perfil después de un delay para que se actualice el estado y se carguen los workouts
      setTimeout(() => {
        openProfileModal();
      }, 800);
    }
  }, [currentUser, realAdminUser, setCurrentUser, setRealAdminUser, openProfileModal]);

  if (!isConfigured) return <div className="min-h-screen bg-black flex items-center justify-center text-white">Config error</div>;
  if (sessionLoading || catalogLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (currentUser && isRecoveryMode) return <ResetPasswordScreen onSuccess={() => setIsRecoveryMode(false)} />;
  if (!currentUser) return <LoginScreen />;

  return (
    <div className="min-h-screen pb-40 relative font-sans text-text transition-colors duration-300 bg-background">
      {realAdminUser && (
        <div className="bg-primary text-black px-4 py-3 flex items-center justify-between sticky top-0 z-50 shadow-xl">
           <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-tight"><EyeOff className="w-4 h-4" /> {t('viewing_as')} {currentUser.name}</div>
           <button onClick={() => { setCurrentUser(realAdminUser); setRealAdminUser(null); }} className="bg-black text-white px-4 py-1.5 rounded-full text-xs font-bold">{t('exit')}</button>
        </div>
      )}

      <PWAInstallBanner />
      <AppHeader 
        currentUser={currentUser} 
        pendingRequestsCount={pendingRequestsCount} 
        activeFriendsCount={activeFriends.length} 
        onOpenSocial={openSocialModal} 
        onOpenPR={openPRModal} 
        onOpenMonthly={openMonthlySummary} 
        onOpenProfile={openProfileModal}
onOpenAdmin={undefined}
      />

      <main className="max-w-md mx-auto px-4 pt-24 space-y-6">
        {/* Panel de Administración - Siempre visible para admins cuando NO está viendo como otro usuario */}
        {currentUser && currentUser.role === 'admin' && !realAdminUser && (
          <AdminPanel 
            currentUser={currentUser}
            onViewAsUser={handleViewAsUser}
          />
        )}
        
        {/* Solo mostrar contenido normal si NO está en modo admin viendo como otro usuario */}
        {!realAdminUser && (
          <>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2">
                 <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/30 px-3 py-1.5 rounded-full shrink-0"><div className="w-5 h-5 rounded-full bg-primary text-black text-[10px] flex items-center justify-center font-bold">{currentUser.name.charAt(0).toUpperCase()}</div><span className="text-xs font-black text-primary">Me</span></div>
                 {activeFriends.map(f => <div key={f.userId} className="flex items-center gap-1.5 bg-surfaceHighlight border px-3 py-1.5 rounded-full shrink-0" style={{ borderColor: `${f.color}30` }}><div className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold" style={{ backgroundColor: f.color, color: '#000' }}>{f.name.charAt(0).toUpperCase()}</div><span className="text-xs font-black" style={{ color: f.color }}>{f.name}</span></div>)}
            </div>
            
            <CalendarView viewDate={viewDate} onViewDateChange={setViewDate} workouts={workouts} selectedFriendsWorkouts={activeFriends.map(f => ({ userId: f.userId, color: f.color, workouts: friendsWorkouts.find(fw => fw.userId === f.userId)?.workouts || [] }))} selectedDate={selectedDate} onSelectDate={setSelectedDate} onSummaryClick={() => {}} />
            
            {activeFriends.length > 0 && (
                <section>
                  <button onClick={openArenaModal} className="w-full bg-zinc-900 border border-white/5 p-4 rounded-[2rem] flex items-center justify-between shadow-lg">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-full border border-primary/20">
                        <Swords className="w-5 h-5 text-primary" />
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-black text-white italic">{t('enter_arena')}</div>
                        <div className="text-[10px] text-zinc-500 font-mono uppercase">{activeFriends.length} {t('opponents')}</div>
                      </div>
                    </div>
                    <div className="text-primary text-[10px] font-black">{t('judge_me')} &rarr;</div>
                  </button>
                </section>
            )}
          </>
        )}

        {/* Mostrar workouts - siempre visible, pero sin opciones de edición cuando está en modo admin */}
        <section className="space-y-4">
          <div className="flex items-center justify-between mb-1 px-2">
            <h2 className="text-[10px] font-black text-zinc-500 tracking-[0.2em] flex items-center gap-2 uppercase italic">
              <Activity className="w-3.5 h-3.5 text-primary" /> 
              {realAdminUser 
                ? `${currentUser?.name?.toUpperCase() || 'USUARIO'} - ${isSameDay(selectedDate, new Date()) ? t('todays_log') : format(selectedDate, 'MMM do', { locale: es }).toUpperCase()}`
                : isSameDay(selectedDate, new Date()) ? t('todays_log') : format(selectedDate, 'MMM do', { locale: es }).toUpperCase()
              }
            </h2>
          </div>
          
          {/* Mostrar todos los workouts cuando está en modo admin, sin filtrar por fecha */}
          {realAdminUser ? (
            workouts.length > 0 ? (
              <div className="space-y-6">
                <div className="text-xs text-zinc-500 mb-2">Mostrando {workouts.length} workouts de {currentUser?.name}</div>
                {workouts.map((w: Workout) => (
                <div key={w.id} className="p-4 rounded-2xl border bg-zinc-900/40 border-white/5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-xs font-black text-white">{format(new Date(w.date), 'dd MMM yyyy', { locale: es })}</div>
                      <div className="text-[9px] font-mono font-bold text-zinc-600">{format(new Date(w.created_at), 'HH:mm')} • {w.user_weight || 80} KG BW</div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {w.structured_data.exercises.map((ex, idx) => (
                      <div key={idx} className="p-3 rounded-xl border border-white/5 bg-black/40 hover:border-primary/30 transition-colors cursor-pointer" onClick={() => { openPRModal(ex.name); }}>
                        <div className="flex items-center gap-3 mb-2">
                          {(() => {
                            const exerciseId = getCanonicalId(ex.name, catalog);
                            const exerciseDef = catalog.find((e: ExerciseDef) => e.id === exerciseId);
                            const isCardio = exerciseDef?.type === 'cardio';
                            return (
                              <div className={`w-8 h-8 rounded-lg bg-black border flex items-center justify-center shrink-0 ${isCardio ? 'border-red-500/50' : 'border-white/10 text-zinc-500'}`}>
                                {getExerciseIcon(ex.name, catalog, "w-4 h-4")}
                              </div>
                            );
                          })()}
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-black text-sm text-white uppercase italic">{ex.name}</h4>
                              {ex.unilateral && (
                                <div className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-500/20 border border-blue-500/30 rounded text-[8px] text-blue-400 font-black uppercase">
                                  <Move className="w-2 h-2" />
                                  <span>½</span>
                                </div>
                              )}
                            </div>
                            <div className="text-[10px] text-zinc-600 font-mono uppercase">{ex.category || 'General'}</div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pl-11">
                          {ex.sets.map((s, sI) => {
                            const exerciseId = getCanonicalId(ex.name, catalog);
                            const exerciseDef = catalog.find((e: ExerciseDef) => e.id === exerciseId);
                            const isCardio = exerciseDef?.type === 'cardio';
                            return (
                              <div key={sI} className={`border rounded-lg px-2 py-1.5 flex items-center gap-1.5 ${isCardio ? 'bg-red-500/20 border-red-500/30' : 'bg-black/60 border-white/10'}`}>
                                {isCardio ? (
                                  <span className="font-mono text-xs font-black text-red-400">{s.time || '--:--'}</span>
                                ) : (
                                  <>
                                    <span className="font-mono text-xs font-black text-primary">{ex.unilateral ? `${(s.weight || 0) * 2}` : (s.weight || 0)}</span>
                                    {ex.unilateral && <span className="text-[8px] text-blue-400 font-black">×2</span>}
                                    <span className="text-[10px] text-zinc-700 font-black">×</span>
                                    <span className="text-white font-mono text-xs font-black">{s.reps || 0}</span>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              </div>
            ) : (
              <div className="py-12 text-center border-2 border-dashed border-border/30 rounded-[2.5rem] bg-surfaceHighlight/10 text-subtext text-[10px] font-black uppercase tracking-widest">
                No hay actividad registrada para {currentUser?.name || 'este usuario'}
              </div>
            )
          ) : groupedLogs.length === 0 && workouts.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-border/30 rounded-[2.5rem] bg-surfaceHighlight/10 text-subtext text-[10px] font-black uppercase tracking-widest">
              {realAdminUser ? `No hay actividad registrada para ${currentUser?.name || 'este usuario'}` : t('no_activity')}
            </div>
          ) : !realAdminUser && groupedLogs.length === 0 && workouts.length > 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-border/30 rounded-[2.5rem] bg-surfaceHighlight/10 text-subtext text-[10px] font-black uppercase tracking-widest">
              No hay registros que mostrar para {format(selectedDate, 'dd/MM/yyyy')}
            </div>
          ) : !realAdminUser && groupedLogs.length > 0 ? (
            <div className="space-y-6">
              {groupedLogs.map((group) => (
                <div key={group.id}>
                  <div className="flex items-center gap-2 mb-3 px-2"><div className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-black text-[10px] shadow-lg" style={{ backgroundColor: group.color }}>{group.name.charAt(0).toUpperCase()}</div><span className="text-xs font-black text-text italic uppercase" style={{ color: group.isMe ? undefined : group.color }}>{group.isMe ? t('todays_log') : group.name}</span></div>
                  <div className="relative border-l border-white/5 ml-3.5 space-y-3 pb-1">
                    {group.workouts.map((w: Workout) => (
                      <div key={w.id} className="relative pl-6">
                        <div className="absolute -left-[4.5px] top-1.5 w-2 h-2 rounded-full border border-background shadow-glow" style={{ backgroundColor: group.color }} />
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[9px] font-mono font-bold text-zinc-600">{format(new Date(w.created_at), 'HH:mm')} • {w.user_weight || 80} KG BW</span>
                          {group.isMe && canEdit && !realAdminUser && <button onClick={() => setDeleteWorkoutId(w.id)} className="p-1 text-zinc-700 hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>}
                        </div>
                        <div className="space-y-3">
                          {w.structured_data.exercises.map((ex, idx) => (
                            <div key={idx} className={`p-4 rounded-2xl border transition-all ${group.isMe ? 'bg-zinc-900/40 border-white/5' : 'bg-surfaceHighlight/5 border-dashed border-border/30'}`}>
                                <div className="flex items-start justify-between w-full gap-3">
                                    <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => { openPRModal(ex.name); }}>
                                        {(() => {
                                            const exerciseId = getCanonicalId(ex.name, catalog);
                                            const exerciseDef = catalog.find((e: ExerciseDef) => e.id === exerciseId);
                                            const isCardio = exerciseDef?.type === 'cardio';
                                            return (
                                                <div className={`w-10 h-10 rounded-xl bg-black border flex items-center justify-center shrink-0 ${isCardio ? 'border-red-500/50' : 'border-white/10 text-zinc-500'}`}>
                                                    {getExerciseIcon(ex.name, catalog, "w-5 h-5")}
                                                </div>
                                            );
                                        })()}
                                        <div className="flex-1 min-w-0 pr-2">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <h4 className="font-black text-sm text-white uppercase italic leading-tight break-words">{ex.name}</h4>
                                            {ex.unilateral && (
                                              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-500/20 border border-blue-500/30 rounded text-[8px] text-blue-400 font-black uppercase shrink-0" title={t('unilateral_hint') || 'Ejercicio unilateral - peso registrado es la mitad del real'}>
                                                <Move className="w-2.5 h-2.5" />
                                                <span>½</span>
                                              </div>
                                            )}
                                          </div>
                                          <div className="text-[10px] text-zinc-600 font-mono uppercase mt-0.5">{ex.category || 'General'}</div>
                                        </div>
                                    </div>
                                    {group.isMe && canEdit && !realAdminUser && (
                                      <div className="flex items-center gap-2 shrink-0">
                                        <button onClick={(e) => { e.stopPropagation(); setEditingExercise({ workoutId: w.id, exerciseIndex: idx, data: ex }); }} className="p-2 bg-white/5 rounded-xl text-zinc-500 hover:text-primary transition-colors"><Pencil className="w-4 h-4" /></button>
                                        <button onClick={(e) => { e.stopPropagation(); setDeleteExerciseInfo({ workoutId: w.id, exerciseIndex: idx, exerciseName: ex.name }); }} className="p-2 bg-white/5 rounded-xl text-zinc-500 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                                      </div>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 pl-13 mt-2">
                                    {ex.sets.map((s, sI) => {
                                        const exerciseId = getCanonicalId(ex.name, catalog);
                                        const exerciseDef = catalog.find((e: ExerciseDef) => e.id === exerciseId);
                                        const isCardio = exerciseDef?.type === 'cardio';
                                        return (
                                            <div key={sI} className={`border rounded-lg px-2 py-1.5 flex items-center gap-1.5 ${isCardio ? 'bg-red-500/20 border-red-500/30' : 'bg-black/60 border-white/10'}`}>
                                                {isCardio ? (
                                                    <span className="font-mono text-xs font-black text-red-400">{s.time || '--:--'}</span>
                                                ) : (
                                                    <>
                                                        <span className="font-mono text-xs font-black text-primary">{ex.unilateral ? `${(s.weight || 0) * 2}` : (s.weight || 0)}</span>
                                                        {ex.unilateral && <span className="text-[8px] text-blue-400 font-black">×2</span>}
                                                        <span className="text-[10px] text-zinc-700 font-black">×</span>
                                                        <span className="text-white font-mono text-xs font-black">{s.reps || 0}</span>
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </main>

      {canEdit && !realAdminUser && (
        <>
          <div className="fixed bottom-28 left-4 z-50">
            <RestTimer />
          </div>
          <ActionDock 
            label={t('input_log')} 
            onOpenUnified={openUnifiedEntry} 
            onWorkoutProcessed={handleWorkoutProcessed} 
          />
        </>
      )}
      
      {/* MODAL CONFIRMACION ENTRENAMIENTO */}
      {deleteWorkoutId && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/95 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-surface border border-red-500/30 p-8 rounded-[2.5rem] max-w-xs w-full text-center space-y-6 shadow-2xl scale-in-center">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto border border-red-500/20"><Trash2 className="w-8 h-8 text-red-500" /></div>
            <div className="space-y-2"><h3 className="text-xl font-black text-white italic uppercase tracking-tight">{t('delete_workout_title')}</h3><p className="text-zinc-500 text-xs leading-relaxed">{t('delete_workout_desc')}</p></div>
            <div className="flex flex-col gap-3 pt-2">
                <button onClick={confirmDeleteWorkout} className="w-full py-4 bg-red-600 text-white font-black rounded-2xl text-sm uppercase shadow-lg shadow-red-600/20 active:scale-95 transition-all">{t('confirm_action')}</button>
                <button onClick={() => setDeleteWorkoutId(null)} className="w-full py-4 bg-zinc-900 text-zinc-500 font-black rounded-2xl text-sm uppercase">{t('cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMACION EJERCICIO */}
      {deleteExerciseInfo && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/95 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-surface border border-red-500/30 p-8 rounded-[2.5rem] max-w-xs w-full text-center space-y-6 shadow-2xl scale-in-center">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto border border-red-500/20"><Trash2 className="w-8 h-8 text-red-500" /></div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-white italic uppercase tracking-tight">¿Eliminar Ejercicio?</h3>
              <p className="text-zinc-500 text-xs leading-relaxed">Se eliminará "{deleteExerciseInfo.exerciseName}" de este entrenamiento.</p>
            </div>
            <div className="flex flex-col gap-3 pt-2">
                <button onClick={confirmDeleteExercise} className="w-full py-4 bg-red-600 text-white font-black rounded-2xl text-sm uppercase shadow-lg shadow-red-600/20 active:scale-95 transition-all">{t('confirm_action')}</button>
                <button onClick={() => setDeleteExerciseInfo(null)} className="w-full py-4 bg-zinc-900 text-zinc-500 font-black rounded-2xl text-sm uppercase">{t('cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMACION RUTINA */}
      {deletePlanId && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/95 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-surface border border-red-500/30 p-8 rounded-[2.5rem] max-w-xs w-full text-center space-y-6 shadow-2xl">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto border border-red-500/20"><AlertTriangle className="w-8 h-8 text-red-500" /></div>
            <div className="space-y-2"><h3 className="text-xl font-black text-white italic uppercase tracking-tight">{t('delete_plan_title')}</h3><p className="text-zinc-500 text-xs leading-relaxed">{t('delete_plan_desc')}</p></div>
            <div className="flex flex-col gap-3">
                <button onClick={confirmDeletePlan} className="w-full py-4 bg-red-600 text-white font-black rounded-2xl text-sm uppercase active:scale-95 transition-all">{t('confirm_action')}</button>
                <button onClick={() => setDeletePlanId(null)} className="w-full py-4 bg-zinc-900 text-zinc-500 font-black rounded-2xl text-sm uppercase">{t('cancel')}</button>
            </div>
          </div>
        </div>
      )}

      <Suspense fallback={null}>
        {showUnifiedEntry && (
          <UnifiedEntryModal 
            isOpen={showUnifiedEntry} 
            onClose={closeUnifiedEntry} 
            onWorkoutProcessed={handleWorkoutProcessed} 
            pastWorkouts={workouts} 
            plans={plans} 
            onOpenCreatePlan={() => { setEditingPlan(null); closeUnifiedEntry(); openCreatePlan(); }} 
            onEditPlan={(p: WorkoutPlan) => { setEditingPlan(p); closeUnifiedEntry(); openCreatePlan(); }} 
            onDeletePlan={(id: string) => setDeletePlanId(id)} 
          />
        )}
        {showPRModal && (
          <PRModal 
            isOpen={showPRModal} 
            onClose={closePRModal} 
            workouts={workouts} 
            initialExercise={selectedHistoryExercise}
            userId={currentUser?.id || null}
          />
        )}
        {showMonthlySummary && currentUser && (
          <MonthlySummaryModal 
            isOpen={showMonthlySummary} 
            onClose={closeMonthlySummary} 
            workouts={workouts} 
            currentUser={currentUser} 
            onSavePlan={(plan: WorkoutPlan) => handleSavePlan(plan, currentUser.id)} 
          />
        )}
        {showCreatePlan && (
          <CreatePlanModal 
            isOpen={showCreatePlan} 
            onClose={closeCreatePlan} 
            initialPlan={editingPlan} 
            onSave={async (plan: WorkoutPlan) => { 
              if (!currentUser) return; 
              await updatePlan(plan, currentUser.id);
              closeCreatePlan();
            }} 
          />
        )}
        {currentUser && showProfileModal && (
          <ProfileModal 
            isOpen={showProfileModal} 
            onClose={closeProfileModal} 
            user={currentUser} 
            workouts={workouts} 
            onUpdateUser={(u: Partial<User>) => {
              if (currentUser) {
                setCurrentUser({ ...currentUser, ...u });
              }
            }} 
            onLogout={logout} 
          />
        )}
        {editingExercise && (
          <EditExerciseModal 
            isOpen={!!editingExercise} 
            onClose={() => setEditingExercise(null)} 
            exercise={editingExercise.data} 
            onSave={async (ex: Exercise) => { 
              await updateExercise(editingExercise.workoutId, editingExercise.exerciseIndex, ex, catalog); 
              setEditingExercise(null);
            }}
          />
        )}
        {currentUser && showSocialModal && (
          <SocialModal 
            isOpen={showSocialModal} 
            onClose={() => { closeSocialModal(); checkPendingRequests(); }} 
            currentUser={currentUser} 
            activeFriends={activeFriends.map(f => f.userId)} 
            onToggleFriend={handleToggleFriend} 
          />
        )}
        {currentUser && showArenaModal && (
          <ArenaModal 
            isOpen={showArenaModal} 
            onClose={closeArenaModal} 
            currentUser={currentUser} 
            friendsData={[
              { userId: currentUser.id, name: currentUser.name, workouts: workouts, color: '#D4FF00' }, 
              ...activeFriends.map(f => ({ 
                userId: f.userId, 
                name: f.name, 
                workouts: friendsWorkouts.find(fw => fw.userId === f.userId)?.workouts || [], 
                color: f.color 
              }))
            ]} 
          />
        )}
      </Suspense>
    </div>
  );
}

