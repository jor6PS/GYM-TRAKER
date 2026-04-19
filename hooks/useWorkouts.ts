import { useState, useEffect, useCallback, useRef } from 'react';
import { Exercise, Workout, WorkoutData, WorkoutPlan, WorkoutSaveResult } from '../types';
import { supabase } from '../services/supabase';
import { sanitizeWorkoutData, getCanonicalId } from '../utils';
import { ExerciseDef } from '../contexts/ExerciseContext';
import { format } from 'date-fns';
import { updateUserRecords } from '../services/recordsService';
import {
  countPendingWorkoutSaves,
  createPendingWorkoutSave,
  getPendingWorkoutSaves,
  PendingWorkoutSave,
  removePendingWorkoutSave,
  upsertPendingWorkoutSave
} from '../services/workoutStorage';

interface UseWorkoutsReturn {
  workouts: Workout[];
  plans: WorkoutPlan[];
  pendingSyncCount: number;
  syncStatusMessage: string | null;
  fetchData: () => Promise<void>;
  handleWorkoutProcessed: (rawData: WorkoutData, selectedDate: Date, currentUserWeight: number, catalog: ExerciseDef[]) => Promise<WorkoutSaveResult>;
  confirmDeleteWorkout: (workoutId: string, catalog?: ExerciseDef[]) => Promise<void>;
  confirmDeletePlan: (planId: string) => Promise<void>;
  handleSavePlan: (plan: WorkoutPlan, userId: string) => Promise<void>;
  updatePlan: (plan: WorkoutPlan, userId: string) => Promise<void>;
  updateExercise: (workoutId: string, exerciseIndex: number, exercise: Exercise, catalog?: ExerciseDef[]) => Promise<void>;
  deleteExercise: (workoutId: string, exerciseIndex: number, catalog?: ExerciseDef[]) => Promise<void>;
}

const SAVE_TIMEOUT_MS = 20000;
const SYNC_INTERVAL_MS = 30000;
const PENDING_ID_PREFIX = 'pending:';

const getPendingEntryIdFromWorkoutId = (workoutId: string) => (
  workoutId.startsWith(PENDING_ID_PREFIX) ? workoutId.slice(PENDING_ID_PREFIX.length) : null
);

const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMessage)), timeoutMs))
  ]);
};

const isRecoverableSaveError = (error: any) => {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('offline') ||
    message.includes('load failed')
  );
};

const mergeWorkoutData = (base: WorkoutData, incoming: WorkoutData, catalog: ExerciseDef[]) => {
  const mergedExercises = [...(base.exercises || [])];
  const existingById = new Set(mergedExercises.map(exercise => getCanonicalId(exercise.name, catalog)));

  incoming.exercises.forEach(exercise => {
    const canonicalId = getCanonicalId(exercise.name, catalog);
    if (!existingById.has(canonicalId)) {
      mergedExercises.push(exercise);
      existingById.add(canonicalId);
    }
  });

  return {
    ...base,
    exercises: mergedExercises,
    notes: [base.notes, incoming.notes].filter(Boolean).join('\n').trim() || undefined
  };
};

export const useWorkouts = (userId: string | null): UseWorkoutsReturn => {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [previousUserId, setPreviousUserId] = useState<string | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);
  const syncInFlightRef = useRef(false);

  const refreshPendingSyncCount = useCallback(() => {
    setPendingSyncCount(countPendingWorkoutSaves(userId || undefined));
  }, [userId]);

  const upsertWorkoutState = useCallback((workout: Workout) => {
    setWorkouts(prev => {
      const sanitized = prev.filter(item => item.id !== `pending:${workout.user_id}:${workout.date}`);
      const existingIndex = sanitized.findIndex(item => item.id === workout.id);

      if (existingIndex === -1) {
        return [...sanitized, workout].sort((a, b) => (
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ));
      }

      const next = [...sanitized];
      next[existingIndex] = workout;
      return next;
    });
  }, []);

  const persistWorkoutToSupabase = useCallback(async (
    entry: PendingWorkoutSave,
    catalog: ExerciseDef[]
  ): Promise<Workout> => {
    const existingResult = await withTimeout(
      supabase
        .from('workouts')
        .select('*')
        .eq('user_id', entry.userId)
        .eq('date', entry.date)
        .maybeSingle() as unknown as Promise<{ data: any; error: any }>,
      SAVE_TIMEOUT_MS,
      'Timeout al verificar workout existente'
    );

    if (existingResult.error && existingResult.error.code !== 'PGRST116') {
      throw existingResult.error;
    }

    if (existingResult.data) {
      const mergedData = mergeWorkoutData(existingResult.data.structured_data, entry.data, catalog);
      const updateResult = await withTimeout(
        supabase
          .from('workouts')
          .update({
            structured_data: mergedData,
            user_weight: entry.userWeight || 80
          })
          .eq('id', existingResult.data.id)
          .select()
          .single() as unknown as Promise<{ data: any; error: any }>,
        SAVE_TIMEOUT_MS,
        'Timeout al actualizar workout'
      );

      if (updateResult.error || !updateResult.data) {
        throw updateResult.error || new Error('No se pudo actualizar el workout');
      }

      return updateResult.data as Workout;
    }

    const insertResult = await withTimeout(
      supabase
        .from('workouts')
        .insert({
          user_id: entry.userId,
          date: entry.date,
          structured_data: entry.data,
          source: 'web',
          user_weight: entry.userWeight || 80
        })
        .select()
        .single() as unknown as Promise<{ data: any; error: any }>,
      SAVE_TIMEOUT_MS,
      'Timeout al insertar workout'
    );

    if (insertResult.error || !insertResult.data) {
      throw insertResult.error || new Error('No se pudo guardar el workout');
    }

    return insertResult.data as Workout;
  }, []);

  const fetchData = useCallback(async () => {
    if (!userId) {
      if (previousUserId !== null) {
        setWorkouts([]);
        setPlans([]);
        setPreviousUserId(null);
      }
      setPendingSyncCount(0);
      return;
    }

    const [wData, pData] = await Promise.all([
      supabase.from('workouts').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      supabase.from('workout_plans').select('*').eq('user_id', userId)
    ]);

    if (wData.data) {
      const remoteWorkouts = wData.data as Workout[];
      const pendingEntries = getPendingWorkoutSaves(userId);
      const pendingByDate = new Map(pendingEntries.map(entry => [entry.date, entry]));

      const hydratedWorkouts = remoteWorkouts.map(workout => {
        const pendingEntry = pendingByDate.get(workout.date);
        if (!pendingEntry) return workout;
        return {
          ...workout,
          structured_data: mergeWorkoutData(workout.structured_data, pendingEntry.data, [])
        };
      });

      pendingEntries.forEach(entry => {
        if (!hydratedWorkouts.some(workout => workout.date === entry.date)) {
          hydratedWorkouts.push({
            id: `pending:${entry.id}`,
            user_id: entry.userId,
            date: entry.date,
            structured_data: entry.data,
            source: 'web',
            created_at: entry.createdAt,
            user_weight: entry.userWeight
          });
        }
      });

      setWorkouts(hydratedWorkouts.sort((a, b) => (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )));
    } else {
      setWorkouts([]);
    }

    if (pData.data) {
      setPlans(pData.data as WorkoutPlan[]);
    } else {
      setPlans([]);
    }

    setPreviousUserId(userId);
    refreshPendingSyncCount();
  }, [userId, previousUserId, refreshPendingSyncCount]);

  const syncPendingWorkouts = useCallback(async (catalog: ExerciseDef[] = []) => {
    if (!userId || syncInFlightRef.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    const queue = getPendingWorkoutSaves(userId);
    if (queue.length === 0) {
      refreshPendingSyncCount();
      return;
    }

    syncInFlightRef.current = true;
    let syncedCount = 0;

    try {
      for (const entry of queue) {
        try {
          const savedWorkout = await persistWorkoutToSupabase(entry, catalog);
          upsertWorkoutState(savedWorkout);
          removePendingWorkoutSave(entry.id);
          syncedCount += 1;

          updateUserRecords(savedWorkout, catalog).catch(error => {
            console.error('Error updating records after sync:', error);
          });
        } catch (error) {
          console.error('Error syncing pending workout:', error);
          if (isRecoverableSaveError(error)) {
            upsertPendingWorkoutSave({
              ...entry,
              updatedAt: new Date().toISOString(),
              retryCount: entry.retryCount + 1,
              lastError: String(error instanceof Error ? error.message : error)
            });
          }
        }
      }

      if (syncedCount > 0) {
        setSyncStatusMessage(
          syncedCount === 1
            ? 'Se sincronizo 1 entrenamiento pendiente.'
            : `Se sincronizaron ${syncedCount} entrenamientos pendientes.`
        );
      }
    } finally {
      syncInFlightRef.current = false;
      refreshPendingSyncCount();
      await fetchData();
    }
  }, [fetchData, persistWorkoutToSupabase, refreshPendingSyncCount, upsertWorkoutState, userId]);

  useEffect(() => {
    if (userId) {
      if (userId !== previousUserId) {
        setWorkouts([]);
        setPlans([]);
        void fetchData();
      } else if (previousUserId === null) {
        void fetchData();
      }
    } else if (previousUserId !== null) {
      setWorkouts([]);
      setPlans([]);
      setPreviousUserId(null);
    }
  }, [userId, previousUserId, fetchData]);

  useEffect(() => {
    if (!userId) return;

    const triggerSync = () => {
      void syncPendingWorkouts();
    };

    triggerSync();
    window.addEventListener('online', triggerSync);
    window.addEventListener('focus', triggerSync);
    const intervalId = window.setInterval(triggerSync, SYNC_INTERVAL_MS);

    return () => {
      window.removeEventListener('online', triggerSync);
      window.removeEventListener('focus', triggerSync);
      window.clearInterval(intervalId);
    };
  }, [userId, syncPendingWorkouts]);

  const handleWorkoutProcessed = useCallback(async (
    rawData: WorkoutData,
    selectedDate: Date,
    currentUserWeight: number,
    catalog: ExerciseDef[]
  ): Promise<WorkoutSaveResult> => {
    if (!userId) {
      throw new Error('Usuario no autenticado. Por favor, inicia sesion.');
    }

    if (!rawData.exercises || rawData.exercises.length === 0) {
      throw new Error('No hay ejercicios para guardar. Anade al menos un ejercicio antes de guardar.');
    }

    const validExercises = rawData.exercises.filter(ex => {
      if (!ex.name?.trim()) return false;
      if (!Array.isArray(ex.sets) || ex.sets.length === 0) return false;

      const exerciseId = getCanonicalId(ex.name, catalog);
      const exerciseDef = catalog.find(item => item.id === exerciseId);
      const isCardio = exerciseDef?.type === 'cardio';

      if (isCardio) {
        return ex.sets.some(set => {
          const time = set.time;
          if (!time) return false;
          if (typeof time === 'number') return time > 0;
          const trimmed = time.trim();
          return /^\d+$/.test(trimmed) || /^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed);
        });
      }

      return ex.sets.some(set => (set.reps || 0) > 0);
    });

    if (validExercises.length === 0) {
      throw new Error('Los ejercicios no tienen series validas. Asegurate de incluir repeticiones o tiempo.');
    }

    const data = sanitizeWorkoutData({ ...rawData, exercises: validExercises }, catalog);
    const dateToSave = format(selectedDate, 'yyyy-MM-dd');
    const existingPending = getPendingWorkoutSaves(userId).find(entry => entry.date === dateToSave);

    const queueEntry = existingPending ? {
      ...existingPending,
      data: mergeWorkoutData(existingPending.data, data, catalog),
      userWeight: currentUserWeight || existingPending.userWeight,
      updatedAt: new Date().toISOString()
    } : createPendingWorkoutSave(userId, dateToSave, data, currentUserWeight || 80);

    upsertPendingWorkoutSave(queueEntry);
    refreshPendingSyncCount();

    setWorkouts(prev => {
      const existingWorkout = prev.find(workout => workout.user_id === userId && workout.date === dateToSave);
      if (!existingWorkout) {
        return [
          ...prev,
          {
            id: `pending:${queueEntry.id}`,
            user_id: userId,
            date: dateToSave,
            structured_data: queueEntry.data,
            source: 'web',
            created_at: queueEntry.createdAt,
            user_weight: queueEntry.userWeight
          }
        ];
      }

      return prev.map(workout => (
        workout.user_id === userId && workout.date === dateToSave
          ? { ...workout, structured_data: mergeWorkoutData(workout.structured_data, queueEntry.data, catalog) }
          : workout
      ));
    });

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSyncStatusMessage('Entrenamiento guardado en este dispositivo. Se sincronizara automaticamente cuando vuelva la conexion.');
      return {
        status: 'queued',
        message: 'Entrenamiento guardado sin conexion.'
      };
    }

    try {
      const savedWorkout = await persistWorkoutToSupabase(queueEntry, catalog);
      upsertWorkoutState(savedWorkout);
      removePendingWorkoutSave(queueEntry.id);
      refreshPendingSyncCount();
      setSyncStatusMessage(null);

      updateUserRecords(savedWorkout, catalog).catch(error => {
        console.error('Error updating records after save:', error);
      });

      void fetchData();
      return { status: 'saved' };
    } catch (error: any) {
      console.error('Error en handleWorkoutProcessed:', error);
      if (isRecoverableSaveError(error)) {
        upsertPendingWorkoutSave({
          ...queueEntry,
          updatedAt: new Date().toISOString(),
          retryCount: queueEntry.retryCount + 1,
          lastError: String(error?.message || error)
        });
        refreshPendingSyncCount();
        setSyncStatusMessage('Entrenamiento guardado en este dispositivo. Se sincronizara automaticamente en segundo plano.');
        return {
          status: 'queued',
          message: 'El entrenamiento quedo pendiente de sincronizacion.'
        };
      }

      removePendingWorkoutSave(queueEntry.id);
      refreshPendingSyncCount();
      throw error;
    }
  }, [fetchData, persistWorkoutToSupabase, refreshPendingSyncCount, upsertWorkoutState, userId]);

  const confirmDeleteWorkout = useCallback(async (workoutId: string, catalog?: ExerciseDef[]) => {
    console.log(`Iniciando eliminacion de workout ID: ${workoutId}`);

    const workoutToDelete = workouts.find((w: Workout) => w.id === workoutId);
    const pendingEntryId = getPendingEntryIdFromWorkoutId(workoutId);

    if (pendingEntryId) {
      removePendingWorkoutSave(pendingEntryId);
      setWorkouts((prev: Workout[]) => prev.filter((w: Workout) => w.id !== workoutId));
      refreshPendingSyncCount();
      return;
    }

    const { error: deleteError } = await supabase
      .from('workouts')
      .delete()
      .eq('id', workoutId);

    if (deleteError) {
      console.error('Error al eliminar workout de BD:', deleteError);
      throw new Error(`Error al eliminar workout: ${deleteError.message}`);
    }

    const { data: verifyDelete, error: verifyError } = await supabase
      .from('workouts')
      .select('id')
      .eq('id', workoutId)
      .maybeSingle();

    if (verifyError && verifyError.code !== 'PGRST116') {
      throw new Error(`Error al verificar eliminacion: ${verifyError.message}`);
    }

    if (verifyDelete) {
      throw new Error('El workout no se elimino correctamente de la base de datos');
    }

    setWorkouts((prev: Workout[]) => prev.filter((w: Workout) => w.id !== workoutId));

    if (userId && catalog && workoutToDelete) {
      try {
        const { recalculateExerciseRecord } = await import('../services/recordsService');
        const exercisesToRecalculate = workoutToDelete.structured_data?.exercises || [];
        const { data: remainingWorkouts } = await supabase
          .from('workouts')
          .select('*')
          .eq('user_id', userId);

        for (const exercise of exercisesToRecalculate) {
          if (exercise.name && exercise.name.trim()) {
            await recalculateExerciseRecord(
              userId,
              exercise.name.trim(),
              catalog,
              remainingWorkouts as Workout[] | undefined
            );
          }
        }
      } catch (error) {
        console.error('Error recalculating records after workout deletion:', error);
      }
    }

    await fetchData();
  }, [fetchData, userId, workouts]);

  const confirmDeletePlan = useCallback(async (planId: string) => {
    const previousPlans = plans;
    setPlans((prev: WorkoutPlan[]) => prev.filter((p: WorkoutPlan) => p.id !== planId));
    const { error } = await supabase.from('workout_plans').delete().eq('id', planId);
    if (error) {
      setPlans(previousPlans);
      throw new Error(`Error al eliminar rutina: ${error.message}`);
    }
  }, [plans]);

  const handleSavePlan = useCallback(async (plan: WorkoutPlan, userId: string) => {
    const payload = { name: plan.name, exercises: plan.exercises, user_id: userId };
    const { data, error } = await supabase.from('workout_plans').insert(payload).select().single();
    if (error || !data) {
      throw new Error(`Error al guardar rutina: ${error?.message || 'respuesta vacia'}`);
    }
    if (data) setPlans((prev: WorkoutPlan[]) => [...prev, data as WorkoutPlan]);
  }, []);

  const updatePlan = useCallback(async (plan: WorkoutPlan, userId: string) => {
    const payload = { name: plan.name, exercises: plan.exercises, user_id: userId };

    if (plans.some((p: WorkoutPlan) => p.id === plan.id)) {
      const previousPlans = plans;
      setPlans((prev: WorkoutPlan[]) => prev.map((p: WorkoutPlan) => p.id === plan.id ? { ...p, ...payload } : p));
      const { error } = await supabase.from('workout_plans').update(payload).eq('id', plan.id);
      if (error) {
        setPlans(previousPlans);
        throw new Error(`Error al actualizar rutina: ${error.message}`);
      }
    } else {
      const { data, error } = await supabase.from('workout_plans').insert(payload).select().single();
      if (error || !data) {
        throw new Error(`Error al crear rutina: ${error?.message || 'respuesta vacia'}`);
      }
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
    if (!workout) {
      throw new Error(`Workout ${workoutId} no encontrado en el estado local`);
    }

    const newExercises = [...workout.structured_data.exercises];
    newExercises[exerciseIndex] = exercise;
    const updatedData = { ...workout.structured_data, exercises: newExercises };
    const pendingEntryId = getPendingEntryIdFromWorkoutId(workoutId);

    if (pendingEntryId) {
      const pendingEntry = getPendingWorkoutSaves(userId || undefined).find(entry => entry.id === pendingEntryId);
      if (pendingEntry) {
        upsertPendingWorkoutSave({
          ...pendingEntry,
          data: updatedData,
          updatedAt: new Date().toISOString()
        });
        refreshPendingSyncCount();
      }
      setWorkouts((prev: Workout[]) => prev.map((w: Workout) =>
        w.id === workoutId ? { ...w, structured_data: updatedData } : w
      ));
      return;
    }

    setWorkouts((prev: Workout[]) => prev.map((w: Workout) =>
      w.id === workoutId ? { ...w, structured_data: updatedData } : w
    ));

    const { data: updatedWorkoutData, error: updateError } = await supabase
      .from('workouts')
      .update({ structured_data: updatedData })
      .eq('id', workoutId)
      .select()
      .single();

    if (updateError || !updatedWorkoutData) {
      setWorkouts((prev: Workout[]) => prev.map((w: Workout) =>
        w.id === workoutId ? workout : w
      ));
      throw new Error(`Error al guardar ejercicio: ${updateError?.message || 'respuesta vacia'}`);
    }

    const { data: verifiedWorkout, error: verifyError } = await supabase
      .from('workouts')
      .select('*')
      .eq('id', updatedWorkoutData.id)
      .single();

    if (verifyError || !verifiedWorkout) {
      setWorkouts((prev: Workout[]) => prev.map((w: Workout) =>
        w.id === workoutId ? workout : w
      ));
      throw new Error('El workout no se guardo correctamente en la base de datos');
    }

    setWorkouts((prev: Workout[]) => prev.map((w: Workout) =>
      w.id === workoutId ? (verifiedWorkout as Workout) : w
    ));

    if (userId && catalog && exercise.name) {
      try {
        const oldExerciseName = workout.structured_data.exercises[exerciseIndex]?.name?.trim();
        const newExerciseName = exercise.name.trim();
        const { recalculateExerciseRecord } = await import('../services/recordsService');

        if (oldExerciseName && oldExerciseName !== newExerciseName) {
          await recalculateExerciseRecord(userId, oldExerciseName, catalog);
        }

        await recalculateExerciseRecord(userId, newExerciseName, catalog);
      } catch (error) {
        console.error(`Error recalculating record for exercise "${exercise.name}":`, error);
      }
    }
  }, [userId, workouts]);

  const deleteExercise = useCallback(async (
    workoutId: string,
    exerciseIndex: number,
    catalog?: ExerciseDef[]
  ) => {
    const workout = workouts.find((w: Workout) => w.id === workoutId);
    if (!workout) return;

    const exerciseToDelete = workout.structured_data.exercises[exerciseIndex];
    const exerciseName = exerciseToDelete?.name?.trim();

    const newExercises = [...workout.structured_data.exercises];
    newExercises.splice(exerciseIndex, 1);

    if (newExercises.length === 0) {
      await confirmDeleteWorkout(workoutId, catalog);
      if (exerciseName && userId && catalog) {
        try {
          const { recalculateExerciseRecord } = await import('../services/recordsService');
          await recalculateExerciseRecord(userId, exerciseName, catalog);
        } catch (error) {
          console.error(`Error recalculating record for deleted exercise "${exerciseName}":`, error);
        }
      }
      return;
    }

    const updatedData = { ...workout.structured_data, exercises: newExercises };
    const pendingEntryId = getPendingEntryIdFromWorkoutId(workoutId);

    if (pendingEntryId) {
      const pendingEntry = getPendingWorkoutSaves(userId || undefined).find(entry => entry.id === pendingEntryId);
      if (pendingEntry) {
        upsertPendingWorkoutSave({
          ...pendingEntry,
          data: updatedData,
          updatedAt: new Date().toISOString()
        });
        refreshPendingSyncCount();
      }
      setWorkouts((prev: Workout[]) => prev.map((w: Workout) =>
        w.id === workoutId ? { ...w, structured_data: updatedData } : w
      ));
      return;
    }

    setWorkouts((prev: Workout[]) => prev.map((w: Workout) =>
      w.id === workoutId ? { ...w, structured_data: updatedData } : w
    ));

    const { data: updatedWorkoutData, error: updateError } = await supabase
      .from('workouts')
      .update({ structured_data: updatedData })
      .eq('id', workoutId)
      .select()
      .single();

    if (updateError || !updatedWorkoutData) {
      setWorkouts((prev: Workout[]) => prev.map((w: Workout) =>
        w.id === workoutId ? workout : w
      ));
      throw new Error(`Error al eliminar ejercicio: ${updateError?.message || 'respuesta vacia'}`);
    }

    const { data: verifiedWorkout, error: verifyError } = await supabase
      .from('workouts')
      .select('*')
      .eq('id', workoutId)
      .single();

    if (verifyError || !verifiedWorkout) {
      setWorkouts((prev: Workout[]) => prev.map((w: Workout) =>
        w.id === workoutId ? workout : w
      ));
      throw new Error('El workout no se guardo correctamente en la base de datos');
    }

    setWorkouts((prev: Workout[]) => prev.map((w: Workout) =>
      w.id === workoutId ? (verifiedWorkout as Workout) : w
    ));

    if (exerciseName && userId && catalog) {
      try {
        const { recalculateExerciseRecord } = await import('../services/recordsService');
        await recalculateExerciseRecord(userId, exerciseName, catalog);
      } catch (error) {
        console.error(`Error recalculating record for deleted exercise "${exerciseName}":`, error);
      }
    }
  }, [confirmDeleteWorkout, userId, workouts]);

  return {
    workouts,
    plans,
    pendingSyncCount,
    syncStatusMessage,
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
