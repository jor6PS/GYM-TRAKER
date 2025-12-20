
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
import es from 'date-fns/locale/es';
import { getExerciseIcon, parseLocalDate, sanitizeWorkoutData } from './utils';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { ExerciseProvider, useExercises } from './contexts/ExerciseContext';
import { Zap, Pencil, Clock, EyeOff, Activity, Dumbbell, Gauge, Swords, Trash2, Plus, Loader2, Settings, AlertTriangle, X, User as UserIcon, Scale, MessageSquare, ChevronRight } from 'lucide-react';

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
    <LanguageProvider><ExerciseProvider><App /></ExerciseProvider></LanguageProvider>
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
  const [editingPlan, setEditingPlan] = useState<WorkoutPlan | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showMonthlySummary, setShowMonthlySummary] = useState(false);
  const [showSocialModal, setShowSocialModal] = useState(false);
  const [showArenaModal, setShowArenaModal] = useState(false);
  const [selectedHistoryExercise, setSelectedHistoryExercise] = useState<string | null>(null);
  const [editingExercise, setEditingExercise] = useState<{ workoutId: string; exerciseIndex: number; data: Exercise; } | null>(null);
  const [deleteWorkoutId, setDeleteWorkoutId] = useState<string | null>(null);
  const [deletePlanId, setDeletePlanId] = useState<string | null>(null);

  useEffect(() => {
    const checkSession = async () => { const { data: { session } } = await supabase.auth.getSession(); if (session) await fetchUserProfile(session.user.id); else setSessionLoading(false); };
    checkSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setIsRecoveryMode(true);
      if (session) { if (!currentUser) fetchUserProfile(session.user.id); } 
      else { setCurrentUser(null); setRealAdminUser(null); setSessionLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []); 

  const fetchUserProfile = async (userId: string) => {
    try {
        const profile = await getCurrentProfile();
        if (profile) setCurrentUser(profile as User);
        else {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) setCurrentUser({ id: user.id, email: user.email || '', name: user.user_metadata?.name || 'Atleta', role: 'user', created_at: user.created_at, weight: 80, height: 180 });
        }
    } catch (e) { console.error(e); } finally { setSessionLoading(false); }
  };

  useEffect(() => {
    if (currentUser) {
        fetchData(); checkPendingRequests();
        if (currentUser.role === 'admin' || realAdminUser?.role === 'admin') fetchAdminData();
    }
  }, [currentUser]);

  const canEdit = !isFuture(selectedDate);
  const myWorkouts = useMemo(() => workouts.filter(w => isSameDay(parseLocalDate(w.date), selectedDate)), [workouts, selectedDate]);
  const friendsWorkoutsForDate = useMemo(() => activeFriends.flatMap(f => (friendsWorkouts.find(fw => fw.userId === f.userId)?.workouts || []).filter(w => isSameDay(parseLocalDate(w.date), selectedDate)).map(w => ({ ...w, _friendColor: f.color, _friendId: f.userId, _friendName: f.name }))), [activeFriends, friendsWorkouts, selectedDate]);

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
    const [wData, pData] = await Promise.all([supabase.from('workouts').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: true }), supabase.from('workout_plans').select('*').eq('user_id', currentUser.id)]);
    if (wData.data) setWorkouts(wData.data as Workout[]);
    if (pData.data) setPlans(pData.data as WorkoutPlan[]);
  };

  const handleToggleFriend = async (friendId: string, friendName: string, color: string) => {
    if (activeFriends.find(f => f.userId === friendId)) setActiveFriends(prev => prev.filter(f => f.userId !== friendId));
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
    if (existingWorkout) {
        const updatedData = { ...existingWorkout.structured_data, exercises: [...existingWorkout.structured_data.exercises, ...data.exercises], notes: (existingWorkout.structured_data.notes || '') + (data.notes ? `\n${data.notes}` : '') };
        setWorkouts(prev => prev.map(w => w.id === existingWorkout.id ? { ...w, structured_data: updatedData } : w));
        await supabase.from('workouts').update({ structured_data: updatedData, user_weight: currentUser.weight || 80 }).eq('id', existingWorkout.id);
    } else {
        const { data: inserted } = await supabase.from('workouts').insert({ user_id: currentUser.id, date: dateToSave, structured_data: data, source: 'web', user_weight: currentUser.weight || 80 }).select().single();
        if (inserted) setWorkouts(prev => [...prev, inserted as Workout]);
    }
  };

  const confirmDeleteWorkout = async () => {
    if (!deleteWorkoutId) return;
    setWorkouts(prev => prev.filter(w => w.id !== deleteWorkoutId));
    await supabase.from('workouts').delete().eq('id', deleteWorkoutId);
    setDeleteWorkoutId(null);
  };

  const confirmDeletePlan = async () => {
    if (!deletePlanId) return;
    setPlans(prev => prev.filter(p => p.id !== deletePlanId));
    await supabase.from('workout_plans').delete().eq('id', deletePlanId);
    setDeletePlanId(null);
  };

  const handleSavePlan = async (plan: WorkoutPlan) => {
    if (!currentUser) return;
    const payload = { name: plan.name, exercises: plan.exercises, user_id: currentUser.id };
    const { data } = await supabase.from('workout_plans').insert(payload).select().single();
    if (data) setPlans(prev => [...prev, data as WorkoutPlan]);
  };

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

      <AppHeader currentUser={currentUser} pendingRequestsCount={pendingRequestsCount} activeFriendsCount={activeFriends.length} onOpenSocial={() => setShowSocialModal(true)} onOpenPR={() => { setSelectedHistoryExercise(null); setShowPRModal(true); }} onOpenMonthly={() => setShowMonthlySummary(true)} onOpenProfile={() => setShowProfileModal(true)} />

      <main className="max-w-md mx-auto px-4 pt-24 space-y-6">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2">
             <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/30 px-3 py-1.5 rounded-full shrink-0"><div className="w-5 h-5 rounded-full bg-primary text-black text-[10px] flex items-center justify-center font-bold">{currentUser.name.charAt(0).toUpperCase()}</div><span className="text-xs font-black text-primary">Me</span></div>
             {activeFriends.map(f => <div key={f.userId} className="flex items-center gap-1.5 bg-surfaceHighlight border px-3 py-1.5 rounded-full shrink-0" style={{ borderColor: `${f.color}30` }}><div className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold" style={{ backgroundColor: f.color, color: '#000' }}>{f.name.charAt(0).toUpperCase()}</div><span className="text-xs font-black" style={{ color: f.color }}>{f.name}</span></div>)}
        </div>
        
        <CalendarView viewDate={viewDate} onViewDateChange={setViewDate} workouts={workouts} selectedFriendsWorkouts={activeFriends.map(f => ({ userId: f.userId, color: f.color, workouts: friendsWorkouts.find(fw => fw.userId === f.userId)?.workouts || [] }))} selectedDate={selectedDate} onSelectDate={setSelectedDate} onSummaryClick={() => {}} />
        
        {activeFriends.length > 0 && (
            <section><button onClick={() => setShowArenaModal(true)} className="w-full bg-zinc-900 border border-white/5 p-4 rounded-[2rem] flex items-center justify-between shadow-lg"><div className="flex items-center gap-3"><div className="p-2 bg-primary/10 rounded-full border border-primary/20"><Swords className="w-5 h-5 text-primary" /></div><div className="text-left"><div className="text-sm font-black text-white italic">{t('enter_arena')}</div><div className="text-[10px] text-zinc-500 font-mono uppercase">{activeFriends.length} {t('opponents')}</div></div></div><div className="text-primary text-[10px] font-black">{t('judge_me')} &rarr;</div></button></section>
        )}

        <section className="space-y-4">
          <div className="flex items-center justify-between mb-1 px-2">
            <h2 className="text-[10px] font-black text-zinc-500 tracking-[0.2em] flex items-center gap-2 uppercase italic"><Activity className="w-3.5 h-3.5 text-primary" /> {isSameDay(selectedDate, new Date()) ? t('todays_log') : format(selectedDate, 'MMM do', { locale: es }).toUpperCase()}</h2>
          </div>
          
          {groupedLogs.length === 0 ? <div className="py-12 text-center border-2 border-dashed border-border/30 rounded-[2.5rem] bg-surfaceHighlight/10 text-subtext text-[10px] font-black uppercase tracking-widest">{t('no_activity')}</div> : (
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
                          {group.isMe && canEdit && <button onClick={() => setDeleteWorkoutId(w.id)} className="p-1 text-zinc-700 hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>}
                        </div>
                        <div className="space-y-3">
                          {w.structured_data.exercises.map((ex, idx) => (
                            <div key={idx} className={`p-4 rounded-2xl border transition-all ${group.isMe ? 'bg-zinc-900/40 border-white/5' : 'bg-surfaceHighlight/5 border-dashed border-border/30'}`}>
                                <div className="flex items-start justify-between w-full">
                                    <div className="flex items-center gap-3 flex-1 min-w-0" onClick={() => { if(group.isMe) { setSelectedHistoryExercise(ex.name); setShowPRModal(true); } }}>
                                        <div className="w-10 h-10 rounded-xl bg-black border border-white/10 text-zinc-500 flex items-center justify-center shrink-0">{getExerciseIcon(ex.name, catalog, "w-5 h-5")}</div>
                                        <div className="flex-1 min-w-0"><h4 className="font-black text-sm text-white uppercase italic truncate leading-tight">{ex.name}</h4><div className="text-[10px] text-zinc-600 font-mono uppercase">{ex.category || 'General'}</div></div>
                                    </div>
                                    {group.isMe && canEdit && <button onClick={() => setEditingExercise({ workoutId: w.id, exerciseIndex: idx, data: ex })} className="p-2 bg-white/5 rounded-xl text-zinc-500 hover:text-primary"><Pencil className="w-4 h-4" /></button>}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 pl-13 mt-2">{ex.sets.map((s, sI) => <div key={sI} className="bg-black/60 border border-white/10 rounded-lg px-2 py-1.5 flex items-center gap-1.5"><span className="font-mono text-xs font-black text-primary">{s.weight}</span><span className="text-[10px] text-zinc-700 font-black">×</span><span className="text-white font-mono text-xs font-black">{s.reps}</span></div>)}</div>
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
      </main>

      {canEdit && (<><div className="fixed bottom-28 left-4 z-50"><RestTimer /></div><ActionDock label={t('input_log')} onOpenUnified={() => setShowUnifiedEntry(true)} onWorkoutProcessed={handleWorkoutProcessed} /></>)}
      
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
        {showUnifiedEntry && <UnifiedEntryModal isOpen={showUnifiedEntry} onClose={() => setShowUnifiedEntry(false)} onWorkoutProcessed={handleWorkoutProcessed} pastWorkouts={workouts} plans={plans} onOpenCreatePlan={() => { setEditingPlan(null); setShowUnifiedEntry(false); setShowCreatePlan(true); }} onEditPlan={(p) => { setEditingPlan(p); setShowUnifiedEntry(false); setShowCreatePlan(true); }} onDeletePlan={(id) => setDeletePlanId(id)} />}
        {showPRModal && <PRModal isOpen={showPRModal} onClose={() => setShowPRModal(false)} workouts={workouts} initialExercise={selectedHistoryExercise} />}
        {showMonthlySummary && currentUser && <MonthlySummaryModal isOpen={showMonthlySummary} onClose={() => setShowMonthlySummary(false)} workouts={workouts} currentUser={currentUser} onSavePlan={handleSavePlan} />}
        {showCreatePlan && <CreatePlanModal isOpen={showCreatePlan} onClose={() => { setShowCreatePlan(false); setEditingPlan(null); }} initialPlan={editingPlan} onSave={async (plan) => { if (!currentUser) return; const payload = { name: plan.name, exercises: plan.exercises, user_id: currentUser.id }; if (plans.some(p => p.id === plan.id)) { await supabase.from('workout_plans').update(payload).eq('id', plan.id); setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, ...payload } : p)); } else { const { data } = await supabase.from('workout_plans').insert(payload).select().single(); if (data) setPlans(prev => [...prev, data as WorkoutPlan]); } setShowCreatePlan(false); setEditingPlan(null); }} />}
        {currentUser && showProfileModal && <ProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} user={currentUser} workouts={workouts} onUpdateUser={(u) => setCurrentUser(prev => prev ? ({ ...prev, ...u }) : null)} onLogout={async () => { await supabase.auth.signOut(); setCurrentUser(null); }} />}
        {editingExercise && <EditExerciseModal isOpen={!!editingExercise} onClose={() => setEditingExercise(null)} exercise={editingExercise.data} onSave={async (ex) => { const w = workouts.find(wr => wr.id === editingExercise.workoutId); if (!w) return; const newExs = [...w.structured_data.exercises]; newExs[editingExercise.exerciseIndex] = ex; const upd = { ...w.structured_data, exercises: newExs }; setWorkouts(prev => prev.map(wr => wr.id === editingExercise.workoutId ? { ...wr, structured_data: upd } : wr)); await supabase.from('workouts').update({ structured_data: upd }).eq('id', editingExercise.workoutId); setEditingExercise(null); }} />}
        {currentUser && showSocialModal && <SocialModal isOpen={showSocialModal} onClose={() => { setShowSocialModal(false); checkPendingRequests(); }} currentUser={currentUser} activeFriends={activeFriends.map(f => f.userId)} onToggleFriend={handleToggleFriend} />}
        {currentUser && showArenaModal && <ArenaModal isOpen={showArenaModal} onClose={() => setShowArenaModal(false)} currentUser={currentUser} friendsData={[{ userId: currentUser.id, name: currentUser.name, workouts: workouts, color: '#D4FF00' }, ...activeFriends.map(f => ({ userId: f.userId, name: f.name, workouts: friendsWorkouts.find(fw => fw.userId === f.userId)?.workouts || [], color: f.color }))] } />}
      </Suspense>
    </div>
  );
}
