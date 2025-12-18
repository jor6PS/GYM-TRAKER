
import { GoogleGenAI, Type } from "@google/genai";
import { WorkoutData, Workout, GlobalReportData, MaxComparisonEntry, GroupAnalysisData } from "../types";
import { format, isSameMonth, subMonths, isAfter, startOfMonth } from "date-fns";
import { es, enUS } from 'date-fns/locale';
import { getCanonicalId, getLocalizedName } from "../utils";
import { EXERCISE_DB } from "../data/exerciseDb";

// --- CONSTANTS & CONFIG ---

const MODELS_PRIORITY = [
    'gemini-2.5-flash', // El más nuevo y rápido
    'gemini-2.0-flash', // El 2 más nuevo y rápido
    'gemini-1.5-pro',   // El más inteligente (backup robusto)
    'gemini-1.5-flash'  // El más estable y económico (último recurso)
];

const CALISTHENIC_IDS = new Set([
  'pull_up', 'chin_up', 'dips_chest', 'push_ups', 
  'handstand_pushup', 'muscle_up', 'dips_triceps', 'dominadas' // Añadido 'dominadas' por si acaso
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
  
  // 1. Eliminar bloques de código Markdown y espacios externos
  let clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  
  // 2. Extraer solo el objeto JSON (desde el primer { hasta el último })
  const firstOpen = clean.indexOf('{');
  const lastClose = clean.lastIndexOf('}');
  if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
    clean = clean.substring(firstOpen, lastClose + 1);
  }

  // 3. SANITIZACIÓN CRÍTICA (Fix para errores de parseo):
  // Reemplaza saltos de línea reales dentro de la cadena por espacios para evitar rotura de strings JSON
  clean = clean.replace(/\n/g, " ");
  // Reemplaza tabuladores por espacios
  clean = clean.replace(/\t/g, " ");
  // Escapa backslashes sueltos que no sean parte de un escape válido (como \n o \")
  clean = clean.replace(/\\(?![/\\bfnrtu"']|u[0-9a-fA-F]{4})/g, "\\\\");

  return clean;
};

// HELPER CRÍTICO: Parsea el string de la DB a Objeto JS
const safeParseWorkout = (structuredData: any): WorkoutData => {
    if (!structuredData) return { exercises: [] };
    
    // Si ya es objeto, devolverlo
    if (typeof structuredData === 'object') return structuredData;
    
    // Si es string (como en tu DB), parsearlo
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
    // Normalización básica para coincidir con tus IDs
    const lowerId = id.toLowerCase();
    if (lowerId.includes('bench') || lowerId.includes('push_up') || lowerId.includes('dips') || lowerId.includes('chest') || lowerId.includes('tricep') || lowerId.includes('press_banca')) return 'PUSH (Pecho/Tríceps)';
    if (lowerId.includes('pull') || lowerId.includes('row') || lowerId.includes('deadlift') || lowerId.includes('bicep') || lowerId.includes('curl') || lowerId.includes('dominadas')) return 'PULL (Espalda/Bíceps)';
    if (lowerId.includes('squat') || lowerId.includes('leg') || lowerId.includes('lunge') || lowerId.includes('calf') || lowerId.includes('sentadilla')) return 'LEGS (Pierna)';
    if (lowerId.includes('shoulder') || lowerId.includes('press') || lowerId.includes('raise') || lowerId.includes('hombro')) return 'SHOULDERS (Hombro)';
    return 'OTROS';
};

const calculate1RM = (weight: number, reps: number) => weight * (1 + (reps / 30));

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
        // En tu DB 'Dominadas' tiene weight: 0, así que sumamos userWeight
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

        // 1. Procesamiento (TypeScript)
        for (const w of allWorkouts) {
            const wDate = new Date(w.date);
            const isThisMonth = isSameMonth(wDate, now);
            const historicWeight = w.user_weight || currentWeight;

            // PARSEO SEGURO DE LA DB
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

        // 3. Prompt
        const systemInstruction = `Eres un Entrenador de Alto Rendimiento y Analista de Datos Deportivos.
        ROL: Técnico, crítico, directo y constructivo. Tono de "gym-bro" experto. Cero cumplidos vacíos.
        OBJETIVO: Optimización pura.
        DATOS PROPORCIONADOS: Historial de entrenamientos con Ejercicios, Series, Reps y KG.
        RESTRICCIÓN: No des consejos de nutrición ni descanso. Céntrate en métricas y programación.

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
            (3 cambios concretos para el mes que viene)",
          "score": número 1-10
        }`;

        const prompt = `Analiza mi legado de hierro. 
        Biometría: ${currentWeight}kg.
        Peso Total Histórico: ${Math.round(totalVolume)}kg. 
        Peso este mes: ${Math.round(monthlyVolume)}kg. 
        Comparativa Máximos: ${JSON.stringify(maxComparison.slice(0, 20))}.
        Historial detallado del mes: ${JSON.stringify(recentHistory)}.
        Genera el informe forense estricto.`;

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

export const generateGroupAnalysis = async (
    usersData: { name: string; workouts: Workout[] }[],
    language: 'es' | 'en' = 'es'
): Promise<GroupAnalysisData> => {
    try {
        // --- FASE 1: PROCESAMIENTO MATEMÁTICO (TypeScript) ---
        const stats: UserStats[] = usersData.map(user => {
            const s: UserStats = {
                userId: user.name,
                name: user.name,
                totalVolume: 0,
                workoutCount: new Set(user.workouts.map(w => w.date.split('T')[0])).size,
                muscleVol: {},
                maxLifts: {} // Aquí guardaremos weight, reps, unit y 1RM estimado
            };

            user.workouts.forEach(w => {
                const historicWeight = w.user_weight || 80; 
                
                // 1. PARSEO SEGURO: Evita el crash si structured_data es string
                const workoutData = safeParseWorkout(w.structured_data);
                
                if (workoutData.exercises) {
                    workoutData.exercises.forEach(ex => {
                        const id = getCanonicalId(ex.name, EXERCISE_DB);
                        const muscle = getMuscleGroup(id);
                        
                        // Inicializar volumen muscular si no existe
                        if (!s.muscleVol[muscle]) s.muscleVol[muscle] = 0;

                        ex.sets.forEach(set => {
                            const isCalis = isCalisthenic(id);
                            const weightVal = (set.weight || 0);
                            const repsVal = (set.reps || 0);
                            
                            // 2. NORMALIZACIÓN DE CARGA (Todo a KG para cálculos internos)
                            let loadInKg = (set.unit === 'lbs' ? weightVal * 0.453592 : weightVal); 
                            
                            // Si es calistenia, la carga real es Peso Corporal + Lastre
                            if (isCalis) loadInKg += historicWeight;
                            
                            // 3. CÁLCULO DE VOLUMEN
                            const vol = loadInKg * repsVal;
                            s.totalVolume += vol;
                            s.muscleVol[muscle] += vol;

                            // 4. CÁLCULO DE MÁXIMOS (Estimated 1RM)
                            // Fórmula Epley: Peso * (1 + Reps/30). Si es BW puro, usamos Reps como métrica.
                            const isBW = weightVal === 0 && isCalis;
                            const currentMetric = isBW ? repsVal : (loadInKg * (1 + repsVal / 30));

                            const currentBest = s.maxLifts[ex.name];
                            
                            // Comparamos métricas normalizadas para ver si este set es el mejor histórico
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
                                    unit: set.unit || 'kg' // IMPORTANTE: Guardar la unidad original
                                };
                            }
                        });
                    });
                }
            });
            return s;
        });

        // --- FASE 2: CROSS-ANALYSIS (Comparativa Directa / Head-to-Head) ---
        const allExercises = new Set<string>();
        stats.forEach(s => Object.keys(s.maxLifts).forEach(k => allExercises.add(k)));

        const headToHead: CommonExerciseComparison[] = [];

        allExercises.forEach(exName => {
            // Filtramos quiénes han hecho este ejercicio
            const participants = stats.filter(s => s.maxLifts[exName]);
            
            // Solo comparamos si hay 2 o más "gladiadores" en este ejercicio
            if (participants.length > 1) {
                const entries = participants.map(p => {
                    const lift = p.maxLifts[exName];
                    
                    // Normalizar a KG para ordenar correctamente
                    const weightInKg = lift.unit === 'lbs' ? lift.weight * 0.453 : lift.weight;
                    
                    // Calcular "Power Score" (1RM o Reps) para decidir ganador
                    const powerScore = lift.isBodyweight 
                        ? lift.reps 
                        : weightInKg * (1 + lift.reps / 30);

                    return {
                        userName: p.name,
                        weight: lift.weight,
                        reps: lift.reps,
                        oneRM: powerScore // Usamos esto para ordenar
                    };
                }).sort((a, b) => b.oneRM - a.oneRM); // Orden descendente (Ganador primero)

                headToHead.push({
                    exerciseId: exName,
                    exerciseName: exName,
                    entries: entries,
                    winner: entries[0].userName
                });
            }
        });

        // --- FASE 3: GENERACIÓN IA ---
        const systemInstruction = `Eres el Juez Supremo de una Competición de Powerlifting y Bodybuilding de Élite.
        TU ROL: Analista de datos deportivo, despiadado, técnico y con un humor "gym-bro" inteligente.
        OBJETIVO: Humillar la mediocridad y glorificar la fuerza basándote E STRICTAMENTE en los datos provistos.

        INSTRUCCIONES DE SEGURIDAD JSON (CRÍTICO):
        1. Tu respuesta debe ser un JSON válido (RFC 8259).
        2. El campo "markdown_report" debe ser UNA SOLA LÍNEA de texto. Usa '\\n' para los saltos de línea visuales. NUNCA uses saltos de línea reales.
        3. NO uses comillas dobles (") dentro del texto del reporte a menos que las escapes correctamente (\\"). Prefiere comillas simples (').

        ESTRUCTURA DE SALIDA (JSON):
        {
            "alpha_user": "Nombre del ganador indiscutible (Volumen + Constancia)",
            "beta_user": "Nombre del que necesita espabilar (Bajo rendimiento)",
            "markdown_report": "Informe completo en Markdown enriquecido (ver contenido abajo)"
        }

        CONTENIDO DEL REPORTE (Markdown):
        1. Usa Emojis para dar vida (🏆, 💀, 🧬, 🛡️).
        2. **TABLA 1: BATALLA REAL (Head-to-Head)**. Usa 'head_to_head_results'. Compara quién levantó más en ejercicios comunes. Sé descriptivo (ej: 'Juan aplastó a Pedro en Banca').
        3. **TABLA 2: ANATOMÍA DEL DOMINIO**. Usa 'muscle_focus'. ¿Quién domina qué grupo muscular? Muestra una tabla y realiza comparaciones (ej: 'Carlos es el rey del Push, pero Ana domina Legs').
        4. **TABLA 3: HALL OF FAME**. Lista todos los levantamientos (PRs) de cada usuario ordenados por impacto.
        5. **VEREDICTO FINAL (ROAST TÉCNICO)**: Un párrafo final ácido. Critica desequilibrios (ej: "Mucho pecho y patas de pollo"), falta de constancia o pesos bajos ("levantando pesos de calentamiento"). Sé gracioso pero técnico.
        `;

        // Preparamos el resumen para la IA (Solo datos digeridos para ahorrar tokens y mejorar precisión)
        const promptData = {
            summary: stats.map(s => ({
                name: s.name,
                total_tonnage: Math.round(s.totalVolume / 1000) + " tons",
                consistency: `${s.workoutCount} sessions`,
                muscle_dominance: Object.entries(s.muscleVol)
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 2) // Top 2 músculos
                    .map(([k, v]) => `${k} (${Math.round(v)}kg vol)`),
                top_lifts: Object.entries(s.maxLifts)
                    .sort(([,a], [,b]) => {
                        // Ordenar lifts por estimación de carga para enviar los más impresionantes
                        const valA = a.isBodyweight ? 0 : a.weight;
                        const valB = b.isBodyweight ? 0 : b.weight;
                        return valB - valA;
                    })
                    .slice(0, 5) // Top 5 ejercicios
            })),
            head_to_head_results: headToHead.slice(0, 10).map(h => ({ // Top 10 batallas
                exercise: h.exerciseName,
                winner: h.winner,
                details: h.entries.map(e => `${e.userName}: ${e.weight > 0 ? e.weight + 'kg' : 'BW'} x ${e.reps}`).join(' vs ')
            }))
        };

        const response = await generateWithFallback(
            { parts: [{ text: `Genera el veredicto final de la Arena: ${JSON.stringify(promptData)}` }] },
            { responseMimeType: "application/json", temperature: 0.6 },
            systemInstruction
        );

        const aiRes = JSON.parse(cleanJson(response.text || '{}'));

        return {
            ...aiRes, 
            // Pasamos los datos crudos calculados para que el Frontend (ArenaModal) pueda dibujar las gráficas
            rawStats: stats,
            headToHeadData: headToHead
        };

    } catch (error) { handleAIError(error); throw error; }
};

