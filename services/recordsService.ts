import { supabase } from './supabase';
import { Workout, Exercise } from '../types';
import { ExerciseDef } from '../contexts/ExerciseContext';
import { getCanonicalId } from '../utils';
import { isCalisthenic } from './workoutProcessor/helpers';

/**
 * Interface simplificada para UserRecord
 * Almacena los records y estadísticas de cada usuario por ejercicio
 */
export interface UserRecord {
  // Identificadores
  id?: string;
  user_id: string;
  exercise_id: string;
  exercise_name: string;
  
  // Campos principales
  max_weight_kg: number;              // Peso máximo REAL levantado (nunca estimado)
  max_weight_reps: number;            // Repeticiones del peso máximo
  max_weight_date?: string;
  max_weight_workout_id?: string;
  
  max_1rm_kg: number;                 // 1RM estimado usando fórmula de Epley
  max_1rm_date?: string;
  max_1rm_workout_id?: string;
  
  total_volume_kg: number;            // Suma total: todos los pesos × reps × series
  
  // Mejor serie individual (mayor volumen = peso × reps)
  best_single_set_weight_kg?: number;
  best_single_set_reps?: number;
  best_single_set_volume_kg?: number;
  best_single_set_date?: string;
  best_single_set_workout_id?: string;
  
  // Mejor serie cerca del máximo (2-10 reps, peso más cercano al máximo, prioriza esfuerzo relativo)
  best_near_max_weight_kg?: number;
  best_near_max_reps?: number;
  best_near_max_date?: string;
  best_near_max_workout_id?: string;
  
  // Máximo de repeticiones (útil para calisténicos)
  max_reps: number;
  max_reps_date?: string;
  max_reps_workout_id?: string;
  
  // Registro de máximos diarios
  daily_max?: Array<{ date: string; max_weight_kg: number; max_reps: number }>;
  
  // Metadatos
  is_bodyweight: boolean;
  category?: string;
  exercise_type?: string;
  unit: string;
  
  // Auditoría
  created_at?: string;
  updated_at?: string;
}

/**
 * Calcula el 1RM estimado usando la fórmula de Epley
 * @param weight Peso levantado (en kg)
 * @param reps Número de repeticiones
 * @returns 1RM estimado en kg
 */
const calculate1RM = (weight: number, reps: number): number => {
  if (weight === 0 || reps === 0) return 0;
  if (reps === 1) return weight;
  const r = Math.min(reps, 30); // Limitar a 30 reps máximo para la fórmula
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
  if (!weight || weight === 0) return 0;
  const weightInKg = unit === 'lbs' ? weight * 0.453592 : weight;
  return isUnilateral ? weightInKg * 2 : weightInKg;
};

/**
 * Calcula el volumen de un set (peso × repeticiones)
 * Para calisténicos, incluye el peso corporal
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
 * Obtiene todos los records de un usuario
 */
export const getUserRecords = async (userId: string): Promise<UserRecord[]> => {
  const { data, error } = await supabase
    .from('user_records')
    .select('*')
    .eq('user_id', userId)
    .order('exercise_name', { ascending: true });
  
  if (error) {
    console.error('Error fetching user records:', error);
    return [];
  }
  
  return data || [];
};

/**
 * Obtiene el volumen total de un usuario sumando todos los total_volume_kg de la tabla user_records
 * Equivalente a: SELECT SUM(total_volume_kg) FROM user_records WHERE user_id = userId
 */
export const getUserTotalVolume = async (userId: string): Promise<number> => {
  const { data, error } = await supabase
    .from('user_records')
    .select('total_volume_kg')
    .eq('user_id', userId);
  
  if (error) {
    console.error(`[getUserTotalVolume] Error fetching total volume for userId ${userId}:`, error);
    throw error;
  }
  
  if (data === null || data === undefined) {
    console.warn(`[getUserTotalVolume] data es null/undefined para userId ${userId} - posible problema de permisos RLS`);
    throw new Error('No se pudo obtener datos - posible problema de permisos RLS');
  }
  
  const totalVolume = (data || []).reduce((sum, record) => sum + (record.total_volume_kg || 0), 0);
  console.log(`[getUserTotalVolume] Volumen total para userId ${userId}: ${Math.round(totalVolume)}kg (suma de ${data.length} records)`);
  return totalVolume;
};

/**
 * Procesa un workout y actualiza los records del usuario
 * Solo actualiza el ejercicio correspondiente cuando se sube un workout
 */
export const updateUserRecords = async (
  workout: Workout,
  catalog: ExerciseDef[]
): Promise<void> => {
  if (!workout.user_id || !workout.structured_data?.exercises) {
    console.warn('Workout sin user_id o exercises, saltando...', workout.id);
    return;
  }

  const userWeight = workout.user_weight || 80;
  const workoutDate = workout.date;
  const workoutId = workout.id;
  
  console.log(`📝 Procesando workout ${workoutId} (${workoutDate}) con ${workout.structured_data.exercises.length} ejercicios`);

  for (const exercise of workout.structured_data.exercises) {
    // Declarar variables fuera del try para que estén disponibles en el catch
    let exerciseNameExact = '';
    let exerciseId = '';
    
    try {
      if (!exercise.name) {
        console.warn('Ejercicio sin nombre encontrado, saltando...', exercise);
        continue;
      }

      // Usar el nombre exacto del ejercicio como ID único para diferenciar variantes
      // (ej: "Curl de Bíceps (Barra)" vs "Curl de Bíceps (Mancuernas)" deben ser records diferentes)
      exerciseNameExact = exercise.name.trim();
    
    // Buscar en el catálogo para obtener metadatos (category, type, etc.)
    // pero usar el nombre exacto como ID para preservar todas las variantes
    const canonicalId = getCanonicalId(exercise.name, catalog);
    const exerciseDef = catalog.find(e => e.id === canonicalId);
    
      // Usar el nombre exacto como exercise_id para preservar todas las variantes
      exerciseId = exerciseNameExact;
    
    const exerciseType = exerciseDef?.type || exercise.type || 'strength';
    
    // Solo procesar ejercicios de fuerza
    if (exerciseType !== 'strength') {
      console.log(`⏭️ Saltando ejercicio no-strength: ${exerciseNameExact} (tipo: ${exerciseType})`);
      continue;
    }
    
    // Si no tiene sets, crear un record vacío pero seguir
    if (!exercise.sets || exercise.sets.length === 0) {
      console.log(`  ⚠️ ${exerciseNameExact} no tiene sets`);
    }
    
    console.log(`  📋 Procesando ejercicio: "${exerciseNameExact}" (canonical: ${canonicalId}, id: ${exerciseId})`);
    
    const category = exerciseDef?.category || exercise.category || 'General';
    // Usar canonicalId para determinar si es calisténico (ya que se basa en el ID del catálogo)
    // Solo ejercicios que están explícitamente en la lista de calisténicos se consideran de peso corporal
    const isCalis = isCalisthenic(canonicalId);
    const isUnilateral = exercise.unilateral || false;
    
    // Obtener los sets del ejercicio ANTES de usarlos
    const exerciseSets = exercise.sets || [];
    
    // Solo considerar ejercicio de peso corporal si está en la lista de calisténicos
    const isBodyweightExercise = isCalis;

    // Obtener o crear el record existente
    const { data: existingRecord } = await supabase
      .from('user_records')
      .select('*')
      .eq('user_id', workout.user_id)
      .eq('exercise_id', exerciseId)
      .maybeSingle();
    
    // Inicializar record - hacer una copia del existente para no modificar el original
    let record: Partial<UserRecord> = existingRecord ? {
      ...existingRecord,
      // Asegurar que estos campos estén presentes
      total_volume_kg: existingRecord.total_volume_kg || 0,
      daily_max: (existingRecord.daily_max || []) as Array<{ date: string; max_weight_kg: number; max_reps: number }>,
      max_weight_kg: existingRecord.max_weight_kg || 0,
      max_weight_reps: existingRecord.max_weight_reps || 0,
      max_1rm_kg: existingRecord.max_1rm_kg || 0,
      max_reps: existingRecord.max_reps || 0,
      is_bodyweight: existingRecord.is_bodyweight ?? isBodyweightExercise,
      category: existingRecord.category || category,
      exercise_type: existingRecord.exercise_type || exerciseType,
      unit: existingRecord.unit || 'kg'
    } : {
      user_id: workout.user_id,
      exercise_id: exerciseId, // Nombre exacto del ejercicio para preservar variantes
      exercise_name: exerciseNameExact, // Nombre exacto
      max_weight_kg: 0,
      max_weight_reps: 0,
      max_1rm_kg: 0,
      total_volume_kg: 0,
      max_reps: 0,
      is_bodyweight: isBodyweightExercise,
      category,
      exercise_type: exerciseType,
      unit: 'kg',
      daily_max: []
    };

    // Variables para análisis
    let workoutVolume = 0; // Volumen solo de este workout
    let bestSingleSet = { weight: 0, reps: 0, volume: 0 };
    let best1RM = 0;
    let maxWeight = 0;
    let maxWeightReps = 0;
    let maxReps = 0;
    const dailyMaxMap = new Map<string, { max_weight_kg: number; max_reps: number }>();

    // Procesar cada set del ejercicio
    // exerciseSets ya está definido arriba
    if (exerciseSets.length === 0) {
      console.log(`  ⚠️ ${exerciseNameExact} no tiene sets - saltando ejercicio`);
      continue; // Saltar este ejercicio si no tiene sets
    }
    
    // Validar que haya al menos un set con reps > 0
    const hasValidSets = exerciseSets.some(s => (s.reps || 0) > 0);
    if (!hasValidSets) {
      console.log(`  ⚠️ ${exerciseNameExact} no tiene sets válidos (todos con reps === 0) - saltando ejercicio`);
      continue; // Saltar este ejercicio si no tiene sets válidos
    }
    
    for (const set of exerciseSets) {
      const weight = set.weight || 0;
      const reps = set.reps || 0;
      const unit = set.unit || 'kg';

      if (reps === 0) {
        // Continuar pero no contar este set
        continue;
      }

      // Calcular peso real
      const realWeight = calculateRealWeight(weight, isUnilateral, unit);
      const totalWeight = isBodyweightExercise ? realWeight + userWeight : realWeight;
      
      // Calcular volumen del set
      const setVolume = calculateSetVolume(weight, reps, isUnilateral, isBodyweightExercise, userWeight, unit);
      workoutVolume += setVolume;

      // Actualizar mejor serie individual (mayor volumen)
      if (setVolume > bestSingleSet.volume) {
        bestSingleSet = {
          weight: totalWeight,
          reps: reps,
          volume: setVolume
        };
      }

      // Actualizar 1RM estimado
      const estimated1RM = calculate1RM(totalWeight, reps);
      if (estimated1RM > best1RM) {
        best1RM = estimated1RM;
      }

      // Actualizar peso máximo (SOLO pesos reales, nunca estimados)
      if (reps === 1) {
        // Si es 1 rep, es un 1RM real
        if (totalWeight > maxWeight) {
          maxWeight = totalWeight;
          maxWeightReps = 1;
        }
      } else {
        // Si no es 1 rep, solo actualizar si no hay 1RM real y el peso es mayor
        if (maxWeightReps !== 1 && totalWeight > maxWeight) {
          maxWeight = totalWeight;
          maxWeightReps = reps;
        }
      }

      // Actualizar máximo de repeticiones
      // Para calisténicos sin peso adicional: actualizar max_reps y max_weight_reps juntos
      if (isBodyweightExercise && weight === 0) {
        if (reps > maxReps) {
          maxReps = reps;
          if (maxWeightReps !== 1) {
            maxWeightReps = reps; // Sincronizar porque el peso es siempre el mismo
          }
        }
      } else if (!isBodyweightExercise) {
        if (reps > maxReps) {
          maxReps = reps;
        }
      }

      // Actualizar máximo del día
      const workoutDateOnly = workoutDate.split('T')[0];
      const existingDayMax = dailyMaxMap.get(workoutDateOnly) || { max_weight_kg: 0, max_reps: 0 };
      if (totalWeight > existingDayMax.max_weight_kg ||
          (totalWeight === existingDayMax.max_weight_kg && reps > existingDayMax.max_reps)) {
        dailyMaxMap.set(workoutDateOnly, { max_weight_kg: totalWeight, max_reps: reps });
      }
    }

    // Actualizar record con los valores calculados de este workout
    // Comparar con el record existente para mantener los mejores valores
    const currentMaxWeight = record.max_weight_kg || 0;
    if (maxWeight > currentMaxWeight) {
      record.max_weight_kg = maxWeight;
      record.max_weight_reps = maxWeightReps;
      record.max_weight_date = workoutDate;
      record.max_weight_workout_id = workoutId;
    }

    const currentMax1RM = record.max_1rm_kg || 0;
    if (best1RM > currentMax1RM) {
      record.max_1rm_kg = best1RM;
      record.max_1rm_date = workoutDate;
      record.max_1rm_workout_id = workoutId;
    }

    const currentMaxReps = record.max_reps || 0;
    if (maxReps > currentMaxReps) {
      record.max_reps = maxReps;
      record.max_reps_date = workoutDate;
      record.max_reps_workout_id = workoutId;
    }
    
    // CRÍTICO: Para ejercicios de peso corporal sin peso adicional, 
    // asegurar que maxWeight sea al menos userWeight si hay repeticiones
    // Esto garantiza que el record tenga datos válidos para guardar
    if (isBodyweightExercise && maxReps > 0 && maxWeight === 0) {
      // Si es ejercicio de peso corporal y no hay peso máximo registrado,
      // establecer el peso máximo como userWeight (peso corporal)
      record.max_weight_kg = userWeight;
      record.max_weight_reps = maxReps;
      record.max_weight_date = workoutDate;
      record.max_weight_workout_id = workoutId;
      // Actualizar maxWeight para que se use en las validaciones siguientes
      maxWeight = userWeight;
    }
    
    // CRÍTICO: Para ejercicios de peso corporal, asegurar que maxWeight sea al menos userWeight
    // si hay repeticiones registradas (para que el record tenga datos válidos)
    if (isBodyweightExercise && maxReps > 0 && (record.max_weight_kg || 0) === 0) {
      record.max_weight_kg = userWeight;
      record.max_weight_reps = maxReps;
      record.max_weight_date = workoutDate;
      record.max_weight_workout_id = workoutId;
    }

    // Actualizar mejor serie individual (si hay volumen)
    const currentBestSetVolume = record.best_single_set_volume_kg || 0;
    if (bestSingleSet.volume > currentBestSetVolume) {
      record.best_single_set_weight_kg = bestSingleSet.weight;
      record.best_single_set_reps = bestSingleSet.reps;
      record.best_single_set_volume_kg = bestSingleSet.volume;
      record.best_single_set_date = workoutDate;
      record.best_single_set_workout_id = workoutId;
    }

    // Calcular mejor serie cerca del máximo
    // Para calistenia sin peso adicional: buscar series cercanas al máximo de repeticiones
    // Para otros ejercicios: buscar series con peso cercano al máximo
    const finalMaxWeight = Math.max(record.max_weight_kg || 0, maxWeight);
    const finalMaxReps = Math.max(record.max_reps || 0, maxReps);
    const hasOnlyBodyweight = isBodyweightExercise && exerciseSets.every(s => (s.weight || 0) === 0);
    
    let bestNearMax: { weight: number; reps: number; date: string; workoutId: string } | null = null;
    
    // Guardar el existente para comparar después
    const existingBestNearMax = existingRecord?.best_near_max_weight_kg && existingRecord?.best_near_max_reps ? {
      weight: existingRecord.best_near_max_weight_kg,
      reps: existingRecord.best_near_max_reps,
      date: existingRecord.best_near_max_date || '',
      workoutId: existingRecord.best_near_max_workout_id || ''
    } : null;
    
    if (hasOnlyBodyweight && finalMaxReps > 0) {
      // Calistenia sin peso adicional: buscar series con repeticiones cercanas a max_reps
      let bestRepScore = -1;
      
      // Inicializar con la mejor serie existente si hay
      if (existingBestNearMax) {
        const existingPercentage = finalMaxReps > 0 ? existingBestNearMax.reps / finalMaxReps : 0;
        bestRepScore = existingPercentage * existingPercentage;
        bestNearMax = existingBestNearMax;
      }

      for (const set of exerciseSets) {
        const weight = set.weight || 0;
        const reps = set.reps || 0;
        
        // Solo considerar series sin peso adicional y con 2 o más reps
        if (weight === 0 && reps >= 2 && reps <= finalMaxReps && reps > 0) {
          // Calcular porcentaje del máximo de repeticiones
          const percentageOfMaxReps = finalMaxReps > 0 ? reps / finalMaxReps : 0;
          // Score: repeticiones cercanas al máximo (mayor porcentaje)
          const score = percentageOfMaxReps * percentageOfMaxReps;
          
          if (score > bestRepScore || (score === bestRepScore && reps > (bestNearMax?.reps || 0))) {
            bestRepScore = score;
            const totalWeight = userWeight; // Para calistenia sin peso, siempre es el peso corporal
            bestNearMax = { weight: totalWeight, reps: reps, date: workoutDate, workoutId: workoutId };
          }
        }
      }
    } else if (finalMaxWeight > 0) {
      // Ejercicios normales o calistenia con peso adicional: buscar series con mejor esfuerzo relativo
      // El esfuerzo se calcula usando el 1RM estimado, priorizando series con alto % del máximo y reps razonables
      let bestScore = -1;
      
      // Calcular el 1RM máximo para usar como referencia (usar el máximo global actualizado)
      const finalMaxWeightReps = record.max_weight_reps || maxWeightReps || 1;
      const max1RM = finalMaxWeight > 0 ? calculate1RM(finalMaxWeight, finalMaxWeightReps) : 0;
      
      // Inicializar con la mejor serie existente si hay
      if (existingBestNearMax && max1RM > 0) {
        const existing1RM = calculate1RM(existingBestNearMax.weight, existingBestNearMax.reps);
        bestScore = existing1RM / max1RM;
        bestNearMax = existingBestNearMax;
      }

      for (const set of exerciseSets) {
        const weight = set.weight || 0;
        const reps = set.reps || 0;
        const unit = set.unit || 'kg';
        
        // Considerar series con 2-10 reps (rango razonable para esfuerzo cerca del máximo)
        if (reps >= 2 && reps <= 10 && reps > 0 && max1RM > 0) {
          const realWeight = calculateRealWeight(weight, isUnilateral, unit);
          const totalWeight = isBodyweightExercise ? realWeight + userWeight : realWeight;
          
          // Calcular 1RM estimado de esta serie
          const set1RM = calculate1RM(totalWeight, reps);
          // Score: porcentaje del 1RM máximo (el 1RM estimado ya considera peso y reps)
          // Esto prioriza series con alto 1RM estimado, que representa mejor esfuerzo relativo
          const score = set1RM / max1RM;
          
          // Si el score es mejor, o si es igual pero tiene más peso absoluto
          if (score > bestScore || (Math.abs(score - bestScore) < 0.001 && totalWeight > (bestNearMax?.weight || 0))) {
            bestScore = score;
            bestNearMax = { weight: totalWeight, reps: reps, date: workoutDate, workoutId: workoutId };
          }
        }
      }
    }

    // Actualizar best_near_max solo si encontramos una mejor serie
    if (bestNearMax) {
      record.best_near_max_weight_kg = bestNearMax.weight;
      record.best_near_max_reps = bestNearMax.reps;
      record.best_near_max_date = bestNearMax.date;
      record.best_near_max_workout_id = bestNearMax.workoutId;
    } else if (existingRecord?.best_near_max_weight_kg) {
      // Si no encontramos ninguna serie válida, mantener el existente
      record.best_near_max_weight_kg = existingRecord.best_near_max_weight_kg;
      record.best_near_max_reps = existingRecord.best_near_max_reps;
      record.best_near_max_date = existingRecord.best_near_max_date;
      record.best_near_max_workout_id = existingRecord.best_near_max_workout_id;
    }

    // CRÍTICO: Validar que haya datos válidos antes de procesar
    // workoutVolume ya se calculó arriba, así que si es > 0, hay sets válidos
    const hasValidData = workoutVolume > 0 || maxWeight > 0 || maxReps > 0 || best1RM > 0;
    
    // Si no hay datos válidos y no existe el record, saltar completamente
    if (!hasValidData && !existingRecord) {
      console.log(`  ⏭️ Saltando ${exerciseNameExact} (${exerciseId}): sin datos válidos para procesar (workoutVolume=${workoutVolume}, maxWeight=${maxWeight}, maxReps=${maxReps})`);
      continue; // Saltar este ejercicio completamente
    }

    // Actualizar volumen total SOLO si hay volumen válido del workout
    // Guardar el volumen anterior para poder revertir si falla el guardado
    const previousVolume = record.total_volume_kg || 0;
    if (workoutVolume > 0) {
      record.total_volume_kg = previousVolume + workoutVolume;
      console.log(`  📊 Acumulando volumen: ${workoutVolume}kg para ${exerciseNameExact} (${exerciseId}). Anterior: ${previousVolume}kg, Nuevo total: ${record.total_volume_kg}kg`);
    }

    // Actualizar daily_max (combinar con existentes)
    const existingDailyMax = (record.daily_max || []) as Array<{ date: string; max_weight_kg: number; max_reps: number }>;
    dailyMaxMap.forEach((dayMax, date) => {
      const existingIndex = existingDailyMax.findIndex(d => d.date === date);
      if (existingIndex >= 0) {
        const existing = existingDailyMax[existingIndex];
        if (dayMax.max_weight_kg > existing.max_weight_kg ||
            (dayMax.max_weight_kg === existing.max_weight_kg && dayMax.max_reps > existing.max_reps)) {
          existingDailyMax[existingIndex] = { ...dayMax, date };
        }
      } else {
        existingDailyMax.push({ ...dayMax, date });
      }
    });
    record.daily_max = existingDailyMax.sort((a, b) => b.date.localeCompare(a.date));

    // Determinar si hay datos válidos (volumen > 0 o algún máximo > 0)
    // CRÍTICO: Para ejercicios de peso corporal, maxReps > 0 es suficiente para considerar datos válidos
    const hasData = (record.total_volume_kg || 0) > 0 || 
                   (record.max_weight_kg || 0) > 0 || 
                   (record.max_reps || 0) > 0 ||
                   (record.max_1rm_kg || 0) > 0 ||
                   (isBodyweightExercise && maxReps > 0); // Ejercicios de peso corporal con reps > 0 tienen datos válidos
    
    // Si no hay datos válidos y no existe el record, no guardar
    if (!hasData && !existingRecord) {
      console.log(`  ⚠️ Record nuevo sin datos válidos para ${exerciseNameExact} (${exerciseId}), NO guardando`);
      continue; // Saltar este ejercicio completamente
    }
    
    // Función helper para convertir strings vacíos a undefined en campos UUID
    const sanitizeUUID = (value: string | undefined | null): string | undefined => {
      if (!value || value.trim() === '') return undefined;
      return value;
    };
    
    // Guardar o actualizar el record
    if (existingRecord) {
      // Construir objeto de actualización explícitamente para asegurar que todos los campos se incluyan
      const updateData: Partial<UserRecord> = {
        max_weight_kg: record.max_weight_kg ?? 0,
        max_weight_reps: record.max_weight_reps ?? 0,
        max_weight_date: record.max_weight_date || undefined,
        max_weight_workout_id: sanitizeUUID(record.max_weight_workout_id),
        max_1rm_kg: record.max_1rm_kg ?? 0,
        max_1rm_date: record.max_1rm_date || undefined,
        max_1rm_workout_id: sanitizeUUID(record.max_1rm_workout_id),
        total_volume_kg: record.total_volume_kg ?? 0,
        max_reps: record.max_reps ?? 0,
        max_reps_date: record.max_reps_date || undefined,
        max_reps_workout_id: sanitizeUUID(record.max_reps_workout_id),
        best_single_set_weight_kg: record.best_single_set_weight_kg,
        best_single_set_reps: record.best_single_set_reps,
        best_single_set_volume_kg: record.best_single_set_volume_kg,
        best_single_set_date: record.best_single_set_date || undefined,
        best_single_set_workout_id: sanitizeUUID(record.best_single_set_workout_id),
        best_near_max_weight_kg: record.best_near_max_weight_kg,
        best_near_max_reps: record.best_near_max_reps,
        best_near_max_date: record.best_near_max_date || undefined,
        best_near_max_workout_id: sanitizeUUID(record.best_near_max_workout_id),
        daily_max: record.daily_max || []
      };
      
      const { error: updateError } = await supabase
        .from('user_records')
        .update(updateData)
        .eq('id', existingRecord.id);
      
      if (updateError) {
        console.error(`❌ Error updating record para ${exerciseNameExact} (${exerciseId}):`, updateError);
        console.error('Update data:', JSON.stringify(updateData, null, 2));
        // CRÍTICO: Si falla el update, revertir el volumen acumulado en memoria
        record.total_volume_kg = previousVolume;
        console.error(`  🔄 Volumen revertido a ${previousVolume}kg debido al error de guardado`);
        throw new Error(`Error al actualizar record: ${updateError.message}. El volumen NO se acumuló.`);
      } else {
        console.log(`✅ Record actualizado: ${exerciseNameExact} (${exerciseId}) - user_id: ${record.user_id}, volumen acumulado: ${workoutVolume}kg, total: ${updateData.total_volume_kg}kg`);
      }
    } else {
      // Función helper para convertir strings vacíos a null en campos UUID
      const sanitizeUUID = (value: string | undefined | null): string | undefined => {
        if (!value || value.trim() === '') return undefined;
        return value;
      };
      
      // Asegurar que todos los campos requeridos estén presentes
      const insertData: Partial<UserRecord> = {
        user_id: record.user_id!,
        exercise_id: record.exercise_id!,
        exercise_name: record.exercise_name!,
        max_weight_kg: record.max_weight_kg ?? 0,
        max_weight_reps: record.max_weight_reps ?? 0,
        max_weight_date: record.max_weight_date || undefined,
        max_weight_workout_id: sanitizeUUID(record.max_weight_workout_id),
        max_1rm_kg: record.max_1rm_kg ?? 0,
        max_1rm_date: record.max_1rm_date || undefined,
        max_1rm_workout_id: sanitizeUUID(record.max_1rm_workout_id),
        total_volume_kg: record.total_volume_kg ?? 0,
        max_reps: record.max_reps ?? 0,
        max_reps_date: record.max_reps_date || undefined,
        max_reps_workout_id: sanitizeUUID(record.max_reps_workout_id),
        is_bodyweight: record.is_bodyweight ?? false,
        category: record.category,
        exercise_type: record.exercise_type,
        unit: record.unit ?? 'kg',
        best_single_set_weight_kg: record.best_single_set_weight_kg,
        best_single_set_reps: record.best_single_set_reps,
        best_single_set_volume_kg: record.best_single_set_volume_kg,
        best_single_set_date: record.best_single_set_date || undefined,
        best_single_set_workout_id: sanitizeUUID(record.best_single_set_workout_id),
        best_near_max_weight_kg: record.best_near_max_weight_kg,
        best_near_max_reps: record.best_near_max_reps,
        best_near_max_date: record.best_near_max_date || undefined,
        best_near_max_workout_id: sanitizeUUID(record.best_near_max_workout_id),
        daily_max: record.daily_max || []
      };
      
      const { error: insertError, data: insertedData } = await supabase
        .from('user_records')
        .insert(insertData)
        .select();
      
      if (insertError) {
        console.error(`❌ Error inserting record para ${exerciseNameExact} (${exerciseId}):`, insertError);
        console.error('Insert data:', JSON.stringify(insertData, null, 2));
        // CRÍTICO: Si falla el insert, el volumen NO se debe acumular
        // El volumen ya se acumuló en record.total_volume_kg, pero como falló el guardado, debemos revertir
        // Sin embargo, como es un nuevo record, el volumen anterior era 0, así que no hay nada que revertir
        // Pero lanzamos el error para que se maneje en el catch
        throw new Error(`Error al insertar record: ${insertError.message}. El volumen NO se acumuló.`);
      } else {
        console.log(`✅ Record insertado: ${exerciseNameExact} (${exerciseId}) - user_id: ${insertedData?.[0]?.user_id}, volumen: ${workoutVolume}kg, total: ${insertedData?.[0]?.total_volume_kg}kg`);
      }
    }
    } catch (exerciseError: any) {
      // Si hay un error al procesar este ejercicio, loguearlo pero continuar con los demás
      const errorExerciseName = exerciseNameExact || exercise?.name || 'desconocido';
      const errorExerciseId = exerciseId || 'desconocido';
      console.error(`❌ Error procesando ejercicio ${errorExerciseName} (${errorExerciseId}):`, exerciseError);
      console.error(`   El volumen de este ejercicio NO se acumuló debido al error.`);
      // Continuar con el siguiente ejercicio
      continue;
    }
  }
};

/**
 * Recalcula todos los records de un usuario desde cero
 * Útil para migraciones o correcciones desde el panel de administración
 * 
 * PROCESAMIENTO MEJORADO: Agrupa todos los workouts por ejercicio para calcular correctamente:
 * - Volumen total acumulado
 * - Máximos diarios correctos (todos los workouts del mismo día)
 * - Todos los máximos globales
 */
export const recalculateUserRecords = async (
  userId: string,
  workouts: Workout[],
  catalog: ExerciseDef[]
): Promise<void> => {
  console.log(`🔄 Iniciando recalculación mejorada de records para user_id: ${userId}, ${workouts.length} workouts`);
  
  // Eliminar records existentes
  const { error: deleteError } = await supabase
    .from('user_records')
    .delete()
    .eq('user_id', userId);

  if (deleteError) {
    console.error(`Error eliminando records existentes para user_id ${userId}:`, deleteError);
    return;
  } else {
    console.log(`✅ Records existentes eliminados para user_id: ${userId}`);
  }

  // Ordenar workouts cronológicamente
  const sortedWorkouts = [...workouts].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Agrupar todos los sets por ejercicio (usando nombre exacto como clave)
  const exerciseMap = new Map<string, {
    exerciseName: string;
    exerciseId: string;
    canonicalId: string;
    sets: Array<{
      workoutId: string;
      workoutDate: string;
      userWeight: number;
      weight: number;
      reps: number;
      unit: string;
      isUnilateral: boolean;
    }>;
    exerciseDef?: ExerciseDef;
    category: string;
    exerciseType: string;
    isBodyweight: boolean;
  }>();

  // Paso 1: Recopilar todos los sets de todos los workouts agrupados por ejercicio
  for (const workout of sortedWorkouts) {
    if (!workout.user_id || !workout.structured_data?.exercises) continue;
    
    const userWeight = workout.user_weight || 80;
    const workoutDate = workout.date;
    const workoutId = workout.id;

    for (const exercise of workout.structured_data.exercises) {
      if (!exercise.name) continue;

      const exerciseNameExact = exercise.name.trim();
      const canonicalId = getCanonicalId(exercise.name, catalog);
      const exerciseDef = catalog.find(e => e.id === canonicalId);
      const exerciseType = exerciseDef?.type || exercise.type || 'strength';
      
      // Solo procesar ejercicios de fuerza
      if (exerciseType !== 'strength') continue;

      const exerciseId = exerciseNameExact; // Usar nombre exacto como ID
      
      // Inicializar o obtener el entry para este ejercicio
      if (!exerciseMap.has(exerciseId)) {
      const category = exerciseDef?.category || exercise.category || 'General';
        const isCalis = isCalisthenic(canonicalId);
        
        // Solo ejercicios que están explícitamente en la lista de calisténicos se consideran de peso corporal
        const exerciseSets = exercise.sets || [];
        const isBodyweight = isCalis;
        
        exerciseMap.set(exerciseId, {
          exerciseName: exerciseNameExact,
          exerciseId,
          canonicalId,
          sets: [],
          exerciseDef,
          category,
          exerciseType,
          isBodyweight
        });
      }

      const exerciseEntry = exerciseMap.get(exerciseId)!;
      const isUnilateral = exercise.unilateral || false;

      // Agregar todos los sets de este ejercicio de este workout
      for (const set of exercise.sets || []) {
        if ((set.reps || 0) === 0) continue; // Saltar sets sin reps

        exerciseEntry.sets.push({
          workoutId,
          workoutDate,
          userWeight,
          weight: set.weight || 0,
          reps: set.reps || 0,
          unit: set.unit || 'kg',
          isUnilateral
        });
      }
    }
  }

  console.log(`📊 Encontrados ${exerciseMap.size} ejercicios únicos`);

  // Paso 2: Procesar cada ejercicio con todos sus sets
  for (const [exerciseId, exerciseData] of exerciseMap.entries()) {
    try {
      const { exerciseName, sets, category, exerciseType, isBodyweight } = exerciseData;
      
      if (sets.length === 0) {
        console.log(`  ⚠️ ${exerciseName} no tiene sets válidos, saltando`);
        continue;
      }

      const uniqueDays = new Set(sets.map(s => s.workoutDate.split('T')[0])).size;
      console.log(`  📋 Procesando ${exerciseName} con ${sets.length} sets de ${uniqueDays} días diferentes`);

      // Calcular todos los máximos y volumen total
      // CRÍTICO: Inicializar campos UUID como null o undefined, nunca como strings vacíos
      let totalVolume = 0;
      let bestSingleSet = { weight: 0, reps: 0, volume: 0, date: '', workoutId: '' };
      let best1RM = 0;
      let best1RMDate: string | null = null;
      let best1RMWorkoutId: string | null = null;
      let maxWeight = 0;
      let maxWeightReps = 0;
      let maxWeightDate: string | null = null;
      let maxWeightWorkoutId: string | null = null;
      let maxReps = 0;
      let maxRepsDate: string | null = null;
      let maxRepsWorkoutId: string | null = null;
      const dailyMaxMap = new Map<string, { max_weight_kg: number; max_reps: number }>();

      // Procesar todos los sets
      for (const set of sets) {
        const { weight, reps, unit, isUnilateral, userWeight, workoutDate, workoutId } = set;
        
        // Calcular peso real
        const realWeight = calculateRealWeight(weight, isUnilateral, unit);
        const totalWeight = isBodyweight ? realWeight + userWeight : realWeight;

        // Calcular volumen del set
        const setVolume = calculateSetVolume(weight, reps, isUnilateral, isBodyweight, userWeight, unit);
        totalVolume += setVolume;

        // Actualizar mejor serie individual (mayor volumen)
        if (setVolume > bestSingleSet.volume) {
          bestSingleSet = {
          weight: totalWeight,
          reps: reps,
          volume: setVolume,
          date: workoutDate,
            workoutId
          };
        }

        // Actualizar 1RM estimado
        const estimated1RM = calculate1RM(totalWeight, reps);
        if (estimated1RM > best1RM) {
          best1RM = estimated1RM;
          best1RMDate = workoutDate;
          best1RMWorkoutId = workoutId;
        }

        // Actualizar peso máximo (SOLO pesos reales, nunca estimados)
        if (reps === 1) {
          // Si es 1 rep, es un 1RM real
          if (totalWeight > maxWeight) {
            maxWeight = totalWeight;
            maxWeightReps = 1;
            maxWeightDate = workoutDate;
            maxWeightWorkoutId = workoutId;
          }
        } else {
          // Si no es 1 rep, solo actualizar si no hay 1RM real y el peso es mayor
          if (maxWeightReps !== 1 && totalWeight > maxWeight) {
            maxWeight = totalWeight;
            maxWeightReps = reps;
            maxWeightDate = workoutDate;
            maxWeightWorkoutId = workoutId;
          }
        }

        // Actualizar máximo de repeticiones
        // Para ejercicios de peso corporal sin peso adicional: actualizar max_reps y max_weight_reps juntos
        if (isBodyweight && weight === 0) {
          if (reps > maxReps) {
            maxReps = reps;
            maxRepsDate = workoutDate;
            maxRepsWorkoutId = workoutId;
            // Para ejercicios de peso corporal, el peso máximo es siempre userWeight
            // Sincronizar maxWeightReps con maxReps
            if (maxWeightReps !== 1 || reps > maxReps) {
              maxWeightReps = reps;
              // Actualizar maxWeight si es necesario (para ejercicios de peso corporal, es userWeight)
              if (maxWeight === 0 || totalWeight > maxWeight) {
                maxWeight = totalWeight;
                maxWeightDate = workoutDate;
                maxWeightWorkoutId = workoutId;
              }
            }
          }
        } else if (!isBodyweight) {
          if (reps > maxReps) {
            maxReps = reps;
            maxRepsDate = workoutDate;
            maxRepsWorkoutId = workoutId;
          }
        }

        // Actualizar máximo del día (procesar todos los sets del mismo día juntos)
        const workoutDateOnly = workoutDate.split('T')[0];
        const existingDayMax = dailyMaxMap.get(workoutDateOnly) || { max_weight_kg: 0, max_reps: 0 };
        if (totalWeight > existingDayMax.max_weight_kg ||
            (totalWeight === existingDayMax.max_weight_kg && reps > existingDayMax.max_reps)) {
          dailyMaxMap.set(workoutDateOnly, { max_weight_kg: totalWeight, max_reps: reps });
        }
      }

      // Calcular mejor serie cerca del máximo
      let bestNearMax: { weight: number; reps: number; date: string; workoutId: string } | null = null;
      
      // Para calistenia sin peso adicional: buscar series cercanas al máximo de repeticiones
      // Para otros ejercicios: buscar series con peso cercano al máximo
      const hasOnlyBodyweight = isBodyweight && sets.every(s => s.weight === 0);
      
      if (hasOnlyBodyweight && maxReps > 0) {
        // Calistenia sin peso adicional: buscar series con repeticiones cercanas a max_reps
        let bestRepScore = -1;
        for (const set of sets) {
          const { weight, reps, workoutDate, workoutId, userWeight, isUnilateral, unit } = set;
          
          // Solo considerar series sin peso adicional
          if (weight === 0 && reps >= 2 && reps <= maxReps && reps > 0) {
            // Calcular porcentaje del máximo de repeticiones
            const percentageOfMaxReps = maxReps > 0 ? reps / maxReps : 0;
            // Score: repeticiones cercanas al máximo (mayor porcentaje)
            const score = percentageOfMaxReps * percentageOfMaxReps;
            
            if (score > bestRepScore || (score === bestRepScore && reps > (bestNearMax?.reps || 0))) {
              bestRepScore = score;
              const realWeight = calculateRealWeight(weight, isUnilateral, unit);
              const totalWeight = isBodyweight ? realWeight + userWeight : realWeight;
              bestNearMax = { weight: totalWeight, reps: reps, date: workoutDate, workoutId };
            }
          }
        }
      } else if (maxWeight > 0) {
        // Ejercicios normales o calistenia con peso adicional: buscar series con mejor esfuerzo relativo
        // El esfuerzo se calcula usando el 1RM estimado, priorizando series con alto % del máximo
        let bestScore = -1;
        
        // Calcular el 1RM máximo para usar como referencia
        const max1RM = maxWeight > 0 ? calculate1RM(maxWeight, maxWeightReps || 1) : 0;
        
        for (const set of sets) {
          const { weight, reps, unit, isUnilateral, userWeight, workoutDate, workoutId } = set;
          
          // Considerar series con 2-10 reps (rango razonable para esfuerzo cerca del máximo)
          if (reps >= 2 && reps <= 10 && reps > 0 && max1RM > 0) {
            const realWeight = calculateRealWeight(weight, isUnilateral, unit);
            const totalWeight = isBodyweight ? realWeight + userWeight : realWeight;
            
            // Calcular 1RM estimado de esta serie
            const set1RM = calculate1RM(totalWeight, reps);
            // Score: porcentaje del 1RM máximo (el 1RM estimado ya considera peso y reps)
            // Esto prioriza series con alto 1RM estimado, que representa mejor esfuerzo relativo
            const score = set1RM / max1RM;
            
            // Si el score es mejor, o si es igual pero tiene más peso absoluto
            if (score > bestScore || (Math.abs(score - bestScore) < 0.001 && totalWeight > (bestNearMax?.weight || 0))) {
              bestScore = score;
              bestNearMax = { weight: totalWeight, reps: reps, date: workoutDate, workoutId };
            }
          }
        }
      }

      // Preparar el record para insertar
      const dailyMaxArray = Array.from(dailyMaxMap.entries())
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => b.date.localeCompare(a.date));

      // Función helper para convertir strings vacíos a null en campos UUID
      const sanitizeUUID = (value: string | undefined | null): string | undefined => {
        if (!value || value.trim() === '') return undefined;
        return value;
      };
      
      // CRÍTICO: Para ejercicios de peso corporal sin peso adicional, 
      // asegurar que maxWeight sea al menos el peso corporal si hay repeticiones
      // Obtener el peso del usuario del primer set (todos los sets tienen el mismo userWeight)
      const userWeightFromSet = sets.length > 0 ? sets[0].userWeight : 80;
      let finalMaxWeight = maxWeight;
      let finalMaxWeightReps = maxWeightReps;
      let finalMaxWeightDate = maxWeightDate;
      let finalMaxWeightWorkoutId = maxWeightWorkoutId;
      
      if (isBodyweight && maxReps > 0 && maxWeight === 0) {
        // Si es ejercicio de peso corporal y no hay peso máximo registrado,
        // establecer el peso máximo como userWeight (peso corporal)
        finalMaxWeight = userWeightFromSet;
        finalMaxWeightReps = maxReps;
        finalMaxWeightDate = maxRepsDate;
        finalMaxWeightWorkoutId = maxRepsWorkoutId;
      }

    const record: Partial<UserRecord> = {
      user_id: userId,
      exercise_id: exerciseId,
        exercise_name: exerciseName,
        max_weight_kg: finalMaxWeight,
        max_weight_reps: finalMaxWeightReps,
        max_weight_date: finalMaxWeightDate || undefined,
        max_weight_workout_id: sanitizeUUID(finalMaxWeightWorkoutId),
        max_1rm_kg: best1RM,
        max_1rm_date: best1RMDate || undefined,
        max_1rm_workout_id: sanitizeUUID(best1RMWorkoutId),
        total_volume_kg: totalVolume,
        max_reps: maxReps,
        max_reps_date: maxRepsDate || undefined,
        max_reps_workout_id: sanitizeUUID(maxRepsWorkoutId),
        is_bodyweight: isBodyweight,
        category,
        exercise_type: exerciseType,
      unit: 'kg',
        best_single_set_weight_kg: bestSingleSet.weight > 0 ? bestSingleSet.weight : undefined,
        best_single_set_reps: bestSingleSet.reps > 0 ? bestSingleSet.reps : undefined,
        best_single_set_volume_kg: bestSingleSet.volume > 0 ? bestSingleSet.volume : undefined,
        best_single_set_date: bestSingleSet.date || undefined,
        best_single_set_workout_id: sanitizeUUID(bestSingleSet.workoutId),
        best_near_max_weight_kg: bestNearMax?.weight,
        best_near_max_reps: bestNearMax?.reps,
        best_near_max_date: bestNearMax?.date || undefined,
        best_near_max_workout_id: sanitizeUUID(bestNearMax?.workoutId),
        daily_max: dailyMaxArray
      };

      // Insertar el record
      const { error: insertError } = await supabase
    .from('user_records')
        .insert(record);

      if (insertError) {
        console.error(`❌ Error insertando record para ${exerciseName}:`, insertError);
        console.error('Record data:', JSON.stringify(record, null, 2));
      } else {
        console.log(`✅ Record insertado: ${exerciseName} - volumen: ${totalVolume}kg, máx: ${maxWeight}kg, días: ${dailyMaxArray.length}`);
      }

    } catch (error) {
      console.error(`Error procesando ejercicio ${exerciseId}:`, error);
    }
  }

  console.log(`✅ Recalculación mejorada completada para user_id: ${userId}`);
};

/**
 * Recalcula SOLO el record de un ejercicio específico
 * Útil cuando se edita un ejercicio para actualizar solo su record sin afectar otros
 * 
 * @param userId ID del usuario
 * @param exerciseName Nombre exacto del ejercicio a recalcular
 * @param workouts Todos los workouts del usuario (opcional, si no se proporciona se obtienen de BD)
 * @param catalog Catálogo de ejercicios
 */
export const recalculateExerciseRecord = async (
  userId: string,
  exerciseName: string,
  catalog: ExerciseDef[],
  workouts?: Workout[]
): Promise<void> => {
  console.log(`🔄 Recalculando record del ejercicio "${exerciseName}" para user_id: ${userId}`);
  
  // Obtener workouts si no se proporcionaron
  let allWorkouts = workouts;
  if (!allWorkouts) {
    const { data: workoutsData, error: fetchError } = await supabase
      .from('workouts')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: true });
    
    if (fetchError) {
      console.error(`Error obteniendo workouts para recalcular ejercicio ${exerciseName}:`, fetchError);
      throw new Error(`Error obteniendo workouts: ${fetchError.message}`);
    }
    
    allWorkouts = (workoutsData || []) as Workout[];
  }
  
  const exerciseNameExact = exerciseName.trim();
  const exerciseId = exerciseNameExact; // Usar nombre exacto como ID
  
  // CRÍTICO: Buscar records existentes que puedan corresponder a este ejercicio
  // usando diferentes variaciones del nombre (normalización)
  const normalizedSearchName = exerciseNameExact.toLowerCase().replace(/\s+/g, ' ').trim();
  
  // Filtrar workouts que contienen este ejercicio (búsqueda más flexible)
  const relevantWorkouts = allWorkouts.filter(workout => {
    if (!workout.structured_data?.exercises) return false;
    return workout.structured_data.exercises.some(ex => {
      const exName = ex.name?.trim() || '';
      const normalizedExName = exName.toLowerCase().replace(/\s+/g, ' ').trim();
      // Comparación exacta o normalizada (sin diferenciar mayúsculas/minúsculas ni espacios múltiples)
      return exName === exerciseNameExact || normalizedExName === normalizedSearchName;
    });
  });
  
  // CRÍTICO: Si no hay workouts con este ejercicio, eliminar el record
  // Ya que no hay datos válidos que mantener
  if (relevantWorkouts.length === 0) {
    console.log(`  ⚠️ No se encontraron workouts con el ejercicio "${exerciseName}", eliminando record`);
    
    // Obtener el record existente para eliminarlo
    const { data: existingRecord } = await supabase
      .from('user_records')
      .select('*')
      .eq('user_id', userId)
      .eq('exercise_id', exerciseId)
      .maybeSingle();
    
    if (existingRecord) {
      const { error: deleteError } = await supabase
        .from('user_records')
        .delete()
        .eq('id', existingRecord.id);
      
      if (deleteError) {
        console.error(`❌ Error eliminando record para ${exerciseName}:`, deleteError);
        throw new Error(`Error eliminando record: ${deleteError.message}`);
      } else {
        console.log(`✅ Record eliminado para "${exerciseName}" (ya no hay workouts con este ejercicio)`);
      }
    } else {
      console.log(`  ℹ️ No existe record para "${exerciseName}", nada que eliminar`);
    }
    
    // No continuar con el recálculo ya que no hay workouts
    return;
  }
  
  console.log(`  📋 Encontrados ${relevantWorkouts.length} workouts con el ejercicio "${exerciseName}"`);
  
  // Obtener metadatos del ejercicio
  const canonicalId = getCanonicalId(exerciseName, catalog);
  const exerciseDef = catalog.find(e => e.id === canonicalId);
  const exerciseType = exerciseDef?.type || 'strength';
  
  if (exerciseType !== 'strength') {
    console.log(`  ⏭️ Saltando ejercicio no-strength: ${exerciseName}`);
    return;
  }
  
  const category = exerciseDef?.category || 'General';
  const isCalis = isCalisthenic(canonicalId);
  
  // Recopilar todos los sets de este ejercicio de todos los workouts relevantes
  const sets: Array<{
    workoutId: string;
    workoutDate: string;
    userWeight: number;
    weight: number;
    reps: number;
    unit: string;
    isUnilateral: boolean;
  }> = [];
  
  for (const workout of relevantWorkouts) {
    if (!workout.structured_data?.exercises) continue;
    
    const userWeight = workout.user_weight || 80;
    const workoutDate = workout.date;
    const workoutId = workout.id;
    
    for (const exercise of workout.structured_data.exercises) {
      const exName = exercise.name?.trim() || '';
      const normalizedExName = exName.toLowerCase().replace(/\s+/g, ' ').trim();
      // Comparación más flexible: exacta o normalizada
      if (exName !== exerciseNameExact && normalizedExName !== normalizedSearchName) continue;
      
      const isUnilateral = exercise.unilateral || false;
      
      for (const set of exercise.sets || []) {
        if ((set.reps || 0) === 0) continue;
        
        sets.push({
          workoutId,
          workoutDate,
          userWeight,
          weight: set.weight || 0,
          reps: set.reps || 0,
          unit: set.unit || 'kg',
          isUnilateral
        });
      }
    }
  }
  
  // Solo ejercicios que están explícitamente en la lista de calisténicos se consideran de peso corporal
  const isBodyweight = isCalis;
  
  // CRÍTICO: Si no hay sets válidos, eliminar el record
  // Ya que no hay datos válidos que mantener (los workouts existen pero no tienen sets válidos)
  if (sets.length === 0) {
    console.log(`  ⚠️ El ejercicio "${exerciseName}" no tiene sets válidos en los workouts encontrados, eliminando record`);
    
    // Verificar si existe el record
    const { data: existingRecord } = await supabase
      .from('user_records')
      .select('*')
      .eq('user_id', userId)
      .eq('exercise_id', exerciseId)
      .maybeSingle();
    
    if (existingRecord) {
      const { error: deleteError } = await supabase
        .from('user_records')
        .delete()
        .eq('id', existingRecord.id);
      
      if (deleteError) {
        console.error(`❌ Error eliminando record para ${exerciseName}:`, deleteError);
        throw new Error(`Error eliminando record: ${deleteError.message}`);
      } else {
        console.log(`✅ Record eliminado para "${exerciseName}" (no tiene sets válidos)`);
      }
    } else {
      console.log(`  ℹ️ No existe record para "${exerciseName}", nada que eliminar`);
    }
    
    // No continuar con el recálculo ya que no hay sets válidos
    return;
  }
  
  // Calcular todos los máximos y volumen total (similar a recalculateUserRecords pero solo para este ejercicio)
  // CRÍTICO: Inicializar campos UUID como null o undefined, nunca como strings vacíos
  let totalVolume = 0;
  let bestSingleSet = { weight: 0, reps: 0, volume: 0, date: '', workoutId: '' };
  let best1RM = 0;
  let best1RMDate: string | null = null;
  let best1RMWorkoutId: string | null = null;
  let maxWeight = 0;
  let maxWeightReps = 0;
  let maxWeightDate: string | null = null;
  let maxWeightWorkoutId: string | null = null;
  let maxReps = 0;
  let maxRepsDate: string | null = null;
  let maxRepsWorkoutId: string | null = null;
  const dailyMaxMap = new Map<string, { max_weight_kg: number; max_reps: number }>();
  
  for (const set of sets) {
    const { weight, reps, unit, isUnilateral, userWeight, workoutDate, workoutId } = set;
    
    const realWeight = calculateRealWeight(weight, isUnilateral, unit);
    const totalWeight = isBodyweight ? realWeight + userWeight : realWeight;
    
    const setVolume = calculateSetVolume(weight, reps, isUnilateral, isBodyweight, userWeight, unit);
    totalVolume += setVolume;
    
    if (setVolume > bestSingleSet.volume) {
      bestSingleSet = {
        weight: totalWeight,
        reps: reps,
        volume: setVolume,
        date: workoutDate,
        workoutId
      };
    }
    
    const estimated1RM = calculate1RM(totalWeight, reps);
    if (estimated1RM > best1RM) {
      best1RM = estimated1RM;
      best1RMDate = workoutDate;
      best1RMWorkoutId = workoutId;
    }
    
    if (reps === 1) {
      if (totalWeight > maxWeight) {
        maxWeight = totalWeight;
        maxWeightReps = 1;
        maxWeightDate = workoutDate;
        maxWeightWorkoutId = workoutId;
      }
    } else {
      if (maxWeightReps !== 1 && totalWeight > maxWeight) {
        maxWeight = totalWeight;
        maxWeightReps = reps;
        maxWeightDate = workoutDate;
        maxWeightWorkoutId = workoutId;
      }
    }
    
    // Actualizar máximo de repeticiones
    // Para ejercicios de peso corporal sin peso adicional: actualizar max_reps y max_weight_reps juntos
    if (isBodyweight && weight === 0) {
      if (reps > maxReps) {
        maxReps = reps;
        maxRepsDate = workoutDate;
        maxRepsWorkoutId = workoutId;
        // Para ejercicios de peso corporal, el peso máximo es siempre userWeight
        // Sincronizar maxWeightReps con maxReps
        if (maxWeightReps !== 1 || reps > maxReps) {
          maxWeightReps = reps;
          // Actualizar maxWeight si es necesario (para ejercicios de peso corporal, es userWeight)
          if (maxWeight === 0 || totalWeight > maxWeight) {
            maxWeight = totalWeight;
            maxWeightDate = workoutDate;
            maxWeightWorkoutId = workoutId;
          }
        }
      }
    } else if (!isBodyweight) {
      if (reps > maxReps) {
        maxReps = reps;
        maxRepsDate = workoutDate;
        maxRepsWorkoutId = workoutId;
      }
    }
    
    const workoutDateOnly = workoutDate.split('T')[0];
    const existingDayMax = dailyMaxMap.get(workoutDateOnly) || { max_weight_kg: 0, max_reps: 0 };
    if (totalWeight > existingDayMax.max_weight_kg ||
        (totalWeight === existingDayMax.max_weight_kg && reps > existingDayMax.max_reps)) {
      dailyMaxMap.set(workoutDateOnly, { max_weight_kg: totalWeight, max_reps: reps });
    }
  }
  
  // Calcular mejor serie cerca del máximo
  let bestNearMax: { weight: number; reps: number; date: string; workoutId: string } | null = null;
  const hasOnlyBodyweight = isBodyweight && sets.every(s => s.weight === 0);
  
  if (hasOnlyBodyweight && maxReps > 0) {
    let bestRepScore = -1;
    for (const set of sets) {
      const { weight, reps, workoutDate, workoutId, userWeight, isUnilateral, unit } = set;
      if (weight === 0 && reps >= 2 && reps <= maxReps && reps > 0) {
        const percentageOfMaxReps = maxReps > 0 ? reps / maxReps : 0;
        const score = percentageOfMaxReps * percentageOfMaxReps;
        if (score > bestRepScore || (score === bestRepScore && reps > (bestNearMax?.reps || 0))) {
          bestRepScore = score;
          const realWeight = calculateRealWeight(weight, isUnilateral, unit);
          const totalWeight = isBodyweight ? realWeight + userWeight : realWeight;
          bestNearMax = { weight: totalWeight, reps: reps, date: workoutDate, workoutId };
        }
      }
    }
  } else if (maxWeight > 0) {
    let bestScore = -1;
    const max1RM = maxWeight > 0 ? calculate1RM(maxWeight, maxWeightReps || 1) : 0;
    
    for (const set of sets) {
      const { weight, reps, unit, isUnilateral, userWeight, workoutDate, workoutId } = set;
      if (reps >= 2 && reps <= 10 && reps > 0 && max1RM > 0) {
        const realWeight = calculateRealWeight(weight, isUnilateral, unit);
        const totalWeight = isBodyweight ? realWeight + userWeight : realWeight;
        const set1RM = calculate1RM(totalWeight, reps);
        const score = set1RM / max1RM;
        if (score > bestScore || (Math.abs(score - bestScore) < 0.001 && totalWeight > (bestNearMax?.weight || 0))) {
          bestScore = score;
          bestNearMax = { weight: totalWeight, reps: reps, date: workoutDate, workoutId };
        }
      }
    }
  }
  
  const dailyMaxArray = Array.from(dailyMaxMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => b.date.localeCompare(a.date));
  
  // Verificar si el record ya existe
  const { data: existingRecord } = await supabase
    .from('user_records')
    .select('*')
    .eq('user_id', userId)
    .eq('exercise_id', exerciseId)
    .maybeSingle();
  
  // Función helper para convertir strings vacíos a undefined en campos UUID
  const sanitizeUUID = (value: string | undefined | null): string | undefined => {
    if (!value || value.trim() === '') return undefined;
    return value;
  };
  
  // CRÍTICO: Para ejercicios de peso corporal sin peso adicional, 
  // asegurar que maxWeight sea al menos el peso corporal si hay repeticiones
  // Obtener el peso del usuario del primer workout relevante
  const userWeightFromWorkout = relevantWorkouts[0]?.user_weight || 80;
  let finalMaxWeight = maxWeight;
  let finalMaxWeightReps = maxWeightReps;
  let finalMaxWeightDate = maxWeightDate;
  let finalMaxWeightWorkoutId = maxWeightWorkoutId;
  
  if (isBodyweight && maxReps > 0 && maxWeight === 0) {
    // Si es ejercicio de peso corporal y no hay peso máximo registrado,
    // establecer el peso máximo como userWeight (peso corporal)
    finalMaxWeight = userWeightFromWorkout;
    finalMaxWeightReps = maxReps;
    finalMaxWeightDate = maxRepsDate;
    finalMaxWeightWorkoutId = maxRepsWorkoutId;
  }
  
  const record: Partial<UserRecord> = {
    user_id: userId,
    exercise_id: exerciseId,
    exercise_name: exerciseNameExact,
    max_weight_kg: finalMaxWeight,
    max_weight_reps: finalMaxWeightReps,
    max_weight_date: finalMaxWeightDate || undefined,
    max_weight_workout_id: sanitizeUUID(finalMaxWeightWorkoutId),
    max_1rm_kg: best1RM,
    max_1rm_date: best1RMDate || undefined,
    max_1rm_workout_id: sanitizeUUID(best1RMWorkoutId),
    total_volume_kg: totalVolume,
    max_reps: maxReps,
    max_reps_date: maxRepsDate || undefined,
    max_reps_workout_id: sanitizeUUID(maxRepsWorkoutId),
    is_bodyweight: isBodyweight,
    category,
    exercise_type: exerciseType,
    unit: 'kg',
    best_single_set_weight_kg: bestSingleSet.weight > 0 ? bestSingleSet.weight : undefined,
    best_single_set_reps: bestSingleSet.reps > 0 ? bestSingleSet.reps : undefined,
    best_single_set_volume_kg: bestSingleSet.volume > 0 ? bestSingleSet.volume : undefined,
    best_single_set_date: bestSingleSet.date || undefined,
    best_single_set_workout_id: sanitizeUUID(bestSingleSet.workoutId),
    best_near_max_weight_kg: bestNearMax?.weight,
    best_near_max_reps: bestNearMax?.reps,
    best_near_max_date: bestNearMax?.date || undefined,
    best_near_max_workout_id: sanitizeUUID(bestNearMax?.workoutId),
    daily_max: dailyMaxArray
  };
  
  if (existingRecord) {
    // Actualizar record existente
    const { error: updateError } = await supabase
      .from('user_records')
      .update(record)
      .eq('id', existingRecord.id);
    
    if (updateError) {
      console.error(`❌ Error actualizando record para ${exerciseName}:`, updateError);
      throw new Error(`Error actualizando record: ${updateError.message}`);
    } else {
      console.log(`✅ Record actualizado para ${exerciseName} - volumen: ${totalVolume}kg, máx: ${maxWeight}kg`);
    }
  } else {
    // Insertar nuevo record
    const { error: insertError } = await supabase
      .from('user_records')
      .insert(record);
    
    if (insertError) {
      console.error(`❌ Error insertando record para ${exerciseName}:`, insertError);
      throw new Error(`Error insertando record: ${insertError.message}`);
    } else {
      console.log(`✅ Record insertado para ${exerciseName} - volumen: ${totalVolume}kg, máx: ${maxWeight}kg`);
    }
  }
};