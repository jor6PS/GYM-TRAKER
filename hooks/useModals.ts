import { useState, useCallback } from 'react';
import { WorkoutPlan, Exercise } from '../types';

interface EditingExercise {
  workoutId: string;
  exerciseIndex: number;
  data: Exercise;
}

interface UseModalsReturn {
  // Modal states
  showUnifiedEntry: boolean;
  showPRModal: boolean;
  showCreatePlan: boolean;
  showProfileModal: boolean;
  showMonthlySummary: boolean;
  showSocialModal: boolean;
  showArenaModal: boolean;
  showAdminModal: boolean;
  
  // Modal actions
  openUnifiedEntry: () => void;
  closeUnifiedEntry: () => void;
  openPRModal: (exercise?: string | null) => void;
  closePRModal: () => void;
  openCreatePlan: () => void;
  closeCreatePlan: () => void;
  openProfileModal: () => void;
  closeProfileModal: () => void;
  openMonthlySummary: () => void;
  closeMonthlySummary: () => void;
  openSocialModal: () => void;
  closeSocialModal: () => void;
  openArenaModal: () => void;
  closeArenaModal: () => void;
  openAdminModal: () => void;
  closeAdminModal: () => void;
  
  // Editing states
  editingPlan: WorkoutPlan | null;
  setEditingPlan: (plan: WorkoutPlan | null) => void;
  editingExercise: EditingExercise | null;
  setEditingExercise: (exercise: EditingExercise | null) => void;
  selectedHistoryExercise: string | null;
  setSelectedHistoryExercise: (exercise: string | null) => void;
  
  // Delete confirmations
  deleteWorkoutId: string | null;
  setDeleteWorkoutId: (id: string | null) => void;
  deletePlanId: string | null;
  setDeletePlanId: (id: string | null) => void;
  deleteExerciseInfo: { workoutId: string; exerciseIndex: number; exerciseName: string } | null;
  setDeleteExerciseInfo: (info: { workoutId: string; exerciseIndex: number; exerciseName: string } | null) => void;
}

export const useModals = (): UseModalsReturn => {
  const [showUnifiedEntry, setShowUnifiedEntry] = useState(false);
  const [showPRModal, setShowPRModal] = useState(false);
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showMonthlySummary, setShowMonthlySummary] = useState(false);
  const [showSocialModal, setShowSocialModal] = useState(false);
  const [showArenaModal, setShowArenaModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  
  const [editingPlan, setEditingPlan] = useState<WorkoutPlan | null>(null);
  const [editingExercise, setEditingExercise] = useState<EditingExercise | null>(null);
  const [selectedHistoryExercise, setSelectedHistoryExercise] = useState<string | null>(null);
  const [deleteWorkoutId, setDeleteWorkoutId] = useState<string | null>(null);
  const [deletePlanId, setDeletePlanId] = useState<string | null>(null);
  const [deleteExerciseInfo, setDeleteExerciseInfo] = useState<{ workoutId: string; exerciseIndex: number; exerciseName: string } | null>(null);

  const openUnifiedEntry = useCallback(() => setShowUnifiedEntry(true), []);
  const closeUnifiedEntry = useCallback(() => setShowUnifiedEntry(false), []);
  
  const openPRModal = useCallback((exercise?: string | null) => {
    if (exercise !== undefined) {
      setSelectedHistoryExercise(exercise);
    } else {
      setSelectedHistoryExercise(null);
    }
    setShowPRModal(true);
  }, []);
  const closePRModal = useCallback(() => setShowPRModal(false), []);
  
  const openCreatePlan = useCallback(() => {
    setEditingPlan(null);
    setShowCreatePlan(true);
  }, []);
  const closeCreatePlan = useCallback(() => {
    setShowCreatePlan(false);
    setEditingPlan(null);
  }, []);
  
  const openProfileModal = useCallback(() => setShowProfileModal(true), []);
  const closeProfileModal = useCallback(() => setShowProfileModal(false), []);
  
  const openMonthlySummary = useCallback(() => setShowMonthlySummary(true), []);
  const closeMonthlySummary = useCallback(() => setShowMonthlySummary(false), []);
  
  const openSocialModal = useCallback(() => setShowSocialModal(true), []);
  const closeSocialModal = useCallback(() => setShowSocialModal(false), []);
  
  const openArenaModal = useCallback(() => setShowArenaModal(true), []);
  const closeArenaModal = useCallback(() => setShowArenaModal(false), []);
  
  const openAdminModal = useCallback(() => setShowAdminModal(true), []);
  const closeAdminModal = useCallback(() => setShowAdminModal(false), []);

  return {
    showUnifiedEntry,
    showPRModal,
    showCreatePlan,
    showProfileModal,
    showMonthlySummary,
    showSocialModal,
    showArenaModal,
    showAdminModal,
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
    openAdminModal,
    closeAdminModal,
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
  };
};

