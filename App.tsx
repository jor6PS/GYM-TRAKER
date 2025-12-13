import React, { useState, useEffect } from 'react';
import { CalendarView } from './components/CalendarView';
import { AudioRecorder } from './components/AudioRecorder';
import { ManualEntryModal } from './components/ManualEntryModal';
import { PRModal } from './components/PRModal';
import { CreatePlanModal } from './components/CreatePlanModal';
import { EditExerciseModal } from './components/EditExerciseModal';
import { LoginScreen } from './components/LoginScreen';
import { AdminDashboard } from './components/AdminDashboard';
import { Workout, WorkoutData, WorkoutPlan, Exercise, User, UserRole } from './types';
import { supabase, getCurrentProfile } from './services/supabase';
import { format, isSameDay, subDays, isFuture } from 'date-fns';
import { getExerciseIcon } from './utils';
import { 
  Dumbbell, 
  Calendar as CalendarIcon, 
  Info, 
  Keyboard, 
  Trophy,
  ExternalLink,
  Trash2,
  AlertTriangle,
  Plus,
  Zap,
  Pencil,
  Clock,
  LogOut,
  Shield,
  ArrowLeft,
  Loader2,
  EyeOff
} from 'lucide-react';

// --- HARDCODED ADMIN LIST FOR DEV ENVIRONMENT ---
const ADMIN_EMAILS = [
  'admin@gymtracker.ai',
  'admin:hackergymiatetr4k30!!', 
  'tu_email_real@ejemplo.com'
];

export default function App() {
  // --- AUTH STATE ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  // Store the original admin session when impersonating
  const [realAdminUser, setRealAdminUser] = useState<User | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  // --- APP STATE ---
  const [currentDate, setCurrentDate] = useState(new Date()); 
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
  const [selectedHistoryExercise, setSelectedHistoryExercise] = useState<string | null>(null);
  
  // Editing State
  const [editingExercise, setEditingExercise] = useState<{ workoutId: string; exerciseIndex: number; data: Exercise; } | null>(null);
  const [editingPlan, setEditingPlan] = useState<WorkoutPlan | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ workoutId: string; exerciseIndex: number; exerciseName: string; } | null>(null);
  const [deletePlanConfirmation, setDeletePlanConfirmation] = useState<{ planId: string; planName: string; } | null>(null);

  // --- AUTH INITIALIZATION ---
  useEffect(() => {
    // 1. Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        fetchUserProfile(session.user.id);
      } else {
        setSessionLoading(false);
      }
    });

    // 2. Listen for changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        // If we are impersonating, do not refetch profile on auth change unless it's a real logout
        if (!realAdminUser) {
           fetchUserProfile(session.user.id);
        }
      } else {
        setCurrentUser(null);
        setRealAdminUser(null);
        setSessionLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [realAdminUser]); // Add dependency to prevent overwriting impersonation

  const fetchUserProfile = async (userId: string) => {
    try {
        let userRole: UserRole = 'user';
        let userName = 'User';
        let userEmail = '';
        let createdAt = new Date().toISOString();

        // 1. Get basic auth data
        const { data: { user: authUser } } = await supabase.auth.getUser();
        
        if (authUser && authUser.id === userId) {
            userEmail = authUser.email || '';
            userName = authUser.user_metadata.name || 'User';
            
            // 2. Try to get DB profile
            const profile = await getCurrentProfile();
            if (profile) {
                userRole = profile.role as UserRole;
                // If DB name exists, use it
                if (profile.name) userName = profile.name;
            }

            // 3. DEV OVERRIDE: Force Admin if email matches secret or list
            const specialKey = 'admin:hackergymiatetr4k30!!';
            if (userEmail.includes(specialKey) || ADMIN_EMAILS.includes(userEmail) || userEmail === specialKey) {
                userRole = 'admin';
                console.log("DEV MODE: Admin Override Activated for", userEmail);
            }

            setCurrentUser({
                id: userId,
                email: userEmail,
                name: userName,
                role: userRole,
                created_at: createdAt
            });
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
        
        // If Admin, fetch admin data
        // We check realAdminUser too, so if an admin is impersonating, we don't fetch admin data again
        // but we do fetch it if we are naturally an admin
        const isAdmin = currentUser.role === 'admin' || (realAdminUser?.role === 'admin');
        if (isAdmin) {
            fetchAdminData();
        }
    }
  }, [currentUser, realAdminUser]);

  const fetchAdminData = async () => {
      // 1. Fetch All Profiles (Simulating Admin Access)
      const { data: profiles } = await supabase.from('profiles').select('*');
      if (profiles) {
          // Map profiles to User type
          const mappedUsers: User[] = profiles.map(p => ({
              id: p.id,
              name: p.name || 'Unknown',
              email: 'hidden@email.com',
              role: p.role || 'user',
              created_at: p.created_at || new Date().toISOString()
          }));
          setAllUsers(mappedUsers);
      }

      // 2. Fetch All Workouts
      const { data: globalWorkouts } = await supabase.from('workouts').select('*').order('created_at', { ascending: false });
      if (globalWorkouts) {
          setAllWorkouts(globalWorkouts as Workout[]);
      }
  };

  const fetchData = async () => {
    if (!currentUser) return;
    setIsLoadingData(true);
    
    // Fetch Workouts for CURRENT VIEWING USER
    const { data: workoutData, error: wError } = await supabase
        .from('workouts')
        .select('*')
        .eq('user_id', currentUser.id) // Filter by the current (or impersonated) user
        .order('created_at', { ascending: true });

    if (workoutData) setWorkouts(workoutData as Workout[]);
    if (wError) console.error("Error fetching workouts:", wError);

    // Fetch Plans
    const { data: planData, error: pError } = await supabase
        .from('workout_plans')
        .select('*')
        .eq('user_id', currentUser.id);
    
    if (planData) setPlans(planData as WorkoutPlan[]);
    if (pError) console.error("Error fetching plans:", pError);

    setIsLoadingData(false);
  };

  // --- AUTH HANDLERS ---
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setRealAdminUser(null);
    setWorkouts([]);
    setPlans([]);
  };

  // --- ADMIN ACTIONS ---
  const handleImpersonate = (targetUserId: string) => {
      const targetUser = allUsers.find(u => u.id === targetUserId);
      if (!targetUser) return;

      // Save the real admin identity if not already saved
      if (!realAdminUser) {
          setRealAdminUser(currentUser);
      }

      // Switch identity
      setCurrentUser(targetUser);
      // Trigger data reload via useEffect
  };

  const stopImpersonating = () => {
      if (realAdminUser) {
          setCurrentUser(realAdminUser);
          setRealAdminUser(null);
      }
  };

  // --- LOGIC ---

  const handleWorkoutProcessed = async (data: WorkoutData) => {
    if (!currentUser) return;

    const dateToSave = format(selectedDate, 'yyyy-MM-dd');
    
    const newWorkoutPayload = {
      user_id: currentUser.id,
      date: dateToSave,
      structured_data: data,
      source: 'web'
    };

    // Optimistic Update
    const tempId = crypto.randomUUID();
    const optimisticWorkout: Workout = {
        id: tempId,
        user_id: currentUser.id,
        date: dateToSave,
        structured_data: data,
        source: 'web',
        created_at: new Date().toISOString()
    };
    setWorkouts(prev => [...prev, optimisticWorkout]);

    // DB Insert
    const { data: inserted, error } = await supabase
        .from('workouts')
        .insert(newWorkoutPayload)
        .select()
        .single();
    
    if (error) {
        console.error("Error saving workout:", error);
        // Revert optimistic update
        setWorkouts(prev => prev.filter(w => w.id !== tempId));
        alert("Failed to save workout. (If impersonating, check RLS policies)");
        return;
    }

    // Replace optimistic with real
    setWorkouts(prev => prev.map(w => w.id === tempId ? (inserted as Workout) : w));

    if (!isSameDay(selectedDate, new Date(dateToSave + 'T00:00:00'))) {
        setSelectedDate(new Date(dateToSave + 'T00:00:00'));
        setViewDate(new Date(dateToSave + 'T00:00:00'));
    }
  };

  const handleSavePlan = async (plan: WorkoutPlan) => {
    if (!currentUser) return;
    
    const planPayload = {
        name: plan.name,
        exercises: plan.exercises,
        user_id: currentUser.id
    };

    if (plan.id && !plan.id.startsWith('temp-') && !plan.id.startsWith('default-')) {
        // Update existing
        const { error } = await supabase
            .from('workout_plans')
            .update(planPayload)
            .eq('id', plan.id);
        
        if (!error) {
            setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, ...planPayload } : p));
        }
    } else {
        // Create new
        const { data: inserted, error } = await supabase
            .from('workout_plans')
            .insert(planPayload)
            .select()
            .single();
        
        if (inserted && !error) {
            setPlans(prev => [...prev, inserted as WorkoutPlan]);
        }
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
    
    const updatedStructuredData = {
        ...workoutToUpdate.structured_data,
        exercises: newExercises
    };

    // Optimistic
    setWorkouts(prev => prev.map(w => w.id === workoutId ? { ...w, structured_data: updatedStructuredData } : w));

    // DB Update
    await supabase
        .from('workouts')
        .update({ structured_data: updatedStructuredData })
        .eq('id', workoutId);
        
    setEditingExercise(null);
  };

  const executeDelete = async () => {
    if (!deleteConfirmation) return;
    
    const { workoutId, exerciseIndex } = deleteConfirmation;
    const workout = workouts.find(w => w.id === workoutId);
    if (!workout) return;

    const newExercises = [...workout.structured_data.exercises];
    newExercises.splice(exerciseIndex, 1);

    if (newExercises.length === 0) {
        // Delete entire workout if empty
        setWorkouts(prev => prev.filter(w => w.id !== workoutId));
        await supabase.from('workouts').delete().eq('id', workoutId);
    } else {
        const updatedData = { ...workout.structured_data, exercises: newExercises };
        setWorkouts(prev => prev.map(w => w.id === workoutId ? { ...w, structured_data: updatedData } : w));
        await supabase
            .from('workouts')
            .update({ structured_data: updatedData })
            .eq('id', workoutId);
    }

    setDeleteConfirmation(null);
  };

  const executeDeletePlan = async () => {
    if (!deletePlanConfirmation) return;
    const { planId } = deletePlanConfirmation;

    setPlans(prev => prev.filter(p => p.id !== planId));
    await supabase.from('workout_plans').delete().eq('id', planId);
    
    setDeletePlanConfirmation(null);
  };

  // --- RENDER ---

  if (sessionLoading) {
      return (
          <div className="min-h-screen bg-black flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
          </div>
      );
  }

  if (!currentUser) {
    return <LoginScreen />;
  }

  // --- ADMIN DASHBOARD LOGIC ---
  if (currentUser.role === 'admin' && !realAdminUser) {
      return (
          <AdminDashboard 
            currentUser={currentUser}
            allUsers={allUsers}
            allWorkouts={allWorkouts}
            onImpersonate={handleImpersonate}
            onLogout={handleLogout}
          />
      );
  }

  // --- STANDARD APP VIEW (User Mode or Impersonation Mode) ---

  const selectedWorkouts = workouts.filter(w => isSameDay(new Date(w.date + 'T00:00:00'), selectedDate));
  const canEdit = !isFuture(selectedDate);

  const requestDeletePlan = (e: React.MouseEvent, planId: string, planName: string) => {
    e.stopPropagation();
    setDeletePlanConfirmation({ planId, planName });
  };
  const handleEditPlan = (e: React.MouseEvent, plan: WorkoutPlan) => {
    e.stopPropagation();
    setEditingPlan(plan);
    setShowCreatePlan(true);
  };
  const requestEdit = (e: React.MouseEvent, workoutId: string, exerciseIndex: number, exercise: Exercise) => {
    e.stopPropagation();
    e.preventDefault();
    setEditingExercise({ workoutId, exerciseIndex, data: exercise });
  };
  const requestDelete = (e: React.MouseEvent, workoutId: string, exerciseIndex: number, exerciseName: string) => {
    e.stopPropagation();
    e.preventDefault();
    setDeleteConfirmation({ workoutId, exerciseIndex, exerciseName });
  };
  const openHistory = (exerciseName: string | null = null) => {
    setSelectedHistoryExercise(exerciseName);
    setShowPRModal(true);
  };

  const handleApplyPlan = (plan: WorkoutPlan) => {
      const smartExercises: Exercise[] = plan.exercises.map(ex => {
          const normalizedName = ex.name.trim().toLowerCase();
          let lastWeight = 0;
          let found = false;
          for (const w of workouts) {
              const match = w.structured_data.exercises.find(
                  we => we.name.trim().toLowerCase() === normalizedName
              );
              if (match) {
                  const maxSet = match.sets.reduce((prev, current) => (prev.weight > current.weight) ? prev : current);
                  lastWeight = maxSet.weight;
                  found = true;
                  break;
              }
          }
          if (found && lastWeight > 0) {
              return { ...ex, sets: ex.sets.map(s => ({ ...s, weight: lastWeight })) };
          }
          return ex;
      });
      handleWorkoutProcessed({ exercises: smartExercises, notes: `Routine: ${plan.name}` });
  };

  return (
    <div className="min-h-screen pb-24 font-sans relative bg-background">
      
      {/* IMPERSONATION BANNER */}
      {realAdminUser && (
        <div className="bg-red-500 text-white px-4 py-2 flex items-center justify-between sticky top-0 z-50 shadow-lg animate-in slide-in-from-top">
           <div className="flex items-center gap-2 text-xs font-bold font-mono uppercase">
             <EyeOff className="w-4 h-4" />
             Viewing as: {currentUser.name}
           </div>
           <button 
             onClick={stopImpersonating}
             className="bg-white text-red-500 px-3 py-1 rounded text-xs font-bold uppercase hover:bg-zinc-100 transition-colors"
           >
             Exit View
           </button>
        </div>
      )}

      {/* Header */}
      <header className={`bg-background/80 backdrop-blur-md sticky ${realAdminUser ? 'top-[40px]' : 'top-0'} z-40 border-b border-white/5`}>
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-[0_0_15px_-3px_rgba(250,204,21,0.3)]">
              <Dumbbell className="w-5 h-5 text-black" />
            </div>
            <h1 className="text-lg font-bold text-text tracking-wide font-mono">
              GYM_AI
            </h1>
          </div>
          
          <div className="flex items-center gap-1">
            <button 
              onClick={() => openHistory(null)}
              className="p-2 hover:bg-white/5 rounded-full transition-all group"
              title="View Personal Records"
            >
              <Trophy className="w-4 h-4 text-zinc-500 group-hover:text-primary transition-colors" />
            </button>
            
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-white/5 rounded-full transition-all group"
              title="Logout"
            >
              <LogOut className="w-4 h-4 text-zinc-500 group-hover:text-red-500 transition-colors" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-8">
        
        {/* Calendar */}
        <section>
          <CalendarView 
            viewDate={viewDate}
            onViewDateChange={setViewDate}
            workouts={workouts} 
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        </section>

        {/* Plans */}
        {canEdit && (
          <section className="overflow-x-auto no-scrollbar pb-2 -mx-4 px-4">
             <div className="flex gap-3">
                <button 
                  onClick={() => {
                    setEditingPlan(null);
                    setShowCreatePlan(true);
                  }}
                  className="flex flex-col items-center justify-center gap-2 p-3 border border-dashed border-white/10 rounded-xl hover:border-primary/50 hover:bg-white/[0.02] transition-all shrink-0 min-w-[120px] group h-[110px]"
                >
                   <div className="w-8 h-8 rounded-full bg-zinc-900 border border-white/5 flex items-center justify-center group-hover:bg-primary group-hover:text-black group-hover:border-primary transition-all duration-300 text-zinc-600">
                     <Plus className="w-4 h-4" />
                   </div>
                   <span className="text-[9px] font-bold font-mono text-zinc-600 uppercase tracking-widest group-hover:text-primary">Create New</span>
                </button>
                
                {plans.map(plan => (
                   <div
                    key={plan.id}
                    className="group relative flex flex-col justify-between p-3 bg-zinc-900/30 border border-white/5 hover:border-white/10 rounded-xl shrink-0 min-w-[150px] transition-all duration-300 h-[110px]"
                  >
                    <div className="mb-2">
                      <div className="flex items-start justify-between">
                         <h3 className="text-xs font-bold text-white tracking-wide truncate w-28" title={plan.name}>{plan.name}</h3>
                      </div>
                      <div className="text-[9px] font-mono text-zinc-500 mt-1 flex items-center gap-1">
                        <Zap className="w-2.5 h-2.5 text-primary opacity-50" />
                        {plan.exercises.length} MOVEMENTS
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between mt-auto pt-1 border-t border-white/5">
                      <button 
                          onClick={(e) => handleEditPlan(e, plan)}
                          className="p-1.5 -ml-1.5 text-zinc-600 hover:text-white transition-colors"
                      >
                          <Pencil className="w-3 h-3" />
                      </button>
                      
                      <button 
                          onClick={() => handleApplyPlan(plan)}
                          className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-black hover:scale-110 active:scale-95 transition-all shadow-[0_0_10px_rgba(250,204,21,0.1)] hover:shadow-[0_0_15px_rgba(250,204,21,0.4)]"
                      >
                          <Plus className="w-4 h-4" />
                      </button>

                      <button 
                          onClick={(e) => requestDeletePlan(e, plan.id, plan.name)}
                          className="p-1.5 -mr-1.5 text-zinc-600 hover:text-red-500 transition-colors"
                      >
                          <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
             </div>
          </section>
        )}

        {/* Details View */}
        <section>
          <div className="flex items-center justify-between mb-6 px-1">
            <h2 className="text-xs font-bold text-zinc-500 font-mono uppercase tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
              {isSameDay(selectedDate, new Date()) ? 'Today\'s Activity' : `${format(selectedDate, 'MMM dd')} Activity`}
            </h2>
            {selectedWorkouts.length > 0 && (
              <span className="text-[10px] font-mono text-zinc-600">
                {selectedWorkouts.length} ENTRIES
              </span>
            )}
          </div>

          {isLoadingData ? (
             <div className="flex justify-center py-12">
                 <Loader2 className="w-6 h-6 animate-spin text-zinc-600" />
             </div>
          ) : selectedWorkouts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 bg-zinc-900/20 rounded-2xl border border-dashed border-white/5 text-center">
              <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mb-4">
                <Info className="w-5 h-5 text-zinc-600" />
              </div>
              <p className="text-zinc-500 text-sm font-mono">No logs recorded.</p>
              {canEdit ? (
                <p className="text-zinc-700 text-xs mt-2">Tap the mic or select a routine.</p>
              ) : (
                <p className="text-zinc-700 text-xs mt-2">Future date selected.</p>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {selectedWorkouts.map((workout) => (
                <div key={workout.id} className="relative pl-4 border-l border-white/10 pb-2 last:border-0 last:pb-0">
                   <div className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-background border border-primary shadow-[0_0_8px_rgba(250,204,21,0.4)]"></div>

                   <div className="flex items-center gap-3 mb-4">
                      <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-400">
                        <Clock className="w-3 h-3 text-zinc-600" />
                        {workout.created_at ? format(new Date(workout.created_at), 'HH:mm') : '--:--'}
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-zinc-500 font-mono border border-white/5 uppercase tracking-wider">
                         {workout.source}
                      </span>
                   </div>

                   <div className="bg-zinc-900/20 rounded-2xl border border-white/5 p-5 hover:border-white/10 transition-colors">
                      {workout.structured_data.notes && (
                        <div className="mb-4 text-xs text-zinc-500 italic font-mono pl-2 border-l border-primary/30">
                          "{workout.structured_data.notes}"
                        </div>
                      )}

                      <div className="space-y-6">
                        {workout.structured_data.exercises.map((ex, idx) => (
                          <div key={idx} className="group">
                            <div className="flex items-center justify-between mb-3">
                                <button 
                                  onClick={() => openHistory(ex.name)}
                                  className="flex items-center gap-3 text-left group-hover:opacity-100 transition-opacity"
                                >
                                  <div className="text-zinc-500 group-hover:text-primary transition-colors">
                                    {getExerciseIcon(ex.name, "w-4 h-4")}
                                  </div>
                                  <h3 className="font-bold text-zinc-200 text-sm tracking-wide group-hover:text-primary transition-colors">
                                    {ex.name}
                                  </h3>
                                </button>
                                
                                {canEdit && (
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      type="button"
                                      onClick={(e) => requestEdit(e, workout.id, idx, ex)}
                                      className="p-1.5 text-zinc-600 hover:text-white transition-colors"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => requestDelete(e, workout.id, idx, ex.name)}
                                      className="p-1.5 text-zinc-600 hover:text-red-500 transition-colors"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                            </div>
                            
                            <div className="flex flex-wrap gap-2 pl-7">
                              {ex.sets.map((set, sIdx) => (
                                <div key={sIdx} className="flex items-baseline gap-1 bg-white/[0.02] border border-white/5 rounded-md px-2 py-1 text-xs hover:border-primary/30 transition-colors cursor-default">
                                  <span className="font-bold text-zinc-300 font-mono">{set.weight}</span>
                                  <span className="text-[10px] text-zinc-600">{set.unit}</span>
                                  <span className="text-zinc-600 mx-1">×</span>
                                  <span className="text-zinc-400 font-mono">{set.reps}</span>
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

      {/* Floating Actions */}
      {canEdit && (
        <>
          <div className="fixed bottom-6 right-24 z-50">
            <button
              onClick={() => setShowManualEntry(true)}
              className="w-12 h-12 bg-black hover:bg-zinc-900 border border-white/10 hover:border-primary rounded-2xl flex items-center justify-center shadow-lg transition-all active:scale-95 text-zinc-400 hover:text-primary"
            >
              <Keyboard className="w-5 h-5" />
            </button>
          </div>

          <AudioRecorder onWorkoutProcessed={handleWorkoutProcessed} />
        </>
      )}
      
      <ManualEntryModal 
        isOpen={showManualEntry} 
        onClose={() => setShowManualEntry(false)}
        onWorkoutProcessed={handleWorkoutProcessed}
      />

      <PRModal 
        isOpen={showPRModal} 
        onClose={() => setShowPRModal(false)} 
        workouts={workouts} 
        initialExercise={selectedHistoryExercise}
      />
      
      <CreatePlanModal 
        isOpen={showCreatePlan} 
        onClose={() => setShowCreatePlan(false)} 
        onSave={handleSavePlan} 
        initialPlan={editingPlan}
      />

      {editingExercise && (
        <EditExerciseModal 
          isOpen={!!editingExercise}
          onClose={() => setEditingExercise(null)}
          exercise={editingExercise.data}
          onSave={executeEdit}
        />
      )}

      {deleteConfirmation && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl relative animate-in zoom-in-95 duration-200">
             <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                   <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="text-md font-bold text-white tracking-wide">Delete Exercise?</h3>
                </div>
             </div>
             
             <p className="text-sm text-zinc-500 mb-6 leading-relaxed">
               This will remove <span className="text-zinc-300 font-bold">{deleteConfirmation.exerciseName}</span> from this workout log.
             </p>

             <div className="flex gap-3 justify-end">
                <button 
                   onClick={() => setDeleteConfirmation(null)}
                   className="px-4 py-2 rounded-lg text-xs font-bold text-zinc-500 hover:text-white transition-colors uppercase tracking-wide"
                >
                  Cancel
                </button>
                <button 
                   onClick={executeDelete}
                   className="px-4 py-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white text-xs font-bold uppercase tracking-wide transition-all shadow-lg active:scale-95"
                >
                  Delete
                </button>
             </div>
          </div>
        </div>
      )}

      {deletePlanConfirmation && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl relative animate-in zoom-in-95 duration-200">
             <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                   <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="text-md font-bold text-white tracking-wide">Delete Routine?</h3>
                </div>
             </div>
             
             <p className="text-sm text-zinc-500 mb-6 leading-relaxed">
               Permanently delete <span className="text-zinc-300 font-bold">{deletePlanConfirmation.planName}</span>?
             </p>

             <div className="flex gap-3 justify-end">
                <button 
                   onClick={() => setDeletePlanConfirmation(null)}
                   className="px-4 py-2 rounded-lg text-xs font-bold text-zinc-500 hover:text-white transition-colors uppercase tracking-wide"
                >
                  Cancel
                </button>
                <button 
                   onClick={executeDeletePlan}
                   className="px-4 py-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white text-xs font-bold uppercase tracking-wide transition-all shadow-lg active:scale-95"
                >
                  Delete
                </button>
             </div>
          </div>
        </div>
      )}

    </div>
  );
}