import { GoogleGenAI, Type } from "@google/genai";
import { WorkoutData, Workout, User, GroupAnalysisData, ComparisonRow } from "../types";
import { format } from "date-fns";
import { getCanonicalId, getLocalizedName } from "../utils";

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
                unit: { type: Type.STRING, enum: ["kg", "lbs"], description: "Weight unit" },
                rpe: { type: Type.NUMBER, description: "Rate of Perceived Exertion (1-10), if mentioned." }
              },
              required: ["reps", "weight", "unit"]
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
              You are an expert fitness transcriber. You understand gym slang, heavy breathing, and rapid speech.
              
              YOUR GOAL: Extract workout data accurately. Do not fail easily. If you hear an exercise, record it.
              
              EXAMPLES:
              Input: "Bench press 3 sets of 10 with 80 kilos"
              Output: {"exercises": [{"name": "Bench Press", "sets": [{"reps": 10, "weight": 80, "unit": "kg"}, {"reps": 10, "weight": 80, "unit": "kg"}, {"reps": 10, "weight": 80, "unit": "kg"}]}]}
              
              Input: "Hice sentadillas, 100 kilos, 5 repeticiones, luego 4 repeticiones, luego 3"
              Output: {"exercises": [{"name": "Squat", "sets": [{"reps": 5, "weight": 100, "unit": "kg"}, {"reps": 4, "weight": 100, "unit": "kg"}, {"reps": 3, "weight": 100, "unit": "kg"}]}]}
              
              RULES:
              1. If weight is not mentioned, check context. If unknown, use 0.
              2. Assume "kilos" or "kg" if unit is missing.
              3. Normalize names (e.g., "pecho" -> "Chest Press" or "Bench Press" depending on context, "banca" -> "Bench Press").
              4. IGNORE filler words like "um", "uh", "creo que", "bueno".
              5. Extract RPE if mentioned (e.g., "costó mucho" -> RPE 9, "fácil" -> RPE 6).
              
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
              Parse this workout log into JSON.
              
              Input: "${text}"
              
              Rules:
              - Normalize exercise names to English standard (e.g. "Sentadilla" -> "Squat").
              - Expand multiple sets if implied (e.g. "3x10").
              - Default unit: kg.
              - Return empty array ONLY if absolutely no workout data matches.
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

export interface ExerciseStat {
    name: string;
    topWeight: number;
    topReps: number; // Reps performed at top weight
    totalSets: number;
}

export interface MonthlyReportData {
    stats: ExerciseStat[];
    analysis: string;
    verdict: string;
}

export const generateMonthlyReport = async (
    currentMonthWorkouts: Workout[], 
    prevMonthWorkouts: Workout[],
    monthName: string,
    language: 'es' | 'en' = 'es' 
): Promise<MonthlyReportData> => {
    try {
        const ai = getAIClient();

        // 1. Calculate Statistics Locally (Deterministic & Accurate)
        const statsMap = new Map<string, ExerciseStat>();

        currentMonthWorkouts.forEach(w => {
            w.structured_data.exercises.forEach(ex => {
                const canonicalId = getCanonicalId(ex.name);
                const displayName = getLocalizedName(canonicalId, language);
                
                const existing = statsMap.get(canonicalId) || { name: displayName, topWeight: 0, topReps: 0, totalSets: 0 };
                
                existing.totalSets += ex.sets.length;
                
                ex.sets.forEach(s => {
                    if (s.weight > existing.topWeight) {
                        existing.topWeight = s.weight;
                        existing.topReps = s.reps;
                    } else if (s.weight === existing.topWeight && s.reps > existing.topReps) {
                        existing.topReps = s.reps;
                    }
                });
                
                statsMap.set(canonicalId, existing);
            });
        });

        const statsArray = Array.from(statsMap.values()).sort((a, b) => a.name.localeCompare(b.name));

        // 2. Prepare Data for AI Context
        const simplify = (w: Workout) => ({
            d: w.date.substring(5), // MM-DD
            e: w.structured_data.exercises.map(e => `${e.name}: ${e.sets.length}sets @ max ${Math.max(...e.sets.map(s=>s.weight))}kg`)
        });

        const currentContext = currentMonthWorkouts.map(simplify);
        const prevContext = prevMonthWorkouts.map(simplify);

        const prompt = `
            Actúa como el "Gym Bro" definitivo. Tu personalidad es sarcástica, dura, pero motivadora.
            
            **IDIOMA DE RESPUESTA:** ${language === 'es' ? 'ESPAÑOL (Castellano)' : 'ENGLISH'}
            
            **CONTEXTO:**
            Analiza el mes de: ${monthName}.
            
            **DATOS:**
            Resumen Mes Actual: ${JSON.stringify(currentContext)}
            Resumen Mes Pasado: ${JSON.stringify(prevContext)}
            
            **INSTRUCCIONES:**
            Devuelve un JSON con dos campos:
            1. "analysis": Un texto en Markdown analizando el progreso en ${language === 'es' ? 'Español' : 'Inglés'}.
            2. "verdict": Una frase final lapidaria en ${language === 'es' ? 'Español' : 'Inglés'}.
            
            Response MIME Type: application/json
        `;

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: { parts: [{ text: prompt }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        analysis: { type: Type.STRING },
                        verdict: { type: Type.STRING }
                    },
                    required: ["analysis", "verdict"]
                }
            }
        });

        const text = response.text || "{}";
        const aiResult = JSON.parse(text);

        return {
            stats: statsArray,
            analysis: aiResult.analysis || "No análisis disponible.",
            verdict: aiResult.verdict || "A entrenar."
        };

    } catch (error) {
        handleAIError(error);
        throw new Error("Error connecting to the gym bro AI.");
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

        const userMaxes: Record<string, Record<string, number>> = {};
        
        usersData.forEach(u => {
            userMaxes[u.name] = {};
            u.workouts.forEach(w => {
                w.structured_data.exercises.forEach(ex => {
                    const normId = getCanonicalId(ex.name); 
                    const maxSet = Math.max(...ex.sets.map(s => s.weight));
                    
                    if (!userMaxes[u.name][normId] || maxSet > userMaxes[u.name][normId]) {
                        userMaxes[u.name][normId] = maxSet;
                    }
                });
            });
        });

        if (usersData.length === 0) throw new Error("No users");
        
        let commonExerciseIds = Object.keys(userMaxes[usersData[0].name]);
        for (let i = 1; i < usersData.length; i++) {
            const currentUserExercises = Object.keys(userMaxes[usersData[i].name]);
            commonExerciseIds = commonExerciseIds.filter(exId => currentUserExercises.includes(exId));
        }

        const comparisonTable: ComparisonRow[] = commonExerciseIds.map(exId => {
            let maxWeight = -1;
            let winnerName = "";
            const results = usersData.map(u => {
                const weight = userMaxes[u.name][exId];
                if (weight > maxWeight) {
                    maxWeight = weight;
                    winnerName = u.name;
                }
                return { userName: u.name, weight };
            });
            const displayExName = getLocalizedName(exId, language);
            return { exercise: displayExName, results, winnerName };
        });

        const ai = getAIClient();

        const context = {
            points_standings: pointsTable,
            head_to_head_results: comparisonTable.map(c => `${c.exercise}: Winner ${c.winnerName} (${Math.max(...c.results.map(r=>r.weight))}kg)`),
            raw_data_summary: usersData.map(u => ({
                name: u.name,
                total_sessions: u.workouts.length,
                top_lifts: Object.entries(userMaxes[u.name]).reduce((acc: any, [id, w]) => {
                    acc[getLocalizedName(id, 'en')] = w; 
                    return acc;
                }, {})
            }))
        };

        const prompt = `
            Role: Ruthless bodybuilding judge. Language: ${language === 'es' ? 'Spanish' : 'English'}.
            **DATA:** ${JSON.stringify(context)}
            
            **INSTRUCTIONS:**
            1. Rank ALL participants. 1st is "Alpha" (Winner), Last is "Beta" (Loser).
            2. Short ranking reason (max 5 words).
            3. Roast summarizing the group.
            
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

        return {
            winner: sortedRankings.length > 0 ? sortedRankings[0].name : "Unknown",
            loser: sortedRankings.length > 0 ? sortedRankings[sortedRankings.length - 1].name : "Unknown",
            rankings: sortedRankings,
            roast: aiResult.roast || "Judge is silent.",
            comparison_table: comparisonTable,
            points_table: pointsTable
        };

    } catch (error) {
        handleAIError(error);
        throw new Error("The AI Judge is currently lifting.");
    }
};