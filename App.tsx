import React, { useState, useEffect, Suspense, lazy, useMemo } from 'react';
import { CalendarView } from './components/CalendarView';
import { RestTimer } from './components/RestTimer';
import { LoginScreen } from './components/LoginScreen';
import { ResetPasswordScreen } from './components/ResetPasswordScreen'; 
import { AppHeader } from './components/AppHeader';
import { ActionDock } from './components/ActionDock';
import { Workout, WorkoutData, WorkoutPlan, Exercise, User } from './types';
import { supabase, getCurrentProfile, getFriendWorkouts, getPendingRequestsCount, isConfigured } from './services/supabase';
import { format, isSameDay, isFuture } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { getExerciseIcon, parseLocalDate, sanitizeWorkoutData } from './utils';
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
  X,
  User as UserIcon
} from 'lucide-react';

// --- LAZY LOADED COMPONENTS (Code Splitting) ---
const AdminDashboard = lazy(() => import('./components/AdminDashboard').then(module => ({ default: module.AdminDashboard }))) as React.ComponentType<any>;
const UnifiedEntryModal = lazy(() => import('./components/UnifiedEntryModal').then(module => ({ default: module.UnifiedEntryModal }))) as React.ComponentType<any>;
const PRModal = lazy(() => import('./components/PRModal').then(module => ({ default: module.PRModal }))) as React.ComponentType<any>;
const CreatePlanModal = lazy(() => import('./components/CreatePlanModal').then(module => ({ default: module.CreatePlanModal }))) as React.ComponentType<any>;
const EditExerciseModal = lazy(() => import('./components/EditExerciseModal').then(module => ({ default: module.EditExerciseModal }))) as React.ComponentType<any>;
const ProfileModal = lazy(() => import('./components/ProfileModal').then(module => ({ default: module.ProfileModal }))) as React.ComponentType<any>;
const MonthlySummaryModal = lazy(() => import('./components/MonthlySummaryModal').then(module => ({ default: module.MonthlySummaryModal }))) as React.ComponentType<any>;
const SocialModal = lazy(() => import('./components/SocialModal').then(module => ({ default: module.SocialModal }))) as React.ComponentType<any>;
const ArenaModal = lazy(() => import('./components/ArenaModal').then(module => ({ default: module.ArenaModal }))) as React.ComponentType<any>;

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

  // --- STATE DEFINITIONS ---
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

  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allWorkouts, setAllWorkouts] = useState<Workout[]>([]);
  
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
  // Removed deletePlanConfirmation as plans are managed in modal now (or future update)
  const [deleteWorkoutConfirmation, setDeleteWorkoutConfirmation] = useState<string | null>(null);

  // --- EFFECTS ---
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

  // --- DATA PREPARATION (MUST BE BEFORE RETURNS) ---
  const canEdit = !isFuture(selectedDate);

  // 1. Get My Workouts for selected date
  const myWorkouts = useMemo(() => {
      return workouts.filter(w => isSameDay(parseLocalDate(w.date), selectedDate));
  }, [workouts, selectedDate]);

  // 2. Get Friends Workouts for selected date
  const friendsWorkoutsForDate = useMemo(() => {
      return activeFriends.flatMap(f => {
          const fWorkouts = friendsWorkouts.find(fw => fw.userId === f.userId)?.workouts || [];
          return fWorkouts.filter(w => isSameDay(parseLocalDate(w.date), selectedDate)).map(w => ({ 
              ...w, 
              _friendColor: f.color, 
              _friendId: f.userId, 
              _friendName: f.name 
          }));
      });
  }, [activeFriends, friendsWorkouts, selectedDate]);

  // 3. GROUPING LOGIC
  const groupedLogs = useMemo(() => {
      if (!currentUser) return [];

      const groups: {
          id: string;
          name: string;
          isMe: boolean;
          color: string;
          workouts: any[];
      }[] = [];

      // Add "Me" Group
      if (myWorkouts.length > 0) {
          groups.push({
              id: currentUser.id,
              name: currentUser.name, // "Tú" or User Name
              isMe: true,
              color: '#D4FF00', // Primary
              workouts: myWorkouts
          });
      }

      // Add Friends Groups
      const friendsMap = new Map<string, any>();
      friendsWorkoutsForDate.forEach(w => {
          if (!friendsMap.has(w._friendId)) {
              friendsMap.set(w._friendId, {
                  id: w._friendId,
                  name: w._friendName,
                  isMe: false,
                  color: w._friendColor,
                  workouts: []
              });
          }
          friendsMap.get(w._friendId).workouts.push(w);
      });

      return [...groups, ...Array.from(friendsMap.values())];
  }, [myWorkouts, friendsWorkoutsForDate, currentUser]);

  // --- HELPERS ---
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

  const handleWorkoutProcessed = async (rawData: WorkoutData) => {
    if (!currentUser) return;
    
    // STRICT VALIDATION: Ensure strict adherence to catalog or delete unknown exercises
    const data = sanitizeWorkoutData(rawData);

    if (!data.exercises || data.exercises.length === 0) {
        alert("No valid exercises detected. Please use exercises from the catalog.");
        return;
    }

    const dateToSave = format(selectedDate, 'yyyy-MM-dd');
    
    // MERGE LOGIC: Check if workout already exists for this date
    const existingWorkout = workouts.find(w => isSameDay(parseLocalDate(w.date), selectedDate));

    if (existingWorkout) {
        // UPDATE EXISTING (Merge)
        const updatedData: WorkoutData = {
            ...existingWorkout.structured_data,
            exercises: [...existingWorkout.structured_data.exercises, ...data.exercises],
            notes: (existingWorkout.structured_data.notes || '') + (data.notes ? `\n${data.notes}` : '')
        };

        // Optimistic Update
        setWorkouts(prev => prev.map(w => w.id === existingWorkout.id ? { ...w, structured_data: updatedData } : w));

        const { error } = await supabase
            .from('workouts')
            .update({ structured_data: updatedData })
            .eq('id', existingWorkout.id);

        if (error) {
             alert("Error merging workout.");
        }

    } else {
        // CREATE NEW
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
    }

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

  // --- RENDERING CONDITIONS (AFTER HOOKS) ---

  if (!isConfigured) {
      return (
          <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 text-center space-y-6">
              <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/30 animate-pulse">
                  <Settings className="w-12 h-12 text-red-500" />
              </div>
              <div className="max-w-md">
                  <h1 className="text-2xl font-bold text-white mb-2">Error de Configuración</h1>
                  <p className="text-zinc-400 mb-4">Variables de entorno faltantes.</p>
              </div>
          </div>
      );
  }

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

        <section>
          <div className="flex items-center justify-between mb-4 px-2">
            <h2 className="text-sm font-bold text-text tracking-tight flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              {isSameDay(selectedDate, new Date()) ? t('todays_log') : format(selectedDate, 'MMMM do', { locale: dateLocale }).toUpperCase()}
            </h2>
            <span className="text-xs font-medium text-subtext bg-surface px-2 py-1 rounded-md border border-border">
              {myWorkouts.length + friendsWorkoutsForDate.length} {t('logs')}
            </span>
          </div>

          {groupedLogs.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center border-2 border-dashed border-border rounded-3xl bg-surface/30">
               <div className="w-16 h-16 bg-surface rounded-full flex items-center justify-center mb-4 text-subtext"><Activity className="w-8 h-8" /></div>
               <p className="text-subtext text-sm font-medium">{t('no_activity')}</p>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* GROUPED WORKOUTS RENDERING */}
              {groupedLogs.map((group) => (
                  <div key={group.id} className="bg-surface rounded-3xl border border-border overflow-hidden shadow-sm">
                      
                      {/* USER HEADER */}
                      <div className="px-4 py-3 flex items-center justify-between bg-surfaceHighlight/50 border-b border-border">
                          <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-black text-xs shadow-sm" style={{ backgroundColor: group.color }}>
                                  {group.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-sm font-bold text-text" style={{ color: group.isMe ? undefined : group.color }}>
                                  {group.isMe ? t('todays_log') : group.name}
                              </span>
                          </div>
                      </div>

                      {/* WORKOUT LIST FOR THIS USER - TIMELINE STYLE */}
                      <div className="p-4">
                          <div className="relative border-l-2 border-dashed border-border ml-3 space-y-8 pb-2">
                              {group.workouts.map((workout: Workout, wIdx: number) => (
                                  <div key={workout.id || wIdx} className="relative pl-6">
                                      {/* Time Dot */}
                                      <div className="absolute -left-[9px] top-0 flex flex-col items-center">
                                          <div className="w-4 h-4 rounded-full border-2 border-surface shadow-sm" style={{ backgroundColor: group.color }}></div>
                                      </div>
                                      
                                      {/* Header: Time + Delete Option */}
                                      <div className="flex items-center justify-between mb-3 -mt-1">
                                          <div className="flex items-center gap-2">
                                              <span className="text-xs font-mono font-bold text-subtext bg-surfaceHighlight/80 px-2 py-0.5 rounded border border-border">
                                                  {workout.created_at ? format(new Date(workout.created_at), 'HH:mm') : '--:--'}
                                              </span>
                                          </div>
                                          
                                          {/* Controls ONLY for Me */}
                                          {group.isMe && canEdit && (
                                              <button onClick={() => setDeleteWorkoutConfirmation(workout.id)} className="p-1.5 text-subtext hover:text-danger hover:bg-danger/10 rounded transition-colors" title="Delete entry">
                                                  <Trash2 className="w-3.5 h-3.5" />
                                              </button>
                                          )}
                                      </div>

                                      {/* Notes */}
                                      {workout.structured_data.notes && (
                                          <div className="mb-3 text-xs text-zinc-500 italic bg-surfaceHighlight/30 p-2 rounded-lg border-l-2 border-subtext/30">
                                              "{workout.structured_data.notes}"
                                          </div>
                                      )}

                                      {/* Exercises */}
                                      <div className="space-y-3">
                                          {workout.structured_data.exercises.map((ex, idx) => (
                                              <div key={idx} className={`p-3 rounded-xl border ${group.isMe ? 'bg-surfaceHighlight/30 border-border' : 'bg-surfaceHighlight/10 border-dashed border-border'}`}>
                                                  <div className="flex items-center justify-between mb-2">
                                                      <div className="flex items-center gap-2 font-bold text-sm text-text cursor-pointer hover:text-primary transition-colors" onClick={() => { if(group.isMe) { setSelectedHistoryExercise(ex.name); setShowPRModal(true); } }}>
                                                          <div className="p-1 rounded bg-surface border border-border text-subtext opacity-80">
                                                              {getExerciseIcon(ex.name, "w-3.5 h-3.5")}
                                                          </div>
                                                          {ex.name}
                                                      </div>
                                                      
                                                      {/* Exercise Controls ONLY for Me */}
                                                      {group.isMe && canEdit && (
                                                          <div className="flex gap-1">
                                                              <button onClick={(e) => { e.stopPropagation(); setEditingExercise({ workoutId: workout.id, exerciseIndex: idx, data: ex }); }} className="p-1 text-subtext hover:text-text"><Pencil className="w-3 h-3" /></button>
                                                              <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmation({ workoutId: workout.id, exerciseIndex: idx, exerciseName: ex.name }); }} className="p-1 text-subtext hover:text-danger"><Trash2 className="w-3 h-3" /></button>
                                                          </div>
                                                      )}
                                                  </div>

                                                  <div className="flex flex-wrap gap-2 pl-8">
                                                      {ex.sets.map((set, sIdx) => (
                                                          <div key={sIdx} className="bg-surface border border-border rounded px-2 py-1 flex items-center gap-1 shadow-sm">
                                                              <span className={`font-mono text-xs font-bold ${group.isMe ? 'text-primary' : 'text-zinc-400'}`}>
                                                                  {set.weight || set.distance}
                                                              </span>
                                                              <span className="text-[9px] text-subtext font-bold uppercase">{set.unit}</span>
                                                              {!set.distance && (
                                                                  <>
                                                                      <span className="text-subtext text-[9px] mx-0.5">x</span>
                                                                      <span className="text-text font-mono text-xs font-bold">{set.reps}</span>
                                                                  </>
                                                              )}
                                                          </div>
                                                      ))}
                                                  </div>
                                              </div>
                                          ))}
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </div>
                  </div>
              ))}

            </div>
          )}
        </section>
      </main>

      {canEdit && (
        <>
          <div className="fixed bottom-28 left-4 z-50"><RestTimer /></div>
          <ActionDock label={t('input_log')} onOpenUnified={() => setShowUnifiedEntry(true)} onWorkoutProcessed={handleWorkoutProcessed} />
        </>
      )}
      
      <Suspense fallback={null}>
        {showUnifiedEntry && (
            <UnifiedEntryModal 
                isOpen={showUnifiedEntry} 
                onClose={() => setShowUnifiedEntry(false)} 
                onWorkoutProcessed={handleWorkoutProcessed} 
                pastWorkouts={workouts} 
                plans={plans} 
                onOpenCreatePlan={() => { setShowUnifiedEntry(false); setShowCreatePlan(true); }}
            />
        )}
        {showPRModal && <PRModal isOpen={showPRModal} onClose={() => setShowPRModal(false)} workouts={workouts} initialExercise={selectedHistoryExercise} />}
        {showMonthlySummary && <MonthlySummaryModal isOpen={showMonthlySummary} onClose={() => setShowMonthlySummary(false)} workouts={workouts} />}
        {showCreatePlan && <CreatePlanModal isOpen={showCreatePlan} onClose={() => setShowCreatePlan(false)} onSave={handleSavePlan} initialPlan={editingPlan} />}
        {currentUser && showProfileModal && <ProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} user={currentUser} workouts={workouts} onUpdateUser={(u) => setCurrentUser(prev => prev ? ({ ...prev, ...u }) : null)} onLogout={async () => { await supabase.auth.signOut(); setCurrentUser(null); }} />}
        {editingExercise && <EditExerciseModal isOpen={!!editingExercise} onClose={() => setEditingExercise(null)} exercise={editingExercise.data} onSave={async (ex) => {
            const workout = workouts.find(w => w.id === editingExercise.workoutId);
            if (!workout) return; // Guard against stale state
            const newExs = [...workout.structured_data.exercises];
            newExs[editingExercise.exerciseIndex] = ex;
            const updatedData = { ...workout.structured_data, exercises: newExs };
            setWorkouts(prev => prev.map(w => w.id === editingExercise.workoutId ? { ...w, structured_data: updatedData } : w));
            await supabase.from('workouts').update({ structured_data: updatedData }).eq('id', editingExercise.workoutId);
            setEditingExercise(null);
        }} />}
        {currentUser && showSocialModal && <SocialModal isOpen={showSocialModal} onClose={() => { setShowSocialModal(false); checkPendingRequests(); }} currentUser={currentUser} activeFriends={activeFriends.map(f => f.userId)} onToggleFriend={handleToggleFriend} />}
        {currentUser && showArenaModal && <ArenaModal isOpen={showArenaModal} onClose={() => setShowArenaModal(false)} currentUser={currentUser} friendsData={[{ userId: currentUser.id, name: currentUser.name, workouts: workouts, color: '#D4FF00' }, ...activeFriends.map(f => ({ userId: f.userId, name: f.name, workouts: friendsWorkouts.find(fw => fw.userId === f.userId)?.workouts || [], color: f.color }))] } />}
      </Suspense>

      {[deleteConfirmation, deleteWorkoutConfirmation].map((conf, i) => {
         if (!conf) return null;
         const action = i === 0 ? executeDeleteExercise : async () => { setWorkouts(prev => prev.filter(w => w.id !== deleteWorkoutConfirmation)); await supabase.from('workouts').delete().eq('id', deleteWorkoutConfirmation); setDeleteWorkoutConfirmation(null); };
         return (
            <div key={i} className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
               <div className="bg-surface border border-border rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                  <div className="w-12 h-12 bg-danger/10 text-danger rounded-full flex items-center justify-center mb-4"><AlertTriangle className="w-6 h-6" /></div>
                  <h3 className="text-lg font-bold text-text mb-2">{t(i === 0 ? 'delete_exercise_title' : 'delete_workout_title')}</h3>
                  <div className="flex gap-3 mt-4">
                     <button onClick={() => { setDeleteConfirmation(null); setDeleteWorkoutConfirmation(null); }} className="flex-1 py-3 rounded-xl font-bold text-sm bg-surfaceHighlight hover:bg-surface border border-border text-text">{t('cancel')}</button>
                     <button onClick={action} className="flex-1 py-3 rounded-xl font-bold text-sm bg-danger text-white hover:opacity-90">{t('delete')}</button>
                  </div>
               </div>
            </div>
         )
      })}
    </div>
  );
}