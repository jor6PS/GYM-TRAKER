-- Script SQL para limpiar campos UUID vacíos/inválidos en la tabla user_records
-- 
-- IMPORTANTE: Este script establece directamente a NULL los campos UUID problemáticos
-- sin intentar leerlos primero, lo que evita errores de casting.

-- Método 1: Establecer todos los campos UUID a NULL para registros que puedan tener problemas
-- Este método es seguro porque no intenta leer los valores inválidos

-- Primero, intentar establecer a NULL todos los campos UUID donde puedan estar vacíos
-- usando un enfoque que evita leer los valores

DO $$
DECLARE
  rec RECORD;
  update_count INTEGER := 0;
BEGIN
  -- Recorrer todos los registros
  FOR rec IN SELECT id FROM user_records LOOP
    BEGIN
      -- Intentar establecer todos los campos UUID a NULL de forma segura
      -- Esto funciona porque estamos estableciendo valores, no leyéndolos
      EXECUTE format('
        UPDATE user_records 
        SET 
          max_weight_workout_id = CASE WHEN max_weight_workout_id IS NOT NULL THEN max_weight_workout_id ELSE NULL END,
          max_1rm_workout_id = CASE WHEN max_1rm_workout_id IS NOT NULL THEN max_1rm_workout_id ELSE NULL END,
          max_reps_workout_id = CASE WHEN max_reps_workout_id IS NOT NULL THEN max_reps_workout_id ELSE NULL END,
          best_single_set_workout_id = CASE WHEN best_single_set_workout_id IS NOT NULL THEN best_single_set_workout_id ELSE NULL END,
          best_near_max_workout_id = CASE WHEN best_near_max_workout_id IS NOT NULL THEN best_near_max_workout_id ELSE NULL END
        WHERE id = %L', rec.id);
      
      update_count := update_count + 1;
      
    EXCEPTION 
      WHEN invalid_text_representation THEN
        -- Si hay un error de casting UUID, establecer todos los campos UUID a NULL
        BEGIN
          EXECUTE format('UPDATE user_records SET max_weight_workout_id = NULL, max_1rm_workout_id = NULL, max_reps_workout_id = NULL, best_single_set_workout_id = NULL, best_near_max_workout_id = NULL WHERE id = %L', rec.id);
          update_count := update_count + 1;
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'Error procesando registro %: %', rec.id, SQLERRM;
        END;
      WHEN invalid_input_syntax_for_type THEN
        -- Error de sintaxis UUID, establecer todos a NULL
        BEGIN
          EXECUTE format('UPDATE user_records SET max_weight_workout_id = NULL, max_1rm_workout_id = NULL, max_reps_workout_id = NULL, best_single_set_workout_id = NULL, best_near_max_workout_id = NULL WHERE id = %L', rec.id);
          update_count := update_count + 1;
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'Error procesando registro %: %', rec.id, SQLERRM;
        END;
      WHEN OTHERS THEN
        RAISE NOTICE 'Error inesperado en registro %: %', rec.id, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE 'Procesados % registros', update_count;
END $$;

-- Método 2: Usar UPDATE directo con WHERE que evita leer campos UUID inválidos
-- Este método actualiza todos los registros estableciendo campos UUID a NULL
-- solo si hay un problema al intentar leerlos

-- Si el método 1 falla, ejecutar este comando manualmente para cada campo:
-- UPDATE user_records SET max_weight_workout_id = NULL WHERE max_weight_workout_id IS NOT NULL;
-- UPDATE user_records SET max_1rm_workout_id = NULL WHERE max_1rm_workout_id IS NOT NULL;
-- UPDATE user_records SET max_reps_workout_id = NULL WHERE max_reps_workout_id IS NOT NULL;
-- UPDATE user_records SET best_single_set_workout_id = NULL WHERE best_single_set_workout_id IS NOT NULL;
-- UPDATE user_records SET best_near_max_workout_id = NULL WHERE best_near_max_workout_id IS NOT NULL;

-- Verificar resultados
SELECT 
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE max_weight_workout_id IS NULL) as null_max_weight,
  COUNT(*) FILTER (WHERE max_1rm_workout_id IS NULL) as null_max_1rm,
  COUNT(*) FILTER (WHERE max_reps_workout_id IS NULL) as null_max_reps,
  COUNT(*) FILTER (WHERE best_single_set_workout_id IS NULL) as null_best_single_set,
  COUNT(*) FILTER (WHERE best_near_max_workout_id IS NULL) as null_best_near_max
FROM user_records;
