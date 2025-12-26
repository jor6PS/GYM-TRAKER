import { useState, useEffect, useCallback } from 'react';
import { Workout, WorkoutPlan, WorkoutData, Exercise } from '../types';
import { supabase } from '../services/supabase';
import { sanitizeWorkoutData, parseLocalDate } from '../utils';
import { ExerciseDef } from '../contexts/ExerciseContext';
import { format, isSameDay } from 'date-fns';
import { updateUserRecords, getUserRecords } from '../services/recordsService';

interface UseWorkoutsReturn {
  workouts: Workout[];
  plans: WorkoutPlan[];
  fetchData: () => Promise<void>;
  handleWorkoutProcessed: (rawData: WorkoutData, selectedDate: Date, currentUserWeight: number, catalog: ExerciseDef[]) => Promise<void>;
  confirmDeleteWorkout: (workoutId: string, catalog?: ExerciseDef[]) => Promise<void>;
  confirmDeletePlan: (planId: string) => Promise<void>;
  handleSavePlan: (plan: WorkoutPlan, userId: string) => Promise<void>;
  updatePlan: (plan: WorkoutPlan, userId: string) => Promise<void>;
  updateExercise: (workoutId: string, exerciseIndex: number, exercise: Exercise, catalog?: ExerciseDef[]) => Promise<void>;
  deleteExercise: (workoutId: string, exerciseIndex: number, catalog?: ExerciseDef[]) => Promise<void>;
}

export const useWorkouts = (userId: string | null): UseWorkoutsReturn => {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [previousUserId, setPreviousUserId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!userId) {
      if (previousUserId !== null) {
        setWorkouts([]);
        setPlans([]);
        setPreviousUserId(null);
      }
      return;
    }
    
    console.log('useWorkouts: Fetching data for userId:', userId, 'previousUserId:', previousUserId);
    
    const [wData, pData] = await Promise.all([
      supabase.from('workouts').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      supabase.from('workout_plans').select('*').eq('user_id', userId)
    ]);
    
    console.log('useWorkouts: Workouts fetched:', wData.data?.length || 0, 'Error:', wData.error);
    if (wData.error) console.error('useWorkouts: Error fetching workouts:', wData.error);
    
    if (wData.data) {
      setWorkouts(wData.data as Workout[]);
      
      // Verificar si el usuario tiene records, si no, procesar workouts existentes
      // Esto se hará cuando se cargue el catalog en App.tsx
    } else {
      setWorkouts([]);
    }
    if (pData.data) {
      setPlans(pData.data as WorkoutPlan[]);
    } else {
      setPlans([]);
    }
    setPreviousUserId(userId);
  }, [userId, previousUserId]);

  useEffect(() => {
    console.log('useWorkouts useEffect triggered - userId:', userId, 'previousUserId:', previousUserId);
    if (userId) {
      if (userId !== previousUserId) {
        console.log('useWorkouts: userId changed from', previousUserId, 'to', userId);
        // Limpiar workouts anteriores cuando cambia el usuario
        setWorkouts([]);
        setPlans([]);
        // Cargar nuevos datos
        fetchData();
      } else if (previousUserId === null) {
        // Primera carga
        console.log('useWorkouts: Primera carga para userId:', userId);
        fetchData();
      }
    } else if (previousUserId !== null) {
      // Solo limpiar si realmente no hay userId
      console.log('useWorkouts: Limpiando porque userId es null');
      setWorkouts([]);
      setPlans([]);
      setPreviousUserId(null);
    }
  }, [userId, previousUserId, fetchData]);

  const handleWorkoutProcessed = useCallback(async (
    rawData: WorkoutData,
    selectedDate: Date,
    currentUserWeight: number,
    catalog: ExerciseDef[]
  ) => {
    if (!userId) return;
    
    const data = sanitizeWorkoutData(rawData, catalog);
    if (!data.exercises || data.exercises.length === 0) return;
    
    const dateToSave = format(selectedDate, 'yyyy-MM-dd');
    const existingWorkout = workouts.find((w: Workout) => isSameDay(parseLocalDate(w.date), selectedDate));
    
    if (existingWorkout) {
      const updatedData = {
        ...existingWorkout.structured_data,
        exercises: [...existingWorkout.structured_data.exercises, ...data.exercises],
        notes: (existingWorkout.structured_data.notes || '') + (data.notes ? `\n${data.notes}` : '')
      };
      
      setWorkouts((prev: Workout[]) => prev.map((w: Workout) => 
        w.id === existingWorkout.id ? { ...w, structured_data: updatedData } : w
      ));
      
      const updatedWorkout = { ...existingWorkout, structured_data: updatedData, user_weight: currentUserWeight || 80 };
      await supabase.from('workouts').update({ 
        structured_data: updatedData, 
        user_weight: currentUserWeight || 80 
      }).eq('id', existingWorkout.id);
      
      // Actualizar records
      try {
        await updateUserRecords(updatedWorkout, catalog);
      } catch (error) {
        console.error('Error updating records:', error);
      }
    } else {
      const { data: inserted } = await supabase.from('workouts').insert({
        user_id: userId,
        date: dateToSave,
        structured_data: data,
        source: 'web',
        user_weight: currentUserWeight || 80
      }).select().single();
      
      if (inserted) {
        setWorkouts((prev: Workout[]) => [...prev, inserted as Workout]);
        
        // Actualizar records
        try {
          await updateUserRecords(inserted as Workout, catalog);
        } catch (error) {
          console.error('Error updating records:', error);
        }
      }
    }
  }, [userId, workouts]);

  const confirmDeleteWorkout = useCallback(async (workoutId: string, catalog?: ExerciseDef[]) => {
    setWorkouts((prev: Workout[]) => prev.filter((w: Workout) => w.id !== workoutId));
    await supabase.from('workouts').delete().eq('id', workoutId);
    
    // Recalcular records después de eliminar workout
    // Nota: Esto requiere recalculación completa, se puede optimizar en el futuro
    if (userId && catalog) {
      try {
        const { recalculateUserRecords } = await import('../services/recordsService');
        const { data: allWorkouts } = await supabase
          .from('workouts')
          .select('*')
          .eq('user_id', userId);
        
        if (allWorkouts) {
          await recalculateUserRecords(userId, allWorkouts as Workout[], catalog);
        }
      } catch (error) {
        console.error('Error recalculating records after workout deletion:', error);
      }
    }
  }, [userId]);

  const confirmDeletePlan = useCallback(async (planId: string) => {
    setPlans((prev: WorkoutPlan[]) => prev.filter((p: WorkoutPlan) => p.id !== planId));
    await supabase.from('workout_plans').delete().eq('id', planId);
  }, []);

  const handleSavePlan = useCallback(async (plan: WorkoutPlan, userId: string) => {
    const payload = { name: plan.name, exercises: plan.exercises, user_id: userId };
    const { data } = await supabase.from('workout_plans').insert(payload).select().single();
    if (data) setPlans((prev: WorkoutPlan[]) => [...prev, data as WorkoutPlan]);
  }, []);

  const updatePlan = useCallback(async (plan: WorkoutPlan, userId: string) => {
    const payload = { name: plan.name, exercises: plan.exercises, user_id: userId };
    
    if (plans.some((p: WorkoutPlan) => p.id === plan.id)) {
      await supabase.from('workout_plans').update(payload).eq('id', plan.id);
      setPlans((prev: WorkoutPlan[]) => prev.map((p: WorkoutPlan) => p.id === plan.id ? { ...p, ...payload } : p));
    } else {
      const { data } = await supabase.from('workout_plans').insert(payload).select().single();
      if (data) setPlans((prev: WorkoutPlan[]) => [...prev, data as WorkoutPlan]);
    }
  }, [plans]);

  const updateExercise = useCallback(async (
    workoutId: string,
    exerciseIndex: number,
    exercise: Exercise,
    catalog?: ExerciseDef[]
  ) => {
    const workout = workouts.find((w: Workout) => w.id === workoutId);
    if (!workout) return;
    
    const newExercises = [...workout.structured_data.exercises];
    newExercises[exerciseIndex] = exercise;
    const updatedData = { ...workout.structured_data, exercises: newExercises };
    
    setWorkouts((prev: Workout[]) => prev.map((w: Workout) => 
      w.id === workoutId ? { ...w, structured_data: updatedData } : w
    ));
    
    await supabase.from('workouts').update({ structured_data: updatedData }).eq('id', workoutId);
    
    // Actualizar records después de editar ejercicio
    if (catalog) {
      try {
        const { data: workoutData } = await supabase
          .from('workouts')
          .select('*')
          .eq('id', workoutId)
          .single();
        
        if (workoutData) {
          await updateUserRecords(workoutData as Workout, catalog);
        }
      } catch (error) {
        console.error('Error updating records after exercise edit:', error);
      }
    }
  }, [workouts]);

  const deleteExercise = useCallback(async (
    workoutId: string,
    exerciseIndex: number,
    catalog?: ExerciseDef[]
  ) => {
    const workout = workouts.find((w: Workout) => w.id === workoutId);
    if (!workout) return;
    
    const newExercises = [...workout.structured_data.exercises];
    newExercises.splice(exerciseIndex, 1);
    
    // Si no quedan ejercicios, eliminar el workout completo
    if (newExercises.length === 0) {
      await confirmDeleteWorkout(workoutId, catalog);
      return;
    }
    
    const updatedData = { ...workout.structured_data, exercises: newExercises };
    
    setWorkouts((prev: Workout[]) => prev.map((w: Workout) => 
      w.id === workoutId ? { ...w, structured_data: updatedData } : w
    ));
    
    await supabase.from('workouts').update({ structured_data: updatedData }).eq('id', workoutId);
    
    // Recalcular records después de eliminar ejercicio
    // Nota: Esto requiere recalculación completa para reflejar correctamente el estado sin el ejercicio eliminado
    if (userId && catalog) {
      try {
        const { recalculateUserRecords } = await import('../services/recordsService');
        const { data: allWorkouts } = await supabase
          .from('workouts')
          .select('*')
          .eq('user_id', userId);
        
        if (allWorkouts) {
          await recalculateUserRecords(userId, allWorkouts as Workout[], catalog);
        }
      } catch (error) {
        console.error('Error recalculating records after exercise deletion:', error);
      }
    }
  }, [workouts, confirmDeleteWorkout]);

  return {
    workouts,
    plans,
    fetchData,
    handleWorkoutProcessed,
    confirmDeleteWorkout,
    confirmDeletePlan,
    handleSavePlan,
    updatePlan,
    updateExercise,
    deleteExercise
  };
};

