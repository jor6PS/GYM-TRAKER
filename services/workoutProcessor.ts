import { Type } from "@google/genai";
import { WorkoutData, Workout, GlobalReportData, MaxComparisonEntry, GroupAnalysisData } from "../types";
import { format, isSameMonth, isAfter } from "date-fns";
import subMonths from "date-fns/subMonths";
import es from 'date-fns/locale/es';
import { getCanonicalId, getLocalizedName } from "../utils";
import { ExerciseDef } from "../contexts/ExerciseContext";
import { getAIClient } from "./workoutProcessor/aiClient";
import { generateWithFallback, REPORT_MODELS, AUDIO_MODELS } from "./workoutProcessor/fallback";
import { 
  isCalisthenic, 
  getMuscleGroup, 
  calculateSetVolume, 
  safeParseWorkout, 
  cleanJson, 
  handleAIError 
} from "./workoutProcessor/helpers";
import { getUserRecords, getUserTotalVolume } from "./recordsService";

// Interfaces internas
interface UserStats {
  userId: string;
  name: string;
  totalVolume: number;
  workoutCount: number;
  muscleVol: Record<string, number>; 
  maxLifts: Record<string, { weight: number; reps: number; isBodyweight: boolean; unit: string }>;
}

interface CommonExerciseComparison {
  exerciseId: string;
  exerciseName: string;
  entries: { userName: string; weight: number; reps: number; oneRM: number; unit: string }[];
  winner: string;
}

// --- CORE FUNCTIONS ---

export const generateGlobalReport = async (
  allWorkouts: Workout[],
  catalog: ExerciseDef[],
  currentWeight: number = 80,
  userHeight: number = 180,
  userAge: number = 25,
  userId?: string
): Promise<GlobalReportData> => {
    try {
        const now = new Date();
        const lookbackDate = subMonths(now, 1);
        
        let totalVolume = 0;
        let monthlyVolume = 0;
        
        const globalMaxMap = new Map<string, { val: number, unit: string, isBW: boolean }>();
        const monthlyMaxMap = new Map<string, { val: number, unit: string, isBW: boolean }>();

        // OPTIMIZACIÓN: Crear índices del catálogo para búsquedas O(1)
        const catalogById = new Map<string, ExerciseDef>();
        const catalogByNormalizedEs = new Map<string, ExerciseDef>();
        const normalizedNameCache = new Map<string, string>();
        
        for (const ex of catalog) {
            catalogById.set(ex.id, ex);
            if (ex.es) {
                const normalized = ex.es.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                catalogByNormalizedEs.set(normalized, ex);
                normalizedNameCache.set(ex.id, normalized);
            }
        }

        // OPTIMIZACIÓN: Cache para getCanonicalId
        const canonicalIdCache = new Map<string, string>();
        const getCanonicalIdCached = (name: string): string => {
            const cacheKey = name.trim().toLowerCase();
            if (canonicalIdCache.has(cacheKey)) {
                return canonicalIdCache.get(cacheKey)!;
            }
            
            const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            
            // Búsqueda exacta
            const exact = catalogByNormalizedEs.get(normalized);
            if (exact) {
                canonicalIdCache.set(cacheKey, exact.id);
                return exact.id;
            }
            
            // Búsqueda por prefijo
            for (const [normEs, exDef] of catalogByNormalizedEs.entries()) {
                if (normEs.startsWith(normalized)) {
                    canonicalIdCache.set(cacheKey, exDef.id);
                    return exDef.id;
                }
            }
            
            // Búsqueda parcial
            for (const [normEs, exDef] of catalogByNormalizedEs.entries()) {
                if (normEs.includes(normalized)) {
                    canonicalIdCache.set(cacheKey, exDef.id);
                    return exDef.id;
                }
            }
            
            canonicalIdCache.set(cacheKey, name.trim());
            return name.trim();
        };

        // OPTIMIZACIÓN: Cache para getLocalizedName
        const localizedNameCache = new Map<string, string>();
        const getLocalizedNameCached = (idOrName: string): string => {
            if (localizedNameCache.has(idOrName)) {
                return localizedNameCache.get(idOrName)!;
            }
            
            const match = catalogById.get(idOrName);
            const result = match?.es || (idOrName.charAt(0).toUpperCase() + idOrName.slice(1));
            localizedNameCache.set(idOrName, result);
            return result;
        };

        // OPTIMIZACIÓN: Cache para isCalisthenic
        const calisthenicCache = new Map<string, boolean>();
        const isCalisthenicCached = (id: string): boolean => {
            if (calisthenicCache.has(id)) {
                return calisthenicCache.get(id)!;
            }
            const result = isCalisthenic(id);
            calisthenicCache.set(id, result);
            return result;
        };

        // 1. OBTENCIÓN DE DATOS HISTÓRICOS (OPTIMIZADO)
        let storedRecords: any[] = [];
        if (userId) {
            try {
                const [records, storedVol] = await Promise.all([
                    getUserRecords(userId),
                    getUserTotalVolume(userId)
                ]);
                storedRecords = records;
                totalVolume = storedVol;
                console.log(`[Crónicas] userId=${userId}: volumen total de BD=${storedVol}kg, records=${records.length}`); 
            } catch (error) {
                console.warn('Error loading stored records, using fallback calculation:', error);
            }
        }

        // 2. PROCESAMIENTO DE RECORDS PARA MÁXIMOS (OPTIMIZADO)
        if (storedRecords.length > 0) {
            for (const record of storedRecords) {
                const displayName = getLocalizedNameCached(record.exercise_id);
                const val = record.is_bodyweight ? record.max_reps : record.max_weight_kg;
                const unit = record.unit || 'kg';
                const isBW = record.is_bodyweight;
                
                // Máximo Global
                const currentG = globalMaxMap.get(displayName);
                if (!currentG || val > currentG.val) {
                    globalMaxMap.set(displayName, { val, unit, isBW });
                }
                
                // Máximo Mensual
                const recDateStr = record.max_weight_date || record.max_reps_date || record.max_1rm_date;
                if (recDateStr) {
                    const recordDate = new Date(recDateStr);
                    if (isSameMonth(recordDate, now)) {
                        const currentM = monthlyMaxMap.get(displayName);
                        if (!currentM || val > currentM.val) {
                            monthlyMaxMap.set(displayName, { val, unit, isBW });
                        }
                    }
                }
            }
        }

        // 3. PROCESAMIENTO DE WORKOUTS (OPTIMIZADO - SINGLE PASS)
        // Para el volumen total: SIEMPRE usar el almacenado en BD (suma de total_volume_kg) si tenemos userId
        // Si no hay userId, calcular desde workouts como fallback
        // NO recalcular desde workouts porque el volumen almacenado en BD es la fuente de verdad
        const recentHistory: any[] = [];
        
        // OPTIMIZACIÓN: Cache para parsing de structured_data
        const parsedWorkoutCache = new Map<Workout, any>();

        for (const w of allWorkouts) {
            const wDate = new Date(w.date);
            const isThisMonth = isSameMonth(wDate, now);
            const isRecent = isAfter(wDate, lookbackDate);

            const historicUserWeight = w.user_weight || currentWeight;
            
            // OPTIMIZACIÓN: Cachear parsing de structured_data
            let workoutData = parsedWorkoutCache.get(w);
            if (!workoutData) {
                workoutData = safeParseWorkout(w.structured_data);
                parsedWorkoutCache.set(w, workoutData);
            }
            
            if (!workoutData.exercises || !Array.isArray(workoutData.exercises)) continue;

            const promptExercises: any[] = [];

            for (const ex of workoutData.exercises) {
                // OPTIMIZACIÓN: Usar funciones cacheadas
                const id = getCanonicalIdCached(ex.name || '');
                const exerciseDef = catalogById.get(id);
                const exerciseType = exerciseDef?.type || 'strength';
                
                if (exerciseType !== 'strength') continue;
                
                const isCalis = isCalisthenicCached(id);
                const isUnilateral = ex.unilateral || false;
                let sessionExVolume = 0;

                // Array detallado de sets para enviar a la IA (NO simplificado - MANTENER TODOS LOS DATOS)
                const setsDetail: any[] = [];

                for (const s of ex.sets) {
                    const setVol = calculateSetVolume(
                        s.reps || 0, 
                        s.weight, 
                        s.unit, 
                        historicUserWeight, 
                        isCalis, 
                        isUnilateral
                    );
                    sessionExVolume += setVol;

                    if (isRecent) {
                        setsDetail.push({
                            reps: s.reps,
                            weight: s.weight,
                            unit: s.unit
                        });
                    }
                }

                // CRÍTICO: Si todos los entrenamientos son del mes actual, el volumen histórico 
                // debería ser igual al volumen mensual (si no hay volumen previo de meses anteriores)
                // totalVolume se obtiene de la BD (getUserTotalVolume) cuando hay userId
                // que suma TODOS los total_volume_kg de TODOS los records (histórico completo)
                // monthlyVolume se calcula sumando solo los workouts del mes actual
                if (!userId) {
                    totalVolume += sessionExVolume;
                }
                if (isThisMonth) {
                    monthlyVolume += sessionExVolume;
                }

                if (isRecent) {
                    promptExercises.push({
                        name: ex.name,
                        id: id,
                        sets: setsDetail
                    });
                }
            }

            if (isRecent && promptExercises.length > 0) {
                recentHistory.push({
                    date: w.date,
                    exercises: promptExercises
                });
            }
        }

        // Preparar lista de comparación de máximos
        const maxComparison: MaxComparisonEntry[] = Array.from(globalMaxMap.entries())
            .map(([name, g]) => {
                const m = monthlyMaxMap.get(name) || { val: 0, unit: g.unit, isBW: g.isBW };
                return {
                    exercise: name,
                    globalMax: g.val,
                    monthlyMax: m.val,
                    unit: g.unit,
                    isBodyweight: g.isBW
                };
            })
            .filter(item => item.monthlyMax > 0)
            .sort((a, b) => b.monthlyMax - a.monthlyMax);

        // 4. PROMPT ENGINEERING (DETALLADO Y COMPLETO + SECCIÓN 3.5)
        const systemInstruction = `Eres un Entrenador de Alto Rendimiento experto en biomecánica y programación.
        
        ROL: Tu tono es **constructivo, profesional, técnico y alentador**. Evita el lenguaje agresivo o de "gym-bro" burlón. Tu objetivo es educar y guiar hacia la mejora continua.

        DATOS PROPORCIONADOS: Historial de entrenamientos detallado (series, reps, pesos), 1RMs y volúmenes, además de biometría del usuario.

        ESTRUCTURA DE RESPUESTA (JSON):
        {
          "equiv_global": "String corto. Comparación VISUAL del peso total histórico con algo masivo (ej: '3 Ballenas Azules').",
          "equiv_monthly": "String corto. Comparación VISUAL del peso mensual con objetos cotidianos o animales.",
          "analysis": "Markdown detallado siguiendo la estructura:
            ## 3 - AUDITORÍA FORENSE DEL MES
            Analiza patrones. ¿Hubo constancia? ¿Se rompió algún récord histórico?
            ### 3.1 - Mapeo de Volumen Efectivo
            (Tabla de series semanales por grupo muscular y Veredicto: Mantenimiento/MAV/Sobreentrenamiento)
            ### 3.2 - Ratios de Equilibrio Estructural
            Observa los ejercicios. ¿Hay mucho 'Push' y poco 'Pull'? ¿Se ignoraron las piernas?
            (Análisis Push/Pull y Anterior/Posterior. Si hay desequilibrio >20%, usar **ALERTA ROJA: [Descripción]** en negrita y mayúsculas)
            ### 3.3 - Secuenciación y Sandbagging
            Analiza las series planas. Si ves muchas series con el mismo peso y reps (ej: 3x10 con 20kg siempre), indica falta de intensidad real ('Sandbagging').
            ### 3.4 - Estímulo vs Fatiga
            Basado en la frecuencia y la EDAD del atleta. ¿Está descansando lo suficiente?
            
            ### 3.5 - Potencia Relativa (Benchmark Edad/Peso)
            **ESTA SECCIÓN ES OBLIGATORIA Y DEBE INCLUIRSE SIEMPRE.**
            Analiza las cargas movidas en relación al peso corporal (${currentWeight}kg) y edad (${userAge} años) del usuario. 
            Cruza los datos de sus 'Maximos' con estándares de fuerza reales.
            ¿Son marcas de principiante, intermedio o avanzado para su grupo de edad y peso? 
            Sé honesto: Si pesa 80kg y levanta 40kg en banca, indícalo constructivamente como área de mejora urgente. Si levanta 1.5x su peso, felicítalo.
            Proporciona una evaluación clara del nivel de fuerza del usuario basada en benchmarks reconocidos.
            
            ## 4 - ANÁLISIS DE EVOLUCIÓN
            Compara 'monthlyMax' vs 'globalMax' de la lista proporcionada.
            - Si monthlyMax >= globalMax: ¡Excelente! Nuevos PRs.
            - Si monthlyMax < globalMax: Fase de acumulación o posible desentrenamiento.
            ## 5 - VEREDICTO Y MEJORAS
            Resumen ejecutivo de 2 líneas y 3 puntos clave (Bullet points) para mejorar.
            ## 6 - PLAN DE ACCIÓN (PRÓXIMOS 3 DÍAS)
            Diseña una rutina de 3 días a unos 6 ejercicios por día (Día 1, Día 2, Día 3) basada en los datos analizados para un entrenamiento completo.
            
            REGLA DE ORO PARA NOMBRES: 
            Debes utilizar EXACTAMENTE los mismos nombres de ejercicios que aparecen en la lista de 'Comparativa Máximos' proporcionada abajo. Si un ejercicio no está ahí, búscalo en tu base de conocimientos pero intenta que coincidan con nombres comunes del catálogo.
            
            IMPORTANTE: Sugiere pesos realistas basados en los 1RMs del usuario y su clasificación de nivel (Punto 3.5).
            
            Formato OBLIGATORIO:
            **DIA 1: [Enfoque]**
            * [Nombre Exacto] | [Sets]x[Reps] | [Peso Sugerido]
            * [Nombre Exacto] | [Sets]x[Reps] | [Peso Sugerido]
            
            **DIA 2: [Enfoque]**
            ...
            
            **DIA 3: [Enfoque]**
            ...",
          "score": número 1-10
        }`;
        
        // Validación: Si todos los workouts son del mes actual, el volumen histórico debería ser igual al mensual
        // (a menos que haya volumen previo de meses anteriores en los records)
        const allWorkoutsThisMonth = allWorkouts.every(w => isSameMonth(new Date(w.date), now));
        if (allWorkoutsThisMonth && Math.abs(totalVolume - monthlyVolume) > 0.01) {
            console.warn(`[Crónicas] ⚠️ Volúmenes no coinciden. Total: ${Math.round(totalVolume)}kg, Mensual: ${Math.round(monthlyVolume)}kg`);
            // Si todos los workouts son del mes actual, usar el monthlyVolume como totalVolume
            // porque el volumen histórico debería ser igual al mensual
            totalVolume = monthlyVolume;
        }
        
        console.log(`[Crónicas] Enviando a IA: totalVolume=${Math.round(totalVolume)}kg, monthlyVolume=${Math.round(monthlyVolume)}kg`);
        
        const prompt = `Analiza mi rendimiento para optimizar mi progreso. 
        Biometría: Edad ${userAge} años, Peso Corporal ${currentWeight}kg, Altura ${userHeight}cm.
        Peso Total Histórico: ${Math.round(totalVolume)}kg. 
        Peso Levantado este mes: ${Math.round(monthlyVolume)}kg. 
        
        INSTRUCCIÓN CRÍTICA Y OBLIGATORIA: 
        - DEBES incluir SIEMPRE la sección "### 3.5 - Potencia Relativa" en tu análisis.
        - En el punto 3.5, analiza explícitamente si mis pesos son adecuados para mi edad (${userAge} años) y tamaño (${currentWeight}kg). 
        - Compara mis máximos con estándares de fuerza reconocidos para mi grupo de edad y peso.
        - ¿Soy fuerte para mi edad o necesito mejorar la fuerza base? Sé específico y constructivo.
        
        Comparativa Máximos (Usa estos nombres exactos): ${JSON.stringify(maxComparison.slice(0, 30))}.
        Historial detallado del mes (Sets, Reps y Pesos): ${JSON.stringify(recentHistory)}.
        
        Genera el informe profesional completo sin omitir detalles.`;

        const ai = getAIClient();
        
        // Schema JSON Estricto
        const schema = {
            type: Type.OBJECT,
            properties: {
                equiv_global: { type: Type.STRING },
                equiv_monthly: { type: Type.STRING },
                analysis: { type: Type.STRING },
                score: { type: Type.NUMBER }
            },
            required: ["equiv_global", "equiv_monthly", "analysis", "score"]
        };
        
        const response = await generateWithFallback(
            ai, 
            REPORT_MODELS, 
            prompt, 
            systemInstruction,
            schema
        );

        // Parseo Robusto
        let rawText = '';
        if (response.text) rawText = response.text;
        else if (response.candidates?.[0]?.content?.parts?.[0]?.text) rawText = response.candidates[0].content.parts[0].text;
        else rawText = JSON.stringify(response);

        let aiRes: any;
        let cleanedJson = cleanJson(rawText || '{}');
        let parseAttempts = 0;
        const maxAttempts = 3;
        
        while (parseAttempts < maxAttempts) {
          try {
            aiRes = JSON.parse(cleanedJson);
            if (!aiRes.equiv_global || !aiRes.equiv_monthly || !aiRes.analysis || aiRes.score === undefined) {
              throw new Error('Faltan campos requeridos en la respuesta');
            }
            break;
          } catch (error: any) {
            parseAttempts++;
            if (parseAttempts >= maxAttempts) {
                // Último intento: Regex Manual
                const equivGlobalMatch = cleanedJson.match(/"equiv_global"\s*:\s*"([^"]*)"/);
                const equivMonthlyMatch = cleanedJson.match(/"equiv_monthly"\s*:\s*"([^"]*)"/);
                const analysisMatch = cleanedJson.match(/"analysis"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
                const scoreMatch = cleanedJson.match(/"score"\s*:\s*(\d+)/);
                
                if (equivGlobalMatch && equivMonthlyMatch && analysisMatch && scoreMatch) {
                    aiRes = {
                        equiv_global: equivGlobalMatch[1].replace(/\\n/g, '\n'),
                        equiv_monthly: equivMonthlyMatch[1].replace(/\\n/g, '\n'),
                        analysis: analysisMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
                        score: parseInt(scoreMatch[1])
                    };
                    break;
                }
                throw new Error(`JSON inválido: ${error.message}`);
            }
            cleanedJson = cleanedJson.replace(/,\s*,+/g, ',').replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
          }
        }

        return {
            totalVolumeKg: totalVolume,
            volumeEquivalentGlobal: aiRes.equiv_global,
            monthlyVolumeKg: monthlyVolume,
            volumeEquivalentMonthly: aiRes.equiv_monthly,
            monthName: format(now, 'MMMM', { locale: es }),
            monthlyAnalysisText: aiRes.analysis,
            efficiencyScore: aiRes.score || 5,
            maxComparison: maxComparison
        };

    } catch (error) { handleAIError(error); throw error; }
};

// --- RESTO DE FUNCIONES (Audio y Grupo) MANTENIDAS IGUAL QUE EN RESPUESTAS ANTERIORES ---
export const processWorkoutAudio = async (audioBase64: string, mimeType: string, catalog?: ExerciseDef[]): Promise<WorkoutData> => {
    // ... (Código de processWorkoutAudio ya proporcionado anteriormente, optimizado con AUDIO_MODELS)
    // Para brevedad, asumo que usas la versión optimizada anterior. Si la necesitas repetida, dímelo.
    try {
        const ai = getAIClient();
        let exerciseCatalog = catalog;
        if (!exerciseCatalog) {
          const { getExerciseCatalog } = await import('./supabase');
          exerciseCatalog = await getExerciseCatalog();
        }
        const commonExercises = exerciseCatalog?.slice(0, 30).map(ex => ex.es || ex.en || ex.id).join(', ') || '';
        const schema = {
            type: Type.OBJECT, 
            properties: {
                exercises: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            sets: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        reps: { type: Type.NUMBER },
                                        weight: { type: Type.NUMBER },
                                        unit: { type: Type.STRING, enum: ["kg", "lbs"] },
                                        rpe: { type: Type.NUMBER }
                                    },
                                    required: ["reps"]
                                }
                            }
                        },
                        required: ["name", "sets"]
                    }
                },
                notes: { type: Type.STRING }
            },
            required: ["exercises"]
        };
        const systemInstruction = `Extrae datos de entrenamiento desde audio en español. Usa nombres de ejercicios en español. Formato: "ejercicio, peso, series, reps". Ejemplos: "Press Banca 80kg 3x10" → {name:"Press Banca", sets:[{reps:10, weight:80, unit:"kg"} x3]}. Si dice "kilos" o "kg" → unit:"kg". Si dice "libras" o "lbs" → unit:"lbs". Extrae TODOS los ejercicios mencionados.`;
        const prompt = `Extrae los ejercicios del audio.${commonExercises ? ` Ejercicios comunes: ${commonExercises}` : ''}`;
        
        const response = await generateWithFallback(ai, AUDIO_MODELS, prompt, systemInstruction, schema, { inlineData: { mimeType, data: audioBase64 } });
        
        let rawData;
        try {
            rawData = JSON.parse(cleanJson(response.text || '{}'));
        } catch {
             throw new Error("No se pudo interpretar el audio. Habla más claro.");
        }
        
        if (!rawData.exercises) rawData.exercises = [];
        
        if (exerciseCatalog && rawData.exercises.length > 0) {
          const { sanitizeWorkoutData } = await import('../utils');
          return sanitizeWorkoutData(rawData, exerciseCatalog);
        }
        return rawData;
    } catch (e: any) { handleAIError(e); throw e; }
};

export const generateGroupAnalysis = async (
    usersData: { name: string; workouts: Workout[]; userId?: string }[],
    catalog: ExerciseDef[]
): Promise<GroupAnalysisData> => {
    try {
        const ai = getAIClient();
        // --- FASE 1: PROCESAMIENTO MATEMÁTICO ---
        const stats: UserStats[] = await Promise.all(usersData.map(async (user) => {
            const s: UserStats = {
                userId: user.userId || user.name,
                name: user.name,
                totalVolume: 0,
                workoutCount: new Set(user.workouts.map(w => w.date.split('T')[0])).size,
                muscleVol: {},
                maxLifts: {} 
            };

            // Intentar obtener records almacenados si tenemos userId
            // NOTA: Puede haber problemas de permisos RLS al intentar leer records de otros usuarios
            // En ese caso, usaremos el volumen calculado desde workouts como fallback
            let storedRecords: any[] = [];
            let storedTotalVolume = 0;
            let recordsFetchError = false;
            
            if (user.userId) {
                try {
                    storedRecords = await getUserRecords(user.userId);
                    storedTotalVolume = await getUserTotalVolume(user.userId);
                    console.log(`[Arena] ✅ Records obtenidos para ${user.name} (${user.userId}): ${storedRecords.length} records, volumen total: ${storedTotalVolume}kg`);
                } catch (error: any) {
                    recordsFetchError = true;
                    console.warn(`[Arena] ⚠️ Error loading stored records for ${user.name} (${user.userId}):`, error);
                    console.warn(`  - Error message: ${error?.message || 'Unknown error'}`);
                    console.warn(`  - Esto puede ser un problema de permisos RLS. Usando fallback: calcular desde workouts.`);
                    // Si hay error (probablemente permisos), los arrays quedan vacíos y se usará el fallback
                    storedRecords = [];
                    storedTotalVolume = 0;
                }
                
                // Verificar si se obtuvo volumen pero es 0 (puede indicar error de permisos)
                if (!recordsFetchError && storedTotalVolume === 0 && storedRecords.length === 0) {
                    console.warn(`[Arena] ⚠️ No se obtuvieron records para ${user.name} (${user.userId}) pero no hubo error. Puede ser un problema de permisos RLS.`);
                }
            }

            // Procesar TODOS los workouts para extraer TODOS los ejercicios únicos
            // Usar como fallback si no hay records almacenados
            const allExercisesFromWorkouts = new Map<string, { 
                name: string; 
                id: string; 
                bestSet: { weight: number; reps: number; isBodyweight: boolean; unit: string } 
            }>();

            let workoutVolume = 0;
            user.workouts.forEach(w => {
                const historicWeight = w.user_weight || 80; 
                const workoutData = safeParseWorkout(w.structured_data);
                
                if (workoutData.exercises) {
                    workoutData.exercises.forEach(ex => {
                        const id = getCanonicalId(ex.name, catalog);
                        const exerciseName = getLocalizedName(id, catalog);
                        const muscle = getMuscleGroup(id);
                        
                        if (!s.muscleVol[muscle]) s.muscleVol[muscle] = 0;

                        ex.sets.forEach(set => {
                            const isCalis = isCalisthenic(id);
                            const weightVal = (set.weight || 0);
                            const repsVal = (set.reps || 0);
                            
                            // Normalización a KG
                            let loadInKg = (set.unit === 'lbs' ? weightVal * 0.453592 : weightVal); 
                            if (isCalis) loadInKg += historicWeight;
                            
                            // Volumen
                            const vol = loadInKg * repsVal;
                            workoutVolume += vol;
                            s.muscleVol[muscle] += vol;

                            // Guardar el mejor set para este ejercicio (solo si no hay records almacenados)
                            // Si hay records, estos se usarán en su lugar
                            const isBW = weightVal === 0 && isCalis;
                            const currentMetric = isBW ? repsVal : (loadInKg * (1 + repsVal / 30));
                            
                            if (!allExercisesFromWorkouts.has(exerciseName)) {
                                allExercisesFromWorkouts.set(exerciseName, {
                                    name: exerciseName,
                                    id: id,
                                    bestSet: {
                                        weight: weightVal,
                                        reps: repsVal,
                                        isBodyweight: isBW,
                                        unit: set.unit || 'kg'
                                    }
                                });
                            } else {
                                const existing = allExercisesFromWorkouts.get(exerciseName)!;
                                const existingMetric = existing.bestSet.isBodyweight 
                                    ? existing.bestSet.reps 
                                    : (existing.bestSet.weight * (existing.bestSet.unit === 'lbs' ? 0.453592 : 1)) * (1 + existing.bestSet.reps / 30);
                                
                                if (currentMetric > existingMetric) {
                                    existing.bestSet = {
                                        weight: weightVal,
                                        reps: repsVal,
                                        isBodyweight: isBW,
                                        unit: set.unit || 'kg'
                                    };
                                }
                            }
                        });
                    });
                }
            });

            // PRIORIDAD: Usar records almacenados (max_weight_kg + max_weight_reps) para comparaciones
            // Los records son la fuente de verdad para los pesos máximos
            if (storedRecords.length > 0) {
                // Limpiar los ejercicios de workouts y usar solo records
                allExercisesFromWorkouts.clear();
                for (const record of storedRecords) {
                    // Usar canonicalId para normalizar y comparar ejercicios entre usuarios
                    const canonicalId = getCanonicalId(record.exercise_id, catalog);
                    const exerciseName = getLocalizedName(canonicalId, catalog);
                    
                    // Usar max_weight_kg y max_weight_reps directamente de los records
                    const weight = record.max_weight_kg || 0;
                    const reps = record.is_bodyweight ? record.max_reps : record.max_weight_reps;
                    
                    // Usar canonicalId como clave para normalizar ejercicios
                    allExercisesFromWorkouts.set(exerciseName, {
                        name: exerciseName,
                        id: canonicalId,
                        bestSet: {
                            weight: weight,
                            reps: reps,
                            isBodyweight: record.is_bodyweight || false,
                            unit: record.unit || 'kg'
                        }
                    });
                }
            }

            // Agregar todos los ejercicios encontrados a maxLifts
            // Si hay records, ya están en allExercisesFromWorkouts desde la sección anterior
            // Si no hay records, usar los calculados de workouts
            allExercisesFromWorkouts.forEach((exerciseData, exerciseName) => {
                s.maxLifts[exerciseName] = exerciseData.bestSet;
            });
            
            // Decidir qué volumen usar:
            // 1. Si tenemos userId y se pudo obtener volumen de BD (storedTotalVolume > 0), usar ese
            // 2. Si hay error de permisos o volumen es 0, usar volumen calculado desde workouts
            // CRÍTICO: Si storedTotalVolume es 0 pero hay workouts con volumen, es probable que haya un problema de permisos RLS
            // En ese caso, usar el volumen calculado desde workouts como fallback
            if (user.userId && storedTotalVolume > 0) {
                s.totalVolume = storedTotalVolume;
                console.log(`[Arena] ✅ Usuario ${s.name}: usando volumen de BD (${storedTotalVolume}kg)`);
            } else if (user.userId && (recordsFetchError || (storedTotalVolume === 0 && workoutVolume > 0))) {
                // Probable problema de permisos RLS - usar volumen calculado desde workouts
                s.totalVolume = workoutVolume;
                console.warn(`[Arena] ⚠️ Usuario ${s.name}: no se pudo obtener volumen de BD (probablemente permisos RLS), usando volumen calculado desde workouts (${workoutVolume}kg)`);
            } else {
                // Sin userId o sin volumen en ningún lado
                s.totalVolume = workoutVolume;
                console.log(`[Arena] Usuario ${s.name}: usando volumen calculado desde workouts (${workoutVolume}kg) - sin userId o sin datos`);
            }

            return s;
        }));

        // --- FASE 2: CROSS-ANALYSIS (Head-to-Head + Empates) ---
        // Usar un Map para normalizar ejercicios por canonicalId
        const allExercisesMap = new Map<string, string>(); // canonicalId -> displayName
        stats.forEach(s => {
            Object.keys(s.maxLifts).forEach(exKey => {
                // exKey es el nombre del ejercicio que usamos como clave
                allExercisesMap.set(exKey, exKey);
            });
        });
        const allExercisesList = Array.from(allExercisesMap.keys()).sort();

        // Head-to-Head: Solo ejercicios realizados por TODOS los participantes
        const headToHead: CommonExerciseComparison[] = [];
        const totalUsers = stats.length;

        allExercisesList.forEach(exName => {
            // Verificar que TODOS los usuarios tengan este ejercicio
            const participants = stats.filter(s => s.maxLifts[exName] !== undefined);
            
            // Solo incluir si TODOS los participantes tienen este ejercicio
            if (participants.length === totalUsers) {
                const entries = stats.map(p => {
                    const lift = p.maxLifts[exName];
                    // Usar max_weight_kg y max_weight_reps para comparación
                    const weightInKg = lift.unit === 'lbs' ? lift.weight * 0.453 : lift.weight;
                    // Para comparación: priorizar peso máximo con sus repeticiones
                    // Para calistenia: comparar por reps
                    // Para peso: comparar por peso * reps (o 1RM estimado)
                    const powerScore = lift.isBodyweight ? lift.reps : weightInKg * (1 + lift.reps / 30);
                    
                    return {
                        userName: p.name,
                        weight: lift.weight,
                        reps: lift.reps,
                        unit: lift.unit,
                        oneRM: powerScore
                    };
                }).sort((a, b) => b.oneRM - a.oneRM);

                // Lógica de empate
                let winnerName = entries[0].userName;
                if (entries.length > 1) {
                    const diff = Math.abs(entries[0].oneRM - entries[1].oneRM);
                    if (diff < 0.1) winnerName = 'EMPATE';
                }

                headToHead.push({
                    exerciseId: exName,
                    exerciseName: exName,
                    entries: entries,
                    winner: winnerName
                });
            }
        });
        
        console.log(`Found ${headToHead.length} common exercises for head-to-head comparison`);

        // --- PREPARACIÓN DE DATOS PARA LA MATRIZ (SECCIÓN 2) ---
        // La matriz incluye TODOS los ejercicios realizados por CUALQUIER participante
        // CRÍTICO: Incluir TODAS las columnas de usuarios, incluso si no tienen datos
        const matrixData = allExercisesList.map(exName => {
            const row: any = { exercise: exName };
            // Asegurar que TODOS los usuarios tengan una columna en cada fila
            stats.forEach(user => {
                const lift = user.maxLifts[exName];
                if (lift) {
                    // Usar max_weight_kg + max_weight_reps para mostrar
                    if (lift.isBodyweight) {
                        row[user.name] = lift.reps > 0 ? `${lift.reps} reps` : "---";
                    } else {
                        row[user.name] = (lift.weight > 0 || lift.reps > 0) 
                            ? `${lift.weight}${lift.unit} x ${lift.reps}` 
                            : "---";
                    }
                } else {
                    row[user.name] = "---";
                }
            });
            return row;
        });
        
        // Obtener los nombres de todos los usuarios para el prompt
        const allUserNames = stats.map(s => s.name);

        // --- FASE 3: GENERACIÓN IA ---
        const systemInstruction = `Eres el Juez Supremo de una Arena de Entrenamiento. Analiza los datos y genera un reporte completo.

FORMATO DE RESPUESTA (JSON válido):
{
  "winner": "nombre del ganador basado en mayor volumen total",
  "loser": "nombre del perdedor (opcional)",
  "markdown_report": "reporte completo en markdown usando \\n para saltos de línea"
}

ESTRUCTURA DEL markdown_report (OBLIGATORIO - incluir TODAS las secciones):

**SECCIÓN 1: DUELOS (Head-to-Head)**
Lista de ejercicios que TODOS los participantes han realizado (solo estos ejercicios):
### [NOMBRE EJERCICIO]
🏆 **[Ganador]**: [Carga] [Reps]
⚔️ vs [Segundo]: [Carga] [Reps]
(Repetir para TODOS los ejercicios de "head_to_head_results" - NO limites a 5-6, incluye TODOS)
Si no hay ejercicios comunes, escribe: "No se encontraron ejercicios realizados por TODOS los participantes para un duelo directo."

**SECCIÓN 2: MATRIZ DE RENDIMIENTO COMPLETA (The Matrix)**
Tabla markdown con TODOS los ejercicios de "full_matrix_data" (ejercicios realizados por CUALQUIER participante).
CRÍTICO: La tabla DEBE tener EXACTAMENTE estas columnas: Ejercicio | ${allUserNames.join(' | ')}
Cada fila DEBE incluir valores para TODAS las columnas de usuarios. Si un usuario no tiene datos para un ejercicio, usa "---".
Ejemplo de formato:
| Ejercicio | ${allUserNames.join(' | ')} |
|-----------|${allUserNames.map(() => '----------').join('|')}|
| Ejercicio1 | valor o --- | valor o --- | valor o --- |
| Ejercicio2 | valor o --- | valor o --- | valor o --- |
... (continuar con TODOS los ejercicios sin excepción, NO limites a 15-20, incluye TODOS)
NO omitas columnas. Cada fila debe tener el mismo número de columnas que el encabezado.

**VEREDICTO FINAL**
Párrafo final (3-4 líneas) resumiendo quién es el Alpha basado en volumen total y rendimiento en la matriz.

IMPORTANTE:
- SECCIÓN 1 solo incluye ejercicios de "head_to_head_results" (ejercicios comunes a TODOS)
- SECCIÓN 2 debe incluir TODOS los ejercicios de "full_matrix_data" con TODAS las columnas de usuarios
- El JSON debe estar COMPLETO (cierra todas las llaves y comillas)
- Escapa comillas dobles dentro de markdown_report: \\"
        `;

        const promptData = {
            head_to_head_results: headToHead.map(h => ({
                exercise: h.exerciseName,
                winner: h.winner,
                details: h.entries.map(e => ({
                    user: e.userName,
                    display: e.weight > 0 ? `${e.weight}${e.unit} x ${e.reps}` : `${e.reps} reps`
                }))
            })),
            full_matrix_data: matrixData
        };

        // MODIFICACIÓN: Usar generateWithFallback con REPORT_MODELS
        // Construir prompt más claro sobre qué debe devolver
        const userPrompt = `Analiza estos datos de usuarios y genera el reporte completo en formato JSON:

USUARIOS Y SUS ESTADÍSTICAS:
${stats.map(s => `- ${s.name}: Volumen total ${Math.round(s.totalVolume)}kg, ${s.workoutCount} entrenamientos`).join('\n')}

DUELOS HEAD-TO-HEAD (${promptData.head_to_head_results.length} ejercicios realizados por TODOS):
${JSON.stringify(promptData.head_to_head_results, null, 2)}

MATRIZ COMPLETA DE EJERCICIOS (${promptData.full_matrix_data.length} ejercicios realizados por CUALQUIER participante):
Los usuarios son: ${allUserNames.join(', ')}
${JSON.stringify(promptData.full_matrix_data, null, 2)}

INSTRUCCIONES CRÍTICAS:
1. Genera un objeto JSON válido con campos: winner, loser (opcional), markdown_report
2. El campo markdown_report DEBE estar en UNA SOLA LÍNEA usando \\n para saltos de línea
3. En markdown_report, incluye TODAS las secciones requeridas: SECCIÓN 1 (DUELOS con TODOS los ejercicios de head_to_head_results), SECCIÓN 2 (MATRIZ con TODOS los ${promptData.full_matrix_data.length} ejercicios), y VEREDICTO FINAL
4. PARA LA SECCIÓN 2 (MATRIZ): 
   - DEBES incluir EXACTAMENTE estas columnas: Ejercicio | ${allUserNames.join(' | ')}
   - Cada fila DEBE tener valores para TODAS las columnas de usuarios (incluye "---" si no hay dato)
   - NO omitas ninguna columna de usuario
   - Incluye TODOS los ${promptData.full_matrix_data.length} ejercicios sin excepción
5. CRÍTICO: El JSON debe estar COMPLETO. Cierra todas las llaves y comillas. Escapa comillas dobles dentro de markdown_report usando \\"
6. Si la respuesta es muy larga, acórtala pero MANTÉN el JSON válido y completo.`;

        // Para análisis de arena, necesitamos más tokens (16384) para evitar truncamiento
        // con muchos ejercicios - esto permite respuestas de hasta ~12,000 palabras
        const response = await generateWithFallback(
            ai, 
            REPORT_MODELS, 
            userPrompt, 
            systemInstruction,
            undefined, // responseSchema
            undefined, // inlineData
            16384 // maxOutputTokens - aumentado significativamente para reportes largos
        );

        // Parsear JSON con manejo robusto de errores
        let aiRes: any;
        
        // Extraer texto de la respuesta de manera robusta
        let rawText = '';
        if (response?.text) {
            rawText = response.text;
        } else if (response?.raw?.text) {
            rawText = response.raw.text;
        } else if (response?.raw?.candidates?.[0]?.content?.parts?.[0]?.text) {
            rawText = response.raw.candidates[0].content.parts[0].text;
        } else if (typeof response === 'string') {
            rawText = response;
        } else {
            console.error('❌ No se pudo extraer texto de la respuesta:', response);
            rawText = '{}';
        }
        
        console.log(`[Arena] Longitud de respuesta: ${rawText.length} caracteres`);
        let cleanedJson = cleanJson(rawText);
        let parseAttempts = 0;
        const maxAttempts = 5;
        
        while (parseAttempts < maxAttempts) {
            try {
                aiRes = JSON.parse(cleanedJson);
                // Validar que tenga los campos esperados
                if (aiRes && typeof aiRes === 'object') {
                    break;
                }
                throw new Error('Respuesta no válida');
            } catch (error: any) {
                parseAttempts++;
                const errorMessage = error?.message || String(error);
                
                // Si es el último intento, intentar reparar el JSON truncado
                if (parseAttempts >= maxAttempts) {
                    console.error("Error parseando JSON después de", maxAttempts, "intentos.");
                    console.error("Error:", errorMessage);
                    console.error("JSON (primeros 500 chars):", cleanedJson.substring(0, 500));
                    console.error("JSON completo (últimos 500 chars):", cleanedJson.substring(Math.max(0, cleanedJson.length - 500)));
                    
                    // Intentar reparar JSON truncado: cerrar strings y objetos abiertos
                    try {
                        let fixedJson = cleanedJson;
                        let inString = false;
                        let escapeNext = false;
                        let braceCount = 0;
                        let bracketCount = 0;
                        let lastStringStart = -1;
                        
                        // Analizar el JSON carácter por carácter para encontrar strings abiertos
                        for (let i = 0; i < fixedJson.length; i++) {
                            const char = fixedJson[i];
                            if (escapeNext) {
                                escapeNext = false;
                                continue;
                            }
                            if (char === '\\') {
                                escapeNext = true;
                                continue;
                            }
                            if (char === '"') {
                                if (!inString) {
                                    lastStringStart = i;
                                    inString = true;
                                } else {
                                    inString = false;
                                    lastStringStart = -1;
                                }
                                continue;
                            }
                            if (!inString) {
                                if (char === '{') braceCount++;
                                if (char === '}') braceCount--;
                                if (char === '[') bracketCount++;
                                if (char === ']') bracketCount--;
                            }
                        }
                        
                        // Si estamos dentro de un string que no está cerrado, cerrarlo
                        if (inString) {
                            // Si el JSON termina con }, probablemente el string debe cerrarse antes
                            const lastBrace = fixedJson.lastIndexOf('}');
                            if (lastBrace > 0 && lastBrace === fixedJson.length - 1) {
                                // El JSON termina con }, insertar " antes del último }
                                fixedJson = fixedJson.substring(0, lastBrace) + '"' + fixedJson.substring(lastBrace);
                            } else {
                                // Agregar " al final
                                fixedJson += '"';
                            }
                            inString = false;
                        }
                        
                        // Re-contar llaves después de cerrar el string
                        braceCount = 0;
                        bracketCount = 0;
                        inString = false;
                        escapeNext = false;
                        for (let i = 0; i < fixedJson.length; i++) {
                            const char = fixedJson[i];
                            if (escapeNext) {
                                escapeNext = false;
                                continue;
                            }
                            if (char === '\\') {
                                escapeNext = true;
                                continue;
                            }
                            if (char === '"') {
                                inString = !inString;
                                continue;
                            }
                            if (!inString) {
                                if (char === '{') braceCount++;
                                if (char === '}') braceCount--;
                                if (char === '[') bracketCount++;
                                if (char === ']') bracketCount--;
                            }
                        }
                        
                        // Cerrar objetos y arrays abiertos
                        if (bracketCount > 0) {
                            fixedJson += ']'.repeat(bracketCount);
                        }
                        if (braceCount > 0) {
                            fixedJson += '}'.repeat(braceCount);
                        }
                        
                        // Intentar parsear el JSON reparado
                        aiRes = JSON.parse(fixedJson);
                        console.log("JSON reparado exitosamente");
                        break;
                    } catch (repairError) {
                        console.error("No se pudo reparar el JSON:", repairError);
                    }
                    
                    // Último recurso: intentar extraer JSON válido usando regex
                    try {
                        // Buscar el objeto JSON más completo posible
                        const jsonMatch = rawText.match(/\{[\s\S]*/);
                        if (jsonMatch) {
                            let extractedJson = jsonMatch[0];
                            
                            // Intentar cerrar strings y objetos
                            let inString = false;
                            let escapeNext = false;
                            let braceCount = 0;
                            let bracketCount = 0;
                            
                            for (let i = 0; i < extractedJson.length; i++) {
                                const char = extractedJson[i];
                                if (escapeNext) {
                                    escapeNext = false;
                                    continue;
                                }
                                if (char === '\\') {
                                    escapeNext = true;
                                    continue;
                                }
                                if (char === '"') {
                                    inString = !inString;
                                    continue;
                                }
                                if (!inString) {
                                    if (char === '{') braceCount++;
                                    if (char === '}') braceCount--;
                                    if (char === '[') bracketCount++;
                                    if (char === ']') bracketCount--;
                                }
                            }
                            
                            if (inString) extractedJson += '"';
                            if (bracketCount > 0) extractedJson += ']'.repeat(bracketCount);
                            if (braceCount > 0) extractedJson += '}'.repeat(braceCount);
                            
                            extractedJson = cleanJson(extractedJson);
                            aiRes = JSON.parse(extractedJson);
                            console.log("JSON extraído exitosamente usando regex");
                            break;
                        }
                    } catch (extractError) {
                        console.error("No se pudo extraer JSON usando regex:", extractError);
                    }
                    
                    // Si todo falla, lanzar el error original con más información
                    throw new Error(`Error parseando respuesta de IA: ${errorMessage}. JSON truncado a 500 chars: ${cleanedJson.substring(0, 500)}`);
                }
                
                // Para los intentos intermedios, intentar limpiar más agresivamente
                // Pero primero, intentar reparar strings no cerrados
                if (errorMessage.includes('Unterminated string') || errorMessage.includes('string')) {
                    // Intentar encontrar y cerrar strings no terminados
                    let fixedJson = cleanedJson;
                    let inString = false;
                    let escapeNext = false;
                    
                    // Buscar el último '"' que no está escapado
                    for (let i = fixedJson.length - 1; i >= 0; i--) {
                        const char = fixedJson[i];
                        if (char === '\\' && i > 0 && fixedJson[i-1] !== '\\') {
                            continue; // Es parte de un escape
                        }
                        if (char === '"') {
                            // Verificar si estamos dentro de un string contando escapes hacia atrás
                            let escapes = 0;
                            for (let j = i - 1; j >= 0 && fixedJson[j] === '\\'; j--) {
                                escapes++;
                            }
                            inString = (escapes % 2 === 0); // Si es par, es una comilla de apertura/cierre
                            break;
                        }
                    }
                    
                    // Si estamos dentro de un string, intentar cerrarlo inteligentemente
                    if (inString) {
                        // Buscar el final del JSON y cerrar el string antes del último }
                        const lastBrace = fixedJson.lastIndexOf('}');
                        if (lastBrace > 0) {
                            fixedJson = fixedJson.substring(0, lastBrace) + '"' + fixedJson.substring(lastBrace);
                        } else {
                            fixedJson += '"';
                        }
                    }
                    cleanedJson = fixedJson;
                } else {
                    // Para otros errores, simplemente limpiar de nuevo
                    cleanedJson = cleanJson(rawText);
                }
            }
        }

        return {
            ...aiRes, 
            rawStats: stats,
            headToHeadData: headToHead
        };

    } catch (error) { 
        console.error("Error en generateGroupAnalysis:", error);
        throw error; 
    }
};
