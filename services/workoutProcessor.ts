import { GoogleGenAI, Type } from "@google/genai";
import { WorkoutData, Workout, GlobalReportData, MaxComparisonEntry, GroupAnalysisData } from "../types";
import { format, isSameMonth, subMonths, isAfter, startOfMonth } from "date-fns";
import { es, enUS } from 'date-fns/locale';
import { getCanonicalId, getLocalizedName } from "../utils";
import { EXERCISE_DB } from "../data/exerciseDb";

// --- CONSTANTS & CONFIG ---

const MODELS_PRIORITY = [
    'gemini-2.5-flash', 
    'gemini-2.0-flash', 
    'gemini-1.5-pro',   
    'gemini-1.5-flash'  
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
    entries: { userName: string; weight: number; reps: number; oneRM: number }[];
    winner: string;
}

// Cache simple
let cachedClient: GoogleGenAI | null = null;
let cachedKey: string | null = null;

// --- HELPERS ---

const getAIClient = (): GoogleGenAI => {
  const userKey = localStorage.getItem('USER_GEMINI_API_KEY');
  
  if (!userKey || userKey.trim() === "" || userKey === "undefined") {
    throw new Error("NEXO DESCONECTADO: Para activar la inteligencia, debes configurar tu Gemini API Key personal en el Perfil.");
  }

  if (cachedClient && cachedKey === userKey) {
    return cachedClient;
  }

  cachedKey = userKey;
  cachedClient = new GoogleGenAI({ apiKey: userKey.trim() });
  return cachedClient;
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
    if (error.message?.includes("NEXO DESCONECTADO")) throw error;
    throw new Error(`ERROR DE INTELIGENCIA: ${error.message || "Fallo en el procesamiento neuronal."}`);
};

const generateWithFallback = async (contents: any, config: any, systemInstruction?: string) => {
    const ai = getAIClient();
    let lastError = null;

    for (const model of MODELS_PRIORITY) {
        try {
            const response = await ai.models.generateContent({
                model: model,
                contents: contents,
                config: { ...config, systemInstruction: systemInstruction }
            });
            return response;
        } catch (error: any) {
            console.warn(`Fallo en modelo ${model}:`, error.message);
            lastError = error;
            if (error.message?.includes("API key") || error.message?.includes("PERMISSION_DENIED")) {
                throw error;
            }
            continue;
        }
    }
    throw lastError || new Error("Todos los modelos de IA están inactivos actualmente.");
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
    currentWeight: number = 80,
    userHeight: number = 180
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

        // 3. Prompt (ACTUALIZADO: Tono Constructivo + Plan 3 Días)
        const systemInstruction = `Eres un Entrenador de Alto Rendimiento experto en biomecánica y programación.
        
        ROL: Tu tono es **constructivo, profesional, técnico y alentador**. Evita el lenguaje agresivo o de "gym-bro" burlón. Tu objetivo es educar y guiar hacia la mejora continua.

        DATOS PROPORCIONADOS: Historial de entrenamientos, 1RMs y volúmenes.

        ESTRUCTURA DE RESPUESTA (JSON):
        {
          "equiv_global": "Cantidad + elemento absurdo/ingenioso para el peso total acumulado",
          "equiv_monthly": "Cantidad + elemento absurdo/ingenioso para el peso de este mes",
          "analysis": "Markdown detallado siguiendo la estructura:
            ## 3 - AUDITORÍA FORENSE DEL MES
            ### 3.1 - Mapeo de Volumen Efectivo
            (Tabla de series semanales por grupo muscular y Veredicto: Mantenimiento/MAV/Sobreentrenamiento)
            ### 3.2 - Ratios de Equilibrio Estructural
            (Análisis Push/Pull y Anterior/Posterior. Si hay desequilibrio >20%, usar **ALERTA ROJA: [Descripción]** en negrita y mayúsculas)
            ### 3.3 - Secuenciación y Sandbagging
            (Criticar orden de ejercicios y detectar series con reps idénticas indicando falta de intensidad real)
            ### 3.4 - Estímulo vs Fatiga
            (Análisis sistémico de ejercicios pesados)
            ## 4 - ANÁLISIS DE EVOLUCIÓN
            (Comparativa técnica con meses pasados sobre sobrecarga progresiva)
            ## 5 - VEREDICTO Y MEJORAS
            (3 cambios concretos para el mes que viene).
            ## 6 - PLAN DE ACCIÓN (PRÓXIMOS 3 DÍAS)
            Diseña una micro-rutina de 3 días (Día A, Día B, Día C) basada en los datos analizados para corregir debilidades o potenciar fortalezas.
            
            IMPORTANTE: Para cada ejercicio, SUGIERE PESOS REALISTAS basados en la 'Comparativa Máximos' provista. Si el usuario levanta 100kg, no sugieras 20kg.
            
            Formato requerido:
            **DÍA 1: [Enfoque]**
            * [Ejercicio] | [Sets]x[Reps] | [Peso Sugerido / RPE]
            * ...
            (Repetir para Día 2 y 3)",
          "score": número 1-10
        }`;

        const prompt = `Analiza mi rendimiento para optimizar mi progreso. 
        Biometría: ${currentWeight}kg.
        Peso Total Histórico: ${Math.round(totalVolume)}kg. 
        Peso este mes: ${Math.round(monthlyVolume)}kg. 
        Comparativa Máximos (Usa esto para calcular los pesos del plan): ${JSON.stringify(maxComparison.slice(0, 20))}.
        Historial detallado del mes: ${JSON.stringify(recentHistory)}.
        Genera el informe profesional y el plan de acción.`;

        const response = await generateWithFallback(
            { parts: [{ text: prompt }] },
            { responseMimeType: "application/json", temperature: 0.7 },
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

    const response = await generateWithFallback(
        { 
            parts: [
                { inlineData: { mimeType, data: audioBase64 } }, 
                { text: "Extract workout data strictly following the JSON schema." }
            ] 
        },
        { 
            responseMimeType: "application/json", 
            responseSchema: schema,
            temperature: 0.1 
        }
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

        const response = await generateWithFallback(
            { parts: [{ text: `Genera el análisis completo: ${JSON.stringify(promptData)}` }] },
            { responseMimeType: "application/json", temperature: 0.5 },
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