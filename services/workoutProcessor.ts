import { GoogleGenAI, Type } from "@google/genai";
import { WorkoutData, Workout, GlobalReportData, MaxComparisonEntry, GroupAnalysisData } from "../types";
import { format, isSameMonth, isAfter } from "date-fns";
// Fix: Import subMonths and startOfMonth from their specific paths to avoid missing exported member errors
import subMonths from "date-fns/subMonths";
import startOfMonth from "date-fns/startOfMonth";
// Fix: Import locales from specific paths as the barrel export might be incomplete or missing
import es from 'date-fns/locale/es';
import enUS from 'date-fns/locale/en-US';
import { getCanonicalId, getLocalizedName } from "../utils";
import { EXERCISE_DB } from "../data/exerciseDb";

// --- CONSTANTS & CONFIG ---

// MODIFICACIÓN: Listas de prioridad para fallback
// El sistema intentará usar el primero, si falla por cuota, usará el segundo, etc.
const REPORT_MODELS = [
    'gemini-3-pro-preview',
    'gemini-3-flash-preview',
    'gemini-2.5-flash',
    'gemini-2.0-pro-exp-02-05', // 1. Experimental Pro (Mejor razonamiento actual)
    'gemini-1.5-pro',           // 2. Pro Estable
    'gemini-2.0-flash',         // 3. Flash Nuevo (Más rápido/barato)
    'gemini-1.5-flash'          // 4. Flash Estable (Mayor cuota disponible)
];

const AUDIO_MODELS = [
    'gemini-2.0-flash-exp',     // Soporta audio nativo y es multimodal
    'gemini-1.5-flash'          // Fallback robusto para audio
];

const CALISTHENIC_IDS = new Set([
  'pull_up', 'chin_up', 'dips_chest', 'push_ups', 
  'handstand_pushup', 'muscle_up', 'dips_triceps', 'dominadas'
]);

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

// --- HELPERS ---

const getAIClient = (): GoogleGenAI => {
  // Priorizamos la clave del perfil del usuario (localStorage)
  const userKey = localStorage.getItem('USER_GEMINI_API_KEY');
  const finalKey = (userKey && userKey.trim().length > 10) ? userKey.trim() : process.env.API_KEY;
  
  if (!finalKey || finalKey === 'undefined' || finalKey === 'null') {
    throw new Error("API_KEY_MISSING: Por favor, configura tu API Key en el Perfil para activar la inteligencia.");
  }
  
  return new GoogleGenAI({ apiKey: finalKey });
};

const cleanJson = (text: string): string => {
  if (!text) return "{}";
  
  let clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  
  const firstOpen = clean.indexOf('{');
  const lastClose = clean.lastIndexOf('}');
  if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
    clean = clean.substring(firstOpen, lastClose + 1);
  }

  clean = clean.replace(/\n/g, " ");
  clean = clean.replace(/\t/g, " ");
  clean = clean.replace(/\\(?![/\\bfnrtu"']|u[0-9a-fA-F]{4})/g, "\\\\");

  return clean;
};

const safeParseWorkout = (structuredData: any): WorkoutData => {
    if (!structuredData) return { exercises: [] };
    if (typeof structuredData === 'object') return structuredData;
    if (typeof structuredData === 'string') {
        try {
            return JSON.parse(structuredData);
        } catch (e) {
            console.warn("Error parsing structured_data:", e);
            return { exercises: [] };
        }
    }
    return { exercises: [] };
};

const handleAIError = (error: any) => {
    console.error("AI Module Error:", error);
    throw new Error(`ERROR DE INTELIGENCIA: ${error.message || "Fallo en el procesamiento neuronal."}`);
};

// --- LOGICA DE REINTENTO (FALLBACK) ---
const generateWithFallback = async (
    ai: GoogleGenAI, 
    models: string[], 
    prompt: string, 
    systemInstruction?: string,
    responseSchema?: any,
    inlineData?: any
): Promise<any> => {
    let lastError;

    for (const modelName of models) {
        try {
            // CONFIGURACIÓN DINÁMICA
            const config: any = { 
                responseMimeType: "application/json", 
                temperature: 0.5,
                maxOutputTokens: 8192 // <--- IMPORTANTE: Evita que se corte el plan de acción
            };
            
            if (systemInstruction) config.systemInstruction = systemInstruction;
            if (responseSchema) config.responseSchema = responseSchema;

            const parts: any[] = [];
            if (inlineData) parts.push(inlineData);
            parts.push({ text: prompt });

            console.log(`🧠 Intentando generar con modelo: ${modelName}...`);

            // Usando la sintaxis de @google/genai
            const response = await ai.models.generateContent({
                model: modelName,
                contents: { parts: parts },
                config: config
            });

            return response;

        } catch (error: any) {
            console.warn(`⚠️ Fallo en modelo ${modelName}:`, error.message);
            lastError = error;
            
            const isRetryable = error.message?.includes('429') || 
                                error.message?.includes('503') || 
                                error.message?.includes('quota') ||
                                error.message?.includes('resource exhausted');

            // Si no es error de cuota y es el último modelo, fallamos.
            if (!isRetryable && models.indexOf(modelName) === models.length - 1) {
                 throw error;
            }
        }
    }
    throw new Error(`Todos los modelos fallaron. Último error: ${lastError?.message}`);
};


const isCalisthenic = (id: string): boolean => CALISTHENIC_IDS.has(id);

const getMuscleGroup = (id: string): string => {
    const lowerId = id.toLowerCase();
    if (lowerId.includes('bench') || lowerId.includes('push_up') || lowerId.includes('dips') || lowerId.includes('chest') || lowerId.includes('tricep') || lowerId.includes('press_banca')) return 'PUSH (Pecho/Tríceps)';
    if (lowerId.includes('pull') || lowerId.includes('row') || lowerId.includes('deadlift') || lowerId.includes('bicep') || lowerId.includes('curl') || lowerId.includes('dominadas')) return 'PULL (Espalda/Bíceps)';
    if (lowerId.includes('squat') || lowerId.includes('leg') || lowerId.includes('lunge') || lowerId.includes('calf') || lowerId.includes('sentadilla')) return 'LEGS (Pierna)';
    if (lowerId.includes('shoulder') || lowerId.includes('press') || lowerId.includes('raise') || lowerId.includes('hombro')) return 'SHOULDERS (Hombro)';
    return 'OTROS';
};

const calculateSetVolume = (
    reps: number, 
    weight: number | undefined, 
    unit: string | undefined, 
    userWeight: number, 
    isCalisthenicExercise: boolean
): number => {
    const safeReps = reps || 0;
    let weightInKg = 0;

    if (weight && weight > 0) {
        weightInKg = unit === 'lbs' ? weight * 0.453592 : weight;
    }

    if (isCalisthenicExercise) {
        return (userWeight + weightInKg) * safeReps;
    } else {
        return weightInKg * safeReps; 
    }
};

// --- CORE FUNCTIONS ---

export const generateGlobalReport = async (
    allWorkouts: Workout[],
    language: 'es' | 'en' = 'es',
    // NOTA: Estos son valores por defecto (fallback) si el usuario NO tiene datos en su perfil.
    // Si el usuario tiene perfil, estos valores se sobrescriben con los reales.
    currentWeight: number = 80,
    userHeight: number = 180,
    userAge: number = 25 // <--- NUEVO: Edad por defecto (fallback)
): Promise<GlobalReportData> => {
    try {
        const now = new Date();
        
        let totalVolume = 0;
        let monthlyVolume = 0;
        
        const globalMaxMap = new Map<string, { val: number, unit: string, isBW: boolean }>();
        const monthlyMaxMap = new Map<string, { val: number, unit: string, isBW: boolean }>();

        // 1. Procesamiento
        for (const w of allWorkouts) {
            const wDate = new Date(w.date);
            const isThisMonth = isSameMonth(wDate, now);
            const historicWeight = w.user_weight || currentWeight;

            const workoutData = safeParseWorkout(w.structured_data);
            if (!workoutData.exercises || !Array.isArray(workoutData.exercises)) continue;

            for (const ex of workoutData.exercises) {
                const id = getCanonicalId(ex.name, EXERCISE_DB);
                const displayName = getLocalizedName(id, EXERCISE_DB, language);
                const isCalis = isCalisthenic(id);

                for (const s of ex.sets) {
                    const isBW = !s.weight || s.weight <= 0;
                    const val = isBW ? (s.reps || 0) : (s.weight || 0);
                    const unit = isBW ? 'reps' : (s.unit || 'kg');
                    
                    const setVol = calculateSetVolume(s.reps || 0, s.weight, s.unit, historicWeight, isCalis);
                    totalVolume += setVol;

                    if (isThisMonth) {
                        monthlyVolume += setVol;
                        const currentM = monthlyMaxMap.get(displayName);
                        if (!currentM || val > currentM.val) monthlyMaxMap.set(displayName, { val, unit, isBW });
                    }

                    const currentG = globalMaxMap.get(displayName);
                    if (!currentG || val > currentG.val) globalMaxMap.set(displayName, { val, unit, isBW });
                }
            }
        }

        // 2. Filtrado para el Prompt
        const lookbackDate = subMonths(now, 1);
        const recentHistory = allWorkouts
            .filter(w => isAfter(new Date(w.date), lookbackDate))
            .map(w => {
                const wData = safeParseWorkout(w.structured_data);
                return {
                    date: w.date,
                    exercises: wData.exercises?.map(ex => ({
                        name: ex.name,
                        id: getCanonicalId(ex.name, EXERCISE_DB),
                        sets: ex.sets
                    })) || []
                };
            });

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

        // 3. Prompt (STRICT Naming Enforcement)
        const systemInstruction = `Eres un Entrenador de Alto Rendimiento experto en biomecánica y programación.
        
        ROL: Tu tono es **constructivo, profesional, técnico y alentador**. Evita el lenguaje agresivo o de "gym-bro" burlón. Tu objetivo es educar y guiar hacia la mejora continua.

        DATOS PROPORCIONADOS: Historial de entrenamientos, 1RMs y volúmenes.

        ESTRUCTURA DE RESPUESTA (JSON):
        {
          "equiv_global": "String corto. Comparación VISUAL del peso total histórico con algo masivo (ej: '3 Ballenas Azules').",
          "equiv_monthly": "String corto. Comparación VISUAL del peso mensual con objetos cotidianos o animales.",
          "analysis": "Markdown detallado siguiendo la estructura:
            ## 3 - AUDITORÍA FORENSE DEL MES
            Analiza patrones. ¿Hubo constancia? ¿Se rompió algún récord histórico
            ### 3.1 - Mapeo de Volumen Efectivo
            (Tabla de series semanales por grupo muscular y Veredicto: Mantenimiento/MAV/Sobreentrenamiento)
            ### 3.2 - Ratios de Equilibrio Estructural
            Observa los ejercicios. ¿Hay mucho 'Push' y poco 'Pull'? ¿Se ignoraron las piernas?
            (Análisis Push/Pull y Anterior/Posterior. Si hay desequilibrio >20%, usar **ALERTA ROJA: [Descripción]** en negrita y mayúsculas)
            ### 3.3 - Secuenciación y Sandbagging
            (Criticar orden de ejercicios si procede y detectar series con reps idénticas indicando falta de intensidad real)
            ### 3.4 - Estímulo vs Fatiga
            Basado en los RPE o fallos (si existen) y la frecuencia.
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
            
            IMPORTANTE: Sugiere pesos realistas basados en los 1RMs del usuario.
            
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
        
        // MODIFICACIÓN: Incluida la EDAD en el Prompt
        const prompt = `Analiza mi rendimiento para optimizar mi progreso. 
        Biometría: Edad ${userAge} años, Peso ${currentWeight}kg, Altura ${userHeight}cm.
        Peso Total Histórico: ${Math.round(totalVolume)}kg. 
        Peso este mes: ${Math.round(monthlyVolume)}kg. 
        IMPORTANTE: Considera mi edad, mi peso y el análisi detallado que has hecho para la elaboracion del informe profesional y ajustar la capacidad de recuperación, el volumen y la intensidad del plan de acción.
        Comparativa Máximos (Usa estos nombres exactos para el Plan de Acción): ${JSON.stringify(maxComparison.slice(0, 20))}.
        Historial detallado del mes: ${JSON.stringify(recentHistory)}.
        Genera el informe profesional y el plan de acción.`;

        const ai = getAIClient();
        
        const response = await generateWithFallback(
            ai, 
            REPORT_MODELS, 
            prompt, 
            systemInstruction
        );

        const aiRes = JSON.parse(cleanJson(response.text || '{}'));

        return {
            totalVolumeKg: totalVolume,
            volumeEquivalentGlobal: aiRes.equiv_global,
            monthlyVolumeKg: monthlyVolume,
            volumeEquivalentMonthly: aiRes.equiv_monthly,
            monthName: format(now, 'MMMM', { locale: language === 'es' ? es : enUS }),
            monthlyAnalysisText: aiRes.analysis,
            efficiencyScore: aiRes.score || 5,
            maxComparison: maxComparison
        };

    } catch (error) { handleAIError(error); throw error; }
};

export const processWorkoutAudio = async (audioBase64: string, mimeType: string): Promise<WorkoutData> => {
  try {
    const ai = getAIClient();
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

    // MODIFICACIÓN: Usar generateWithFallback con AUDIO_MODELS
    const response = await generateWithFallback(
        ai,
        AUDIO_MODELS, // Intenta el nativo, luego el 1.5 flash
        "Extract workout data strictly following the JSON schema.",
        undefined, // No system instruction
        schema,
        { inlineData: { mimeType, data: audioBase64 } }
    );

    return JSON.parse(cleanJson(response.text || ''));
  } catch (error: any) { handleAIError(error); throw error; }
};

// ------------------------------------------------------------------
// GENERATE GROUP ANALYSIS (ARENA MODE)
// ------------------------------------------------------------------

export const generateGroupAnalysis = async (
    usersData: { name: string; workouts: Workout[] }[],
    language: 'es' | 'en' = 'es'
): Promise<GroupAnalysisData> => {
    try {
        const ai = getAIClient();
        // --- FASE 1: PROCESAMIENTO MATEMÁTICO ---
        const stats: UserStats[] = usersData.map(user => {
            const s: UserStats = {
                userId: user.name,
                name: user.name,
                totalVolume: 0,
                workoutCount: new Set(user.workouts.map(w => w.date.split('T')[0])).size,
                muscleVol: {},
                maxLifts: {} 
            };

            user.workouts.forEach(w => {
                const historicWeight = w.user_weight || 80; 
                const workoutData = safeParseWorkout(w.structured_data);
                
                if (workoutData.exercises) {
                    workoutData.exercises.forEach(ex => {
                        const id = getCanonicalId(ex.name, EXERCISE_DB);
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
                            s.totalVolume += vol;
                            s.muscleVol[muscle] += vol;

                            // Cálculo de 1RM Estimado (Epley Formula)
                            const isBW = weightVal === 0 && isCalis;
                            const currentMetric = isBW ? repsVal : (loadInKg * (1 + repsVal / 30));

                            const currentBest = s.maxLifts[ex.name];
                            let isNewRecord = false;
                            
                            if (!currentBest) {
                                isNewRecord = true;
                            } else {
                                const prevMetric = currentBest.isBodyweight 
                                    ? currentBest.reps 
                                    : (currentBest.weight * (currentBest.unit === 'lbs' ? 0.453 : 1)) * (1 + currentBest.reps / 30);
                                
                                if (currentMetric > prevMetric) isNewRecord = true;
                            }

                            if (isNewRecord) {
                                s.maxLifts[ex.name] = {
                                    weight: weightVal,
                                    reps: repsVal,
                                    isBodyweight: isBW,
                                    unit: set.unit || 'kg'
                                };
                            }
                        });
                    });
                }
            });
            return s;
        });

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