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

  // Helper para agregar timeout a promesas
  const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
      )
    ]);
  };

  const handleWorkoutProcessed = useCallback(async (
    rawData: WorkoutData,
    selectedDate: Date,
    currentUserWeight: number,
    catalog: ExerciseDef[]
  ) => {
    if (!userId) {
      throw new Error('Usuario no autenticado. Por favor, inicia sesión.');
    }
    
    // CRÍTICO: Validar que haya ejercicios antes de procesar
    if (!rawData.exercises || rawData.exercises.length === 0) {
      throw new Error('No hay ejercicios para guardar. Añade al menos un ejercicio antes de guardar.');
    }
    
    // CRÍTICO: Validar que todos los ejercicios tengan sets válidos
    const validExercises = rawData.exercises.filter(ex => {
      if (!ex.name || !ex.name.trim()) return false;
      if (!ex.sets || !Array.isArray(ex.sets) || ex.sets.length === 0) return false;
      // Validar que al menos un set tenga reps > 0
      const hasValidSets = ex.sets.some(set => (set.reps || 0) > 0);
      return hasValidSets;
    });
    
    if (validExercises.length === 0) {
      throw new Error('Los ejercicios no tienen series válidas. Asegúrate de que cada ejercicio tenga al menos una serie con repeticiones.');
    }
    
    if (validExercises.length < rawData.exercises.length) {
      console.warn(`⚠️ Se filtraron ${rawData.exercises.length - validExercises.length} ejercicios sin sets válidos`);
    }
    
    const data = sanitizeWorkoutData({ ...rawData, exercises: validExercises }, catalog);
    
    // Validación final después de sanitizar
    if (!data.exercises || data.exercises.length === 0) {
      throw new Error('Error al procesar los ejercicios. Intenta de nuevo.');
    }
    
    const SAVE_TIMEOUT_MS = 60000; // 60 segundos timeout para el guardado completo (aumentado para sesiones largas)
    
    try {
      // Wrapper para timeout general del proceso
      await withTimeout(
        (async () => {
          const dateToSave = format(selectedDate, 'yyyy-MM-dd');
          console.log(`💾 Guardando workout para fecha: ${dateToSave} con ${data.exercises.length} ejercicios`);
          
          // CRÍTICO: Verificar en la BD si ya existe un workout para esta fecha antes de guardar
          // Esto previene duplicados si hay problemas de conexión
          console.log(`🔍 Verificando workout existente para fecha: ${dateToSave}...`);
          
          // Primero, verificar solo existencia (más rápido)
          const existsCheck = await withTimeout(
            supabase
              .from('workouts')
              .select('id')
              .eq('user_id', userId)
              .eq('date', dateToSave)
              .maybeSingle() as unknown as Promise<{ data: any; error: any }>,
            25000, // 25 segundos timeout para verificación (aumentado para sesiones largas)
            'Timeout al verificar workout existente'
          );
          
          let existingWorkoutInDb = null;
          let fetchError = existsCheck.error;
          
          // Si existe, obtener los datos completos
          if (existsCheck.data && !existsCheck.error) {
            console.log(`📋 Workout existente encontrado (ID: ${existsCheck.data.id}), obteniendo datos completos...`);
            const fullQueryResult = await withTimeout(
              supabase
                .from('workouts')
                .select('*')
                .eq('id', existsCheck.data.id)
                .single() as unknown as Promise<{ data: any; error: any }>,
              20000, // 20 segundos timeout para obtener datos completos
              'Timeout al obtener datos completos del workout existente'
            );
            existingWorkoutInDb = fullQueryResult.data;
            if (fullQueryResult.error) {
              fetchError = fullQueryResult.error;
            }
          }
          
          if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = no rows returned, es normal
            console.error('❌ Error al verificar workout existente en BD:', fetchError);
            // Si es un timeout, lanzar error más descriptivo
            if (fetchError.message?.includes('Timeout') || fetchError.message?.includes('timeout')) {
              throw new Error('La verificación del workout tardó demasiado. Esto puede ocurrir con muchos ejercicios o conexión lenta. Por favor, intenta guardar de nuevo. Tus ejercicios se han guardado temporalmente y no se perderán.');
            }
            // Para otros errores, continuar de todas formas pero loguear
          }
          
          if (existingWorkoutInDb) {
            console.log(`📋 Workout existente encontrado en BD para ${dateToSave}, actualizando...`);
      
      // Verificar si los ejercicios nuevos ya están en el workout existente
      const existingExercises = existingWorkoutInDb.structured_data?.exercises || [];
      const newExerciseNames = data.exercises.map(ex => ex.name?.trim()).filter(Boolean);
      const existingExerciseNames = existingExercises.map((ex: any) => ex.name?.trim()).filter(Boolean);
      
      // Filtrar ejercicios que ya existen (comparando por nombre)
      const exercisesToAdd = data.exercises.filter(ex => {
        const exName = ex.name?.trim();
        return exName && !existingExerciseNames.includes(exName);
      });
      
      if (exercisesToAdd.length === 0) {
            console.log(`ℹ️ Todos los ejercicios ya están en el workout. Actualizando estado local.`);
            // Actualizar el estado local con los datos de la BD
            setWorkouts((prev: Workout[]) => {
              const existing = prev.find((w: Workout) => w.id === existingWorkoutInDb.id);
              if (!existing) {
                return [...prev, existingWorkoutInDb as Workout];
              }
              // Actualizar el workout existente con los datos más recientes de la BD
              return prev.map((w: Workout) => 
                w.id === existingWorkoutInDb.id ? (existingWorkoutInDb as Workout) : w
              );
            });
            // No es un error, simplemente no hay nada nuevo que agregar
            // No retornar error para que el modal se cierre normalmente
            return;
          }
      
            console.log(`➕ Agregando ${exercisesToAdd.length} ejercicios nuevos (${data.exercises.length - exercisesToAdd.length} ya existían)`);
            
            const updatedData = {
              ...existingWorkoutInDb.structured_data,
              exercises: [...existingExercises, ...exercisesToAdd],
              notes: (existingWorkoutInDb.structured_data?.notes || '') + (data.notes ? `\n${data.notes}` : '')
            };
            
            // CRÍTICO: Verificar que el update sea exitoso
            console.log(`💾 Actualizando workout en BD...`);
            const updateResult = await withTimeout(
              supabase
                .from('workouts')
                .update({ 
                  structured_data: updatedData, 
                  user_weight: currentUserWeight || 80 
                })
                .eq('id', existingWorkoutInDb.id)
                .select()
                .single() as unknown as Promise<{ data: any; error: any }>,
              25000, // 25 segundos timeout para actualización (aumentado para sesiones largas)
              'Timeout al actualizar workout'
            );
            const { data: updatedWorkoutData, error: updateError } = updateResult;
      
      if (updateError) {
        console.error('❌ Error al actualizar workout en BD:', updateError);
        throw new Error(`Error al guardar workout: ${updateError.message}`);
      }
      
      if (!updatedWorkoutData) {
        throw new Error('No se recibió el workout actualizado de la BD');
      }
      
      console.log(`✅ Workout actualizado exitosamente en BD. ID: ${updatedWorkoutData.id}`);
      
            // CRÍTICO: Verificar que realmente se guardó correctamente en BD
            // Re-verificar desde BD para asegurarnos de que el guardado fue exitoso
            console.log(`✅ Verificando workout actualizado en BD...`);
            const verifyResult = await withTimeout(
              supabase
                .from('workouts')
                .select('*')
                .eq('id', updatedWorkoutData.id)
                .single() as unknown as Promise<{ data: any; error: any }>,
              20000, // 20 segundos timeout para verificación (aumentado)
              'Timeout al verificar workout actualizado'
            );
            const { data: verifiedWorkout, error: verifyError } = verifyResult;
      
      if (verifyError || !verifiedWorkout) {
        console.error('❌ ERROR CRÍTICO: El workout no se guardó correctamente en BD después de actualizar:', verifyError);
        throw new Error('El workout no se guardó correctamente en la base de datos');
      }
      
      // Actualizar estado local con los datos confirmados de la BD
      setWorkouts((prev: Workout[]) => prev.map((w: Workout) => 
        w.id === verifiedWorkout.id ? (verifiedWorkout as Workout) : w
      ));
      
      // CRÍTICO: Solo procesar los NUEVOS ejercicios, no todos los del workout
      // SOLO actualizar records DESPUÉS de verificar que el workout se guardó correctamente
      const newExercisesWorkout: Workout = {
        ...verifiedWorkout,
        structured_data: {
          ...verifiedWorkout.structured_data,
          exercises: exercisesToAdd, // SOLO los nuevos ejercicios
          notes: data.notes || ''
        },
        user_weight: currentUserWeight || 80
      };
      
      // Actualizar records SOLO con los nuevos ejercicios
      // IMPORTANTE: Esto se ejecuta DESPUÉS de confirmar que el workout se guardó
      try {
        console.log(`📊 Actualizando records para ${exercisesToAdd.length} ejercicios nuevos...`);
        await withTimeout(
          updateUserRecords(newExercisesWorkout, catalog),
          20000, // 20 segundos timeout para actualización de records
          'Timeout al actualizar records'
        );
        console.log(`✅ Records actualizados exitosamente`);
      } catch (error) {
        console.error('❌ Error updating records:', error);
        // El workout ya está guardado, así que el error en records no debe bloquear
        // pero es crítico loguearlo para debugging
        // NO lanzar el error para no bloquear el guardado exitoso del workout
      }
      
      console.log(`✅ Proceso de actualización completado exitosamente. Workout ID: ${verifiedWorkout.id}`);
      
            // CRÍTICO: Forzar refresh de datos desde BD para asegurar consistencia
            // Esto es opcional, no bloquear si falla
            try {
              console.log(`🔄 Refrescando estado local desde BD...`);
              const refreshResult = await withTimeout(
                supabase
                  .from('workouts')
                  .select('*')
                  .eq('user_id', userId)
                  .order('created_at', { ascending: true }) as unknown as Promise<{ data: any; error: any }>,
                10000, // 10 segundos timeout para refresh
                'Timeout al refrescar datos'
              );
              const { data: refreshedWorkouts, error: refreshError } = refreshResult;
        
        if (!refreshError && refreshedWorkouts) {
          console.log(`🔄 Refrescando estado local desde BD después de actualizar. Workouts encontrados: ${refreshedWorkouts.length}`);
          setWorkouts(refreshedWorkouts as Workout[]);
        } else if (refreshError) {
          console.error('⚠️ Error al refrescar workouts desde BD:', refreshError);
        }
      } catch (refreshErr) {
        console.error('⚠️ Error al refrescar datos (no crítico):', refreshErr);
        // No bloquear si el refresh falla, el workout ya está guardado
      }
          } else {
            console.log(`➕ Creando nuevo workout para ${dateToSave}...`);
            
            const insertResult = await withTimeout(
              supabase.from('workouts').insert({
                user_id: userId,
                date: dateToSave,
                structured_data: data,
                source: 'web',
                user_weight: currentUserWeight || 80
              }).select().single() as unknown as Promise<{ data: any; error: any }>,
              25000, // 25 segundos timeout para inserción (aumentado para sesiones largas)
              'Timeout al insertar workout'
            );
            const { data: inserted, error: insertError } = insertResult;
            
            if (insertError) {
              console.error('❌ Error al insertar workout en BD:', insertError);
              
              // Si el error es de duplicado único (posible problema de conexión anterior)
              if (insertError.code === '23505') { // PostgreSQL unique violation
                console.warn('⚠️ Posible duplicado detectado. Verificando en BD...');
                // Intentar obtener el workout que ya existe
                const { data: existingAfterError } = await supabase
                  .from('workouts')
                  .select('*')
                  .eq('user_id', userId)
                  .eq('date', dateToSave)
                  .maybeSingle();
                
                if (existingAfterError) {
                  console.log(`✅ El workout ya existe en BD (probablemente se guardó anteriormente). Usando el existente.`);
                  setWorkouts((prev: Workout[]) => {
                    const existing = prev.find((w: Workout) => w.id === existingAfterError.id);
                    if (!existing) {
                      return [...prev, existingAfterError as Workout];
                    }
                    return prev;
                  });
                  return; // No intentar guardar de nuevo
                }
              }
              
              throw new Error(`Error al guardar workout: ${insertError.message}`);
            }
            
            if (!inserted) {
              throw new Error('No se pudo insertar el workout: respuesta vacía de la base de datos');
            }
            
            console.log(`✅ Workout insertado exitosamente en BD. ID: ${inserted.id}`);
            
            // CRÍTICO: Verificar que realmente se guardó correctamente en BD
            // Re-verificar desde BD para asegurarnos de que el guardado fue exitoso
            console.log(`✅ Verificando workout insertado en BD...`);
            const verifyInsertResult = await withTimeout(
              supabase
                .from('workouts')
                .select('*')
                .eq('id', inserted.id)
                .single() as unknown as Promise<{ data: any; error: any }>,
              20000, // 20 segundos timeout para verificación (aumentado)
              'Timeout al verificar workout insertado'
            );
            const { data: verifiedWorkout, error: verifyError } = verifyInsertResult;
            
            if (verifyError || !verifiedWorkout) {
              console.error('❌ ERROR CRÍTICO: El workout no se guardó correctamente en BD después de insertar:', verifyError);
              throw new Error('El workout no se guardó correctamente en la base de datos');
            }
            
            // Actualizar estado local con el workout confirmado desde BD
            setWorkouts((prev: Workout[]) => {
              // Verificar que no esté ya en la lista (por si acaso)
              const existing = prev.find((w: Workout) => w.id === verifiedWorkout.id);
              if (!existing) {
                console.log(`✅ Workout agregado al estado local. ID: ${verifiedWorkout.id}`);
                return [...prev, verifiedWorkout as Workout];
              } else {
                // Si ya existe, actualizarlo con los datos confirmados de BD
                console.log(`✅ Workout actualizado en estado local. ID: ${verifiedWorkout.id}`);
                return prev.map((w: Workout) => 
                  w.id === verifiedWorkout.id ? (verifiedWorkout as Workout) : w
                );
              }
            });
            
            // Actualizar records con el workout completo (es nuevo, no hay duplicación)
            // IMPORTANTE: Esto se ejecuta DESPUÉS de confirmar que el workout se guardó
            try {
              console.log(`📊 Actualizando records para ${data.exercises.length} ejercicios nuevos...`);
              await withTimeout(
                updateUserRecords(verifiedWorkout as Workout, catalog),
                20000, // 20 segundos timeout para actualización de records
                'Timeout al actualizar records'
              );
              console.log(`✅ Records actualizados exitosamente`);
            } catch (error) {
              console.error('❌ Error updating records:', error);
              // El workout ya está guardado, así que el error en records no debe bloquear
              // pero es crítico loguearlo para debugging
              // NO lanzar el error para no bloquear el guardado exitoso del workout
            }
            
            console.log(`✅ Proceso de guardado completado exitosamente. Workout ID: ${verifiedWorkout.id}`);
            
            // CRÍTICO: Forzar refresh de datos desde BD para asegurar consistencia
            // Esto garantiza que el estado local refleja exactamente lo que hay en BD
            // Esto es opcional, no bloquear si falla
            try {
              console.log(`🔄 Refrescando estado local desde BD...`);
              const refreshResult2 = await withTimeout(
                supabase
                  .from('workouts')
                  .select('*')
                  .eq('user_id', userId)
                  .order('created_at', { ascending: true }) as unknown as Promise<{ data: any; error: any }>,
                10000, // 10 segundos timeout para refresh
                'Timeout al refrescar datos'
              );
              const { data: refreshedWorkouts, error: refreshError } = refreshResult2;
              
              if (!refreshError && refreshedWorkouts) {
                console.log(`🔄 Refrescando estado local desde BD. Workouts encontrados: ${refreshedWorkouts.length}`);
                setWorkouts(refreshedWorkouts as Workout[]);
              } else if (refreshError) {
                console.error('⚠️ Error al refrescar workouts desde BD:', refreshError);
                // No lanzar error porque el workout ya se guardó correctamente
              }
            } catch (refreshErr) {
              console.error('⚠️ Error al refrescar datos (no crítico):', refreshErr);
              // No lanzar error porque el workout ya se guardó correctamente
            }
          }
        })(),
        SAVE_TIMEOUT_MS,
        `Timeout general al guardar workout (más de ${SAVE_TIMEOUT_MS/1000}s)`
      );
    } catch (error: any) {
      console.error('❌ Error en handleWorkoutProcessed:', error);
      throw error; // Re-lanzar el error para que el componente lo maneje
    }
  }, [userId, fetchData]);

  const confirmDeleteWorkout = useCallback(async (workoutId: string, catalog?: ExerciseDef[]) => {
    console.log(`🗑️ Iniciando eliminación de workout ID: ${workoutId}`);
    
    // Guardar referencia al workout antes de intentar eliminarlo (por si necesitamos revertir)
    const workoutToDelete = workouts.find((w: Workout) => w.id === workoutId);
    
    // CRÍTICO: Primero intentar eliminar de la BD, luego actualizar estado local
    const { error: deleteError } = await supabase
      .from('workouts')
      .delete()
      .eq('id', workoutId);
    
    if (deleteError) {
      console.error('❌ Error al eliminar workout de BD:', deleteError);
      throw new Error(`Error al eliminar workout: ${deleteError.message}`);
    }
    
    console.log(`✅ Workout eliminado de BD. Verificando eliminación...`);
    
    // CRÍTICO: Verificar que realmente se eliminó de la BD
    const { data: verifyDelete, error: verifyError } = await supabase
      .from('workouts')
      .select('id')
      .eq('id', workoutId)
      .maybeSingle();
    
    if (verifyError && verifyError.code !== 'PGRST116') {
      console.error('❌ Error al verificar eliminación:', verifyError);
      throw new Error(`Error al verificar eliminación: ${verifyError.message}`);
    }
    
    if (verifyDelete) {
      console.error('❌ ERROR CRÍTICO: El workout todavía existe en BD después de eliminar');
      throw new Error('El workout no se eliminó correctamente de la base de datos');
    }
    
    console.log(`✅ Verificación exitosa: workout eliminado de BD`);
    
    // Solo ahora actualizar el estado local
    setWorkouts((prev: Workout[]) => prev.filter((w: Workout) => w.id !== workoutId));
    
    // CRÍTICO: Recalcular SOLO los records de los ejercicios que estaban en el workout eliminado
    // Esto es más eficiente y evita problemas con ejercicios que no tienen más workouts
    if (userId && catalog && workoutToDelete) {
      try {
        const { recalculateExerciseRecord } = await import('../services/recordsService');
        const exercisesToRecalculate = workoutToDelete.structured_data?.exercises || [];
        
        // Obtener todos los workouts RESTANTES (después de la eliminación)
        // Esto es importante para que recalculateExerciseRecord tenga los datos correctos
        const { data: remainingWorkouts, error: fetchError } = await supabase
          .from('workouts')
          .select('*')
          .eq('user_id', userId);
        
        if (fetchError) {
          console.error('❌ Error obteniendo workouts restantes para recalcular records:', fetchError);
          // Continuar de todas formas, recalculateExerciseRecord obtendrá los workouts internamente
        }
        
        console.log(`📊 Recalculando records para ${exercisesToRecalculate.length} ejercicios del workout eliminado...`);
        console.log(`  📋 Workouts restantes: ${remainingWorkouts?.length || 0}`);
        
        // Recalcular cada ejercicio individualmente
        for (const exercise of exercisesToRecalculate) {
          if (exercise.name && exercise.name.trim()) {
            try {
              const exerciseName = exercise.name.trim();
              console.log(`  🔄 Recalculando record para "${exerciseName}"...`);
              
              // Pasar los workouts restantes para que use los datos actualizados
              await recalculateExerciseRecord(
                userId, 
                exerciseName, 
                catalog,
                remainingWorkouts as Workout[] | undefined
              );
              
              console.log(`  ✅ Record recalculado/eliminado para "${exerciseName}"`);
            } catch (error) {
              console.error(`  ❌ Error recalculando record para "${exercise.name}":`, error);
              // Continuar con el siguiente ejercicio aunque este falle
            }
          }
        }
        
        console.log(`✅ Records recalculados para todos los ejercicios del workout eliminado`);
      } catch (error) {
        console.error('Error recalculating records after workout deletion:', error);
        // No lanzar error aquí, ya que el workout se eliminó correctamente
      }
    }
    
    // Forzar re-fetch para asegurar sincronización completa
    await fetchData();
    
    console.log(`✅ Eliminación completada exitosamente para workout ID: ${workoutId}`);
  }, [userId, workouts, fetchData]);

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
    if (!workout) {
      console.error(`❌ Workout ${workoutId} no encontrado en el estado local`);
      return;
    }
    
    console.log(`💾 Actualizando ejercicio ${exerciseIndex} en workout ${workoutId}...`);
    
    const newExercises = [...workout.structured_data.exercises];
    newExercises[exerciseIndex] = exercise;
    const updatedData = { ...workout.structured_data, exercises: newExercises };
    
    // Actualizar estado local optimísticamente
    setWorkouts((prev: Workout[]) => prev.map((w: Workout) => 
      w.id === workoutId ? { ...w, structured_data: updatedData } : w
    ));
    
    // CRÍTICO: Actualizar en BD y verificar que se guardó correctamente
    const { data: updatedWorkoutData, error: updateError } = await supabase
      .from('workouts')
      .update({ structured_data: updatedData })
      .eq('id', workoutId)
      .select()
      .single();
    
    if (updateError) {
      console.error('❌ Error al actualizar ejercicio en BD:', updateError);
      // Revertir el cambio optimista en caso de error
      setWorkouts((prev: Workout[]) => prev.map((w: Workout) => 
        w.id === workoutId ? workout : w
      ));
      throw new Error(`Error al guardar ejercicio: ${updateError.message}`);
    }
    
    if (!updatedWorkoutData) {
      console.error('❌ No se recibió el workout actualizado de la BD');
      // Revertir el cambio optimista
      setWorkouts((prev: Workout[]) => prev.map((w: Workout) => 
        w.id === workoutId ? workout : w
      ));
      throw new Error('No se recibió el workout actualizado de la base de datos');
    }
    
    console.log(`✅ Ejercicio actualizado exitosamente en BD. Workout ID: ${updatedWorkoutData.id}`);
    
    // CRÍTICO: Verificar que realmente se guardó correctamente en BD
    const { data: verifiedWorkout, error: verifyError } = await supabase
      .from('workouts')
      .select('*')
      .eq('id', updatedWorkoutData.id)
      .single();
    
    if (verifyError || !verifiedWorkout) {
      console.error('❌ ERROR CRÍTICO: El workout no se guardó correctamente en BD después de actualizar ejercicio:', verifyError);
      // Revertir el cambio optimista
      setWorkouts((prev: Workout[]) => prev.map((w: Workout) => 
        w.id === workoutId ? workout : w
      ));
      throw new Error('El workout no se guardó correctamente en la base de datos');
    }
    
    // Actualizar estado local con los datos confirmados de la BD
    setWorkouts((prev: Workout[]) => prev.map((w: Workout) => 
      w.id === workoutId ? (verifiedWorkout as Workout) : w
    ));
    
    // CRÍTICO: Recalcular SOLO el record del ejercicio editado, no todos los records
    // Esto evita que se pierdan records de otros ejercicios si hay un error
    // IMPORTANTE: Si el nombre del ejercicio cambió, recalcular ambos (antiguo y nuevo)
    if (userId && catalog && exercise.name) {
      try {
        const oldExerciseName = workout.structured_data.exercises[exerciseIndex]?.name?.trim();
        const newExerciseName = exercise.name.trim();
        
        // Si el nombre cambió, recalcular ambos records
        if (oldExerciseName && oldExerciseName !== newExerciseName) {
          console.log(`📊 El nombre del ejercicio cambió de "${oldExerciseName}" a "${newExerciseName}", recalculando ambos records...`);
          const { recalculateExerciseRecord } = await import('../services/recordsService');
          
          // Recalcular el record del nombre antiguo (puede que ya no exista en workouts, pero mantener datos históricos)
          await recalculateExerciseRecord(userId, oldExerciseName, catalog);
          
          // Recalcular el record del nombre nuevo
          await recalculateExerciseRecord(userId, newExerciseName, catalog);
          
          console.log(`✅ Records recalculados para ambos nombres`);
        } else {
          // El nombre no cambió, solo recalcular el record del ejercicio
          console.log(`📊 Recalculando record del ejercicio "${exercise.name}" después de editar...`);
          const { recalculateExerciseRecord } = await import('../services/recordsService');
          await recalculateExerciseRecord(userId, newExerciseName, catalog);
          console.log(`✅ Record del ejercicio "${exercise.name}" recalculado exitosamente`);
        }
      } catch (error) {
        console.error(`❌ Error recalculating record for exercise "${exercise.name}":`, error);
        // No lanzar el error para no bloquear la actualización del ejercicio
        // pero loguearlo para debugging
      }
    }
  }, [workouts, userId]);

  const deleteExercise = useCallback(async (
    workoutId: string,
    exerciseIndex: number,
    catalog?: ExerciseDef[]
  ) => {
    const workout = workouts.find((w: Workout) => w.id === workoutId);
    if (!workout) return;
    
    // Guardar el nombre del ejercicio que se va a eliminar para recalcular su record después
    const exerciseToDelete = workout.structured_data.exercises[exerciseIndex];
    const exerciseName = exerciseToDelete?.name?.trim();
    
    const newExercises = [...workout.structured_data.exercises];
    newExercises.splice(exerciseIndex, 1);
    
    // Si no quedan ejercicios, eliminar el workout completo
    if (newExercises.length === 0) {
      await confirmDeleteWorkout(workoutId, catalog);
      // Si había un ejercicio eliminado, recalcular su record (puede haber otros workouts con ese ejercicio)
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
    
    // Actualizar estado local optimísticamente
    setWorkouts((prev: Workout[]) => prev.map((w: Workout) => 
      w.id === workoutId ? { ...w, structured_data: updatedData } : w
    ));
    
    // CRÍTICO: Actualizar en BD y verificar que se guardó correctamente
    const { data: updatedWorkoutData, error: updateError } = await supabase
      .from('workouts')
      .update({ structured_data: updatedData })
      .eq('id', workoutId)
      .select()
      .single();
    
    if (updateError) {
      console.error('❌ Error al eliminar ejercicio en BD:', updateError);
      // Revertir el cambio optimista
      setWorkouts((prev: Workout[]) => prev.map((w: Workout) => 
        w.id === workoutId ? workout : w
      ));
      throw new Error(`Error al eliminar ejercicio: ${updateError.message}`);
    }
    
    if (!updatedWorkoutData) {
      console.error('❌ No se recibió el workout actualizado de la BD');
      // Revertir el cambio optimista
      setWorkouts((prev: Workout[]) => prev.map((w: Workout) => 
        w.id === workoutId ? workout : w
      ));
      throw new Error('No se recibió el workout actualizado de la base de datos');
    }
    
    // CRÍTICO: Verificar que realmente se guardó correctamente en BD
    const { data: verifiedWorkout, error: verifyError } = await supabase
      .from('workouts')
      .select('*')
      .eq('id', workoutId)
      .single();
    
    if (verifyError || !verifiedWorkout) {
      console.error('❌ ERROR CRÍTICO: El workout no se guardó correctamente en BD después de eliminar ejercicio:', verifyError);
      // Revertir el cambio optimista
      setWorkouts((prev: Workout[]) => prev.map((w: Workout) => 
        w.id === workoutId ? workout : w
      ));
      throw new Error('El workout no se guardó correctamente en la base de datos');
    }
    
    // Actualizar estado local con los datos confirmados de la BD
    setWorkouts((prev: Workout[]) => prev.map((w: Workout) => 
      w.id === workoutId ? (verifiedWorkout as Workout) : w
    ));
    
    // CRÍTICO: Recalcular SOLO el record del ejercicio eliminado, no todos los records
    // Esto evita que se pierdan records de otros ejercicios si hay un error
    // Si no quedan más workouts con ese ejercicio, el record se eliminará automáticamente
    if (exerciseName && userId && catalog) {
      try {
        console.log(`📊 Recalculando record del ejercicio "${exerciseName}" después de eliminar...`);
        const { recalculateExerciseRecord } = await import('../services/recordsService');
        await recalculateExerciseRecord(userId, exerciseName, catalog);
        console.log(`✅ Record del ejercicio "${exerciseName}" recalculado exitosamente`);
      } catch (error) {
        console.error(`❌ Error recalculating record for deleted exercise "${exerciseName}":`, error);
        // No lanzar el error para no bloquear la eliminación del ejercicio
        // pero loguearlo para debugging
      }
    }
  }, [workouts, confirmDeleteWorkout, userId]);

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

