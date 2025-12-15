
import { GoogleGenAI, Type } from "@google/genai";
import { WorkoutData, Workout, User, GroupAnalysisData, ComparisonRow, UserStatsProfile, Highlight, GlobalReportData, MonthlyMaxEntry } from "../types";
import { format, isSameMonth, subMonths } from "date-fns";
import { es, enUS } from 'date-fns/locale';
import { getCanonicalId, getLocalizedName } from "../utils";
import { EXERCISE_DB } from "../data/exerciseDb";

// --- CONFIGURATION ---
const MODEL_NAME = 'gemini-2.5-flash'; 

// Helper to safely get the AI instance only when needed
const getAIClient = () => {
  // 1. Get the raw key from the environment
  const rawKey = process.env.API_KEY;
  
  // 2. SANITIZATION: Remove any accidental quotes (" or ') and whitespace.
  // This fixes common .env parsing issues in Vite where the key gets double-quoted.
  const apiKey = rawKey ? rawKey.replace(/["']/g, '').trim() : '';
  
  if (!apiKey || apiKey === 'undefined' || apiKey === 'null') {
     console.error("🚨 CRITICAL ERROR: Google Gemini API Key is missing or invalid.");
     // Log masked key for debugging
     console.log(`Current Key Length: ${rawKey ? rawKey.length : 0}`);
     throw new Error("Falta la API Key de Gemini. Revisa tu archivo .env.");
  }
  return new GoogleGenAI({ apiKey });
};

const WORKOUT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    exercises: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Name of the exercise (e.g., Bench Press). Normalize to standard gym terminology." },
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
    notes: { type: Type.STRING, description: "Any general notes about the workout energy or feelings." }
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
        throw new Error("No he detectado ejercicios en el audio. Intenta hablar más claro o acercarte al micro.");
    }

    return data as WorkoutData;
};

// Helper for error handling
const handleAIError = (error: any) => {
    console.error("AI Error Details (Full):", error);
    
    const msg = (error.message || error.toString()).toLowerCase();
    
    // SDK Specific Generic Error
    if (msg.includes("failed to call the gemini api") || msg.includes("fetch failed")) {
        throw new Error("⚠️ Error de Conexión con Gemini. \n1. Verifica tu internet. \n2. Si usas VPN o AdBlock, desactívalos. \n3. Verifica que la API Key sea correcta.");
    }

    if (msg.includes('404') && msg.includes('not found')) {
        throw new Error(`Error: El modelo '${MODEL_NAME}' no está disponible o la API Key es incorrecta.`);
    }
    if (msg.includes('429') || msg.includes('quota') || msg.includes('too many requests')) {
        throw new Error("⚠️ Has superado el límite de uso de la IA. Espera un minuto.");
    }
    if (msg.includes('400') || msg.includes('api key') || msg.includes('invalid')) {
        throw new Error("⚠️ API Key inválida o malformada.");
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
              You are an expert fitness transcriber for a GYM TRACKER app.
              
              YOUR GOAL: Extract workout data accurately. Focus on STRENGTH.
              Ignore irrelevant sports chatter (football scores, tennis matches).
              
              EXAMPLES:
              Input: "Bench press 3 sets of 10 with 80 kilos"
              Output: {"exercises": [{"name": "Bench Press", "sets": [{"reps": 10, "weight": 80, "unit": "kg"}]}]}
              
              Rules:
              1. Strength: Extract weight and reps.
              2. Normalize names (e.g., "pecho" -> "Chest Press").
              3. If weight unit isn't specified, assume kg.
              
              Return strictly JSON.
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
    throw error; // TS satisfaction (handleAIError throws)
  }
};

export const processWorkoutText = async (text: string): Promise<WorkoutData> => {
  try {
    const ai = getAIClient();

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          {
            text: `
              Parse this gym workout log into JSON.
              Input: "${text}"
              
              Rules:
              - Normalize exercise names to English standard.
              - Strength: Weight/Reps.
              - IGNORE non-gym sports.
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

// Helper to parse time string "90" or "1:30" to minutes number
const parseTimeToMinutes = (timeStr: string | undefined): number => {
    if (!timeStr) return 0;
    if (timeStr.includes(':')) {
        const parts = timeStr.split(':').map(Number);
        if (parts.length === 2) return parts[0]; 
        if (parts.length === 3) return parts[0] * 60 + parts[1];
    }
    return parseFloat(timeStr) || 0;
};

// REPLACED OLD MONTHLY REPORT WITH NEW GLOBAL FUN REPORT + MONTHLY ANALYSIS
export const generateGlobalReport = async (
    allWorkouts: Workout[],
    language: 'es' | 'en' = 'es' 
): Promise<GlobalReportData> => {
    try {
        const ai = getAIClient();

        // 1. Calculate Grand Totals Locally (STRICT)
        let totalVolume = 0;

        // 2. Prepare Data for Monthly Comparison & Highlights
        const now = new Date();
        const currentMonthWorkouts = allWorkouts.filter(w => isSameMonth(new Date(w.date), now));
        const prevMonthWorkouts = allWorkouts.filter(w => isSameMonth(new Date(w.date), subMonths(now, 1)));

        // --- CALCULATE MONTHLY STATS LOCALLY ---
        // We do this to ensure accuracy before AI "Creative Writing"
        let maxLift = { name: '', weight: 0 };
        const freqMap = new Map<string, number>();
        const monthlyMaxesMap = new Map<string, { weight: number, unit: string }>();

        currentMonthWorkouts.forEach(w => {
            w.structured_data.exercises.forEach(ex => {
                const id = getCanonicalId(ex.name);
                const def = EXERCISE_DB.find(d => d.id === id);
                const displayName = getLocalizedName(id, language);

                // Frequency
                freqMap.set(displayName, (freqMap.get(displayName) || 0) + 1);

                ex.sets.forEach(s => {
                    // Only process sets with weight
                    if (s.weight && s.weight > 0) {
                        // Max Lift Global
                        if (s.weight > maxLift.weight) {
                            maxLift = { name: displayName, weight: s.weight };
                        }
                        
                        // Per Exercise Max
                        const existingMax = monthlyMaxesMap.get(displayName);
                        if (!existingMax || s.weight > existingMax.weight) {
                            monthlyMaxesMap.set(displayName, { weight: s.weight, unit: s.unit });
                        }
                    }
                });
            });
        });

        // Convert Map to Array for UI
        const monthlyMaxesList = Array.from(monthlyMaxesMap.entries())
            .map(([exercise, data]) => ({ exercise, weight: data.weight, unit: data.unit }))
            .sort((a, b) => b.weight - a.weight); // Sort heaviest first

        // Find Most Frequent
        let favorite = { name: '', count: 0 };
        freqMap.forEach((count, name) => {
            if (count > favorite.count) favorite = { name, count };
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

        // Calculate Totals Strict (VOLUME ONLY)
        allWorkouts.forEach(w => {
            w.structured_data.exercises.forEach(ex => {
                const id = getCanonicalId(ex.name);
                const def = EXERCISE_DB.find(d => d.id === id);
                // Strict check: defaults to strength if not defined, but skip if explicit cardio
                if (def?.type === 'cardio') return;

                ex.sets.forEach(s => {
                    // Volume Strict
                    if (s.weight && s.reps && (s.unit === 'kg' || s.unit === 'lbs')) {
                        let w = s.weight;
                        if (s.unit === 'lbs') w = w * 0.453592;
                        totalVolume += (w * s.reps);
                    }
                });
            });
        });

        const langInstructions = language === 'es' 
            ? "EL IDIOMA DE SALIDA DEBE SER 100% ESPAÑOL. NO USES INGLÉS EN LOS TÍTULOS NI DESCRIPCIONES." 
            : "OUTPUT LANGUAGE MUST BE ENGLISH.";

        // 3. Ask AI for Analysis with PRE-CALCULATED Highlights
        const prompt = `
            Actúa como un "Gym Bro" analista de datos. Tono: Colegueo, motivador, sarcástico pero útil.
            ${langInstructions}

            **OBJETIVO**: Analizar SOLO el rendimiento de fuerza/gym. IGNORA cardio, distancia, running, ciclismo, etc.

            **PARTE 1: DATOS GLOBALES (HISTÓRICO)**
            - Volumen Total Levantado (Hierro): ${Math.round(totalVolume)} kg
            
            **PARTE 2: ESTE MES vs MES ANTERIOR**
            - Ejercicios Top Este Mes (Max Kg): ${JSON.stringify(currentMonthStats.slice(0, 5))}
            - Ejercicios Top Mes Pasado (Max Kg): ${JSON.stringify(prevMonthStats.slice(0, 5))}
            
            **PARTE 3: HIGHLIGHTS DEL MES (Datos Reales)**
            - Levantamiento Más Pesado: ${maxLift.name ? `${maxLift.name} (${maxLift.weight}kg)` : 'N/A'}
            - Ejercicio Favorito (Más frecuente): ${favorite.name ? `${favorite.name} (${favorite.count} sessions)` : 'N/A'}
            
            **TAREA:**
            1. Genera "volume_comparison": Una frase corta comparando el volumen total (kg) con un objeto real (ej. "3 Ballenas", "1 Cohete", "200 Perros").
            2. Clasifica el objeto de la comparación en "volume_type": ['car', 'animal', 'building', 'plane', 'rocket', 'mountain', 'ship', 'default'].
            3. Genera "global_verdict": Una frase épica sobre el volumen total.
            4. Genera "monthly_analysis": Un párrafo corto analizando si ha mejorado la FUERZA.
            5. Genera 3 "highlights" (Tarjetas) basados en los datos de fuerza.
            
            **IMPORTANTE: Si el idioma es español, traduce TODO el texto generado.**

            **FORMATO JSON:**
            {
               "volume_comparison": "Texto corto (ej. 5 Coches)",
               "volume_type": "car",
               "global_verdict": "Frase sentencia final.",
               "monthly_analysis": "Texto análisis mensual.",
               "highlights": [...]
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
                        volume_type: { 
                            type: Type.STRING, 
                            enum: ['car', 'animal', 'building', 'plane', 'rocket', 'mountain', 'ship', 'default'],
                            description: "Category of the object used in comparison to select an icon."
                        },
                        global_verdict: { type: Type.STRING },
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
                    required: ["volume_comparison", "volume_type", "global_verdict", "monthly_analysis", "highlights"]
                }
            }
        });

        const text = response.text || "{}";
        const aiResult = JSON.parse(text);

        // Date formatting based on language
        const dateLocale = language === 'es' ? es : enUS;
        const rawMonth = format(now, 'MMMM', { locale: dateLocale });
        // Capitalize first letter
        const displayMonth = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1);

        return {
            totalVolumeKg: totalVolume,
            volumeComparison: aiResult.volume_comparison || "Mucho peso",
            volumeType: aiResult.volume_type || "default",
            globalVerdict: aiResult.global_verdict || "Sigue así bestia.",
            monthName: displayMonth,
            monthlyAnalysisText: aiResult.monthly_analysis || "No data yet.",
            highlights: aiResult.highlights || [],
            monthlyMaxes: monthlyMaxesList // Add the locally calculated list
        };

    } catch (error) {
        handleAIError(error);
        throw new Error("Error generating fun report.");
    }
};

export const generateGroupAnalysis = async (
    usersData: { name: string; workouts: Workout[] }[],
    language: 'es' | 'en' = 'es'
): Promise<GroupAnalysisData> => {
    try {
        const pointsTable = usersData.map(u => {
            const uniqueDays = new Set(u.workouts.map(w => w.date)).size;
            return { name: u.name, points: uniqueDays };
        }).sort((a, b) => b.points - a.points);

        // Store best value per exercise per user
        // Value depends on type: Weight (Strength) or Distance (Cardio)
        const userMaxes: Record<string, Record<string, { value: number; display: string; metric: string }>> = {};
        
        usersData.forEach(u => {
            userMaxes[u.name] = {};
            u.workouts.forEach(w => {
                w.structured_data.exercises.forEach(ex => {
                    const normId = getCanonicalId(ex.name); 
                    
                    // Determine Type
                    const dbMatch = EXERCISE_DB.find(d => d.id === normId);
                    const type = dbMatch?.type || 'strength';

                    let bestVal = 0;
                    let display = "";
                    let metric = "";

                    // LOGIC: METRIC SELECTION
                    if (type === 'cardio') {
                        // Max Distance
                        const maxDist = Math.max(...ex.sets.map(s => s.distance || 0));
                        bestVal = maxDist;
                        display = `${maxDist}km`;
                        metric = 'km';
                    } else {
                        // Max Weight
                        const maxWeight = Math.max(...ex.sets.map(s => s.weight || 0));
                        bestVal = maxWeight;
                        display = `${maxWeight}kg`;
                        metric = 'kg';
                    }
                    
                    if (!userMaxes[u.name][normId] || bestVal > userMaxes[u.name][normId].value) {
                        userMaxes[u.name][normId] = { value: bestVal, display, metric };
                    }
                });
            });
        });

        // --- NEW: Generate Individual Top 10 Lists ---
        const individualRecords: UserStatsProfile[] = usersData.map(u => {
            const userData = userMaxes[u.name];
            if (!userData) return { name: u.name, stats: [] };

            const sortedStats = Object.entries(userData)
                .map(([exId, data]) => ({
                    exercise: getLocalizedName(exId, language),
                    value: data.value,
                    display: data.display,
                    metric: data.metric
                }))
                // Sort Descending by Value (Rough heuristic: High numbers (weight/dist) > Low numbers)
                // This is imperfect but ensures "Records" are at top.
                .sort((a, b) => b.value - a.value)
                .slice(0, 10);

            return { name: u.name, stats: sortedStats };
        });

        if (usersData.length === 0) throw new Error("No users");
        
        let commonExerciseIds = Object.keys(userMaxes[usersData[0].name]);
        for (let i = 1; i < usersData.length; i++) {
            const currentUserExercises = Object.keys(userMaxes[usersData[i].name]);
            commonExerciseIds = commonExerciseIds.filter(exId => currentUserExercises.includes(exId));
        }

        const comparisonTable: ComparisonRow[] = commonExerciseIds.map(exId => {
            let maxValue = -1;
            let winnerName = "";
            let metricLabel = "";

            const results = usersData.map(u => {
                const data = userMaxes[u.name][exId];
                if (data.value > maxValue) {
                    maxValue = data.value;
                    winnerName = u.name;
                    metricLabel = data.metric;
                }
                return { userName: u.name, value: data.value, display: data.display };
            });
            const displayExName = getLocalizedName(exId, language);
            return { exercise: displayExName, results, winnerName, metric: metricLabel };
        });

        // DETECT DRAW CONDITION (TIE)
        // If top 2 users have same points AND no common exercises to break tie
        const isTie = pointsTable.length > 1 && 
                      pointsTable[0].points === pointsTable[1].points &&
                      comparisonTable.length === 0;

        const ai = getAIClient();

        const context = {
            points_standings: pointsTable,
            head_to_head_results: comparisonTable.map(c => `${c.exercise}: Winner ${c.winnerName} (${c.results.find(r => r.userName === c.winnerName)?.display})`),
            raw_data_summary: usersData.map(u => ({
                name: u.name,
                total_sessions: u.workouts.length,
                top_feats: Object.entries(userMaxes[u.name]).slice(0, 5).reduce((acc: any, [id, data]) => {
                    acc[getLocalizedName(id, 'en')] = data.display; 
                    return acc;
                }, {})
            })),
            is_draw_condition: isTie // Pass this to AI
        };

        const prompt = `
            Role: Ruthless fitness judge (Gym Bro style). Language: ${language === 'es' ? 'Spanish' : 'English'}.
            **DATA:** ${JSON.stringify(context)}
            
            **INSTRUCTIONS:**
            1. Rank participants based on Consistency (Points) and Strength/Cardio Feats.
            2. Ignore any non-gym related activities.
            3. If 'is_draw_condition' is true, return 'DRAW'.
            4. 1st is "Alpha" (Winner), Last is "Beta".
            5. Short ranking reason (max 5 words).
            6. Roast summarizing the group.
            7. **IMPORTANT: ALL output text (reasons, roast) MUST be in ${language === 'es' ? 'SPANISH' : 'ENGLISH'}.**
            
            **OUTPUT JSON:**
            {
               "rankings": [{ "name": "UserA", "rank": 1, "reason": "Reason" }, ...],
               "roast": "String"
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
                    },
                    required: ["rankings", "roast"]
                }
            }
        });

        const text = cleanJson(response.text || "{}");
        const aiResult = JSON.parse(text);
        const sortedRankings = (aiResult.rankings || []).sort((a: any, b: any) => a.rank - b.rank);
        
        // Force Draw logic if AI was ambiguous or to be safe
        if (isTie) {
            return {
                winner: "DRAW",
                loser: "DRAW",
                rankings: sortedRankings,
                roast: "Empate Técnico. A entrenar más.",
                comparison_table: comparisonTable,
                points_table: pointsTable,
                individual_records: individualRecords
            };
        }

        return {
            winner: sortedRankings.length > 0 ? sortedRankings[0].name : "Unknown",
            loser: sortedRankings.length > 0 ? sortedRankings[sortedRankings.length - 1].name : "Unknown",
            rankings: sortedRankings,
            roast: aiResult.roast || "Judge is silent.",
            comparison_table: comparisonTable,
            points_table: pointsTable,
            individual_records: individualRecords
        };

    } catch (error) {
        handleAIError(error);
        throw new Error("The AI Judge is currently lifting.");
    }
};
