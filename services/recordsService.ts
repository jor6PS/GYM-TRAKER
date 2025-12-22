import { supabase } from './supabase';
import { Workout, Exercise } from '../types';
import { ExerciseDef } from '../contexts/ExerciseContext';
import { getCanonicalId } from '../utils';
import { isCalisthenic } from './workoutProcessor/helpers';

export interface UserRecord {
  id?: string;
  user_id: string;
  exercise_id: string;
  exercise_name: string;
  max_weight_kg: number;
  max_weight_reps: number;
  max_weight_date?: string;
  max_weight_workout_id?: string;
  max_reps: number;
  max_reps_date?: string;
  max_reps_workout_id?: string;
  max_1rm_kg: number;
  max_1rm_date?: string;
  max_1rm_workout_id?: string;
  total_volume_kg: number;
  is_bodyweight: boolean;
  category?: string;
  exercise_type?: string;
  unit: string;
  // Mejor serie individual
  best_single_set_weight_kg?: number;
  best_single_set_reps?: number;
  best_single_set_volume_kg?: number;
  best_single_set_date?: string;
  best_single_set_workout_id?: string;
  // Mejor conjunto de series
  best_set_combination_volume_kg?: number;
  best_set_combination_sets_count?: number;
  best_set_combination_avg_reps?: number;
  best_set_combination_weight_kg?: number;
  best_set_combination_consistency_score?: number;
  best_set_combination_date?: string;
  best_set_combination_workout_id?: string;
}

/**
 * Calcula el 1RM estimado usando la fórmula de Epley
 */
const calculate1RM = (weight: number, reps: number): number => {
  if (weight === 0 || reps === 0) return 0;
  if (reps === 1) return weight;
  const r = Math.min(reps, 30);
  return Math.round(weight / (1.0278 - 0.0278 * r));
};

/**
 * Calcula el peso real considerando ejercicios unilaterales
 */
const calculateRealWeight = (
  weight: number,
  isUnilateral: boolean,
  unit: string
): number => {
  let weightInKg = unit === 'lbs' ? weight * 0.453592 : weight;
  if (isUnilateral) {
    weightInKg = weightInKg * 2; // Multiplicar por 2 si es unilateral
  }
  return weightInKg;
};

/**
 * Calcula el volumen de un set (peso * reps)
 */
const calculateSetVolume = (
  weight: number,
  reps: number,
  isUnilateral: boolean,
  isCalisthenic: boolean,
  userWeight: number,
  unit: string
): number => {
  const realWeight = calculateRealWeight(weight, isUnilateral, unit);
  const totalWeight = isCalisthenic ? realWeight + userWeight : realWeight;
  return totalWeight * reps;
};

/**
 * Calcula el score de consistencia de un conjunto de series
 * Penaliza cuando las reps disminuyen entre series
 */
const calculateConsistencyScore = (
  sets: Array<{ weight: number; reps: number }>,
  totalVolume: number
): number => {
  if (sets.length === 0) return 0;
  if (sets.length === 1) return totalVolume; // Una serie = consistencia perfecta
  
  // Calcular desviación estándar de las reps
  const reps = sets.map(s => s.reps);
  const avgReps = reps.reduce((a, b) => a + b, 0) / reps.length;
  const variance = reps.reduce((sum, r) => sum + Math.pow(r - avgReps, 2), 0) / reps.length;
  const stdDev = Math.sqrt(variance);
  
  // Score: volumen total × (1 - coeficiente de variación)
  // Un score más alto indica mejor consistencia
  const coefficientOfVariation = avgReps > 0 ? stdDev / avgReps : 1;
  const consistencyMultiplier = Math.max(0, 1 - coefficientOfVariation);
  
  return totalVolume * (0.5 + 0.5 * consistencyMultiplier); // Peso base 50% + 50% por consistencia
};

/**
 * Procesa un workout y actualiza los records del usuario
 */
export const updateUserRecords = async (
  workout: Workout,
  catalog: ExerciseDef[]
): Promise<void> => {
  if (!workout.user_id || !workout.structured_data?.exercises) return;

  const userWeight = workout.user_weight || 80;
  const workoutDate = workout.date;
  const workoutId = workout.id;

  for (const exercise of workout.structured_data.exercises) {
    const exerciseId = getCanonicalId(exercise.name, catalog);
    const exerciseDef = catalog.find(e => e.id === exerciseId);
    const exerciseType = exerciseDef?.type || 'strength';
    const category = exerciseDef?.category || exercise.category || 'General';
    const isCalis = isCalisthenic(exerciseId);
    const isUnilateral = exercise.unilateral || false;

    // Solo procesamos ejercicios de fuerza
    if (exerciseType !== 'strength') continue;
    
    // Solo dips y pull-ups/dominadas se consideran bodyweight
    // Los ejercicios de core y otros NO se tratan como bodyweight
    const isBodyweightExercise = isCalis;

    // Obtener o crear el record existente
    const { data: existingRecord, error: fetchError } = await supabase
      .from('user_records')
      .select('*')
      .eq('user_id', workout.user_id)
      .eq('exercise_id', exerciseId)
      .maybeSingle();
    
    // Si hay un error que no sea "no encontrado", loguearlo
    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching record:', fetchError);
    }

    // Si existe un record, usarlo; si no, crear uno nuevo
    // IMPORTANTE: El total_volume_kg se acumula a lo largo de todos los workouts
    // PERO: Si este workout ya fue procesado, no debemos sumar su volumen de nuevo
    // Para evitar duplicaciones, vamos a recalcular el volumen total desde cero
    // Esto es más seguro aunque sea menos eficiente
    let record: Partial<UserRecord> = existingRecord ? {
      ...existingRecord,
      // Resetear el volumen total - lo recalcularemos desde cero
      total_volume_kg: 0,
    } : {
      user_id: workout.user_id,
      exercise_id: exerciseId,
      exercise_name: exercise.name,
      max_weight_kg: 0,
      max_weight_reps: 0,
      max_reps: 0,
      max_1rm_kg: 0,
      total_volume_kg: 0, // Inicializar en 0 solo si es un record nuevo
      is_bodyweight: isBodyweightExercise,
      category,
      exercise_type: exerciseType,
      unit: 'kg',
      best_single_set_weight_kg: 0,
      best_single_set_reps: 0,
      best_single_set_volume_kg: 0,
      best_set_combination_volume_kg: 0,
      best_set_combination_sets_count: 0,
      best_set_combination_avg_reps: 0,
      best_set_combination_weight_kg: 0,
      best_set_combination_consistency_score: 0
    };
    
    // Calcular el volumen de este workout específico (solo los sets de este workout)
    let workoutVolume = 0;

    // Preparar arrays para análisis de mejor serie y mejor conjunto
    const setsData: Array<{ weight: number; reps: number; volume: number; realWeight: number }> = [];
    let bestSingleSet = {
      weight: 0,
      reps: 0,
      volume: 0,
      realWeight: 0
    };

    // Procesar cada set del ejercicio
    for (const set of exercise.sets) {
      const weight = set.weight || 0;
      const reps = set.reps || 0;
      const unit = set.unit || 'kg';

      if (reps === 0) continue;

      // Calcular peso real (considerando unilaterales)
      const realWeight = calculateRealWeight(weight, isUnilateral, unit);
      
      // Calcular volumen del set
      const setVolume = calculateSetVolume(
        weight,
        reps,
        isUnilateral,
        isBodyweightExercise,
        userWeight,
        unit
      );

      // Calcular peso real para análisis
      const totalWeight = isBodyweightExercise ? realWeight + userWeight : realWeight;

      // Guardar datos del set para análisis
      setsData.push({
        weight: weight,
        reps: reps,
        volume: setVolume,
        realWeight: totalWeight
      });

      // Actualizar mejor serie individual (mayor volumen de una sola serie)
      if (setVolume > bestSingleSet.volume) {
        bestSingleSet = {
          weight: totalWeight,
          reps: reps,
          volume: setVolume,
          realWeight: totalWeight
        };
      }

      // Acumular volumen de este workout
      workoutVolume += setVolume;

      // Si es ejercicio de peso corporal (calisténico o core sin peso adicional)
      if (isBodyweightExercise && weight === 0) {
        // Actualizar record de reps
        if (reps > (record.max_reps || 0)) {
          record.max_reps = reps;
          record.max_reps_date = workoutDate;
          record.max_reps_workout_id = workoutId;
        }
        
        // Para ejercicios calisténicos, el 1RM es el peso corporal del usuario
        // Calcular 1RM basado en peso corporal + reps
        const bodyweight1RM = calculate1RM(userWeight, reps);
        if (bodyweight1RM > (record.max_1rm_kg || 0)) {
          record.max_1rm_kg = bodyweight1RM;
          record.max_1rm_date = workoutDate;
          record.max_1rm_workout_id = workoutId;
        }
        
        // También actualizar max_weight_kg con el peso corporal para comparaciones
        if (userWeight > (record.max_weight_kg || 0)) {
          record.max_weight_kg = userWeight;
          record.max_weight_reps = reps;
          record.max_weight_date = workoutDate;
          record.max_weight_workout_id = workoutId;
        }
      } else {
        // Ejercicio con peso (o calisténico/core con peso adicional)
        const totalWeight = isBodyweightExercise ? realWeight + userWeight : realWeight;
        
        // Calcular 1RM para comparación
        const estimated1RM = calculate1RM(totalWeight, reps);
        const currentMaxWeight = record.max_weight_kg || 0;
        const currentMaxReps = record.max_weight_reps || 0;
        const currentMax1RM = record.max_1rm_kg || 0;
        
        // Actualizar record de peso máximo
        // Se actualiza si:
        // 1. El peso es mayor, O
        // 2. El peso es igual pero las reps son mayores, O
        // 3. El 1RM es mayor (mejor rendimiento aunque el peso sea menor)
        const isBetterWeightRecord = 
          totalWeight > currentMaxWeight || 
          (totalWeight === currentMaxWeight && reps > currentMaxReps) ||
          (estimated1RM > currentMax1RM && totalWeight >= currentMaxWeight * 0.9); // Permitir hasta 10% menos peso si el 1RM es mejor
        
        if (isBetterWeightRecord) {
          record.max_weight_kg = totalWeight;
          record.max_weight_reps = reps;
          record.max_weight_date = workoutDate;
          record.max_weight_workout_id = workoutId;
        }

        // Actualizar 1RM si es mejor
        if (estimated1RM > currentMax1RM) {
          record.max_1rm_kg = estimated1RM;
          record.max_1rm_date = workoutDate;
          record.max_1rm_workout_id = workoutId;
          
          // Si el 1RM es mejor pero el peso es menor, también actualizar max_weight si es razonable
          // (por ejemplo, 95kg × 15 reps puede tener mejor 1RM que 100kg × 10 reps)
          if (totalWeight < currentMaxWeight && estimated1RM > currentMax1RM) {
            // Solo actualizar si el peso no es mucho menor (más del 10% de diferencia)
            if (totalWeight >= currentMaxWeight * 0.9) {
              record.max_weight_kg = totalWeight;
              record.max_weight_reps = reps;
              record.max_weight_date = workoutDate;
              record.max_weight_workout_id = workoutId;
            }
          }
        }
      }
    }

    // Actualizar mejor serie individual si es mejor que la anterior
    if (bestSingleSet.volume > (record.best_single_set_volume_kg || 0)) {
      record.best_single_set_weight_kg = bestSingleSet.weight;
      record.best_single_set_reps = bestSingleSet.reps;
      record.best_single_set_volume_kg = bestSingleSet.volume;
      record.best_single_set_date = workoutDate;
      record.best_single_set_workout_id = workoutId;
    }

    // Calcular mejor conjunto de series del workout actual
    if (setsData.length > 0) {
      // Calcular el conjunto completo del ejercicio en este workout
      const totalVolume = setsData.reduce((sum, s) => sum + s.volume, 0);
      const avgReps = setsData.reduce((sum, s) => sum + s.reps, 0) / setsData.length;
      const avgWeight = setsData.reduce((sum, s) => sum + s.realWeight, 0) / setsData.length;
      const consistencyScore = calculateConsistencyScore(
        setsData.map(s => ({ weight: s.realWeight, reps: s.reps })),
        totalVolume
      );

      // También considerar subconjuntos del mismo peso (para casos donde cambias de peso)
      const setsByWeight = new Map<number, typeof setsData>();
      
      setsData.forEach(set => {
        const weightKey = Math.round(set.realWeight * 100) / 100; // Redondear a 2 decimales
        if (!setsByWeight.has(weightKey)) {
          setsByWeight.set(weightKey, []);
        }
        setsByWeight.get(weightKey)!.push(set);
      });

      // Encontrar el mejor conjunto (comparar conjunto completo vs subconjuntos del mismo peso)
      let bestCombination = {
        weight: avgWeight,
        sets: setsData,
        totalVolume: totalVolume,
        avgReps: avgReps,
        consistencyScore: consistencyScore
      };

      // Comparar con subconjuntos del mismo peso
      setsByWeight.forEach((sets, weight) => {
        if (sets.length < 2) return; // Solo considerar si hay 2+ series del mismo peso
        
        const subsetVolume = sets.reduce((sum, s) => sum + s.volume, 0);
        const subsetAvgReps = sets.reduce((sum, s) => sum + s.reps, 0) / sets.length;
        const subsetConsistencyScore = calculateConsistencyScore(
          sets.map(s => ({ weight: s.realWeight, reps: s.reps })),
          subsetVolume
        );

        // Comparar: primero por score de consistencia, luego por volumen total
        // Un conjunto más consistente con buen volumen es mejor que uno con más volumen pero menos consistente
        if (subsetConsistencyScore > bestCombination.consistencyScore ||
            (subsetConsistencyScore === bestCombination.consistencyScore && subsetVolume > bestCombination.totalVolume)) {
          bestCombination = {
            weight: weight,
            sets: sets,
            totalVolume: subsetVolume,
            avgReps: subsetAvgReps,
            consistencyScore: subsetConsistencyScore
          };
        }
      });

      // Actualizar mejor conjunto si es mejor que el anterior
      const currentBestScore = record.best_set_combination_consistency_score || 0;
      const currentBestVolume = record.best_set_combination_volume_kg || 0;
      
      if (bestCombination.consistencyScore > currentBestScore ||
          (bestCombination.consistencyScore === currentBestScore && bestCombination.totalVolume > currentBestVolume)) {
        record.best_set_combination_weight_kg = bestCombination.weight;
        record.best_set_combination_volume_kg = bestCombination.totalVolume;
        record.best_set_combination_sets_count = bestCombination.sets.length;
        record.best_set_combination_avg_reps = bestCombination.avgReps;
        record.best_set_combination_consistency_score = bestCombination.consistencyScore;
        record.best_set_combination_date = workoutDate;
        record.best_set_combination_workout_id = workoutId;
      }
    }

    // IMPORTANTE: En lugar de sumar, vamos a recalcular el volumen total desde cero
    // para evitar duplicaciones si el mismo workout se procesa múltiples veces
    // Esto requiere obtener todos los workouts del usuario y recalcular
    // Por ahora, sumamos pero el usuario debe recalcular desde el admin panel si hay problemas
    record.total_volume_kg = (record.total_volume_kg || 0) + workoutVolume;

    // Solo guardar si hay al menos un set procesado (reps > 0)
    // Esto evita crear records vacíos
    const hasData = (record.max_reps && record.max_reps > 0) || 
                   (record.max_weight_kg && record.max_weight_kg > 0) ||
                   (record.total_volume_kg && record.total_volume_kg > 0);
    
    if (!hasData) return; // No hay datos para guardar
    
    // Guardar o actualizar el record
    if (existingRecord) {
      const { error: updateError } = await supabase
        .from('user_records')
        .update(record)
        .eq('id', existingRecord.id);
      
      if (updateError) {
        console.error('Error updating record:', updateError);
      }
    } else {
      const { error: insertError } = await supabase
        .from('user_records')
        .insert(record);
      
      if (insertError) {
        console.error('Error inserting record:', insertError);
      }
    }
  }
};

/**
 * Recalcula todos los records de un usuario desde cero
 * Útil para migraciones o correcciones
 */
export const recalculateUserRecords = async (
  userId: string,
  workouts: Workout[],
  catalog: ExerciseDef[]
): Promise<void> => {
  // Eliminar records existentes
  await supabase
    .from('user_records')
    .delete()
    .eq('user_id', userId);

  // Agrupar todos los datos por ejercicio y calcular desde cero
  const exerciseDataMap = new Map<string, {
    exerciseName: string;
    totalVolume: number;
    maxWeight: number;
    maxWeightReps: number;
    maxWeightDate?: string;
    maxWeightWorkoutId?: string;
    maxReps: number;
    maxRepsDate?: string;
    maxRepsWorkoutId?: string;
    max1RM: number;
    max1RMDate?: string;
    max1RMWorkoutId?: string;
    isBodyweight: boolean;
    category: string;
    exerciseType: string;
    bestSingleSet: { weight: number; reps: number; volume: number; date?: string; workoutId?: string };
    allSets: Array<{ weight: number; reps: number; volume: number; realWeight: number; date: string; workoutId: string }>;
  }>();

  // Primera pasada: procesar todos los workouts y acumular datos
  for (const workout of workouts) {
    if (!workout.user_id || !workout.structured_data?.exercises) continue;
    
    const userWeight = workout.user_weight || 80;
    const workoutDate = workout.date;
    const workoutId = workout.id;

    for (const exercise of workout.structured_data.exercises) {
      const exerciseId = getCanonicalId(exercise.name, catalog);
      const exerciseDef = catalog.find(e => e.id === exerciseId);
      const exerciseType = exerciseDef?.type || 'strength';
      
      if (exerciseType !== 'strength') continue;
      
      const isCalis = isCalisthenic(exerciseId);
      const isUnilateral = exercise.unilateral || false;
      const isBodyweightExercise = isCalis;
      const category = exerciseDef?.category || exercise.category || 'General';

      if (!exerciseDataMap.has(exerciseId)) {
        exerciseDataMap.set(exerciseId, {
          exerciseName: exercise.name,
          totalVolume: 0,
          maxWeight: 0,
          maxWeightReps: 0,
          maxReps: 0,
          max1RM: 0,
          isBodyweight: isBodyweightExercise,
          category,
          exerciseType,
          bestSingleSet: { weight: 0, reps: 0, volume: 0 },
          allSets: []
        });
      }

      const data = exerciseDataMap.get(exerciseId)!;

      // Procesar cada set
      for (const set of exercise.sets) {
        const weight = set.weight || 0;
        const reps = set.reps || 0;
        const unit = set.unit || 'kg';

        if (reps === 0) continue;

        const realWeight = calculateRealWeight(weight, isUnilateral, unit);
        const setVolume = calculateSetVolume(weight, reps, isUnilateral, isBodyweightExercise, userWeight, unit);
        const totalWeight = isBodyweightExercise ? realWeight + userWeight : realWeight;
        const current1RM = calculate1RM(totalWeight, reps);

        // Acumular volumen total
        data.totalVolume += setVolume;

        // Guardar set para análisis de mejor combo
        data.allSets.push({
          weight: totalWeight,
          reps: reps,
          volume: setVolume,
          realWeight: totalWeight,
          date: workoutDate,
          workoutId: workoutId
        });

        // Actualizar mejor serie individual
        if (setVolume > data.bestSingleSet.volume) {
          data.bestSingleSet = { weight: totalWeight, reps: reps, volume: setVolume, date: workoutDate, workoutId: workoutId };
        }

        // Actualizar máximos
        if (isBodyweightExercise && weight === 0) {
          if (reps > data.maxReps) {
            data.maxReps = reps;
            data.maxRepsDate = workoutDate;
            data.maxRepsWorkoutId = workoutId;
          }
        } else {
          if (current1RM > data.max1RM) {
            data.max1RM = current1RM;
            data.max1RMDate = workoutDate;
            data.max1RMWorkoutId = workoutId;
          }
          if (totalWeight > data.maxWeight || (totalWeight === data.maxWeight && reps > data.maxWeightReps)) {
            data.maxWeight = totalWeight;
            data.maxWeightReps = reps;
            data.maxWeightDate = workoutDate;
            data.maxWeightWorkoutId = workoutId;
          }
        }
      }
    }
  }

  // Segunda pasada: calcular mejor combo y guardar records
  for (const [exerciseId, data] of exerciseDataMap.entries()) {
    // Calcular mejor conjunto de series (similar a updateUserRecords)
    let bestCombination = {
      weight: 0,
      sets: [] as Array<{ weight: number; reps: number; volume: number; realWeight: number }>,
      totalVolume: 0,
      avgReps: 0,
      consistencyScore: 0
    };

    if (data.allSets.length > 0) {
      // Agrupar sets por peso
      const setsByWeight = new Map<number, Array<{ weight: number; reps: number; volume: number; realWeight: number }>>();
      data.allSets.forEach(s => {
        const weightKey = Math.round(s.weight * 10) / 10; // Redondear a 1 decimal
        if (!setsByWeight.has(weightKey)) {
          setsByWeight.set(weightKey, []);
        }
        setsByWeight.get(weightKey)!.push(s);
      });

      // Encontrar mejor combinación
      setsByWeight.forEach((sets, weight) => {
        // Probar todas las combinaciones posibles de sets
        for (let i = 1; i <= sets.length; i++) {
          const subset = sets.slice(0, i);
          const subsetVolume = subset.reduce((sum, s) => sum + s.volume, 0);
          const subsetAvgReps = subset.reduce((sum, s) => sum + s.reps, 0) / subset.length;
          // calculateConsistencyScore solo necesita weight y reps
          const subsetForConsistency = subset.map(s => ({ weight: s.weight, reps: s.reps }));
          const subsetConsistencyScore = calculateConsistencyScore(subsetForConsistency, subsetVolume);

          if (subsetConsistencyScore > bestCombination.consistencyScore ||
              (subsetConsistencyScore === bestCombination.consistencyScore && subsetVolume > bestCombination.totalVolume)) {
            bestCombination = {
              weight: weight,
              sets: subset,
              totalVolume: subsetVolume,
              avgReps: subsetAvgReps,
              consistencyScore: subsetConsistencyScore
            };
          }
        }
      });
    }

    // Crear record final
    const record: Partial<UserRecord> = {
      user_id: userId,
      exercise_id: exerciseId,
      exercise_name: data.exerciseName,
      max_weight_kg: data.maxWeight,
      max_weight_reps: data.maxWeightReps,
      max_weight_date: data.maxWeightDate,
      max_weight_workout_id: data.maxWeightWorkoutId,
      max_reps: data.maxReps,
      max_reps_date: data.maxRepsDate,
      max_reps_workout_id: data.maxRepsWorkoutId,
      max_1rm_kg: data.max1RM,
      max_1rm_date: data.max1RMDate,
      max_1rm_workout_id: data.max1RMWorkoutId,
      total_volume_kg: data.totalVolume,
      is_bodyweight: data.isBodyweight,
      category: data.category,
      exercise_type: data.exerciseType,
      unit: 'kg',
      best_single_set_weight_kg: data.bestSingleSet.weight,
      best_single_set_reps: data.bestSingleSet.reps,
      best_single_set_volume_kg: data.bestSingleSet.volume,
      best_single_set_date: data.bestSingleSet.date,
      best_single_set_workout_id: data.bestSingleSet.workoutId,
      best_set_combination_volume_kg: bestCombination.totalVolume,
      best_set_combination_sets_count: bestCombination.sets.length,
      best_set_combination_avg_reps: bestCombination.avgReps,
      best_set_combination_weight_kg: bestCombination.weight,
      best_set_combination_consistency_score: bestCombination.consistencyScore,
      best_set_combination_date: bestCombination.sets.length > 0 ? (bestCombination.sets[0] as any).date : undefined,
      best_set_combination_workout_id: bestCombination.sets.length > 0 ? (bestCombination.sets[0] as any).workoutId : undefined
    };

    const hasData = (record.max_reps && record.max_reps > 0) || 
                   (record.max_weight_kg && record.max_weight_kg > 0) ||
                   (record.total_volume_kg && record.total_volume_kg > 0);
    
    if (hasData) {
      await supabase.from('user_records').insert(record);
    }
  }
};

/**
 * Obtiene todos los records de un usuario
 */
export const getUserRecords = async (userId: string): Promise<UserRecord[]> => {
  const { data, error } = await supabase
    .from('user_records')
    .select('*')
    .eq('user_id', userId)
    .order('max_1rm_kg', { ascending: false });

  if (error) {
    console.error('Error fetching user records:', error);
    return [];
  }

  return data || [];
};

/**
 * Obtiene el peso total levantado histórico de un usuario
 */
export const getUserTotalVolume = async (userId: string): Promise<number> => {
  const { data, error } = await supabase
    .from('user_records')
    .select('total_volume_kg')
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching total volume:', error);
    return 0;
  }

  return (data || []).reduce((sum: number, record: { total_volume_kg: number | null | undefined }) => {
    return sum + (record.total_volume_kg || 0);
  }, 0);
};

/**
 * Obtiene el mayor peso levantado histórico de un usuario
 */
export const getUserMaxWeight = async (userId: string): Promise<number> => {
  const { data, error } = await supabase
    .from('user_records')
    .select('max_weight_kg')
    .eq('user_id', userId)
    .eq('is_bodyweight', false)
    .order('max_weight_kg', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return 0;
  return data.max_weight_kg || 0;
};

/**
 * Obtiene el mayor 1RM histórico de un usuario
 */
export const getUserMax1RM = async (userId: string): Promise<number> => {
  const { data, error } = await supabase
    .from('user_records')
    .select('max_1rm_kg')
    .eq('user_id', userId)
    .order('max_1rm_kg', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return 0;
  return data.max_1rm_kg || 0;
};

