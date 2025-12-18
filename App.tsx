
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
import { es } from 'date-fns/locale';
import { getExerciseIcon, parseLocalDate, sanitizeWorkoutData } from './utils';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { ExerciseProvider, useExercises } from './contexts/ExerciseContext';
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
  User as UserIcon,
  Scale,
  MessageSquare,
  ChevronRight
} from 'lucide-react';

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
      <ExerciseProvider>
        <App />
      </ExerciseProvider>
    </LanguageProvider>
  );
}

function App() {
  const { t } = useLanguage();
  const { catalog, isLoading: catalogLoading } = useExercises();
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
  const [showUnifiedEntry, setShowUnifiedEntry] = useState(false);
  const [showPRModal, setShowPRModal] = useState(false);
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showMonthlySummary, setShowMonthlySummary] = useState(false);
  const [showSocialModal, setShowSocialModal] = useState(false);
  const [showArenaModal, setShowArenaModal] = useState(false);
  const [selectedHistoryExercise, setSelectedHistoryExercise] = useState<string | null>(null);
  const [editingExercise, setEditingExercise] = useState<{ workoutId: string; exerciseIndex: number; data: Exercise; } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ workoutId: string; exerciseIndex: number; exerciseName: string; } | null>(null);
  const [deleteWorkoutConfirmation, setDeleteWorkoutConfirmation] = useState<string | null>(null);

  useEffect(() => {
    const checkSession = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            await fetchUserProfile(session.user.id);
        } else {
            setSessionLoading(false);
        }
    };
    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setIsRecoveryMode(true);
      if (session) { 
          if (!currentUser) fetchUserProfile(session.user.id); 
      } 
      else { 
          setCurrentUser(null); 
          setRealAdminUser(null); 
          setSessionLoading(false); 
      }
    });
    return () => subscription.unsubscribe();
  }, []); 

  const fetchUserProfile = async (userId: string) => {
    try {
        const profile = await getCurrentProfile();
        if (profile) {
            setCurrentUser(profile as User);
        } else {
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (authUser) {
                setCurrentUser({
                    id: authUser.id,
                    email: authUser.email || '',
                    name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Atleta',
                    role: 'user',
                    created_at: authUser.created_at,
                    weight: 80,
                    height: 180
                });
            }
        }
    } catch (e) { 
        console.error("Error en fetchUserProfile:", e); 
    } finally { 
        setSessionLoading(false); 
    }
  };

  useEffect(() => {
    if (currentUser) {
        fetchData();
        checkPendingRequests();
        if (currentUser.role === 'admin' || (realAdminUser?.role === 'admin')) fetchAdminData();
    }
  }, [currentUser]);

  const canEdit = !isFuture(selectedDate);
  const myWorkouts = useMemo(() => workouts.filter(w => isSameDay(parseLocalDate(w.date), selectedDate)), [workouts, selectedDate]);
  const friendsWorkoutsForDate = useMemo(() => activeFriends.flatMap(f => {
          const fWorkouts = friendsWorkouts.find(fw => fw.userId === f.userId)?.workouts || [];
          return fWorkouts.filter(w => isSameDay(parseLocalDate(w.date), selectedDate)).map(w => ({ ...w, _friendColor: f.color, _friendId: f.userId, _friendName: f.name }));
      }), [activeFriends, friendsWorkouts, selectedDate]);

  const groupedLogs = useMemo(() => {
      if (!currentUser) return [];
      const groups: any[] = [];
      if (myWorkouts.length > 0) groups.push({ id: currentUser.id, name: currentUser.name, isMe: true, color: '#D4FF00', workouts: myWorkouts });
      const friendsMap = new Map<string, any>();
      friendsWorkoutsForDate.forEach(w => {
          if (!friendsMap.has(w._friendId)) friendsMap.set(w._friendId, { id: w._friendId, name: w._friendName, isMe: false, color: w._friendColor, workouts: [] });
          friendsMap.get(w._friendId).workouts.push(w);
      });
      return [...groups, ...Array.from(friendsMap.values())];
  }, [myWorkouts, friendsWorkoutsForDate, currentUser]);

  const checkPendingRequests = async () => { if (!currentUser) return; setPendingRequestsCount(await getPendingRequestsCount()); };
  const fetchAdminData = async () => {
      const { data: profiles } = await supabase.from('profiles').select('*');
      if (profiles) setAllUsers(profiles.map(p => ({ id: p.id, name: p.name || 'Unknown', email: 'hidden@email.com', role: p.role || 'user', created_at: p.created_at || new Date().toISOString(), avatar_url: p.avatar_url, weight: p.weight, height: p.height })));
      const { data: globalWorkouts } = await supabase.from('workouts').select('*').order('created_at', { ascending: false });
      if (globalWorkouts) setAllWorkouts(globalWorkouts as Workout[]);
  };
  const fetchData = async () => {
    if (!currentUser) return;
    const [wData, pData] = await Promise.all([
        supabase.from('workouts').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: true }), 
        supabase.from('workout_plans').select('*').eq('user_id', currentUser.id)
    ]);
    if (wData.data) setWorkouts(wData.data as Workout[]);
    if (pData.data) setPlans(pData.data as WorkoutPlan[]);
  };

  const handleToggleFriend = async (friendId: string, friendName: string, color: string) => {
    const isActive = activeFriends.find(f => f.userId === friendId);
    if (isActive) setActiveFriends(prev => prev.filter(f => f.userId !== friendId));
    else {
        const wData = await getFriendWorkouts([friendId]);
        setFriendsWorkouts(prev => [...prev.filter(p => p.userId !== friendId), { userId: friendId, workouts: wData }]);
        setActiveFriends(prev => [...prev, { userId: friendId, name: friendName, color }]);
    }
  };

  const handleWorkoutProcessed = async (rawData: WorkoutData) => {
    if (!currentUser) return;
    const data = sanitizeWorkoutData(rawData, catalog);
    if (!data.exercises || data.exercises.length === 0) return;
    const dateToSave = format(selectedDate, 'yyyy-MM-dd');
    const existingWorkout = workouts.find(w => isSameDay(parseLocalDate(w.date), selectedDate));
    const weightToSave = currentUser.weight || 80;

    if (existingWorkout) {
        const updatedData: WorkoutData = { 
          ...existingWorkout.structured_data, 
          exercises: [...existingWorkout.structured_data.exercises, ...data.exercises], 
          notes: (existingWorkout.structured_data.notes || '') + (data.notes ? `\n${data.notes}` : '') 
        };
        setWorkouts(prev => prev.map(w => w.id === existingWorkout.id ? { ...w, structured_data: updatedData } : w));
        await supabase.from('workouts').update({ 
          structured_data: updatedData,
          user_weight: weightToSave 
        }).eq('id', existingWorkout.id);
    } else {
        const { data: inserted } = await supabase.from('workouts').insert({ 
          user_id: currentUser.id, 
          date: dateToSave, 
          structured_data: data, 
          source: 'web',
          user_weight: weightToSave
        }).select().single();
        if (inserted) setWorkouts(prev => [...prev, inserted as Workout]);
    }
  };

  const handleDeleteWorkout = async (workoutId: string) => {
    setWorkouts(prev => prev.filter(w => w.id !== workoutId));
    await supabase.from('workouts').delete().eq('id', workoutId);
    setDeleteWorkoutConfirmation(null);
  };

  if (!isConfigured) return <div className="min-h-screen bg-black flex items-center justify-center p-8 text-white">Error de Configuración</div>;
  if (sessionLoading || catalogLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (currentUser && isRecoveryMode) return <ResetPasswordScreen onSuccess={() => setIsRecoveryMode(false)} />;
  if (!currentUser) return <LoginScreen />;

  return (
    <div className="min-h-screen pb-40 relative font-sans text-text transition-colors duration-300">
      {realAdminUser && (
        <div className="bg-primary text-black px-4 py-3 flex items-center justify-between sticky top-0 z-50 shadow-xl">
           <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-tight"><EyeOff className="w-4 h-4" /> {t('viewing_as')} {currentUser.name}</div>
           <button onClick={() => { setCurrentUser(realAdminUser); setRealAdminUser(null); }} className="bg-black text-white px-4 py-1.5 rounded-full text-xs font-bold hover:scale-105 transition-transform">{t('exit')}</button>
        </div>
      )}

      <AppHeader currentUser={currentUser} pendingRequestsCount={pendingRequestsCount} activeFriendsCount={activeFriends.length} onOpenSocial={() => setShowSocialModal(true)} onOpenPR={() => { setSelectedHistoryExercise(null); setShowPRModal(true); }} onOpenMonthly={() => setShowMonthlySummary(true)} onOpenProfile={() => setShowProfileModal(true)} />

      <main className="max-w-md mx-auto px-4 pt-24 space-y-6">
        <div className="flex items-center gap-2 mb-2 px-1 overflow-x-auto no-scrollbar py-2">
             <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/30 px-3 py-1.5 rounded-full shrink-0 animate-in fade-in slide-in-from-left-2"><div className="w-5 h-5 rounded-full bg-primary text-black text-[10px] flex items-center justify-center font-bold">{currentUser.name.charAt(0).toUpperCase()}</div><span className="text-xs font-black text-primary">Me</span></div>
             {activeFriends.map(friend => (<div key={friend.userId} className="flex items-center gap-1.5 bg-surfaceHighlight border px-3 py-1.5 rounded-full shrink-0 animate-in fade-in zoom-in" style={{ borderColor: `${friend.color}30` }}><div className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold shadow-sm" style={{ backgroundColor: friend.color, color: '#000' }}>{friend.name.charAt(0).toUpperCase()}</div><span className="text-xs font-black" style={{ color: friend.color }}>{friend.name}</span><button onClick={() => handleToggleFriend(friend.userId, friend.name, friend.color)} className="ml-1 text-subtext hover:text-white transition-colors"><X className="w-3.5 h-3.5" /></button></div>))}
        </div>
        
        <CalendarView viewDate={viewDate} onViewDateChange={setViewDate} workouts={workouts} selectedFriendsWorkouts={activeFriends.map(f => ({ userId: f.userId, color: f.color, workouts: friendsWorkouts.find(fw => fw.userId === f.userId)?.workouts || [] }))} selectedDate={selectedDate} onSelectDate={setSelectedDate} onSummaryClick={() => {}} />
        
        {activeFriends.length > 0 && (
            <section className="animate-in slide-in-from-bottom-4 duration-500"><button onClick={() => setShowArenaModal(true)} className="w-full bg-gradient-to-r from-zinc-900 to-black border border-white/5 p-4 rounded-[2rem] flex items-center justify-between group shadow-lg ring-1 ring-white/10 hover:ring-primary/40 transition-all"><div className="flex items-center gap-3"><div className="p-2 bg-primary/10 rounded-full border border-primary/20 group-hover:scale-110 group-hover:bg-primary/20 transition-all"><Swords className="w-5 h-5 text-primary" /></div><div className="text-left"><div className="text-sm font-black text-white italic tracking-tight">{t('enter_arena')}</div><div className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">{activeFriends.length} {t('opponents')}</div></div></div><div className="text-primary text-[10px] font-black font-mono tracking-[0.2em] group-hover:translate-x-1 transition-transform">{t('judge_me')} &rarr;</div></button></section>
        )}

        <section className="space-y-4">
          <div className="flex items-center justify-between mb-1 px-2">
            <h2 className="text-[10px] font-black text-zinc-500 tracking-[0.2em] flex items-center gap-2 uppercase italic leading-none"><Activity className="w-3.5 h-3.5 text-primary" /> {isSameDay(selectedDate, new Date()) ? t('todays_log') : format(selectedDate, 'MMM do', { locale: es }).toUpperCase()}</h2>
            <div className="text-[9px] font-black text-zinc-600 font-mono uppercase">{myWorkouts.length + friendsWorkoutsForDate.length} ENTRIES</div>
          </div>
          
          {groupedLogs.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center border-2 border-dashed border-border/30 rounded-[2.5rem] bg-surfaceHighlight/10 animate-in fade-in zoom-in duration-500">
              <Activity className="w-8 h-8 text-zinc-800 mb-4" />
              <p className="text-subtext text-[10px] font-black uppercase tracking-widest">{t('no_activity')}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {groupedLogs.map((group) => (
                <div key={group.id} className="animate-in fade-in slide-in-from-bottom-6 duration-500">
                  <div className="flex items-center gap-2 mb-3 px-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-black text-[10px] shadow-lg relative" style={{ backgroundColor: group.color }}>
                        {group.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs font-black text-text italic tracking-tight uppercase" style={{ color: group.isMe ? undefined : group.color }}>
                        {group.isMe ? t('todays_log') : group.name}
                    </span>
                  </div>

                  <div className="relative border-l border-white/5 ml-3.5 space-y-3 pb-1">
                    {group.workouts.map((workout: Workout, wIdx: number) => {
                      const displayWeight = workout.user_weight || (group.isMe ? currentUser.weight : 80);
                      
                      return (
                      <div key={workout.id || wIdx} className="relative pl-6">
                        <div className="absolute -left-[4.5px] top-1.5 w-2 h-2 rounded-full border border-background shadow-glow" style={{ backgroundColor: group.color }}></div>
                        
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-mono font-bold text-zinc-500">
                              {workout.created_at ? format(new Date(workout.created_at), 'HH:mm') : '--:--'}
                            </span>
                            <div className="h-2 w-px bg-white/5"></div>
                            <span className="text-[9px] text-zinc-600 font-black uppercase tracking-widest">{displayWeight} KG BW</span>
                          </div>
                          {group.isMe && canEdit && (
                            <button onClick={() => setDeleteWorkoutConfirmation(workout.id)} className="p-1 text-zinc-700 hover:text-danger transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {workout.structured_data.notes && (
                          <div className="mb-2 text-[9px] text-zinc-500 italic px-2 py-1.5 bg-white/5 rounded-lg border-l-2 border-zinc-700">
                            {workout.structured_data.notes}
                          </div>
                        )}

                        <div className="space-y-3">
                          {workout.structured_data.exercises.map((ex, idx) => (
                            <div key={idx} className={`flex flex-col gap-3 p-4 rounded-2xl border transition-all ${group.isMe ? 'bg-zinc-900/40 border-white/5 hover:border-primary/20 shadow-md ring-1 ring-white/5' : 'bg-surfaceHighlight/5 border-dashed border-border/30'}`}>
                                {/* Row 1: Exercise Name & Edit Action */}
                                <div className="flex items-start justify-between w-full">
                                    <div className="flex items-center gap-3 flex-1 min-w-0" onClick={() => { if(group.isMe) { setSelectedHistoryExercise(ex.name); setShowPRModal(true); } }}>
                                        <div className="w-10 h-10 rounded-xl bg-black border border-white/10 text-zinc-500 flex items-center justify-center shrink-0 shadow-inner">
                                            {getExerciseIcon(ex.name, catalog, "w-5 h-5")}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-black text-sm text-white uppercase tracking-tight italic leading-tight">{ex.name}</h4>
                                            <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mt-0.5">{ex.category || 'General'}</div>
                                        </div>
                                    </div>
                                    {group.isMe && canEdit && (
                                        <button onClick={(e) => { e.stopPropagation(); setEditingExercise({ workoutId: workout.id, exerciseIndex: idx, data: ex }); }} className="p-2 bg-white/5 rounded-xl text-zinc-500 hover:text-primary transition-all shrink-0">
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                                
                                {/* Row 2: Sets Visualization (Next line) */}
                                <div className="flex flex-wrap items-center gap-2 pl-13">
                                    {ex.sets.map((set, sIdx) => (
                                        <div key={sIdx} className="bg-black/60 border border-white/10 rounded-lg px-3 py-1.5 flex items-center gap-2 shrink-0 shadow-sm ring-1 ring-white/5">
                                            {set.weight ? (
                                                <>
                                                    <span className={`font-mono text-xs font-black ${group.isMe ? 'text-primary' : 'text-zinc-400'}`}>{set.weight}</span>
                                                    <span className="text-[10px] text-zinc-700 font-black">×</span>
                                                    <span className="text-white font-mono text-xs font-black">{set.reps}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="text-white font-mono text-xs font-black">{set.reps || set.distance}</span>
                                                    <span className="text-[10px] text-zinc-700 font-black uppercase">{set.unit === 'reps' ? 'R' : set.unit}</span>
                                                </>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )})}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {canEdit && (<><div className="fixed bottom-28 left-4 z-50"><RestTimer /></div><ActionDock label={t('input_log')} onOpenUnified={() => setShowUnifiedEntry(true)} onWorkoutProcessed={handleWorkoutProcessed} /></>)}
      
      {deleteWorkoutConfirmation && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md">
          <div className="bg-surface border border-danger/30 p-8 rounded-[2.5rem] max-w-xs w-full text-center space-y-6 shadow-2xl">
            <Trash2 className="w-12 h-12 text-danger mx-auto" />
            <h3 className="text-xl font-black text-white italic uppercase">{t('delete_workout_title')}</h3>
            <div className="flex flex-col gap-3">
              <button onClick={() => handleDeleteWorkout(deleteWorkoutConfirmation)} className="w-full py-4 bg-danger text-white font-black rounded-2xl text-sm uppercase shadow-lg shadow-danger/20">ELIMINAR AHORA</button>
              <button onClick={() => setDeleteWorkoutConfirmation(null)} className="w-full py-4 bg-zinc-900 text-zinc-500 font-black rounded-2xl text-sm uppercase">CANCELAR</button>
            </div>
          </div>
        </div>
      )}

      <Suspense fallback={null}>
        {showUnifiedEntry && (<UnifiedEntryModal isOpen={showUnifiedEntry} onClose={() => setShowUnifiedEntry(false)} onWorkoutProcessed={handleWorkoutProcessed} pastWorkouts={workouts} plans={plans} onOpenCreatePlan={() => { setShowUnifiedEntry(false); setShowCreatePlan(true); }} />)}
        {showPRModal && <PRModal isOpen={showPRModal} onClose={() => setShowPRModal(false)} workouts={workouts} initialExercise={selectedHistoryExercise} />}
        {showMonthlySummary && currentUser && <MonthlySummaryModal isOpen={showMonthlySummary} onClose={() => setShowMonthlySummary(false)} workouts={workouts} currentUser={currentUser} />}
        {showCreatePlan && <CreatePlanModal isOpen={showCreatePlan} onClose={() => setShowCreatePlan(false)} onSave={async (plan: WorkoutPlan) => { if (!currentUser) return; const planPayload = { name: plan.name, exercises: plan.exercises, user_id: currentUser.id }; if (plans.some(p => p.id === plan.id)) { await supabase.from('workout_plans').update(planPayload).eq('id', plan.id); setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, ...planPayload } : p)); } else { const { data } = await supabase.from('workout_plans').insert(planPayload).select().single(); if (data) setPlans(prev => [...prev, data as WorkoutPlan]); } setShowCreatePlan(false); }} />}
        {currentUser && showProfileModal && <ProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} user={currentUser} workouts={workouts} onUpdateUser={(u: Partial<User>) => setCurrentUser(prev => prev ? ({ ...prev, ...u }) : null)} onLogout={async () => { await supabase.auth.signOut(); setCurrentUser(null); }} />}
        {editingExercise && <EditExerciseModal isOpen={!!editingExercise} onClose={() => setEditingExercise(null)} exercise={editingExercise.data} onSave={async (ex: Exercise) => { const workout = workouts.find(w => w.id === editingExercise.workoutId); if (!workout) return; const newExs = [...workout.structured_data.exercises]; newExs[editingExercise.exerciseIndex] = ex; const updatedData = { ...workout.structured_data, exercises: newExs }; setWorkouts(prev => prev.map(w => w.id === editingExercise.workoutId ? { ...w, structured_data: updatedData } : w)); await supabase.from('workouts').update({ structured_data: updatedData }).eq('id', editingExercise.workoutId); setEditingExercise(null); }} />}
        {currentUser && showSocialModal && <SocialModal isOpen={showSocialModal} onClose={() => { setShowSocialModal(false); checkPendingRequests(); }} currentUser={currentUser} activeFriends={activeFriends.map(f => f.userId)} onToggleFriend={handleToggleFriend} />}
        {currentUser && showArenaModal && <ArenaModal isOpen={showArenaModal} onClose={() => setShowArenaModal(false)} currentUser={currentUser} friendsData={[{ userId: currentUser.id, name: currentUser.name, workouts: workouts, color: '#D4FF00' }, ...activeFriends.map(f => ({ userId: f.userId, name: f.name, workouts: friendsWorkouts.find(fw => fw.userId === f.userId)?.workouts || [], color: f.color }))] } />}
      </Suspense>
    </div>
  );
}
