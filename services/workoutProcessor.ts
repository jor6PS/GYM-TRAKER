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
            } catch (error) {
                console.warn('Error loading stored records, using fallback calculation:', error);
            }
        }

        // 2. PROCESAMIENTO DE RECORDS PARA MÁXIMOS
        if (storedRecords.length > 0) {
            for (const record of storedRecords) {
                const displayName = getLocalizedName(record.exercise_id, catalog);
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

        // 3. PROCESAMIENTO DE WORKOUTS (SINGLE PASS - Bucle Único)
        // ✅ CORRECCIÓN: Siempre recalcular totalVolume desde workouts para asegurar que esté actualizado
        // El valor de records puede estar desactualizado si hay nuevos workouts
        totalVolume = 0; // Resetear para recalcular desde cero
        const recentHistory: any[] = []; 

        for (const w of allWorkouts) {
            const wDate = new Date(w.date);
            const isThisMonth = isSameMonth(wDate, now);
            const isRecent = isAfter(wDate, lookbackDate);

            const historicUserWeight = w.user_weight || currentWeight;
            const workoutData = safeParseWorkout(w.structured_data);
            
            if (!workoutData.exercises || !Array.isArray(workoutData.exercises)) continue;

            const promptExercises: any[] = [];

            for (const ex of workoutData.exercises) {
                const id = getCanonicalId(ex.name, catalog);
                const exerciseDef = catalog.find(e => e.id === id);
                const exerciseType = exerciseDef?.type || 'strength';
                
                if (exerciseType !== 'strength') continue;
                
                const isCalis = isCalisthenic(id);
                const isUnilateral = ex.unilateral || false;
                let sessionExVolume = 0;

                // Array detallado de sets para enviar a la IA (NO simplificado)
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

                // ✅ CORRECCIÓN: Siempre sumar al totalVolume (ya no depende de calcTotalFromScratch)
                totalVolume += sessionExVolume;
                if (isThisMonth) monthlyVolume += sessionExVolume;

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
            let storedRecords: any[] = [];
            let storedTotalVolume = 0;
            if (user.userId) {
                try {
                    storedRecords = await getUserRecords(user.userId);
                    storedTotalVolume = await getUserTotalVolume(user.userId);
                } catch (error) {
                    console.warn(`Error loading stored records for ${user.name}, using fallback:`, error);
                }
            }

            // Procesar TODOS los workouts para extraer TODOS los ejercicios únicos
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

                            // Guardar el mejor set para este ejercicio
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

            // Si tenemos records almacenados, usarlos para los máximos (sobrescriben si son mejores)
            if (storedRecords.length > 0) {
                for (const record of storedRecords) {
                    const exerciseName = getLocalizedName(record.exercise_id, catalog);
                    const weight = record.is_bodyweight ? 0 : record.max_weight_kg;
                    const reps = record.is_bodyweight ? record.max_reps : record.max_weight_reps;
                    
                    // Si ya tenemos este ejercicio de los workouts, comparar y usar el mejor
                    if (allExercisesFromWorkouts.has(exerciseName)) {
                        const existing = allExercisesFromWorkouts.get(exerciseName)!;
                        const recordMetric = record.is_bodyweight 
                            ? reps 
                            : (weight * (record.unit === 'kg' ? 1 : 0.453592)) * (1 + reps / 30);
                        const existingMetric = existing.bestSet.isBodyweight 
                            ? existing.bestSet.reps 
                            : (existing.bestSet.weight * (existing.bestSet.unit === 'lbs' ? 0.453592 : 1)) * (1 + existing.bestSet.reps / 30);
                        
                        if (recordMetric > existingMetric) {
                            existing.bestSet = {
                                weight: weight,
                                reps: reps,
                                isBodyweight: record.is_bodyweight,
                                unit: record.unit || 'kg'
                            };
                        }
                    } else {
                        // Si no está en los workouts pero sí en records, agregarlo
                        allExercisesFromWorkouts.set(exerciseName, {
                            name: exerciseName,
                            id: record.exercise_id,
                            bestSet: {
                                weight: weight,
                                reps: reps,
                                isBodyweight: record.is_bodyweight,
                                unit: record.unit || 'kg'
                            }
                        });
                    }
                }
            }

            // Agregar todos los ejercicios encontrados a maxLifts
            allExercisesFromWorkouts.forEach((exerciseData, exerciseName) => {
                s.maxLifts[exerciseName] = exerciseData.bestSet;
            });
            
            // Si tenemos volumen almacenado, usamos ese valor; de lo contrario usamos el calculado de workouts
            s.totalVolume = storedTotalVolume > 0 ? storedTotalVolume : workoutVolume;

            return s;
        }));

        // --- FASE 2: CROSS-ANALYSIS (Head-to-Head + Empates) ---
        const allExercisesSet = new Set<string>();
        stats.forEach(s => Object.keys(s.maxLifts).forEach(k => allExercisesSet.add(k)));
        const allExercisesList = Array.from(allExercisesSet).sort();

        const headToHead: CommonExerciseComparison[] = [];

        allExercisesList.forEach(exName => {
            const participants = stats.filter(s => s.maxLifts[exName]);
            
            if (participants.length > 1) {
                const entries = participants.map(p => {
                    const lift = p.maxLifts[exName];
                    const weightInKg = lift.unit === 'lbs' ? lift.weight * 0.453 : lift.weight;
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

        // --- PREPARACIÓN DE DATOS (TABLAS 2 y 3) ---

        // A) DATOS PARA LA MATRIZ (TABLA 3)
        const matrixData = allExercisesList.map(exName => {
            const row: any = { exercise: exName };
            stats.forEach(user => {
                const lift = user.maxLifts[exName];
                if (lift) {
                    row[user.name] = lift.isBodyweight 
                        ? `${lift.reps} reps` 
                        : `${lift.weight}${lift.unit} x ${lift.reps}`;
                } else {
                    row[user.name] = ""; 
                }
            });
            return row;
        });

        // B) DATOS PARA ENFOQUE (TABLA 2)
        const focusComparison = stats.map(user => {
            const total = user.totalVolume || 1;
            const breakdown = Object.entries(user.muscleVol)
                .sort(([, a], [, b]) => b - a)
                .map(([muscle, vol]) => {
                    const pct = Math.round((vol / total) * 100);
                    return `${muscle} (${pct}%)`;
                }).slice(0, 3);
            
            return {
                name: user.name,
                top_muscles: breakdown.join(', ')
            };
        });

        // --- FASE 3: GENERACIÓN IA ---
        const systemInstruction = `Eres el Juez Supremo de una Arena de Entrenamiento.
        TU ROL: Analista de datos brutalmente honesto.
        
        INSTRUCCIONES DE FORMATO (CRÍTICO):
        1. Respuesta JSON válido. "markdown_report" en UNA SOLA LÍNEA (usa \\n).
        
        ESTRUCTURA DEL REPORTE MARKDOWN:
        
        **SECCIÓN 1: DUELOS (Head-to-Head)**
        ¡IMPORTANTE! NO HAGAS UNA TABLA AQUÍ.
        Genera una lista visual de tarjetas para los ejercicios comunes más relevantes (máximo 5-6).
        Formato obligatorio por ejercicio:
        
        ### [NOMBRE EJERCICIO MAYÚSCULAS]
        🏆 **[Ganador]**: [Carga] [Reps]
        ⚔️ vs [Segundo]: [Carga] [Reps]
        (Deja espacio entre ejercicios)
        
        *Si 'winner' es 'EMPATE', usa este formato:*
        ⚖️ **EMPATE TÉCNICO**: [Carga] [Reps]
        ⚔️ [Usuario A] vs [Usuario B]

        **TABLA 2: DISTRIBUCIÓN DE ENTRENAMIENTO (Focus Analysis)**
        (Aquí SÍ usa una Tabla normal).
        Columnas: Atleta | Top 3 Grupos Musculares (% del volumen).
        
        **TABLA 3: MATRIZ DE RENDIMIENTO COMPLETA (The Matrix)**
        (Aquí SÍ usa una Tabla normal).
        Columnas: Ejercicio | [Nombre Usuario 1] | [Nombre Usuario 2] ...
        Filas: Todos los ejercicios provistos en 'full_matrix_data'.
        Celdas: Copia el valor exacto (ej: "100kg x 5"). Si está vacío, deja la celda vacía.
        
        **VEREDICTO FINAL**
        Párrafo final ácido resumiendo quién es el Alpha.
        `;

        const promptData = {
            head_to_head_results: headToHead.slice(0, 10).map(h => ({
                exercise: h.exerciseName,
                winner: h.winner,
                details: h.entries.map(e => ({
                    user: e.userName,
                    display: e.weight > 0 ? `${e.weight}${e.unit} x ${e.reps}` : `${e.reps} reps`
                }))
            })),
            focus_comparison: focusComparison,
            full_matrix_data: matrixData
        };

        // MODIFICACIÓN: Usar generateWithFallback con REPORT_MODELS
        const response = await generateWithFallback(
            ai, 
            REPORT_MODELS, 
            `Genera el análisis completo: ${JSON.stringify(promptData)}`, 
            systemInstruction
        );

        const aiRes = JSON.parse(cleanJson(response.text || '{}'));

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
