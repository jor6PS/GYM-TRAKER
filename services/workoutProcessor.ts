import { GoogleGenAI, Type } from "@google/genai";
import { WorkoutData, Workout, User, GroupAnalysisData } from "../types";
import { format } from "date-fns";

// Helper to safely get the AI instance only when needed
const getAIClient = () => {
  const apiKey = process.env.API_KEY || (import.meta as any).env?.VITE_API_KEY || (import.meta as any).env?.API_KEY;
  
  if (!apiKey) {
     console.error("DEBUG: API Keys checked were empty. Ensure 'API_KEY' is set in Vercel Environment Variables.");
     throw new Error("API Key configuration missing. If you just set it in Vercel, please REDEPLOY the project for changes to take effect.");
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
        throw new Error("I heard you, but didn't catch any specific exercises. Please try again.");
    }

    return data as WorkoutData;
};

export const processWorkoutAudio = async (audioBase64: string, mimeType: string): Promise<WorkoutData> => {
  try {
    const ai = getAIClient();
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
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
              You are an expert fitness tracker. Listen to this workout audio log.
              Extract the exercises, sets, reps, weights, and RPE (if mentioned).
              If the user says "RPE 8" or "Intensity 8", record it.
              Normalize exercise names to standard gym terminology.
              Return ONLY valid JSON matching the schema.
            `
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: WORKOUT_SCHEMA,
        systemInstruction: "You are a precise data extractor for gym workouts."
      }
    });

    if (!response.text) {
      throw new Error("No data returned from AI");
    }

    const cleanedText = cleanJson(response.text);
    const data = JSON.parse(cleanedText);
    
    return validateData(data);

  } catch (error: any) {
    console.error("Error processing workout audio:", error);
    if (error instanceof SyntaxError) {
        throw new Error("AI returned invalid JSON. Please try again.");
    }
    throw error;
  }
};

export const processWorkoutText = async (text: string): Promise<WorkoutData> => {
  try {
    const ai = getAIClient();

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            text: `
              You are an expert fitness tracker. Parse the following workout text.
              Extract the exercises, sets, reps, weights, and RPE (Rate of Perceived Exertion).
              CRITICAL: Normalize exercise names to standard gym terminology.
              Example input: "Bench press 100kg for 5 reps RPE 9" -> extract RPE 9.
              
              Text to parse:
              "${text}"
              
              Return ONLY valid JSON adhering to the schema.
            `
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: WORKOUT_SCHEMA,
      }
    });

    if (!response.text) {
      throw new Error("No data returned from AI");
    }

    const cleanedText = cleanJson(response.text);
    const data = JSON.parse(cleanedText);
    return validateData(data);

  } catch (error: any) {
    console.error("Error processing workout text:", error);
    if (error instanceof SyntaxError) {
        throw new Error("AI returned invalid JSON. Please try again.");
    }
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
    language: 'es' | 'en' = 'es' // Add language parameter
): Promise<MonthlyReportData> => {
    try {
        const ai = getAIClient();

        // 1. Calculate Statistics Locally (Deterministic & Accurate)
        const statsMap = new Map<string, ExerciseStat>();

        currentMonthWorkouts.forEach(w => {
            w.structured_data.exercises.forEach(ex => {
                const normName = ex.name.trim();
                const existing = statsMap.get(normName) || { name: normName, topWeight: 0, topReps: 0, totalSets: 0 };
                
                existing.totalSets += ex.sets.length;
                
                ex.sets.forEach(s => {
                    if (s.weight > existing.topWeight) {
                        existing.topWeight = s.weight;
                        existing.topReps = s.reps;
                    } else if (s.weight === existing.topWeight && s.reps > existing.topReps) {
                        existing.topReps = s.reps;
                    }
                });
                
                statsMap.set(normName, existing);
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
            Actúa como el "Gym Bro" definitivo. Tu personalidad es sarcástica, dura, pero motivadora (estilo David Goggins mezclado con un colega de barrio).
            
            **IDIOMA DE RESPUESTA:** ${language === 'es' ? 'ESPAÑOL (Castellano)' : 'ENGLISH'}
            
            **CONTEXTO:**
            Analiza el mes de: ${monthName}.
            
            **DATOS:**
            Resumen Mes Actual: ${JSON.stringify(currentContext)}
            Resumen Mes Pasado: ${JSON.stringify(prevContext)}
            
            **INSTRUCCIONES:**
            Devuelve un JSON con dos campos:
            1. "analysis": Un texto en Markdown analizando el progreso en ${language === 'es' ? 'Español' : 'Inglés'}. Compara el volumen y la constancia con el mes anterior. Sé muy expresivo. Usa negritas (**texto**) para enfatizar insultos cariñosos o logros. 
            2. "verdict": Una frase final lapidaria en ${language === 'es' ? 'Español' : 'Inglés'}. Corta, agresiva y memorable.
            
            **TONO:**
            - Si entrenó poco: Insulta su pereza. "¿Te pesaba el mando de la tele?".
            - Si entrenó bien: "Eres una bestia parda".
            - NO repitas las estadísticas numéricas exactas de cada ejercicio (ya las muestro en una tabla), céntrate en la tendencia general y el esfuerzo.
            
            Response MIME Type: application/json
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
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
        console.error("Error generating report:", error);
        throw new Error("Error connecting to the gym bro AI.");
    }
};

export const generateGroupAnalysis = async (
    usersData: { name: string; workouts: Workout[] }[],
    language: 'es' | 'en' = 'es'
): Promise<GroupAnalysisData> => {
    try {
        const ai = getAIClient();

        // Simplify data for AI to save tokens and focus on highlights
        const context = usersData.map(u => {
            const exercises = u.workouts.flatMap(w => w.structured_data.exercises);
            const summary = exercises.reduce((acc: any, ex) => {
                const maxWeight = Math.max(...ex.sets.map(s => s.weight));
                if (!acc[ex.name] || maxWeight > acc[ex.name]) {
                    acc[ex.name] = maxWeight;
                }
                return acc;
            }, {});
            
            return {
                user: u.name,
                total_sessions: u.workouts.length,
                best_lifts: summary
            };
        });

        const prompt = `
            Actúa como un juez despiadado de una competición de culturismo underground.
            
            **IDIOMA:** ${language === 'es' ? 'ESPAÑOL' : 'ENGLISH'}
            
            **TAREA:**
            Analiza los datos de estos usuarios y compáralos brutalmente.
            
            **DATOS:**
            ${JSON.stringify(context)}
            
            **INSTRUCCIONES:**
            Genera un JSON con:
            1. "winner": Nombre del ganador (el Alpha).
            2. "loser": Nombre del perdedor (el que necesita leche).
            3. "roast": Un texto corto (Markdown) humillando al perdedor y alabando al ganador. Sé sarcástico. Compara sus estadísticas.
            4. "comparison_table": Un array de objetos { "exercise": "Nombre", "details": ["UserA: 100kg", "UserB: 80kg"] } para los 3 ejercicios más relevantes donde compiten.
            
            **TONO:**
            Muy agresivo, divertido, jerga de gimnasio.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        winner: { type: Type.STRING },
                        loser: { type: Type.STRING },
                        roast: { type: Type.STRING },
                        comparison_table: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    exercise: { type: Type.STRING },
                                    details: { type: Type.ARRAY, items: { type: Type.STRING } }
                                }
                            }
                        }
                    }
                }
            }
        });

        const text = response.text || "{}";
        return JSON.parse(text) as GroupAnalysisData;

    } catch (error) {
        console.error("Group analysis error", error);
        throw new Error("The AI Judge is currently lifting. Try again later.");
    }
};