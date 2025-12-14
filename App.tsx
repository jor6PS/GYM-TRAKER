import React, { useState, useEffect, Suspense, lazy } from 'react';
import { CalendarView } from './components/CalendarView';
import { AudioRecorder } from './components/AudioRecorder';
import { RestTimer } from './components/RestTimer';
import { LoginScreen } from './components/LoginScreen';
import { Workout, WorkoutData, WorkoutPlan, Exercise, User, UserRole } from './types';
import { supabase, getCurrentProfile, getFriendWorkouts, getPendingRequestsCount } from './services/supabase';
import { format, isSameDay, isFuture } from 'date-fns';
import es from 'date-fns/locale/es';
import enUS from 'date-fns/locale/en-US';
import { getExerciseIcon, AppLogo } from './utils';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { 
  Trophy,
  Trash2,
  AlertTriangle,
  Plus,
  Zap,
  Pencil,
  Clock,
  EyeOff,
  Activity,
  Keyboard,
  Dumbbell,
  Gauge,
  Users,
  Swords,
  X,
  Loader2
} from 'lucide-react';
import { clsx } from 'clsx';

// --- LAZY LOADED COMPONENTS (Code Splitting) ---
// Reduces initial bundle size by loading heavy components only when needed
const AdminDashboard = lazy(() => import('./components/AdminDashboard').then(module => ({ default: module.AdminDashboard })));
const ManualEntryModal = lazy(() => import('./components/ManualEntryModal').then(module => ({ default: module.ManualEntryModal })));
const PRModal = lazy(() => import('./components/PRModal').then(module => ({ default: module.PRModal })));
const CreatePlanModal = lazy(() => import('./components/CreatePlanModal').then(module => ({ default: module.CreatePlanModal })));
const EditExerciseModal = lazy(() => import('./components/EditExerciseModal').then(module => ({ default: module.EditExerciseModal })));
const ProfileModal = lazy(() => import('./components/ProfileModal').then(module => ({ default: module.ProfileModal })));
const MonthlySummaryModal = lazy(() => import('./components/MonthlySummaryModal').then(module => ({ default: module.MonthlySummaryModal })));
const SocialModal = lazy(() => import('./components/SocialModal').then(module => ({ default: module.SocialModal })));
const ArenaModal = lazy(() => import('./components/ArenaModal').then(module => ({ default: module.ArenaModal })));

// Helper for consistent date parsing (forces Local Time instead of UTC)
const parseLocalDate = (dateStr: string) => {
    if (!dateStr) return new Date();
    // Appends T00:00:00 to force local time interpretation in most browsers
    // preventing the "day before" bug due to timezone shifts.
    return new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
};

// Wrapper to provide Context to the App Component
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

  // --- AUTH STATE ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [realAdminUser, setRealAdminUser] = useState<User | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  // --- APP STATE ---
  const [viewDate, setViewDate] = useState(new Date()); 
  const [selectedDate, setSelectedDate] = useState(new Date()); 
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  
  // --- SOCIAL STATE ---
  // Updated to store name
  const [activeFriends, setActiveFriends] = useState<{ userId: string; name: string; color: string; }[]>([]);
  const [friendsWorkouts, setFriendsWorkouts] = useState<{ userId: string; workouts: Workout[] }[]>([]);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  // --- THEME STATE ---
  // Default to Dark Mode as per design request
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return true;
  });
  
  // --- ADMIN STATE ---
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allWorkouts, setAllWorkouts] = useState<Workout[]>([]);
  
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [showPRModal, setShowPRModal] = useState(false);
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showMonthlySummary, setShowMonthlySummary] = useState(false);
  const [showSocialModal, setShowSocialModal] = useState(false);
  const [showArenaModal, setShowArenaModal] = useState(false);
  const [selectedHistoryExercise, setSelectedHistoryExercise] = useState<string | null>(null);
  
  // Editing State
  const [editingExercise, setEditingExercise] = useState<{ workoutId: string; exerciseIndex: number; data: Exercise; } | null>(null);
  const [editingPlan, setEditingPlan] = useState<WorkoutPlan | null>(null);
  
  // Deletion States
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ workoutId: string; exerciseIndex: number; exerciseName: string; } | null>(null);
  const [deletePlanConfirmation, setDeletePlanConfirmation] = useState<{ planId: string; planName: string; } | null>(null);
  const [deleteWorkoutConfirmation, setDeleteWorkoutConfirmation] = useState<string | null>(null);

  // --- THEME TOGGLE ---
  const toggleTheme = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    if (newIsDark) {
      document.documentElement.classList.add('dark');
      localStorage.theme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.theme = 'light';
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === 'es' ? 'en' : 'es');
  };

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
        checkPendingRequests();
        if (currentUser.role === 'admin' || (realAdminUser?.role === 'admin')) {
            fetchAdminData();
        }
    }
  }, [currentUser, realAdminUser]);

  const checkPendingRequests = async () => {
      if (!currentUser) return;
      const count = await getPendingRequestsCount();
      setPendingRequestsCount(count);
  };

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

  // --- SOCIAL LOGIC ---
  const handleToggleFriend = async (friendId: string, friendName: string, color: string) => {
    // Check if already active
    const isActive = activeFriends.find(f => f.userId === friendId);
    
    if (isActive) {
        // Remove
        setActiveFriends(prev => prev.filter(f => f.userId !== friendId));
    } else {
        // Add
        // Fetch data immediately
        const wData = await getFriendWorkouts([friendId]);
        
        // Update state
        setFriendsWorkouts(prev => {
            // Remove old data for this user if exists to avoid dupes
            const filtered = prev.filter(p => p.userId !== friendId);
            return [...filtered, { userId: friendId, workouts: wData }];
        });
        
        setActiveFriends(prev => [...prev, { userId: friendId, name: friendName, color }]);
    }
  };

  // Prepare data for Calendar
  const calendarFriendsData = activeFriends.map(f => ({
      userId: f.userId,
      color: f.color,
      workouts: friendsWorkouts.find(fw => fw.userId === f.userId)?.workouts || []
  }));

  // Prepare data for Arena (Include current user with REAL NAME)
  const arenaParticipants = [
      { userId: currentUser?.id || 'me', name: currentUser?.name || 'Me', workouts: workouts, color: '#D4FF00' },
      ...activeFriends.map(f => {
          return {
              userId: f.userId,
              name: f.name, // Now using the correct name stored in state
              workouts: friendsWorkouts.find(fw => fw.userId === f.userId)?.workouts || [],
              color: f.color
          };
      })
  ];

  // --- ACTIONS ---
  const handleLogout = async () => {
    setShowProfileModal(false);
    await supabase.auth.signOut();
    setCurrentUser(null);
    setRealAdminUser(null);
    setWorkouts([]);
    setPlans([]);
    setActiveFriends([]);
    setFriendsWorkouts([]);
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

    if (!isSameDay(selectedDate, parseLocalDate(dateToSave))) {
        const newDate = parseLocalDate(dateToSave);
        setSelectedDate(newDate);
        setViewDate(newDate);
    }
  };

  const handleSavePlan = async (plan: WorkoutPlan) => {
    if (!currentUser) return;
    const planPayload = { name: plan.name, exercises: plan.exercises, user_id: currentUser.id };

    const isExistingPlan = plans.some(p => p.id === plan.id);

    if (isExistingPlan) {
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

  // Lazy load Admin Dashboard
  if (currentUser.role === 'admin' && !realAdminUser) {
      return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
           <AdminDashboard currentUser={currentUser} allUsers={allUsers} allWorkouts={allWorkouts} onImpersonate={handleImpersonate} onLogout={handleLogout} />
        </Suspense>
      );
  }

  // Use parseLocalDate to avoid UTC mismatches
  const selectedWorkouts = workouts.filter(w => isSameDay(parseLocalDate(w.date), selectedDate));
  
  // Also get selected friends workouts for this day
  const friendsSelectedWorkouts = calendarFriendsData.flatMap(fd => {
      const daysWorkouts = fd.workouts.filter(w => isSameDay(parseLocalDate(w.date), selectedDate));
      return daysWorkouts.map(w => ({ ...w, _friendColor: fd.color, _friendId: fd.userId }));
  });

  const canEdit = !isFuture(selectedDate);

  return (
    <div className="min-h-screen pb-40 relative font-sans text-text selection:bg-primary selection:text-black transition-colors duration-300">
      
      {/* IMPERSONATION BANNER */}
      {realAdminUser && (
        <div className="bg-primary text-black px-4 py-3 flex items-center justify-between sticky top-0 z-50 shadow-xl">
           <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-tight">
             <EyeOff className="w-4 h-4" />
             {t('viewing_as')} {currentUser.name}
           </div>
           <button onClick={stopImpersonating} className="bg-black text-white px-4 py-1.5 rounded-full text-xs font-bold hover:scale-105 transition-transform">
             {t('exit')}
           </button>
        </div>
      )}

      {/* HEADER: Floating Glass */}
      <div className="fixed top-0 left-0 right-0 z-40 px-4 py-4 pointer-events-none">
        <div className="max-w-md mx-auto pointer-events-auto">
          <header className="glass-panel rounded-full px-5 py-3 flex items-center justify-between shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg overflow-hidden bg-surface border border-border">
                 <AppLogo className="w-full h-full object-contain" />
              </div>
              <h1 className="text-lg font-bold tracking-tight text-text">
                GYM<span className="text-primary">.AI</span>
              </h1>
            </div>
            
            <div className="flex items-center gap-1">
              
              {/* SOCIAL BUTTON */}
              <button 
                onClick={() => setShowSocialModal(true)}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surfaceHighlight transition-colors text-subtext hover:text-blue-400 relative"
              >
                <Users className="w-5 h-5" />
                {/* Pending Request Indicator (Red) has priority */}
                {pendingRequestsCount > 0 ? (
                     <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-surface"></span>
                ) : activeFriends.length > 0 && (
                     <span className="absolute top-1 right-1 w-2 h-2 bg-blue-400 rounded-full"></span>
                )}
              </button>

              <button 
                onClick={() => { setSelectedHistoryExercise(null); setShowPRModal(true); }}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surfaceHighlight transition-colors text-subtext hover:text-primary"
              >
                <Trophy className="w-5 h-5" />
              </button>
              
              <button onClick={() => setShowProfileModal(true)} className="ml-1">
                <div className="w-9 h-9 rounded-full bg-surface border border-border p-0.5 overflow-hidden shadow-lg transition-transform hover:scale-105 active:scale-95">
                  {currentUser.avatar_url ? (
                    <img src={currentUser.avatar_url} alt="Profile" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-surfaceHighlight flex items-center justify-center text-xs font-bold text-text">
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
          {/* Active Participants Strip */}
          <div className="flex items-center gap-2 mb-2 px-1 overflow-x-auto no-scrollbar">
             {/* Me */}
             <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/30 px-2 py-1 rounded-full shrink-0">
                <div className="w-5 h-5 rounded-full bg-primary text-black text-[10px] flex items-center justify-center font-bold">
                   {currentUser.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-bold text-primary">Me</span>
             </div>

             {/* Friends */}
             {activeFriends.map(friend => (
                 <div key={friend.userId} className="flex items-center gap-1.5 bg-surfaceHighlight border px-2 py-1 rounded-full shrink-0 animate-in fade-in zoom-in" style={{ borderColor: `${friend.color}50` }}>
                     <div className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold shadow-sm" style={{ backgroundColor: friend.color, color: '#000' }}>
                         {friend.name.charAt(0).toUpperCase()}
                     </div>
                     <span className="text-xs font-bold" style={{ color: friend.color }}>{friend.name}</span>
                     <button 
                        onClick={() => handleToggleFriend(friend.userId, friend.name, friend.color)}
                        className="ml-1 text-subtext hover:text-white"
                     >
                         <X className="w-3 h-3" />
                     </button>
                 </div>
             ))}
          </div>

          <CalendarView 
            viewDate={viewDate}
            onViewDateChange={setViewDate}
            workouts={workouts} 
            selectedFriendsWorkouts={calendarFriendsData}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onSummaryClick={() => setShowMonthlySummary(true)}
          />
        </section>
        
        {/* ARENA BANNER (If friends selected) */}
        {activeFriends.length > 0 && (
            <section>
                <button 
                    onClick={() => setShowArenaModal(true)}
                    className="w-full bg-gradient-to-r from-zinc-900 to-black border border-white/10 p-4 rounded-2xl flex items-center justify-between group shadow-lg"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/5 rounded-full border border-white/10 group-hover:scale-110 transition-transform">
                            <Swords className="w-5 h-5 text-primary" />
                        </div>
                        <div className="text-left">
                            <div className="text-sm font-bold text-white">Enter The Arena</div>
                            <div className="text-[10px] text-zinc-400">Compare stats with {activeFriends.length} friends</div>
                        </div>
                    </div>
                    <div className="text-primary text-xs font-bold font-mono tracking-widest group-hover:underline">JUDGE ME &rarr;</div>
                </button>
            </section>
        )}

        {/* PLANS (Horizontal Scroll - COMPACT) */}
        {canEdit && (
          <section>
             {/* Header Section for Plans - Matches 'Today' style */}
             <div className="flex items-center justify-between mb-3 px-2">
                <h2 className="text-sm font-bold text-text tracking-tight flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  {t('routines')}
                </h2>
                <span className="text-xs font-medium text-subtext bg-surface px-2 py-1 rounded-md border border-border">
                  {plans.length} {t('saved')}
                </span>
             </div>

             <div className="-mx-4 px-4 overflow-x-auto no-scrollbar py-1">
                 <div className="flex gap-3">
                    {/* CREATE NEW BUTTON */}
                    <button 
                      onClick={() => { setEditingPlan(null); setShowCreatePlan(true); }}
                      className="flex flex-col items-center justify-center gap-2 w-[100px] h-[100px] rounded-2xl border border-dashed border-border hover:border-primary/50 bg-surface hover:bg-primary/5 transition-all shrink-0 group"
                    >
                       <div className="w-8 h-8 rounded-full bg-surfaceHighlight border border-border flex items-center justify-center text-subtext group-hover:text-primary group-hover:border-primary transition-all">
                         <Plus className="w-4 h-4" />
                       </div>
                       <span className="text-[10px] font-bold text-subtext group-hover:text-primary tracking-wide">{t('new')}</span>
                    </button>
                    
                    {/* PLAN CARDS */}
                    {plans.map(plan => (
                       <div
                        key={plan.id}
                        onClick={() => handleApplyPlan(plan)}
                        className="w-[120px] h-[100px] rounded-2xl bg-surfaceHighlight border border-border p-3 flex flex-col justify-between shrink-0 hover:border-primary/50 transition-all cursor-pointer group shadow-sm hover:shadow-lg active:scale-95 relative overflow-hidden"
                      >
                        <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="bg-primary/20 text-primary text-[8px] font-bold px-1.5 py-0.5 rounded-full border border-primary/20">RUN</div>
                        </div>

                        <div>
                          <div className="w-6 h-6 rounded-full bg-surface flex items-center justify-center mb-2">
                             <Dumbbell className="w-3 h-3 text-primary" />
                          </div>
                          <h3 className="text-xs font-bold text-text leading-tight truncate">{plan.name}</h3>
                          <p className="text-[9px] text-subtext font-medium">{plan.exercises.length} Items</p>
                        </div>
                        
                        {/* UPDATE: Buttons Logic (Edit - Add - Delete) */}
                        <div className="flex items-center justify-between pt-2 border-t border-border mt-auto gap-1">
                            {/* Edit */}
                            <button 
                               onClick={(e) => { e.stopPropagation(); setEditingPlan(plan); setShowCreatePlan(true); }}
                               className="p-1.5 rounded hover:bg-surface text-subtext hover:text-text transition-colors"
                            >
                               <Pencil className="w-3 h-3" />
                            </button>
                            
                            {/* Add/Run Button */}
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleApplyPlan(plan); }}
                                className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-black hover:bg-primaryHover hover:scale-110 transition-all shadow-sm"
                            >
                                <Plus className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete */}
                            <button 
                               onClick={(e) => { e.stopPropagation(); setDeletePlanConfirmation({ planId: plan.id, planName: plan.name }); }}
                               className="p-1.5 rounded hover:bg-surface text-subtext hover:text-danger transition-colors"
                            >
                               <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                      </div>
                    ))}
                 </div>
             </div>
          </section>
        )}

        {/* WORKOUT FEED (Mine + Friends) */}
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

          {(selectedWorkouts.length === 0 && friendsSelectedWorkouts.length === 0) ? (
            <div className="py-12 flex flex-col items-center justify-center text-center border-2 border-dashed border-border rounded-3xl bg-surface/30">
               <div className="w-16 h-16 bg-surface rounded-full flex items-center justify-center mb-4 text-subtext">
                  <Activity className="w-8 h-8" />
               </div>
               <p className="text-subtext text-sm font-medium">{t('no_activity')}</p>
               {canEdit && <p className="text-subtext/70 text-xs mt-1">{t('tap_mic')}</p>}
            </div>
          ) : (
            <div className="space-y-4">
              
              {/* MY WORKOUTS */}
              {selectedWorkouts.map((workout) => (
                <div key={workout.id} className="bg-surface rounded-3xl p-5 border border-border shadow-sm relative overflow-hidden group">
                   {/* Decorative gradient blob */}
                   <div className="absolute -right-10 -top-10 w-32 h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>

                   <div className="flex items-center justify-between mb-4 relative z-10">
                      <div className="flex items-center gap-2 text-xs font-bold text-subtext bg-surfaceHighlight px-3 py-1 rounded-full border border-border">
                        <Clock className="w-3 h-3" />
                        {workout.created_at ? format(new Date(workout.created_at), 'HH:mm') : '--:--'}
                        <span className="w-1 h-1 bg-subtext rounded-full mx-1"></span>
                        <span className="uppercase text-[10px] tracking-wider text-primary">{workout.source}</span>
                      </div>
                      
                      {canEdit && (
                         <button 
                           onClick={() => setDeleteWorkoutConfirmation(workout.id)}
                           className="p-2 text-subtext hover:text-danger hover:bg-danger/10 rounded-full transition-all opacity-0 group-hover:opacity-100"
                         >
                            <Trash2 className="w-4 h-4" />
                         </button>
                      )}
                   </div>

                   {workout.structured_data.notes && (
                      <div className="mb-5 text-sm text-subtext italic bg-surfaceHighlight p-3 rounded-xl border border-border">
                        "{workout.structured_data.notes}"
                      </div>
                   )}

                   <div className="space-y-4 relative z-10">
                      {workout.structured_data.exercises.map((ex, idx) => (
                        <div key={idx}>
                           <div className="flex items-center justify-between mb-2">
                              <div 
                                className="flex items-center gap-3 font-bold text-text text-base cursor-pointer hover:text-primary transition-colors"
                                onClick={() => { setSelectedHistoryExercise(ex.name); setShowPRModal(true); }}
                              >
                                 <div className="p-1.5 bg-surfaceHighlight rounded-lg text-subtext border border-border">
                                   {getExerciseIcon(ex.name, "w-4 h-4")}
                                 </div>
                                 {ex.name}
                                 <div className="flex gap-2">
                                    <span className="text-[10px] font-mono text-subtext bg-surfaceHighlight px-1.5 py-0.5 rounded border border-border">
                                      {ex.sets.length} {t('sets')}
                                    </span>
                                    <span className="text-[10px] font-mono text-subtext bg-surfaceHighlight px-1.5 py-0.5 rounded border border-border">
                                      {ex.sets.reduce((acc, s) => acc + (s.weight * s.reps), 0).toLocaleString()} KG {t('vol')}
                                    </span>
                                 </div>
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
                                <div key={sIdx} className="bg-surfaceHighlight border border-border rounded-lg px-3 py-1.5 flex items-center gap-1.5 shadow-sm group/set relative overflow-hidden">
                                   {/* RPE Indicator Background */}
                                   {set.rpe && (
                                     <div 
                                       className={clsx(
                                          "absolute bottom-0 left-0 h-0.5 w-full",
                                          set.rpe >= 9 ? "bg-red-500" : set.rpe >= 7 ? "bg-yellow-500" : "bg-green-500"
                                       )} 
                                       title={`RPE ${set.rpe}`}
                                     />
                                   )}
                                   
                                   <span className="text-primary font-bold font-mono text-sm">{set.weight}</span>
                                   <span className="text-[10px] text-subtext font-bold">{set.unit}</span>
                                   <span className="text-subtext text-xs">✕</span>
                                   <span className="text-text font-bold font-mono text-sm">{set.reps}</span>
                                   
                                   {set.rpe && (
                                     <div className="ml-2 pl-2 border-l border-border text-[9px] font-mono text-subtext flex items-center gap-1">
                                       <Gauge className="w-2.5 h-2.5" /> {set.rpe}
                                     </div>
                                   )}
                                </div>
                              ))}
                           </div>
                        </div>
                      ))}
                   </div>
                </div>
              ))}

              {/* FRIENDS WORKOUTS */}
              {friendsSelectedWorkouts.map((workout) => (
                <div key={workout.id} className="bg-surface rounded-3xl p-5 border border-border shadow-sm relative overflow-hidden opacity-90" style={{ borderColor: `${(workout as any)._friendColor}40` }}>
                   {/* Friend Indicator */}
                   <div className="absolute top-0 right-0 px-3 py-1 text-[10px] font-bold uppercase text-black rounded-bl-xl" style={{ backgroundColor: (workout as any)._friendColor }}>
                      Friend Log
                   </div>

                   <div className="flex items-center justify-between mb-4 relative z-10">
                      <div className="flex items-center gap-2 text-xs font-bold text-subtext bg-surfaceHighlight px-3 py-1 rounded-full border border-border">
                        <Clock className="w-3 h-3" />
                        {workout.created_at ? format(new Date(workout.created_at), 'HH:mm') : '--:--'}
                      </div>
                   </div>

                   <div className="space-y-4 relative z-10">
                      {workout.structured_data.exercises.map((ex, idx) => (
                        <div key={idx}>
                           <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3 font-bold text-text text-base">
                                 <div className="p-1.5 bg-surfaceHighlight rounded-lg text-subtext border border-border">
                                   {getExerciseIcon(ex.name, "w-4 h-4")}
                                 </div>
                                 {ex.name}
                              </div>
                           </div>
                           
                           <div className="flex flex-wrap gap-2 pl-9">
                              {ex.sets.map((set, sIdx) => (
                                <div key={sIdx} className="bg-surfaceHighlight border border-border rounded-lg px-3 py-1.5 flex items-center gap-1.5 shadow-sm opacity-80">
                                   <span className="font-bold font-mono text-sm" style={{ color: (workout as any)._friendColor }}>{set.weight}</span>
                                   <span className="text-[10px] text-subtext font-bold">{set.unit}</span>
                                   <span className="text-subtext text-xs">✕</span>
                                   <span className="text-text font-bold font-mono text-sm">{set.reps}</span>
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

      {/* --- NEW ACTION ISLAND DOCK --- */}
      {canEdit && (
        <div className="fixed bottom-8 left-0 right-0 z-50 flex flex-col items-center justify-end pointer-events-none">
          
          {/* Label Hint */}
          <div className="mb-2 bg-surface/80 backdrop-blur-md px-3 py-1 rounded-full border border-border text-[10px] font-bold text-subtext tracking-widest uppercase shadow-lg animate-in fade-in slide-in-from-bottom-2">
            {t('input_log')}
          </div>

          {/* Glass Dock */}
          <div className="pointer-events-auto bg-surfaceHighlight/80 backdrop-blur-xl border border-border rounded-full p-2 pl-4 pr-2 shadow-[0_0_50px_rgba(0,0,0,0.5)] flex items-center gap-4 transition-transform hover:scale-105 duration-300">
            
            {/* Manual Button (Left) */}
            <button
              onClick={() => setShowManualEntry(true)}
              className="flex items-center gap-2 text-subtext hover:text-text transition-colors group"
            >
              <div className="p-2 rounded-full bg-surface group-hover:bg-surfaceHighlight border border-border transition-colors">
                <Keyboard className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold hidden sm:block">{t('manual')}</span>
            </button>
            
            {/* Divider */}
            <div className="w-px h-8 bg-border"></div>

            {/* Timer (Middle) */}
            <div className="relative group">
                <RestTimer />
            </div>

            {/* Divider */}
            <div className="w-px h-8 bg-border"></div>

            {/* AI Mic Button (Right/Center - handled by component) */}
            <AudioRecorder onWorkoutProcessed={handleWorkoutProcessed} />
          
          </div>
        </div>
      )}
      
      {/* MODALS - Wrapped in Suspense for Lazy Loading */}
      <Suspense fallback={null}>
        {showManualEntry && <ManualEntryModal isOpen={showManualEntry} onClose={() => setShowManualEntry(false)} onWorkoutProcessed={handleWorkoutProcessed} />}
        {showPRModal && <PRModal isOpen={showPRModal} onClose={() => setShowPRModal(false)} workouts={workouts} initialExercise={selectedHistoryExercise} />}
        {showMonthlySummary && <MonthlySummaryModal isOpen={showMonthlySummary} onClose={() => setShowMonthlySummary(false)} viewDate={viewDate} workouts={workouts} />}
        {showCreatePlan && <CreatePlanModal isOpen={showCreatePlan} onClose={() => setShowCreatePlan(false)} onSave={handleSavePlan} initialPlan={editingPlan} />}
        {currentUser && showProfileModal && <ProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} user={currentUser} workouts={workouts} onUpdateUser={handleUpdateUser} onLogout={handleLogout} />}
        {editingExercise && <EditExerciseModal isOpen={!!editingExercise} onClose={() => setEditingExercise(null)} exercise={editingExercise.data} onSave={executeEdit} />}
        
        {/* SOCIAL MODALS */}
        {currentUser && showSocialModal && (
            <SocialModal 
                isOpen={showSocialModal} 
                onClose={() => {
                    setShowSocialModal(false);
                    checkPendingRequests(); // Refresh requests count on close
                }} 
                currentUser={currentUser} 
                activeFriends={activeFriends.map(f => f.userId)}
                onToggleFriend={handleToggleFriend}
            />
        )}
        {currentUser && showArenaModal && (
            <ArenaModal 
                isOpen={showArenaModal} 
                onClose={() => setShowArenaModal(false)} 
                currentUser={currentUser}
                friendsData={arenaParticipants}
            />
        )}
      </Suspense>

      {/* CONFIRMATION DIALOGS (Styled Modern) - Keep static as they are lightweight */}
      {[deleteConfirmation, deleteWorkoutConfirmation, deletePlanConfirmation].map((conf, i) => {
         if (!conf) return null;
         const title = deleteConfirmation ? t('delete_exercise_title') : deletePlanConfirmation ? t('delete_plan_title') : t('delete_workout_title');
         const desc = deleteConfirmation ? t('delete_exercise_desc') : deletePlanConfirmation ? t('delete_plan_desc') : t('delete_workout_desc');
         const action = i === 0 ? executeDeleteExercise : i === 1 ? executeDeleteWorkout : executeDeletePlan;
         const close = i === 0 ? () => setDeleteConfirmation(null) : i === 1 ? () => setDeleteWorkoutConfirmation(null) : () => setDeletePlanConfirmation(null);

         return (
            <div key={i} className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
               <div className="bg-surface border border-border rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                  <div className="w-12 h-12 bg-danger/10 text-danger rounded-full flex items-center justify-center mb-4"><AlertTriangle className="w-6 h-6" /></div>
                  <h3 className="text-lg font-bold text-text mb-2">{title}</h3>
                  <p className="text-subtext text-sm mb-6">{desc}</p>
                  <div className="flex gap-3">
                     <button onClick={close} className="flex-1 py-3 rounded-xl font-bold text-sm bg-surfaceHighlight hover:bg-surface border border-border text-text">{t('cancel')}</button>
                     <button onClick={action} className="flex-1 py-3 rounded-xl font-bold text-sm bg-danger text-white hover:opacity-90">{t('delete')}</button>
                  </div>
               </div>
            </div>
         )
      })}

    </div>
  );
}