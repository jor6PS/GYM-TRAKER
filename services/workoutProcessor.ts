
import { GoogleGenAI, Type } from "@google/genai";
import { WorkoutData, Workout, User, GlobalReportData, MaxComparisonEntry, GroupAnalysisData } from "../types";
import { format, isSameMonth, subMonths, isAfter } from "date-fns";
import { es, enUS } from 'date-fns/locale';
import { getCanonicalId, getLocalizedName } from "../utils";
import { EXERCISE_DB } from "../data/exerciseDb";

const MODEL_NAME = 'gemini-2.5-flash'; 

const getAIClient = () => {
  const userKey = localStorage.getItem('USER_GEMINI_API_KEY');
  if (!userKey || userKey.trim() === "" || userKey === "undefined") {
    throw new Error("NEXO DESCONECTADO: Para activar la inteligencia (Voz, Arena o Crónicas), debes configurar tu Gemini API Key personal en el Perfil.");
  }
  return new GoogleGenAI({ apiKey: userKey.trim() });
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
    if (error.message?.includes("NEXO DESCONECTADO")) throw error;
    throw new Error(`ERROR DE COMUNICACIÓN: ${error.message || "Error desconocido"}`);
};

const isCalisthenic = (id: string): boolean => {
    return ['pull_up', 'chin_up', 'dips_chest', 'push_ups', 'handstand_pushup', 'muscle_up', 'dips_triceps'].includes(id);
};

export const generateGlobalReport = async (
    allWorkouts: Workout[],
    language: 'es' | 'en' = 'es',
    currentWeight: number = 80,
    userHeight: number = 180
): Promise<GlobalReportData> => {
    try {
        const ai = getAIClient();
        const now = new Date();
        const startOfMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);
        
        let totalVolume = 0;
        let monthlyVolume = 0;
        
        const globalMaxMap = new Map<string, { val: number, unit: string, isBW: boolean }>();
        const monthlyMaxMap = new Map<string, { val: number, unit: string, isBW: boolean }>();

        // Pre-procesamiento de datos para la IA
        const workoutSummary = allWorkouts.map(w => ({
            date: w.date,
            exercises: w.structured_data.exercises.map(ex => ({
                name: ex.name,
                id: getCanonicalId(ex.name, EXERCISE_DB),
                sets: ex.sets
            }))
        }));

        allWorkouts.forEach(w => {
            const isThisMonth = isSameMonth(new Date(w.date), now);
            const historicWeight = w.user_weight || currentWeight;

            w.structured_data.exercises.forEach(ex => {
                const id = getCanonicalId(ex.name, EXERCISE_DB);
                const displayName = getLocalizedName(id, EXERCISE_DB, language);

                ex.sets.forEach(s => {
                    const isBW = !s.weight || s.weight <= 0;
                    const val = isBW ? (s.reps || 0) : (s.weight || 0);
                    const unit = isBW ? 'reps' : (s.unit || 'kg');
                    
                    let baseW = (s.weight && s.weight > 0) ? (s.unit === 'lbs' ? s.weight * 0.453592 : s.weight) : 0;
                    const setVol = (isCalisthenic(id) ? (historicWeight + baseW) : (baseW || historicWeight)) * (s.reps || 0);
                    
                    totalVolume += setVol;
                    if (isThisMonth) {
                        monthlyVolume += setVol;
                        const currentM = monthlyMaxMap.get(displayName);
                        if (!currentM || val > currentM.val) monthlyMaxMap.set(displayName, { val, unit, isBW });
                    }

                    const currentG = globalMaxMap.get(displayName);
                    if (!currentG || val > currentG.val) globalMaxMap.set(displayName, { val, unit, isBW });
                });
            });
        });

        const maxComparison: MaxComparisonEntry[] = Array.from(globalMaxMap.keys()).map(name => {
            const g = globalMaxMap.get(name)!;
            const m = monthlyMaxMap.get(name) || { val: 0, unit: g.unit, isBW: g.isBW };
            return {
                exercise: name,
                globalMax: g.val,
                monthlyMax: m.val,
                unit: g.unit,
                isBodyweight: g.isBW
            };
        }).filter(item => item.monthlyMax > 0);

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
        Peso Total: ${totalVolume}kg. Peso este mes: ${monthlyVolume}kg. 
        Comparativa Máximos: ${JSON.stringify(maxComparison)}.
        Historial detallado del mes: ${JSON.stringify(workoutSummary.filter(w => isAfter(new Date(w.date), subMonths(now, 1))))}.
        Biometría: ${currentWeight}kg.
        Genera el informe forense estricto.`;

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: { parts: [{ text: prompt }] },
            config: { 
                responseMimeType: "application/json", 
                temperature: 0.7,
                systemInstruction: systemInstruction
            }
        });

        const aiRes = JSON.parse(cleanJson(response.text || '{}'));

        return {
            totalVolumeKg: totalVolume,
            volumeEquivalentGlobal: aiRes.equiv_global,
            monthlyVolumeKg: monthlyVolume,
            volumeEquivalentMonthly: aiRes.equiv_monthly,
            monthName: format(now, 'MMMM', { locale: language === 'es' ? es : enUS }),
            monthlyAnalysisText: aiRes.analysis,
            efficiencyScore: aiRes.score || 5,
            maxComparison: maxComparison.sort((a, b) => b.monthlyMax - a.monthlyMax)
        };
    } catch (error) { handleAIError(error); throw error; }
};

export const processWorkoutAudio = async (audioBase64: string, mimeType: string): Promise<WorkoutData> => {
  try {
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: { parts: [{ inlineData: { mimeType, data: audioBase64 } }, { text: "Transcribe audio to structured JSON workout data." }] },
      config: { responseMimeType: "application/json", temperature: 0.1 }
    });
    return JSON.parse(cleanJson(response.text || ''));
  } catch (error: any) { handleAIError(error); throw error; }
};

export const processWorkoutText = async (text: string): Promise<WorkoutData> => {
  try {
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: { parts: [{ text: `Parse text to structured JSON workout data: "${text}"` }] },
      config: { responseMimeType: "application/json", temperature: 0.1 }
    });
    return JSON.parse(cleanJson(response.text || ''));
  } catch (error: any) { handleAIError(error); throw error; }
};

export const generateGroupAnalysis = async (
    usersData: { name: string; workouts: Workout[] }[],
    language: 'es' | 'en' = 'es'
): Promise<GroupAnalysisData> => {
    try {
        const ai = getAIClient();
        const prompt = `Analiza competitivamente este grupo: ${JSON.stringify(usersData)}. Determina Alpha/Beta y haz un Roast técnico. Responde en JSON según esquema GroupAnalysisData.`;
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: { parts: [{ text: prompt }] },
            config: { responseMimeType: "application/json", temperature: 0.3 }
        });
        return JSON.parse(cleanJson(response.text || '{}'));
    } catch (error) { handleAIError(error); throw error; }
};
