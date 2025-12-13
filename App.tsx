import React, { useState, useEffect } from 'react';
import { CalendarView } from './components/CalendarView';
import { AudioRecorder } from './components/AudioRecorder';
import { ManualEntryModal } from './components/ManualEntryModal';
import { PRModal } from './components/PRModal';
import { CreatePlanModal } from './components/CreatePlanModal';
import { EditExerciseModal } from './components/EditExerciseModal';
import { LoginScreen } from './components/LoginScreen';
import { AdminDashboard } from './components/AdminDashboard';
import { ProfileModal } from './components/ProfileModal';
import { Workout, WorkoutData, WorkoutPlan, Exercise, User, UserRole } from './types';
import { supabase, getCurrentProfile } from './services/supabase';
import { format, isSameDay, isFuture } from 'date-fns';
import { getExerciseIcon, AppLogo } from './utils';
import { 
  Trophy,
  Trash2,
  AlertTriangle,
  Plus,
  Zap,
  Pencil,
  Clock,
  EyeOff,
  MoreVertical,
  Activity,
  Calendar,
  ChevronRight,
  TrendingUp,
  Keyboard
} from 'lucide-react';
import { clsx } from 'clsx';

export default function App() {
  // --- AUTH STATE ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [realAdminUser, setRealAdminUser] = useState<User | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  // --- APP STATE ---
  const [viewDate, setViewDate] = useState(new Date()); 
  const [selectedDate, setSelectedDate] = useState(new Date()); 
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  
  // --- ADMIN STATE ---
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allWorkouts, setAllWorkouts] = useState<Workout[]>([]);
  
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [showPRModal, setShowPRModal] = useState(false);
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedHistoryExercise, setSelectedHistoryExercise] = useState<string | null>(null);
  
  // Editing State
  const [editingExercise, setEditingExercise] = useState<{ workoutId: string; exerciseIndex: number; data: Exercise; } | null>(null);
  const [editingPlan, setEditingPlan] = useState<WorkoutPlan | null>(null);
  
  // Deletion States
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ workoutId: string; exerciseIndex: number; exerciseName: string; } | null>(null);
  const [deletePlanConfirmation, setDeletePlanConfirmation] = useState<{ planId: string; planName: string; } | null>(null);
  const [deleteWorkoutConfirmation, setDeleteWorkoutConfirmation] = useState<string | null>(null);

  // --- AUTH INITIALIZATION ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) fetchUserProfile(session.user.id);
      else setSessionLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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
        let userRole: UserRole = 'user';
        let userName = 'User';
        let userEmail = '';
        let userAvatar = undefined;
        let createdAt = new Date().toISOString();

        const { data: { user: authUser } } = await supabase.auth.getUser();
        
        if (authUser && authUser.id === userId) {
            userEmail = authUser.email || '';
            userName = authUser.user_metadata.name || 'User';
            
            const profile = await getCurrentProfile();
            if (profile) {
                userRole = profile.role as UserRole;
                if (profile.name) userName = profile.name;
                if (profile.avatar_url) userAvatar = profile.avatar_url;
                if (profile.created_at) createdAt = profile.created_at;
            }

            setCurrentUser({ id: userId, email: userEmail, name: userName, role: userRole, created_at: createdAt, avatar_url: userAvatar });
        }
    } catch (e) {
        console.error("Profile load error", e);
    } finally {
        setSessionLoading(false);
    }
  };

  // --- DATA LOADING ---
  useEffect(() => {
    if (currentUser) {
        fetchData();
        if (currentUser.role === 'admin' || (realAdminUser?.role === 'admin')) {
            fetchAdminData();
        }
    }
  }, [currentUser, realAdminUser]);

  const fetchAdminData = async () => {
      const { data: profiles } = await supabase.from('profiles').select('*');
      if (profiles) {
          const mappedUsers: User[] = profiles.map(p => ({
              id: p.id,
              name: p.name || 'Unknown',
              email: 'hidden@email.com',
              role: p.role || 'user',
              created_at: p.created_at || new Date().toISOString(),
              avatar_url: p.avatar_url
          }));
          setAllUsers(mappedUsers);
      }
      const { data: globalWorkouts } = await supabase.from('workouts').select('*').order('created_at', { ascending: false });
      if (globalWorkouts) setAllWorkouts(globalWorkouts as Workout[]);
  };

  const fetchData = async () => {
    if (!currentUser) return;
    setIsLoadingData(true);
    
    const { data: workoutData } = await supabase.from('workouts').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: true });
    if (workoutData) setWorkouts(workoutData as Workout[]);

    const { data: planData } = await supabase.from('workout_plans').select('*').eq('user_id', currentUser.id);
    if (planData) setPlans(planData as WorkoutPlan[]);

    setIsLoadingData(false);
  };

  // --- ACTIONS ---
  const handleLogout = async () => {
    setShowProfileModal(false);
    await supabase.auth.signOut();
    setCurrentUser(null);
    setRealAdminUser(null);
    setWorkouts([]);
    setPlans([]);
  };

  const handleUpdateUser = (updates: Partial<User>) => {
      if (currentUser) setCurrentUser({ ...currentUser, ...updates });
  };

  const handleImpersonate = (targetUserId: string) => {
      const targetUser = allUsers.find(u => u.id === targetUserId);
      if (!targetUser) return;
      if (!realAdminUser) setRealAdminUser(currentUser);
      setCurrentUser(targetUser);
  };

  const stopImpersonating = () => {
      if (realAdminUser) {
          setCurrentUser(realAdminUser);
          setRealAdminUser(null);
      }
  };

  const handleWorkoutProcessed = async (data: WorkoutData) => {
    if (!currentUser) return;
    if (!data.exercises || data.exercises.length === 0) {
        alert("No exercises detected.");
        return;
    }

    const dateToSave = format(selectedDate, 'yyyy-MM-dd');
    const newWorkoutPayload = { user_id: currentUser.id, date: dateToSave, structured_data: data, source: 'web' };

    const tempId = crypto.randomUUID();
    const optimisticWorkout: Workout = {
        id: tempId, user_id: currentUser.id, date: dateToSave, structured_data: data, source: 'web', created_at: new Date().toISOString()
    };
    setWorkouts(prev => [...prev, optimisticWorkout]);

    const { data: inserted, error } = await supabase.from('workouts').insert(newWorkoutPayload).select().single();
    
    if (error) {
        setWorkouts(prev => prev.filter(w => w.id !== tempId));
        alert("Failed to save.");
        return;
    }

    setWorkouts(prev => prev.map(w => w.id === tempId ? (inserted as Workout) : w));

    if (!isSameDay(selectedDate, new Date(dateToSave + 'T00:00:00'))) {
        setSelectedDate(new Date(dateToSave + 'T00:00:00'));
        setViewDate(new Date(dateToSave + 'T00:00:00'));
    }
  };

  const handleSavePlan = async (plan: WorkoutPlan) => {
    if (!currentUser) return;
    const planPayload = { name: plan.name, exercises: plan.exercises, user_id: currentUser.id };

    if (plan.id && !plan.id.startsWith('temp-') && !plan.id.startsWith('default-')) {
        const { error } = await supabase.from('workout_plans').update(planPayload).eq('id', plan.id);
        if (!error) setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, ...planPayload } : p));
    } else {
        const { data: inserted, error } = await supabase.from('workout_plans').insert(planPayload).select().single();
        if (inserted && !error) setPlans(prev => [...prev, inserted as WorkoutPlan]);
    }
    setShowCreatePlan(false);
    setEditingPlan(null);
  };

  const executeEdit = async (updatedExercise: Exercise) => {
    if (!editingExercise) return;
    const { workoutId, exerciseIndex } = editingExercise;
    const workoutToUpdate = workouts.find(w => w.id === workoutId);
    if (!workoutToUpdate) return;

    const newExercises = [...workoutToUpdate.structured_data.exercises];
    newExercises[exerciseIndex] = updatedExercise;
    const updatedStructuredData = { ...workoutToUpdate.structured_data, exercises: newExercises };

    setWorkouts(prev => prev.map(w => w.id === workoutId ? { ...w, structured_data: updatedStructuredData } : w));
    await supabase.from('workouts').update({ structured_data: updatedStructuredData }).eq('id', workoutId);
    setEditingExercise(null);
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
  
  const executeDeleteWorkout = async () => {
      if (!deleteWorkoutConfirmation) return;
      const workoutId = deleteWorkoutConfirmation;
      setWorkouts(prev => prev.filter(w => w.id !== workoutId));
      await supabase.from('workouts').delete().eq('id', workoutId);
      setDeleteWorkoutConfirmation(null);
  };

  const executeDeletePlan = async () => {
    if (!deletePlanConfirmation) return;
    const { planId } = deletePlanConfirmation;
    setPlans(prev => prev.filter(p => p.id !== planId));
    await supabase.from('workout_plans').delete().eq('id', planId);
    setDeletePlanConfirmation(null);
  };

  const handleApplyPlan = (plan: WorkoutPlan) => {
      const smartExercises: Exercise[] = plan.exercises.map(ex => {
          const normalizedName = ex.name.trim().toLowerCase();
          let lastWeight = 0;
          let found = false;
          for (const w of workouts) {
              const match = w.structured_data.exercises.find(we => we.name.trim().toLowerCase() === normalizedName);
              if (match) {
                  const maxSet = match.sets.reduce((prev, current) => (prev.weight > current.weight) ? prev : current);
                  lastWeight = maxSet.weight;
                  found = true;
                  break;
              }
          }
          if (found && lastWeight > 0) return { ...ex, sets: ex.sets.map(s => ({ ...s, weight: lastWeight })) };
          return ex;
      });
      handleWorkoutProcessed({ exercises: smartExercises, notes: `Routine: ${plan.name}` });
  };

  // --- RENDER ---
  if (sessionLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;

  if (!currentUser) return <LoginScreen />;

  if (currentUser.role === 'admin' && !realAdminUser) {
      return <AdminDashboard currentUser={currentUser} allUsers={allUsers} allWorkouts={allWorkouts} onImpersonate={handleImpersonate} onLogout={handleLogout} />;
  }

  const selectedWorkouts = workouts.filter(w => isSameDay(new Date(w.date + 'T00:00:00'), selectedDate));
  const canEdit = !isFuture(selectedDate);

  return (
    <div className="min-h-screen pb-32 relative font-sans text-text selection:bg-primary selection:text-black">
      
      {/* IMPERSONATION BANNER */}
      {realAdminUser && (
        <div className="bg-primary text-black px-4 py-3 flex items-center justify-between sticky top-0 z-50 shadow-xl">
           <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-tight">
             <EyeOff className="w-4 h-4" />
             Viewing as {currentUser.name}
           </div>
           <button onClick={stopImpersonating} className="bg-black text-white px-4 py-1.5 rounded-full text-xs font-bold hover:scale-105 transition-transform">
             Exit
           </button>
        </div>
      )}

      {/* HEADER: Floating Glass */}
      <div className="fixed top-0 left-0 right-0 z-40 px-4 py-4 pointer-events-none">
        <div className="max-w-md mx-auto pointer-events-auto">
          <header className="glass-panel rounded-full px-5 py-3 flex items-center justify-between shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/5 border border-white/10">
                 <AppLogo className="w-full h-full object-contain" />
              </div>
              <h1 className="text-lg font-bold tracking-tight text-white">
                GYM<span className="text-primary">.AI</span>
              </h1>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={() => { setSelectedHistoryExercise(null); setShowPRModal(true); }}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors text-zinc-400 hover:text-primary"
              >
                <Trophy className="w-5 h-5" />
              </button>
              
              <button onClick={() => setShowProfileModal(true)} className="ml-1">
                <div className="w-9 h-9 rounded-full bg-surface border border-white/10 p-0.5 overflow-hidden shadow-lg transition-transform hover:scale-105 active:scale-95">
                  {currentUser.avatar_url ? (
                    <img src={currentUser.avatar_url} alt="Profile" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">
                      {currentUser.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              </button>
            </div>
          </header>
        </div>
      </div>

      <main className="max-w-md mx-auto px-4 pt-24 space-y-8">
        
        {/* CALENDAR */}
        <section>
          <CalendarView 
            viewDate={viewDate}
            onViewDateChange={setViewDate}
            workouts={workouts} 
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        </section>

        {/* PLANS (Horizontal Scroll - COMPACT) */}
        {canEdit && (
          <section className="-mx-4 px-4 overflow-x-auto no-scrollbar py-1">
             <div className="flex gap-3">
                {/* CREATE NEW BUTTON */}
                <button 
                  onClick={() => { setEditingPlan(null); setShowCreatePlan(true); }}
                  className="flex flex-col items-center justify-center gap-2 w-[100px] h-[100px] rounded-2xl border border-dashed border-white/10 hover:border-primary/50 bg-white/5 hover:bg-primary/5 transition-all shrink-0 group"
                >
                   <div className="w-8 h-8 rounded-full bg-surface border border-white/10 flex items-center justify-center text-zinc-500 group-hover:text-primary group-hover:border-primary transition-all">
                     <Plus className="w-4 h-4" />
                   </div>
                   <span className="text-[10px] font-bold text-zinc-500 group-hover:text-primary tracking-wide">NEW</span>
                </button>
                
                {/* PLAN CARDS */}
                {plans.map(plan => (
                   <div
                    key={plan.id}
                    onClick={() => handleApplyPlan(plan)}
                    className="w-[120px] h-[100px] rounded-2xl bg-surfaceHighlight border border-white/5 p-3 flex flex-col justify-between shrink-0 hover:border-primary/50 transition-all cursor-pointer group shadow-lg active:scale-95 relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="bg-primary/20 text-primary text-[8px] font-bold px-1.5 py-0.5 rounded-full border border-primary/20">RUN</div>
                    </div>

                    <div>
                      <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center mb-2">
                         <Zap className="w-3 h-3 text-primary" />
                      </div>
                      <h3 className="text-xs font-bold text-white leading-tight truncate">{plan.name}</h3>
                      <p className="text-[9px] text-zinc-500 font-medium">{plan.exercises.length} Items</p>
                    </div>
                    
                    <div className="flex items-center gap-2 pt-2 border-t border-white/5 mt-auto">
                        <button 
                           onClick={(e) => { e.stopPropagation(); setEditingPlan(plan); setShowCreatePlan(true); }}
                           className="p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-white transition-colors"
                        >
                           <Pencil className="w-3 h-3" />
                        </button>
                        <button 
                           onClick={(e) => { e.stopPropagation(); setDeletePlanConfirmation({ planId: plan.id, planName: plan.name }); }}
                           className="p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-danger transition-colors ml-auto"
                        >
                           <Trash2 className="w-3 h-3" />
                        </button>
                    </div>
                  </div>
                ))}
             </div>
          </section>
        )}

        {/* WORKOUT FEED */}
        <section>
          <div className="flex items-center justify-between mb-4 px-2">
            <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              {isSameDay(selectedDate, new Date()) ? 'Today' : format(selectedDate, 'MMMM do')}
            </h2>
            <span className="text-xs font-medium text-zinc-600 bg-white/5 px-2 py-1 rounded-md">
              {selectedWorkouts.length} Logs
            </span>
          </div>

          {selectedWorkouts.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center border-2 border-dashed border-white/5 rounded-3xl bg-surface/30">
               <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4 text-zinc-700">
                  <Activity className="w-8 h-8" />
               </div>
               <p className="text-zinc-500 text-sm font-medium">No activity recorded.</p>
               {canEdit && <p className="text-zinc-600 text-xs mt-1">Record audio or add manually.</p>}
            </div>
          ) : (
            <div className="space-y-4">
              {selectedWorkouts.map((workout) => (
                <div key={workout.id} className="bg-surface rounded-3xl p-5 border border-white/5 shadow-xl relative overflow-hidden group">
                   {/* Decorative gradient blob */}
                   <div className="absolute -right-10 -top-10 w-32 h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>

                   <div className="flex items-center justify-between mb-4 relative z-10">
                      <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 bg-black/30 px-3 py-1 rounded-full border border-white/5">
                        <Clock className="w-3 h-3" />
                        {workout.created_at ? format(new Date(workout.created_at), 'HH:mm') : '--:--'}
                        <span className="w-1 h-1 bg-zinc-600 rounded-full mx-1"></span>
                        <span className="uppercase text-[10px] tracking-wider text-primary">{workout.source}</span>
                      </div>
                      
                      {canEdit && (
                         <button 
                           onClick={() => setDeleteWorkoutConfirmation(workout.id)}
                           className="p-2 text-zinc-600 hover:text-danger hover:bg-danger/10 rounded-full transition-all opacity-0 group-hover:opacity-100"
                         >
                            <Trash2 className="w-4 h-4" />
                         </button>
                      )}
                   </div>

                   {workout.structured_data.notes && (
                      <div className="mb-5 text-sm text-zinc-300 italic bg-white/5 p-3 rounded-xl border border-white/5">
                        "{workout.structured_data.notes}"
                      </div>
                   )}

                   <div className="space-y-4 relative z-10">
                      {workout.structured_data.exercises.map((ex, idx) => (
                        <div key={idx}>
                           <div className="flex items-center justify-between mb-2">
                              <div 
                                className="flex items-center gap-3 font-bold text-white text-base cursor-pointer hover:text-primary transition-colors"
                                onClick={() => { setSelectedHistoryExercise(ex.name); setShowPRModal(true); }}
                              >
                                 <div className="p-1.5 bg-white/5 rounded-lg text-zinc-400">
                                   {getExerciseIcon(ex.name, "w-4 h-4")}
                                 </div>
                                 {ex.name}
                              </div>
                              {canEdit && (
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                   <button onClick={(e) => { e.stopPropagation(); setEditingExercise({ workoutId: workout.id, exerciseIndex: idx, data: ex }); }} className="p-1.5 text-zinc-500 hover:text-white"><Pencil className="w-3.5 h-3.5" /></button>
                                   <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmation({ workoutId: workout.id, exerciseIndex: idx, exerciseName: ex.name }); }} className="p-1.5 text-zinc-500 hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                              )}
                           </div>
                           
                           <div className="flex flex-wrap gap-2 pl-9">
                              {ex.sets.map((set, sIdx) => (
                                <div key={sIdx} className="bg-black border border-white/10 rounded-lg px-3 py-1.5 flex items-baseline gap-1.5 shadow-sm">
                                   <span className="text-primary font-bold font-mono text-sm">{set.weight}</span>
                                   <span className="text-[10px] text-zinc-600 font-bold">{set.unit}</span>
                                   <span className="text-zinc-700 text-xs">✕</span>
                                   <span className="text-white font-bold font-mono text-sm">{set.reps}</span>
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

      {/* FLOATING ACTION BUTTONS */}
      {canEdit && (
        <>
          <div className="fixed bottom-6 right-24 z-50">
            <button
              onClick={() => setShowManualEntry(true)}
              className="w-14 h-14 bg-surface border border-white/10 hover:border-primary text-zinc-400 hover:text-white rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-90"
            >
              <Keyboard className="w-6 h-6" />
            </button>
          </div>

          <AudioRecorder onWorkoutProcessed={handleWorkoutProcessed} />
        </>
      )}
      
      {/* MODALS */}
      <ManualEntryModal isOpen={showManualEntry} onClose={() => setShowManualEntry(false)} onWorkoutProcessed={handleWorkoutProcessed} />
      <PRModal isOpen={showPRModal} onClose={() => setShowPRModal(false)} workouts={workouts} initialExercise={selectedHistoryExercise} />
      <CreatePlanModal isOpen={showCreatePlan} onClose={() => setShowCreatePlan(false)} onSave={handleSavePlan} initialPlan={editingPlan} />
      {currentUser && <ProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} user={currentUser} totalWorkouts={workouts.length} onUpdateUser={handleUpdateUser} onLogout={handleLogout} />}
      {editingExercise && <EditExerciseModal isOpen={!!editingExercise} onClose={() => setEditingExercise(null)} exercise={editingExercise.data} onSave={executeEdit} />}

      {/* CONFIRMATION DIALOGS (Styled Modern) */}
      {[deleteConfirmation, deleteWorkoutConfirmation, deletePlanConfirmation].map((conf, i) => {
         if (!conf) return null;
         const title = deleteConfirmation ? "Delete Exercise?" : deletePlanConfirmation ? "Delete Plan?" : "Delete Workout?";
         const desc = deleteConfirmation ? "This set will be removed." : deletePlanConfirmation ? "Routine will be lost." : "Entire log will be deleted.";
         const action = i === 0 ? executeDeleteExercise : i === 1 ? executeDeleteWorkout : executeDeletePlan;
         const close = i === 0 ? () => setDeleteConfirmation(null) : i === 1 ? () => setDeleteWorkoutConfirmation(null) : () => setDeletePlanConfirmation(null);

         return (
            <div key={i} className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
               <div className="bg-surface border border-white/10 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                  <div className="w-12 h-12 bg-danger/10 text-danger rounded-full flex items-center justify-center mb-4"><AlertTriangle className="w-6 h-6" /></div>
                  <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
                  <p className="text-zinc-500 text-sm mb-6">{desc}</p>
                  <div className="flex gap-3">
                     <button onClick={close} className="flex-1 py-3 rounded-xl font-bold text-sm bg-white/5 hover:bg-white/10 text-white">Cancel</button>
                     <button onClick={action} className="flex-1 py-3 rounded-xl font-bold text-sm bg-danger text-white hover:opacity-90">Delete</button>
                  </div>
               </div>
            </div>
         )
      })}

    </div>
  );
}