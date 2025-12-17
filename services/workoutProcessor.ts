
import { GoogleGenAI, Type } from "@google/genai";
import { WorkoutData, Workout, User, GroupAnalysisData, ComparisonRow, UserStatsProfile, Highlight, GlobalReportData, MonthlyMaxEntry } from "../types";
import { format, isSameMonth, addMonths } from "date-fns";
import { es, enUS } from 'date-fns/locale';
import { getCanonicalId, getLocalizedName } from "../utils";
import { EXERCISE_DB } from "../data/exerciseDb";

const MODEL_NAME = 'gemini-2.5-flash'; 

const getAIClient = () => {
  const userKey = typeof window !== 'undefined' ? localStorage.getItem('USER_GEMINI_KEY') : null;
  if (!userKey || userKey.trim().length === 0) {
     throw new Error("MISSING_USER_KEY");
  }
  const apiKey = userKey.replace(/["']/g, '').trim();
  return new GoogleGenAI({ apiKey });
};

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

const handleAIError = (error: any) => {
    console.error("AI Error:", error);
    const msg = (error.message || error.toString()).toLowerCase();
    if (msg.includes("missing_user_key")) throw new Error("🔑 FALTA TU LLAVE MAESTRA\n\nVe a tu Perfil y pega tu API Key.");
    throw new Error(`Error de IA: ${error.message || "Inténtalo de nuevo."}`);
};

export const processWorkoutAudio = async (audioBase64: string, mimeType: string): Promise<WorkoutData> => {
  try {
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [{ inlineData: { mimeType, data: audioBase64 } }, { text: `Fitness transcriber.` }]
      },
      config: { responseMimeType: "application/json", temperature: 0.1 }
    });
    return JSON.parse(cleanJson(response.text));
  } catch (error: any) { handleAIError(error); throw error; }
};

export const processWorkoutText = async (text: string): Promise<WorkoutData> => {
  try {
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: { parts: [{ text: `Parse workout text: "${text}"` }] },
      config: { responseMimeType: "application/json", temperature: 0.1 }
    });
    return JSON.parse(cleanJson(response.text));
  } catch (error: any) { handleAIError(error); throw error; }
};

export const generateGlobalReport = async (
    allWorkouts: Workout[],
    language: 'es' | 'en' = 'es' 
): Promise<GlobalReportData> => {
    try {
        const ai = getAIClient();
        let totalVolume = 0; let monthlyVolume = 0;
        const now = new Date();
        const currentMonthWorkouts = allWorkouts.filter(w => isSameMonth(new Date(w.date), now));
        
        // Mapa exhaustivo de máximos
        const monthlyMaxesMap = new Map<string, MonthlyMaxEntry>();

        currentMonthWorkouts.forEach(w => {
            w.structured_data.exercises.forEach(ex => {
                const id = getCanonicalId(ex.name);
                const def = EXERCISE_DB.find(d => d.id === id);
                const displayName = getLocalizedName(id, language);
                
                ex.sets.forEach(s => {
                    // Cálculo de volumen
                    if (def?.type !== 'cardio' && s.weight && s.reps) {
                        let wVol = s.unit === 'lbs' ? s.weight * 0.453592 : s.weight;
                        monthlyVolume += (wVol * s.reps);
                    }

                    // Lógica exhaustiva de máximos
                    const isBodyweight = !s.weight || s.weight <= 0;
                    const val = isBodyweight ? (s.reps || 0) : (s.weight || 0);
                    const unit = isBodyweight ? 'reps' : (s.unit || 'kg');

                    const existing = monthlyMaxesMap.get(displayName);
                    if (!existing) {
                        monthlyMaxesMap.set(displayName, { 
                            exercise: displayName, 
                            value: val, 
                            unit: unit, 
                            isBodyweight 
                        });
                    } else {
                        // Si el ejercicio tiene peso en alguna sesión del mes, priorizamos el récord de peso
                        if (!isBodyweight && (existing.isBodyweight || val > existing.value)) {
                            existing.value = val;
                            existing.unit = unit;
                            existing.isBodyweight = false;
                        } else if (isBodyweight && existing.isBodyweight && val > existing.value) {
                            // Si solo es corporal, comparamos repeticiones
                            existing.value = val;
                        }
                    }
                });
            });
        });

        allWorkouts.forEach(w => w.structured_data.exercises.forEach(ex => ex.sets.forEach(s => {
            if (s.weight && s.reps) totalVolume += ((s.unit === 'lbs' ? s.weight * 0.453592 : s.weight) * s.reps);
        })));

        const detailedMonthLog = currentMonthWorkouts.map(w => {
             const exercisesText = w.structured_data.exercises.map(e => `- ${e.name}: [${e.sets.map(s => s.distance ? `${s.distance}km` : `${s.weight || 0}kg x ${s.reps || 0}`).join(", ")}]`).join("\n");
             return `FECHA ${w.date}:\n${exercisesText}`;
        }).join("\n\n");

        const prompt = `
            ROL: Entrenador de Élite y Analista de Guerra Deportiva.
            TONO: Directo, crudo, biomecánico pero con lenguaje de calle. No uses relleno.
            
            DATOS:
            - VOLUMEN TOTAL HISTÓRICO: ${Math.round(totalVolume)} kg
            - VOLUMEN ESTE MES: ${Math.round(monthlyVolume)} kg
            - LOGS DEL MES:
            ${detailedMonthLog}

            INSTRUCCIONES DE RESPUESTA:
            1. COMPARATIVA MASIVA: Compara los pesos con objetos. Devuelve SOLO "Cantidad + Elemento". Ej: "3 Tanques Abrams", "12 Elefantes". NO digas frases, NO repitas el peso.
            2. AUDITORÍA FORENSE:
               - Mapeo de volumen (MAV/Mantenimiento).
               - Ratios estructurales (Push/Pull). ALERTA ROJA si hay descompensación.
               - Detecta Sandbagging (series con mismas reps y peso sin caída de rendimiento).
            3. EVOLUCIÓN: Comenta tendencia de sobrecarga progresiva.
            4. VEREDICTO: Nota 1-10 y 3 cambios concretos.

            REGLA DE ORO: Si escribes la nota de puntuación al principio, asegúrate de que esté en una línea independiente para que el render la pille bien.

            RESPONDE SOLO EN JSON:
            {
               "vol_global_comp": "Cantidad + Elemento",
               "vol_month_comp": "Cantidad + Elemento",
               "analysis": "Texto Markdown estructurado",
               "score": 0-10
            }
        `;

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: { parts: [{ text: prompt }] },
            config: { responseMimeType: "application/json" }
        });

        const aiResult = JSON.parse(cleanJson(response.text));
        const dateLocale = language === 'es' ? es : enUS;
        const displayMonth = format(now, 'MMMM', { locale: dateLocale });

        return {
            totalVolumeKg: totalVolume,
            volumeComparison: aiResult.vol_global_comp,
            volumeType: 'ship',
            monthlyVolumeKg: monthlyVolume,
            monthlyVolumeComparison: aiResult.vol_month_comp,
            monthlyVolumeType: 'rocket',
            monthName: displayMonth.charAt(0).toUpperCase() + displayMonth.slice(1),
            monthlyAnalysisText: aiResult.analysis,
            efficiencyScore: aiResult.score || 5,
            monthlyMaxes: Array.from(monthlyMaxesMap.values()).sort((a, b) => b.value - a.value)
        };
    } catch (error) { handleAIError(error); throw error; }
};

export const generateGroupAnalysis = async (
    usersData: { name: string; workouts: Workout[] }[],
    language: 'es' | 'en' = 'es'
): Promise<GroupAnalysisData> => {
    try {
        const pointsTable = usersData.map(u => ({ name: u.name, points: new Set(u.workouts.map(w => w.date)).size })).sort((a, b) => b.points - a.points);
        const volumeTable = usersData.map(u => {
            let v = 0;
            u.workouts.forEach(w => w.structured_data.exercises.forEach(ex => {
                const dbMatch = EXERCISE_DB.find(d => d.id === getCanonicalId(ex.name));
                if (dbMatch?.type !== 'cardio') ex.sets.forEach(s => {
                    if (s.weight && s.reps) v += ((s.unit === 'lbs' ? s.weight * 0.453592 : s.weight) * s.reps);
                });
            }));
            return { name: u.name, total_volume_kg: Math.round(v) };
        }).sort((a, b) => b.total_volume_kg - a.total_volume_kg);

        const ai = getAIClient();
        const prompt = `Role: Fitness Judge. Data: ${JSON.stringify({ pointsTable, volumeTable })}. Output JSON: { rankings, roast, volume_verdict }.`;
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: { parts: [{ text: prompt }] },
            config: { responseMimeType: "application/json" }
        });
        const aiResult = JSON.parse(cleanJson(response.text));
        return {
            winner: aiResult.rankings[0]?.name || "N/A",
            loser: aiResult.rankings[aiResult.rankings.length - 1]?.name || "N/A",
            rankings: aiResult.rankings,
            roast: aiResult.roast,
            volume_verdict: aiResult.volume_verdict,
            comparison_table: [], points_table: pointsTable, volume_table: volumeTable, individual_records: []
        };
    } catch (error) { handleAIError(error); throw error; }
};
