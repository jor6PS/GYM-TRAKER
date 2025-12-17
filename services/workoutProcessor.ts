
import { GoogleGenAI, Type } from "@google/genai";
import { WorkoutData, Workout, User, GroupAnalysisData, ComparisonRow, UserStatsProfile, Highlight, GlobalReportData, MonthlyMaxEntry } from "../types";
import { format, isSameMonth, addMonths } from "date-fns";
import { es, enUS } from 'date-fns/locale';
import { getCanonicalId, getLocalizedName } from "../utils";
import { EXERCISE_DB } from "../data/exerciseDb";

// --- CONFIGURATION ---
const MODEL_NAME = 'gemini-2.5-flash'; 

// Helper to safely get the AI instance only when needed
const getAIClient = () => {
  // 1. Try to get User's Personal Key (BYOK) - STRICT MODE
  const userKey = typeof window !== 'undefined' ? localStorage.getItem('USER_GEMINI_KEY') : null;
  
  // 2. FORCE USER KEY. We no longer fallback to process.env.API_KEY for the main app functions
  // to ensure users utilize their own free quota.
  
  if (!userKey || userKey.trim().length === 0) {
     console.warn("⛔ [AI Client] Blocked: No User API Key found.");
     throw new Error("MISSING_USER_KEY");
  }
  
  // 3. SANITIZATION
  const apiKey = userKey.replace(/["']/g, '').trim();
  
  // 4. Verification Log
  console.log(`🤖 [AI Client] Initialized using: USER (Personal) Key`);

  return new GoogleGenAI({ apiKey });
};

// --- HELPER: Prepare DB for AI Context ---
const getExerciseContextString = () => {
    return EXERCISE_DB.map(ex => `"${ex.es}" / "${ex.en}"`).join(", ");
};

const WORKOUT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    exercises: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Official Name from the allowed list if matches." },
          original_input: { type: Type.STRING, description: "What the user actually said." },
          match_status: { type: Type.STRING, enum: ["exact", "inferred", "unknown"], description: "Did we find it in the catalog?" },
          sets: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                reps: { type: Type.NUMBER },
                weight: { type: Type.NUMBER },
                unit: { type: Type.STRING, enum: ["kg", "lbs", "km", "m", "mins"], description: "Weight, Distance or Time unit" },
                distance: { type: Type.NUMBER, description: "Distance covered if cardio" },
                time: { type: Type.STRING, description: "Time elapsed" },
                rpe: { type: Type.NUMBER, description: "Rate of Perceived Exertion (1-10), if mentioned." }
              },
              required: ["unit"]
            }
          }
        },
        required: ["name", "sets"]
      }
    },
    notes: { type: Type.STRING, description: "Any general notes." }
  },
  required: ["exercises"]
};

// Helper to clean Markdown code blocks from JSON response
const cleanJson = (text: string): string => {
  if (!text) return "{}";
  let clean = text.replace(/```json/g, '').replace(/```/g, '');
  
  const firstOpen = clean.indexOf('{');
  const lastClose = clean.lastIndexOf('}');
  if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
    clean = clean.substring(firstOpen, lastClose + 1);
  }
  
  return clean.trim();
};

const validateData = (data: any): WorkoutData => {
    if (!data || !data.exercises || !Array.isArray(data.exercises)) {
        throw new Error("Invalid data structure returned by AI.");
    }
    
    if (data.exercises.length === 0) {
        throw new Error("No he detectado ejercicios claros. Intenta hablar más fuerte.");
    }

    return {
        exercises: data.exercises.map((ex: any) => ({
            name: ex.name, 
            sets: ex.sets
        })),
        notes: data.notes
    };
};

// Helper for error handling - REFACTORED FOR BETTER UX
const handleAIError = (error: any) => {
    console.error("AI Error Details (Full):", error);
    
    const msg = (error.message || error.toString()).toLowerCase();

    // 1. MISSING KEY GUIDANCE (The most important one)
    if (msg.includes("missing_user_key")) {
        throw new Error(
            "🔑 FALTA TU LLAVE MAESTRA\n\n" +
            "Para usar la IA, necesitas tu propia API Key de Google (Es gratis).\n\n" +
            "1. Ve a tu PERFIL (esquina superior derecha).\n" +
            "2. Busca la sección 'API Key'.\n" +
            "3. Pega tu clave allí."
        );
    }
    
    // SDK Specific Generic Error
    if (msg.includes("failed to call the gemini api") || msg.includes("fetch failed")) {
        throw new Error("⚠️ Error de Conexión. Verifica tu internet o desactiva el AdBlock.");
    }

    if (msg.includes('404') && msg.includes('not found')) {
        throw new Error(`Error: El modelo IA no está disponible o tu API Key es incorrecta.`);
    }

    if (msg.includes('429') || msg.includes('quota') || msg.includes('too many requests')) {
         throw new Error("⚠️ Tráfico Alto: Has superado tu límite gratuito por minuto. Espera un momento.");
    }

    if (msg.includes('400') || msg.includes('api key') || msg.includes('invalid')) {
        throw new Error("⚠️ API Key inválida. Revisa que la hayas copiado bien en tu Perfil.");
    }
    if (error instanceof SyntaxError) {
        throw new Error("Error de IA: La respuesta no tuvo el formato correcto.");
    }
    
    // Default fallback
    throw new Error(`Error de IA: ${error.message || "Inténtalo de nuevo."}`);
};

export const processWorkoutAudio = async (audioBase64: string, mimeType: string): Promise<WorkoutData> => {
  try {
    const ai = getAIClient();
    const exerciseList = getExerciseContextString();
    
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: audioBase64
            }
          },
          {
            text: `
              You are an expert fitness transcriber.
              
              **CRITICAL: EXERCISE MAPPING**
              Here is the ALLOWED CATALOG of exercises: 
              [${exerciseList}]

              YOUR TASK:
              1. Listen to the audio.
              2. For each exercise mentioned, try to find the CLOSEST MATCH in the allowed catalog.
              3. If a match is found, use the EXACT name from the catalog in the 'name' field.
              4. If NO match is found, use the original name but set 'match_status' to "unknown".
              
              **ENCODING RULES:**
              - Output JSON only.
              - PRESERVE Spanish accents.
              
              Structure:
              - Strength: Extract weight and reps. Default unit: 'kg'.
              - Cardio: Extract distance/time.
            `
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: WORKOUT_SCHEMA,
        temperature: 0.1, 
      }
    });

    if (!response.text) {
      throw new Error("No data returned from AI");
    }

    const cleanedText = cleanJson(response.text);
    const data = JSON.parse(cleanedText);
    
    return validateData(data);

  } catch (error: any) {
    handleAIError(error);
    throw error; 
  }
};

export const processWorkoutText = async (text: string): Promise<WorkoutData> => {
  try {
    const ai = getAIClient();
    const exerciseList = getExerciseContextString();

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          {
            text: `
              Parse this workout log into JSON.
              Input: "${text}"
              
              **CRITICAL: EXERCISE CATALOG**
              Map user input to these official names if possible:
              [${exerciseList}]
              
              Rules:
              1. If user types "Banca", map to "Press Banca (Barra)" (or closest match).
              2. If user types "Bici", map to "Ciclismo" or "Bici Estática".
              3. If explicit match found, use Catalog Name.
              4. PRESERVE accents.
            `
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: WORKOUT_SCHEMA,
        temperature: 0.1
      }
    });

    if (!response.text) {
      throw new Error("No data returned from AI");
    }

    const cleanedText = cleanJson(response.text);
    const data = JSON.parse(cleanedText);
    return validateData(data);

  } catch (error: any) {
    handleAIError(error);
    throw error;
  }
};

// ... (Rest of the file remains similar but uses handleAIError which catches the key issue) ...

// REPLACED OLD MONTHLY REPORT WITH NEW GLOBAL FUN REPORT + MONTHLY ANALYSIS
export const generateGlobalReport = async (
    allWorkouts: Workout[],
    language: 'es' | 'en' = 'es' 
): Promise<GlobalReportData> => {
    try {
        const ai = getAIClient();

        // 1. Calculate Grand Totals Locally (STRICT)
        let totalVolume = 0;
        let monthlyVolume = 0;
        let prevMonthlyVolume = 0;

        // 2. Prepare Data for Monthly Comparison & Highlights
        const now = new Date();
        const currentMonthWorkouts = allWorkouts.filter(w => isSameMonth(new Date(w.date), now));
        const prevMonthDate = addMonths(now, -1);
        const prevMonthWorkouts = allWorkouts.filter(w => isSameMonth(new Date(w.date), prevMonthDate));

        // --- CALCULATE MONTHLY STATS LOCALLY ---
        let maxLift = { name: '', weight: 0 };
        const freqMap = new Map<string, number>();
        const monthlyMaxesMap = new Map<string, MonthlyMaxEntry>();

        // Current Month Processing
        currentMonthWorkouts.forEach(w => {
            w.structured_data.exercises.forEach(ex => {
                const id = getCanonicalId(ex.name);
                const def = EXERCISE_DB.find(d => d.id === id);
                const displayName = getLocalizedName(id, language);
                const isCardio = def?.type === 'cardio';

                freqMap.set(displayName, (freqMap.get(displayName) || 0) + 1);

                ex.sets.forEach(s => {
                    const weight = s.weight || 0;
                    const reps = s.reps || 0;

                    if (!isCardio && weight && reps && (s.unit === 'kg' || s.unit === 'lbs')) {
                        let wVol = weight;
                        if (s.unit === 'lbs') wVol = wVol * 0.453592;
                        monthlyVolume += (wVol * reps);
                    }
                    if (weight > maxLift.weight) {
                        maxLift = { name: displayName, weight: weight };
                    }
                    
                    // Monthly Max Logic...
                    const existing = monthlyMaxesMap.get(displayName);
                    let shouldUpdate = false;
                    let isBW = false;
                    let val = 0;
                    let u = s.unit;

                    if (weight > 0) {
                        val = weight; isBW = false;
                        if (!existing || (!existing.isBodyweight && val > existing.value)) shouldUpdate = true;
                    } else if (reps > 0) {
                        val = reps; isBW = true; u = 'reps';
                        if (!existing || (existing.isBodyweight && val > existing.value)) shouldUpdate = true;
                    }

                    if (shouldUpdate) {
                        monthlyMaxesMap.set(displayName, { exercise: displayName, value: val, unit: u, isBodyweight: isBW });
                    }
                });
            });
        });

        // Previous Month Volume
        prevMonthWorkouts.forEach(w => {
            w.structured_data.exercises.forEach(ex => {
                const id = getCanonicalId(ex.name);
                const def = EXERCISE_DB.find(d => d.id === id);
                if (def?.type === 'cardio') return;
                ex.sets.forEach(s => {
                    if (s.weight && s.reps && (s.unit === 'kg' || s.unit === 'lbs')) {
                        let wVol = s.weight;
                        if (s.unit === 'lbs') wVol = wVol * 0.453592;
                        prevMonthlyVolume += (wVol * s.reps);
                    }
                });
            });
        });

        // Calculate Totals Strict (GLOBAL VOLUME)
        allWorkouts.forEach(w => {
            w.structured_data.exercises.forEach(ex => {
                const id = getCanonicalId(ex.name);
                const def = EXERCISE_DB.find(d => d.id === id);
                if (def?.type === 'cardio') return;
                ex.sets.forEach(s => {
                    if (s.weight && s.reps && (s.unit === 'kg' || s.unit === 'lbs')) {
                        let w = s.weight;
                        if (s.unit === 'lbs') w = w * 0.453592;
                        totalVolume += (w * s.reps);
                    }
                });
            });
        });

        // Helper to extract top exercises for comparison
        const extractTopExercises = (workouts: Workout[]) => {
            const map = new Map<string, number>();
            workouts.forEach(w => {
                w.structured_data.exercises.forEach(ex => {
                    const id = getCanonicalId(ex.name);
                    const maxVal = Math.max(...ex.sets.map(s => s.weight || 0));
                    if (!map.has(id) || maxVal > map.get(id)!) {
                        map.set(id, maxVal);
                    }
                });
            });
            return Array.from(map.entries());
        };

        const currentMonthStats = extractTopExercises(currentMonthWorkouts);
        const prevMonthStats = extractTopExercises(prevMonthWorkouts);

        const langInstructions = language === 'es' 
            ? "EL IDIOMA DE SALIDA DEBE SER 100% ESPAÑOL. IMPORTANTE: USA TILDES (á,é,í,ó,ú) Y Ñ CORRECTAMENTE. NO OMITE ACENTOS." 
            : "OUTPUT LANGUAGE MUST BE ENGLISH.";

        const prompt = `
            ACTÚA COMO UN CIENTÍFICO DEL DEPORTE Y ENTRENADOR DE ÉLITE.
            ${langInstructions}

            **DATOS:**
            - VOLUMEN GLOBAL TOTAL: ${Math.round(totalVolume)} kg
            - VOLUMEN MES ACTUAL: ${Math.round(monthlyVolume)} kg
            - VOLUMEN MES ANTERIOR: ${Math.round(prevMonthlyVolume)} kg
            
            - Mejores Marcas Mes ACTUAL (Ejercicio: Peso): ${JSON.stringify(currentMonthStats.slice(0, 3))}
            - Mejores Marcas Mes ANTERIOR (Ejercicio: Peso): ${JSON.stringify(prevMonthStats.slice(0, 3))}

            **OBJETIVO 1: COMPARACIÓN VISUAL DE PESO (volume_comparison, monthly_volume_comparison)**
            - Convierte el peso en UN SOLO OBJETO (o muy pocos).
            - REGLA DE ORO: Prioriza objetos que pesen lo mismo individualmente.
            - PREFERIBLE: "1 Camión de Bomberos" (Mejor que "10,000 Manzanas").
            - PREFERIBLE: "1 Ballena Azul" (Mejor que "500 Perros").
            - FORMATO ESTRICTO: "[CANTIDAD] [OBJETO]" (Sin palabras de enlace).
            - NO USAR: "Equivale a", "Es como", "Son".

            **OBJETIVO 2: ANÁLISIS TÉCNICO DETALLADO (monthly_analysis)**
            - Actúa como un analista deportivo experto.
            - Compara explícitamente los datos del Mes Actual vs Mes Anterior.
            - Busca patrones de Sobrecarga Progresiva (¿Subió el peso? ¿Subió el volumen?).
            - Si el volumen bajó, menciónalo como posible "descarga" o "falta de consistencia".
            - Si el volumen subió, felicita la adaptación hipertrófica o de fuerza.
            - Sé técnico pero motivador. Menciona ejercicios específicos si hay datos.
            
            **OUTPUT JSON:**
            {
               "volume_comparison": "CANTIDAD OBJETO",
               "volume_type": "rocket", 
               "monthly_volume_comparison": "CANTIDAD OBJETO",
               "monthly_volume_type": "animal",
               "monthly_analysis": "Texto detallado del análisis (80-100 palabras).",
               "highlights": []
            }
        `;

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: { parts: [{ text: prompt }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        volume_comparison: { type: Type.STRING },
                        volume_type: { type: Type.STRING, enum: ['car', 'animal', 'building', 'plane', 'rocket', 'mountain', 'ship', 'default'] },
                        monthly_volume_comparison: { type: Type.STRING },
                        monthly_volume_type: { type: Type.STRING, enum: ['car', 'animal', 'building', 'plane', 'rocket', 'mountain', 'ship', 'default'] },
                        monthly_analysis: { type: Type.STRING },
                        highlights: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    title: { type: Type.STRING },
                                    value: { type: Type.STRING },
                                    description: { type: Type.STRING },
                                    type: { type: Type.STRING, enum: ['strength', 'consistency'] }
                                },
                                required: ["title", "value", "description", "type"]
                            }
                        }
                    },
                    required: ["volume_comparison", "volume_type", "monthly_volume_comparison", "monthly_volume_type", "monthly_analysis", "highlights"]
                }
            }
        });

        const text = response.text || "{}";
        const aiResult = JSON.parse(text);

        const dateLocale = language === 'es' ? es : enUS;
        const rawMonth = format(now, 'MMMM', { locale: dateLocale });
        const displayMonth = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1);

        return {
            totalVolumeKg: totalVolume,
            volumeComparison: aiResult.volume_comparison || "Mucho peso",
            volumeType: aiResult.volume_type || "default",
            monthlyVolumeKg: monthlyVolume,
            monthlyVolumeComparison: aiResult.monthly_volume_comparison || "Bastante peso",
            monthlyVolumeType: aiResult.monthly_volume_type || "default",
            globalVerdict: "",
            monthName: displayMonth,
            monthlyAnalysisText: aiResult.monthly_analysis || "No data yet.",
            highlights: aiResult.highlights || [],
            monthlyMaxes: Array.from(monthlyMaxesMap.values()).sort((a, b) => b.value - a.value)
        };

    } catch (error) {
        handleAIError(error);
        throw error;
    }
};

const getComparisonGroup = (exerciseId: string): string => {
    if (exerciseId.includes('bench_press') || exerciseId.includes('chest_press')) return 'BENCH PRESS';
    if (exerciseId.includes('squat')) return 'SQUAT';
    if (exerciseId.includes('deadlift')) return 'DEADLIFT';
    if (exerciseId.includes('overhead_press') || exerciseId.includes('shoulder_press') || exerciseId.includes('military')) return 'SHOULDER PRESS';
    if (exerciseId.includes('pull_up') || exerciseId.includes('chin_up')) return 'PULL-UPS';
    if (exerciseId.includes('row')) return 'ROWS';
    return exerciseId;
};

export const generateGroupAnalysis = async (
    usersData: { name: string; workouts: Workout[] }[],
    language: 'es' | 'en' = 'es'
): Promise<GroupAnalysisData> => {
    try {
        // ... (Same logic for points, volume, tables) ...
        const pointsTable = usersData.map(u => {
            const uniqueDays = new Set(u.workouts.map(w => w.date)).size;
            return { name: u.name, points: uniqueDays };
        }).sort((a, b) => b.points - a.points);

        const volumeTable = usersData.map(u => {
            let userVol = 0;
            u.workouts.forEach(w => {
                w.structured_data.exercises.forEach(ex => {
                    const normId = getCanonicalId(ex.name);
                    const dbMatch = EXERCISE_DB.find(d => d.id === normId);
                    if (dbMatch?.type !== 'cardio') {
                        ex.sets.forEach(s => {
                            if (s.weight && s.reps && (s.unit === 'kg' || s.unit === 'lbs')) {
                                let w = s.weight;
                                if (s.unit === 'lbs') w = w * 0.453592;
                                userVol += (w * s.reps);
                            }
                        });
                    }
                });
            });
            return { name: u.name, total_volume_kg: Math.round(userVol) };
        }).sort((a, b) => b.total_volume_kg - a.total_volume_kg);

        const userSpecificMaxes: Record<string, Record<string, { value: number; display: string; metric: string }>> = {};
        const userGroupedMaxes: Record<string, Record<string, { value: number; display: string; metric: string }>> = {};
        
        usersData.forEach(u => {
            userSpecificMaxes[u.name] = {};
            userGroupedMaxes[u.name] = {};
            u.workouts.forEach(w => {
                w.structured_data.exercises.forEach(ex => {
                    const normId = getCanonicalId(ex.name);
                    const comparisonGroup = getComparisonGroup(normId);
                    const dbMatch = EXERCISE_DB.find(d => d.id === normId);
                    const type = dbMatch?.type || 'strength';

                    let bestVal = 0;
                    let display = "";
                    let metric = "";

                    if (type === 'cardio') {
                        const maxDist = Math.max(...ex.sets.map(s => s.distance || 0));
                        bestVal = maxDist; display = `${maxDist}km`; metric = 'km';
                    } else {
                        const maxWeight = Math.max(...ex.sets.map(s => s.weight || 0));
                        if (maxWeight > 0) { bestVal = maxWeight; display = `${maxWeight}kg`; metric = 'kg'; } 
                        else {
                            const maxReps = Math.max(...ex.sets.map(s => s.reps || 0));
                            if (maxReps > 0) { bestVal = maxReps; display = `${maxReps} reps`; metric = 'reps'; }
                        }
                    }
                    
                    if (bestVal > 0) {
                        if (!userSpecificMaxes[u.name][normId] || bestVal > userSpecificMaxes[u.name][normId].value) {
                            userSpecificMaxes[u.name][normId] = { value: bestVal, display, metric };
                        }
                        if (!userGroupedMaxes[u.name][comparisonGroup] || bestVal > userGroupedMaxes[u.name][comparisonGroup].value) {
                            userGroupedMaxes[u.name][comparisonGroup] = { value: bestVal, display, metric };
                        }
                    }
                });
            });
        });

        const individualRecords: UserStatsProfile[] = usersData.map(u => {
            const userData = userSpecificMaxes[u.name];
            if (!userData) return { name: u.name, stats: [] };
            const sortedStats = Object.entries(userData)
                .map(([specificId, data]) => ({
                    exercise: getLocalizedName(specificId, language),
                    value: data.value,
                    display: data.display,
                    metric: data.metric
                })).filter(s => s.value > 0).sort((a, b) => b.value - a.value); 
            return { name: u.name, stats: sortedStats };
        });

        if (usersData.length === 0) throw new Error("No users");
        
        let commonGroups = Object.keys(userGroupedMaxes[usersData[0].name]);
        for (let i = 1; i < usersData.length; i++) {
            const currentUserGroups = Object.keys(userGroupedMaxes[usersData[i].name]);
            commonGroups = commonGroups.filter(gId => currentUserGroups.includes(gId));
        }

        const comparisonTable: ComparisonRow[] = commonGroups.map(groupId => {
            let maxValue = -1;
            let winnerName = "";
            let metricLabel = "";

            const results = usersData.map(u => {
                const data = userGroupedMaxes[u.name][groupId];
                if (!data) return { userName: u.name, value: 0, display: '-' };
                if (data.value > maxValue) { maxValue = data.value; winnerName = u.name; metricLabel = data.metric; }
                return { userName: u.name, value: data.value, display: data.display };
            });
            const displayExName = groupId === groupId.toUpperCase() 
                ? groupId.charAt(0) + groupId.slice(1).toLowerCase().replace('_', ' ') 
                : getLocalizedName(groupId, language);
            return { exercise: displayExName, results, winnerName, metric: metricLabel };
        });

        const isTie = pointsTable.length > 1 && pointsTable[0].points === pointsTable[1].points && comparisonTable.length === 0;

        const ai = getAIClient();
        const context = {
            consistency_leaderboard: pointsTable,
            total_volume_leaderboard: volumeTable,
            head_to_head_results: comparisonTable.map(c => `${c.exercise}: Winner ${c.winnerName}`),
            is_draw_condition: isTie
        };

        const prompt = `
            Role: Ruthless fitness judge. Language: ${language === 'es' ? 'Spanish' : 'English'}.
            **DATA:** ${JSON.stringify(context)}
            
            **INSTRUCTIONS:**
            1. Rank based on Consistency and Volume.
            2. Output 'rankings', 'roast', 'volume_verdict'.
            
            **OUTPUT JSON:**
            {
               "rankings": [{ "name": "UserA", "rank": 1, "reason": "Highest Volume" }, ...],
               "roast": "String",
               "volume_verdict": "String"
            }
        `;

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: { parts: [{ text: prompt }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        rankings: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    name: { type: Type.STRING },
                                    rank: { type: Type.NUMBER },
                                    reason: { type: Type.STRING }
                                },
                                required: ["name", "rank", "reason"]
                            }
                        },
                        roast: { type: Type.STRING },
                        volume_verdict: { type: Type.STRING }
                    },
                    required: ["rankings", "roast", "volume_verdict"]
                }
            }
        });

        const text = cleanJson(response.text || "{}");
        const aiResult = JSON.parse(text);
        const sortedRankings = (aiResult.rankings || []).sort((a: any, b: any) => a.rank - b.rank);
        
        if (isTie) {
            return {
                winner: "DRAW", loser: "DRAW", rankings: sortedRankings, roast: "Empate Técnico.", volume_verdict: "Sin datos.",
                comparison_table: comparisonTable, points_table: pointsTable, volume_table: volumeTable, individual_records: individualRecords
            };
        }

        return {
            winner: sortedRankings.length > 0 ? sortedRankings[0].name : "Unknown",
            loser: sortedRankings.length > 0 ? sortedRankings[sortedRankings.length - 1].name : "Unknown",
            rankings: sortedRankings,
            roast: aiResult.roast || "Judge is silent.",
            volume_verdict: aiResult.volume_verdict || "Analysis unavailable.",
            comparison_table: comparisonTable,
            points_table: pointsTable,
            volume_table: volumeTable,
            individual_records: individualRecords
        };

    } catch (error) {
        handleAIError(error);
        throw error;
    }
};
