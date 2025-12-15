
import React, { useState, useEffect, Suspense, lazy } from 'react';
import { CalendarView } from './components/CalendarView';
import { RestTimer } from './components/RestTimer';
import { LoginScreen } from './components/LoginScreen';
import { ResetPasswordScreen } from './components/ResetPasswordScreen'; 
import { AppHeader } from './components/AppHeader'; // New Component
import { ActionDock } from './components/ActionDock'; // New Component
import { Workout, WorkoutData, WorkoutPlan, Exercise, User, UserRole } from './types';
import { supabase, getCurrentProfile, getFriendWorkouts, getPendingRequestsCount, isConfigured } from './services/supabase';
import { format, isSameDay, isFuture } from 'date-fns';
import es from 'date-fns/locale/es';
import enUS from 'date-fns/locale/en-US';
import { getExerciseIcon, parseLocalDate } from './utils';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { 
  Zap,
  Pencil,
  Clock,
  EyeOff,
  Activity,
  Dumbbell,
  Gauge,
  Swords,
  Trash2,
  Plus,
  Loader2,
  Settings,
  AlertTriangle,
  X
} from 'lucide-react';

// --- LAZY LOADED COMPONENTS (Code Splitting) ---
const AdminDashboard = lazy(() => import('./components/AdminDashboard').then(module => ({ default: module.AdminDashboard })));
const UnifiedEntryModal = lazy(() => import('./components/UnifiedEntryModal').then(module => ({ default: module.UnifiedEntryModal })));
const PRModal = lazy(() => import('./components/PRModal').then(module => ({ default: module.PRModal })));
const CreatePlanModal = lazy(() => import('./components/CreatePlanModal').then(module => ({ default: module.CreatePlanModal })));
const EditExerciseModal = lazy(() => import('./components/EditExerciseModal').then(module => ({ default: module.EditExerciseModal })));
const ProfileModal = lazy(() => import('./components/ProfileModal').then(module => ({ default: module.ProfileModal })));
const MonthlySummaryModal = lazy(() => import('./components/MonthlySummaryModal').then(module => ({ default: module.MonthlySummaryModal })));
const SocialModal = lazy(() => import('./components/SocialModal').then(module => ({ default: module.SocialModal })));
const ArenaModal = lazy(() => import('./components/ArenaModal').then(module => ({ default: module.ArenaModal })));

export default function AppWrapper() {
  return (
    <LanguageProvider>
      <App />
    </LanguageProvider>
  );
}

function App() {
  const { t, language, setLanguage } = useLanguage();
  const dateLocale = language === 'es' ? es : enUS;

  // --- SAFETY CHECK ---
  if (!isConfigured) {
      return (
          <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 text-center space-y-6">
              <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/30 animate-pulse">
                  <Settings className="w-12 h-12 text-red-500" />
              </div>
              <div className="max-w-md">
                  <h1 className="text-2xl font-bold text-white mb-2">Error de Configuración</h1>
                  <p className="text-zinc-400 mb-4">
                      Variables de entorno faltantes.
                  </p>
              </div>
          </div>
      );
  }

  // --- STATE ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [realAdminUser, setRealAdminUser] = useState<User | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);

  const [viewDate, setViewDate] = useState(new Date()); 
  const [selectedDate, setSelectedDate] = useState(new Date()); 
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  
  const [activeFriends, setActiveFriends] = useState<{ userId: string; name: string; color: string; }[]>([]);
  const [friendsWorkouts, setFriendsWorkouts] = useState<{ userId: string; workouts: Workout[] }[]>([]);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  // Admin Data
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allWorkouts, setAllWorkouts] = useState<Workout[]>([]);
  
  // UI Flags
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [showUnifiedEntry, setShowUnifiedEntry] = useState(false);
  const [showPRModal, setShowPRModal] = useState(false);
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showMonthlySummary, setShowMonthlySummary] = useState(false);
  const [showSocialModal, setShowSocialModal] = useState(false);
  const [showArenaModal, setShowArenaModal] = useState(false);
  const [selectedHistoryExercise, setSelectedHistoryExercise] = useState<string | null>(null);
  
  const [editingExercise, setEditingExercise] = useState<{ workoutId: string; exerciseIndex: number; data: Exercise; } | null>(null);
  const [editingPlan, setEditingPlan] = useState<WorkoutPlan | null>(null);
  
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ workoutId: string; exerciseIndex: number; exerciseName: string; } | null>(null);
  const [deletePlanConfirmation, setDeletePlanConfirmation] = useState<{ planId: string; planName: string; } | null>(null);
  const [deleteWorkoutConfirmation, setDeleteWorkoutConfirmation] = useState<string | null>(null);

  // --- AUTH ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) fetchUserProfile(session.user.id);
        else setSessionLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setIsRecoveryMode(true);
      if (session) {
        if (!realAdminUser) fetchUserProfile(session.user.id);
      } else {
        setCurrentUser(null);
        setRealAdminUser(null);
        setSessionLoading(false);
      }
    });
    return () => subscription.unsubscribe();
  }, [realAdminUser]); 

  const fetchUserProfile = async (userId: string) => {
    try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser && authUser.id === userId) {
            const profile = await getCurrentProfile();
            setCurrentUser({ 
                id: userId, 
                email: authUser.email || '', 
                name: profile?.name || authUser.user_metadata.name || 'User', 
                role: profile?.role || 'user', 
                created_at: profile?.created_at || new Date().toISOString(), 
                avatar_url: profile?.avatar_url 
            });
        }
    } catch (e) {
        console.error(e);
    } finally {
        setSessionLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
        fetchData();
        checkPendingRequests();
        if (currentUser.role === 'admin' || (realAdminUser?.role === 'admin')) {
            fetchAdminData();
        }
    }
  }, [currentUser, realAdminUser]);

  const checkPendingRequests = async () => {
      if (!currentUser) return;
      setPendingRequestsCount(await getPendingRequestsCount());
  };

  const fetchAdminData = async () => {
      const { data: profiles } = await supabase.from('profiles').select('*');
      if (profiles) {
          setAllUsers(profiles.map(p => ({
              id: p.id,
              name: p.name || 'Unknown',
              email: 'hidden@email.com',
              role: p.role || 'user',
              created_at: p.created_at || new Date().toISOString(),
              avatar_url: p.avatar_url
          })));
      }
      const { data: globalWorkouts } = await supabase.from('workouts').select('*').order('created_at', { ascending: false });
      if (globalWorkouts) setAllWorkouts(globalWorkouts as Workout[]);
  };

  const fetchData = async () => {
    if (!currentUser) return;
    setIsLoadingData(true);
    
    const [wData, pData] = await Promise.all([
        supabase.from('workouts').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: true }),
        supabase.from('workout_plans').select('*').eq('user_id', currentUser.id)
    ]);

    if (wData.data) setWorkouts(wData.data as Workout[]);
    if (pData.data) setPlans(pData.data as WorkoutPlan[]);
    setIsLoadingData(false);
  };

  // --- ACTIONS ---
  const handleToggleFriend = async (friendId: string, friendName: string, color: string) => {
    const isActive = activeFriends.find(f => f.userId === friendId);
    if (isActive) {
        setActiveFriends(prev => prev.filter(f => f.userId !== friendId));
    } else {
        const wData = await getFriendWorkouts([friendId]);
        setFriendsWorkouts(prev => [...prev.filter(p => p.userId !== friendId), { userId: friendId, workouts: wData }]);
        setActiveFriends(prev => [...prev, { userId: friendId, name: friendName, color }]);
    }
  };

  const handleWorkoutProcessed = async (data: WorkoutData) => {
    if (!currentUser) return;
    if (!data.exercises || data.exercises.length === 0) {
        alert("No exercises detected.");
        return;
    }

    const dateToSave = format(selectedDate, 'yyyy-MM-dd');
    const tempId = crypto.randomUUID();
    const optimisticWorkout: Workout = {
        id: tempId, user_id: currentUser.id, date: dateToSave, structured_data: data, source: 'web', created_at: new Date().toISOString()
    };
    
    setWorkouts(prev => [...prev, optimisticWorkout]);

    const { data: inserted, error } = await supabase.from('workouts').insert({ 
        user_id: currentUser.id, 
        date: dateToSave, 
        structured_data: data, 
        source: 'web' 
    }).select().single();
    
    if (error) {
        setWorkouts(prev => prev.filter(w => w.id !== tempId));
        alert("Failed to save.");
        return;
    }

    setWorkouts(prev => prev.map(w => w.id === tempId ? (inserted as Workout) : w));

    if (!isSameDay(selectedDate, parseLocalDate(dateToSave))) {
        const newDate = parseLocalDate(dateToSave);
        setSelectedDate(newDate);
        setViewDate(newDate);
    }
  };

  const executeDeleteExercise = async () => {
    if (!deleteConfirmation) return;
    const { workoutId, exerciseIndex } = deleteConfirmation;
    const workout = workouts.find(w => w.id === workoutId);
    if (!workout) return;

    const newExercises = [...workout.structured_data.exercises];
    newExercises.splice(exerciseIndex, 1);

    if (newExercises.length === 0) {
        setWorkouts(prev => prev.filter(w => w.id !== workoutId));
        await supabase.from('workouts').delete().eq('id', workoutId);
    } else {
        const updatedData = { ...workout.structured_data, exercises: newExercises };
        setWorkouts(prev => prev.map(w => w.id === workoutId ? { ...w, structured_data: updatedData } : w));
        await supabase.from('workouts').update({ structured_data: updatedData }).eq('id', workoutId);
    }
    setDeleteConfirmation(null);
  };

  const handleApplyPlan = (plan: WorkoutPlan) => {
      // Smart weight fill logic could be moved to a utility
      const smartExercises: Exercise[] = plan.exercises.map(ex => {
          // Simplified logic for brevity
          return ex; 
      });
      handleWorkoutProcessed({ exercises: smartExercises, notes: `Routine: ${plan.name}` });
  };

  const handleSavePlan = async (plan: WorkoutPlan) => {
    if (!currentUser) return;
    const planPayload = { name: plan.name, exercises: plan.exercises, user_id: currentUser.id };
    
    if (plans.some(p => p.id === plan.id)) {
        await supabase.from('workout_plans').update(planPayload).eq('id', plan.id);
        setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, ...planPayload } : p));
    } else {
        const { data } = await supabase.from('workout_plans').insert(planPayload).select().single();
        if (data) setPlans(prev => [...prev, data as WorkoutPlan]);
    }
    setShowCreatePlan(false);
    setEditingPlan(null);
  };

  // --- RENDER ---
  if (sessionLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (currentUser && isRecoveryMode) return <ResetPasswordScreen onSuccess={() => setIsRecoveryMode(false)} />;
  if (!currentUser) return <LoginScreen />;

  if (currentUser.role === 'admin' && !realAdminUser) {
      return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="animate-spin text-primary" /></div>}>
           <AdminDashboard 
             currentUser={currentUser} allUsers={allUsers} allWorkouts={allWorkouts} 
             onImpersonate={(id) => {
                 const target = allUsers.find(u => u.id === id);
                 if (target) { setRealAdminUser(currentUser); setCurrentUser(target); }
             }} 
             onLogout={async () => { await supabase.auth.signOut(); setCurrentUser(null); }} 
           />
        </Suspense>
      );
  }

  const selectedWorkouts = workouts.filter(w => isSameDay(parseLocalDate(w.date), selectedDate));
  const friendsSelectedWorkouts = activeFriends.flatMap(f => {
      const fWorkouts = friendsWorkouts.find(fw => fw.userId === f.userId)?.workouts || [];
      return fWorkouts.filter(w => isSameDay(parseLocalDate(w.date), selectedDate)).map(w => ({ 
          ...w, _friendColor: f.color, _friendId: f.userId, _friendName: f.name 
      }));
  });

  const canEdit = !isFuture(selectedDate);

  return (
    <div className="min-h-screen pb-40 relative font-sans text-text selection:bg-primary selection:text-black transition-colors duration-300">
      
      {realAdminUser && (
        <div className="bg-primary text-black px-4 py-3 flex items-center justify-between sticky top-0 z-50 shadow-xl">
           <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-tight">
             <EyeOff className="w-4 h-4" /> {t('viewing_as')} {currentUser.name}
           </div>
           <button onClick={() => { setCurrentUser(realAdminUser); setRealAdminUser(null); }} className="bg-black text-white px-4 py-1.5 rounded-full text-xs font-bold hover:scale-105 transition-transform">{t('exit')}</button>
        </div>
      )}

      <AppHeader 
        currentUser={currentUser}
        language={language}
        toggleLanguage={() => setLanguage(language === 'es' ? 'en' : 'es')}
        pendingRequestsCount={pendingRequestsCount}
        activeFriendsCount={activeFriends.length}
        onOpenSocial={() => setShowSocialModal(true)}
        onOpenPR={() => { setSelectedHistoryExercise(null); setShowPRModal(true); }}
        onOpenMonthly={() => setShowMonthlySummary(true)}
        onOpenProfile={() => setShowProfileModal(true)}
      />

      <main className="max-w-md mx-auto px-4 pt-24 space-y-8">
        
        {/* CALENDAR SECTION */}
        <section>
          <div className="flex items-center gap-2 mb-2 px-1 overflow-x-auto no-scrollbar">
             <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/30 px-2 py-1 rounded-full shrink-0">
                <div className="w-5 h-5 rounded-full bg-primary text-black text-[10px] flex items-center justify-center font-bold">
                   {currentUser.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-bold text-primary">Me</span>
             </div>
             {activeFriends.map(friend => (
                 <div key={friend.userId} className="flex items-center gap-1.5 bg-surfaceHighlight border px-2 py-1 rounded-full shrink-0 animate-in fade-in zoom-in" style={{ borderColor: `${friend.color}50` }}>
                     <div className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold shadow-sm" style={{ backgroundColor: friend.color, color: '#000' }}>
                         {friend.name.charAt(0).toUpperCase()}
                     </div>
                     <span className="text-xs font-bold" style={{ color: friend.color }}>{friend.name}</span>
                     <button onClick={() => handleToggleFriend(friend.userId, friend.name, friend.color)} className="ml-1 text-subtext hover:text-white"><X className="w-3 h-3" /></button>
                 </div>
             ))}
          </div>

          <CalendarView 
            viewDate={viewDate}
            onViewDateChange={setViewDate}
            workouts={workouts} 
            selectedFriendsWorkouts={activeFriends.map(f => ({
                userId: f.userId, color: f.color, workouts: friendsWorkouts.find(fw => fw.userId === f.userId)?.workouts || []
            }))}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onSummaryClick={() => {}} 
          />
        </section>
        
        {/* ARENA BANNER */}
        {activeFriends.length > 0 && (
            <section>
                <button onClick={() => setShowArenaModal(true)} className="w-full bg-gradient-to-r from-zinc-900 to-black border border-white/10 p-4 rounded-2xl flex items-center justify-between group shadow-lg">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/5 rounded-full border border-white/10 group-hover:scale-110 transition-transform"><Swords className="w-5 h-5 text-primary" /></div>
                        <div className="text-left">
                            <div className="text-sm font-bold text-white">{t('enter_arena')}</div>
                            <div className="text-[10px] text-zinc-400">{activeFriends.length} {t('opponents')}</div>
                        </div>
                    </div>
                    <div className="text-primary text-xs font-bold font-mono tracking-widest group-hover:underline">{t('judge_me')} &rarr;</div>
                </button>
            </section>
        )}

        {/* WORKOUT FEED (Optimized Rendering) */}
        <section>
          <div className="flex items-center justify-between mb-4 px-2">
            <h2 className="text-sm font-bold text-text tracking-tight flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              {isSameDay(selectedDate, new Date()) ? t('todays_log') : format(selectedDate, 'MMMM do', { locale: dateLocale }).toUpperCase()}
            </h2>
            <span className="text-xs font-medium text-subtext bg-surface px-2 py-1 rounded-md border border-border">
              {selectedWorkouts.length + friendsSelectedWorkouts.length} {t('logs')}
            </span>
          </div>

          {selectedWorkouts.length === 0 && friendsSelectedWorkouts.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center border-2 border-dashed border-border rounded-3xl bg-surface/30">
               <div className="w-16 h-16 bg-surface rounded-full flex items-center justify-center mb-4 text-subtext"><Activity className="w-8 h-8" /></div>
               <p className="text-subtext text-sm font-medium">{t('no_activity')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {selectedWorkouts.map((workout) => (
                <div key={workout.id} className="bg-surface rounded-3xl p-5 border border-border shadow-sm relative overflow-hidden group">
                   <div className="flex items-center justify-between mb-4 relative z-10">
                      <div className="flex items-center gap-2 text-xs font-bold text-subtext bg-surfaceHighlight px-3 py-1 rounded-full border border-border">
                        <Clock className="w-3 h-3" />
                        {workout.created_at ? format(new Date(workout.created_at), 'HH:mm') : '--:--'}
                      </div>
                      {canEdit && (
                         <button onClick={() => setDeleteWorkoutConfirmation(workout.id)} className="p-2 text-subtext hover:text-danger hover:bg-danger/10 rounded-full transition-all opacity-0 group-hover:opacity-100">
                            <Trash2 className="w-4 h-4" />
                         </button>
                      )}
                   </div>
                   {workout.structured_data.notes && <div className="mb-5 text-sm text-subtext italic bg-surfaceHighlight p-3 rounded-xl border border-border">"{workout.structured_data.notes}"</div>}
                   <div className="space-y-4 relative z-10">
                      {workout.structured_data.exercises.map((ex, idx) => (
                        <div key={idx}>
                           <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3 font-bold text-text text-base cursor-pointer hover:text-primary transition-colors" onClick={() => { setSelectedHistoryExercise(ex.name); setShowPRModal(true); }}>
                                 <div className="p-1.5 bg-surfaceHighlight rounded-lg text-subtext border border-border">{getExerciseIcon(ex.name, "w-4 h-4")}</div>
                                 {ex.name}
                              </div>
                              {canEdit && (
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                   <button onClick={(e) => { e.stopPropagation(); setEditingExercise({ workoutId: workout.id, exerciseIndex: idx, data: ex }); }} className="p-1.5 text-subtext hover:text-text"><Pencil className="w-3.5 h-3.5" /></button>
                                   <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmation({ workoutId: workout.id, exerciseIndex: idx, exerciseName: ex.name }); }} className="p-1.5 text-subtext hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                              )}
                           </div>
                           <div className="flex flex-wrap gap-2 pl-9">
                              {ex.sets.map((set, sIdx) => (
                                <div key={sIdx} className="bg-surfaceHighlight border border-border rounded-lg px-3 py-1.5 flex items-center gap-1.5 shadow-sm">
                                    <span className="text-primary font-bold font-mono text-sm">{set.weight || set.distance}</span>
                                    <span className="text-[10px] text-subtext font-bold">{set.unit}</span>
                                    {!set.distance && <><span className="text-subtext text-xs">✕</span><span className="text-text font-bold font-mono text-sm">{set.reps}</span></>}
                                    {set.rpe && <div className="ml-2 pl-2 border-l border-border text-[9px] font-mono text-subtext flex items-center gap-1"><Gauge className="w-2.5 h-2.5" /> {set.rpe}</div>}
                                </div>
                              ))}
                           </div>
                        </div>
                      ))}
                   </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* PLANS SECTION */}
        {canEdit && (
          <section>
             <div className="flex items-center justify-between mb-3 px-2">
                <h2 className="text-sm font-bold text-text tracking-tight flex items-center gap-2"><Zap className="w-4 h-4 text-primary" />{t('routines')}</h2>
                <span className="text-xs font-medium text-subtext bg-surface px-2 py-1 rounded-md border border-border">{plans.length} {t('saved')}</span>
             </div>
             <div className="-mx-4 px-4 overflow-x-auto no-scrollbar py-6 flex gap-4">
                <button onClick={() => { setEditingPlan(null); setShowCreatePlan(true); }} className="flex flex-col items-center justify-center gap-2 w-[110px] h-[120px] rounded-2xl border border-dashed border-border hover:border-primary/50 bg-surface hover:bg-primary/5 transition-all shrink-0 group">
                   <div className="w-8 h-8 rounded-full bg-surfaceHighlight border border-border flex items-center justify-center text-subtext group-hover:text-primary transition-all"><Plus className="w-4 h-4" /></div>
                   <span className="text-[10px] font-bold text-subtext group-hover:text-primary tracking-wide">{t('new')}</span>
                </button>
                {plans.map(plan => (
                   <div key={plan.id} onClick={() => handleApplyPlan(plan)} className="w-[150px] h-[120px] rounded-2xl bg-surfaceHighlight border border-border p-3 flex flex-col justify-between shrink-0 hover:border-primary/50 transition-all cursor-pointer group shadow-sm relative overflow-hidden">
                      <div>
                        <div className="w-6 h-6 rounded-full bg-surface flex items-center justify-center mb-2"><Dumbbell className="w-3 h-3 text-primary" /></div>
                        <h3 className="text-xs font-bold text-text leading-tight truncate">{plan.name}</h3>
                        <p className="text-[9px] text-subtext font-medium">{plan.exercises.length} Items</p>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-border mt-auto gap-1">
                          <button onClick={(e) => { e.stopPropagation(); setEditingPlan(plan); setShowCreatePlan(true); }} className="p-1.5 rounded hover:bg-surface text-subtext hover:text-text"><Pencil className="w-3 h-3" /></button>
                          <button onClick={(e) => { e.stopPropagation(); setDeletePlanConfirmation({ planId: plan.id, planName: plan.name }); }} className="p-1.5 rounded hover:bg-surface text-subtext hover:text-danger"><Trash2 className="w-3 h-3" /></button>
                      </div>
                   </div>
                ))}
             </div>
          </section>
        )}
      </main>

      {canEdit && (
        <>
          <div className="fixed bottom-28 left-4 z-50"><RestTimer /></div>
          <ActionDock label={t('input_log')} onOpenUnified={() => setShowUnifiedEntry(true)} onWorkoutProcessed={handleWorkoutProcessed} />
        </>
      )}
      
      {/* MODALS */}
      <Suspense fallback={null}>
        {showUnifiedEntry && <UnifiedEntryModal isOpen={showUnifiedEntry} onClose={() => setShowUnifiedEntry(false)} onWorkoutProcessed={handleWorkoutProcessed} pastWorkouts={workouts} />}
        {showPRModal && <PRModal isOpen={showPRModal} onClose={() => setShowPRModal(false)} workouts={workouts} initialExercise={selectedHistoryExercise} />}
        {showMonthlySummary && <MonthlySummaryModal isOpen={showMonthlySummary} onClose={() => setShowMonthlySummary(false)} workouts={workouts} />}
        {showCreatePlan && <CreatePlanModal isOpen={showCreatePlan} onClose={() => setShowCreatePlan(false)} onSave={handleSavePlan} initialPlan={editingPlan} />}
        {currentUser && showProfileModal && <ProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} user={currentUser} workouts={workouts} onUpdateUser={(u) => setCurrentUser(prev => prev ? ({ ...prev, ...u }) : null)} onLogout={async () => { await supabase.auth.signOut(); setCurrentUser(null); }} />}
        {editingExercise && <EditExerciseModal isOpen={!!editingExercise} onClose={() => setEditingExercise(null)} exercise={editingExercise.data} onSave={async (ex) => {
            const newExs = [...workouts.find(w => w.id === editingExercise.workoutId)!.structured_data.exercises];
            newExs[editingExercise.exerciseIndex] = ex;
            const updatedData = { ...workouts.find(w => w.id === editingExercise.workoutId)!.structured_data, exercises: newExs };
            setWorkouts(prev => prev.map(w => w.id === editingExercise.workoutId ? { ...w, structured_data: updatedData } : w));
            await supabase.from('workouts').update({ structured_data: updatedData }).eq('id', editingExercise.workoutId);
            setEditingExercise(null);
        }} />}
        {currentUser && showSocialModal && <SocialModal isOpen={showSocialModal} onClose={() => { setShowSocialModal(false); checkPendingRequests(); }} currentUser={currentUser} activeFriends={activeFriends.map(f => f.userId)} onToggleFriend={handleToggleFriend} />}
        {currentUser && showArenaModal && <ArenaModal isOpen={showArenaModal} onClose={() => setShowArenaModal(false)} currentUser={currentUser} friendsData={[{ userId: currentUser.id, name: currentUser.name, workouts: workouts, color: '#D4FF00' }, ...activeFriends.map(f => ({ userId: f.userId, name: f.name, workouts: friendsWorkouts.find(fw => fw.userId === f.userId)?.workouts || [], color: f.color }))] } />}
      </Suspense>

      {/* Confirmation Dialogs - Kept Minimal for brevity */}
      {[deleteConfirmation, deleteWorkoutConfirmation, deletePlanConfirmation].map((conf, i) => {
         if (!conf) return null;
         const action = i === 0 ? executeDeleteExercise : i === 1 ? async () => { setWorkouts(prev => prev.filter(w => w.id !== deleteWorkoutConfirmation)); await supabase.from('workouts').delete().eq('id', deleteWorkoutConfirmation); setDeleteWorkoutConfirmation(null); } : async () => { setPlans(prev => prev.filter(p => p.id !== deletePlanConfirmation?.planId)); await supabase.from('workout_plans').delete().eq('id', deletePlanConfirmation?.planId); setDeletePlanConfirmation(null); };
         return (
            <div key={i} className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
               <div className="bg-surface border border-border rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                  <div className="w-12 h-12 bg-danger/10 text-danger rounded-full flex items-center justify-center mb-4"><AlertTriangle className="w-6 h-6" /></div>
                  <h3 className="text-lg font-bold text-text mb-2">{t(i === 0 ? 'delete_exercise_title' : i === 1 ? 'delete_workout_title' : 'delete_plan_title')}</h3>
                  <div className="flex gap-3 mt-4">
                     <button onClick={() => { setDeleteConfirmation(null); setDeleteWorkoutConfirmation(null); setDeletePlanConfirmation(null); }} className="flex-1 py-3 rounded-xl font-bold text-sm bg-surfaceHighlight hover:bg-surface border border-border text-text">{t('cancel')}</button>
                     <button onClick={action} className="flex-1 py-3 rounded-xl font-bold text-sm bg-danger text-white hover:opacity-90">{t('delete')}</button>
                  </div>
               </div>
            </div>
         )
      })}
    </div>
  );
}
