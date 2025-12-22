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
    // NOTA: Estos son valores por defecto (fallback) si el usuario NO tiene datos en su perfil.
    // Si el usuario tiene perfil, estos valores se sobrescriben con los reales.
    currentWeight: number = 80,
    userHeight: number = 180,
    userAge: number = 25, // <--- NUEVO: Edad por defecto (fallback)
    userId?: string // <--- NUEVO: userId para obtener records almacenados
): Promise<GlobalReportData> => {
    try {
        const now = new Date();
        
        let totalVolume = 0;
        let monthlyVolume = 0;
        
        const globalMaxMap = new Map<string, { val: number, unit: string, isBW: boolean }>();
        const monthlyMaxMap = new Map<string, { val: number, unit: string, isBW: boolean }>();

        // Intentar obtener records almacenados si tenemos userId
        let storedRecords: any[] = [];
        if (userId) {
            try {
                storedRecords = await getUserRecords(userId);
                totalVolume = await getUserTotalVolume(userId);
            } catch (error) {
                console.warn('Error loading stored records, using fallback calculation:', error);
            }
        }

        // Si tenemos records almacenados, usarlos para los máximos
        if (storedRecords.length > 0) {
            for (const record of storedRecords) {
                const displayName = getLocalizedName(record.exercise_id, catalog);
                const val = record.is_bodyweight ? record.max_reps : record.max_weight_kg;
                const unit = record.unit || 'kg';
                const isBW = record.is_bodyweight;
                
                // Máximo global
                const currentG = globalMaxMap.get(displayName);
                if (!currentG || val > currentG.val) {
                    globalMaxMap.set(displayName, { val, unit, isBW });
                }
                
                // Máximo mensual (si la fecha del record es de este mes)
                if (record.max_weight_date || record.max_reps_date || record.max_1rm_date) {
                    const recordDate = new Date(record.max_weight_date || record.max_reps_date || record.max_1rm_date);
                    if (isSameMonth(recordDate, now)) {
                        const currentM = monthlyMaxMap.get(displayName);
                        if (!currentM || val > currentM.val) {
                            monthlyMaxMap.set(displayName, { val, unit, isBW });
                        }
                    }
                }
            }
        }

        // Calcular volumen mensual desde workouts (si no tenemos records o como fallback)
        if (monthlyVolume === 0 || storedRecords.length === 0) {
            for (const w of allWorkouts) {
                const wDate = new Date(w.date);
                const isThisMonth = isSameMonth(wDate, now);
                if (!isThisMonth) continue;
                
                const historicWeight = w.user_weight || currentWeight;
                const workoutData = safeParseWorkout(w.structured_data);
                if (!workoutData.exercises || !Array.isArray(workoutData.exercises)) continue;

                for (const ex of workoutData.exercises) {
                    const id = getCanonicalId(ex.name, catalog);
                    const exerciseDef = catalog.find(e => e.id === id);
                    const exerciseType = exerciseDef?.type || 'strength';
                    
                    // Solo procesar ejercicios de fuerza (igual que en recordsService)
                    if (exerciseType !== 'strength') continue;
                    
                    const isCalis = isCalisthenic(id);
                    const isUnilateral = ex.unilateral || false;

                    for (const s of ex.sets) {
                        const setVol = calculateSetVolume(s.reps || 0, s.weight, s.unit, historicWeight, isCalis, isUnilateral);
                        monthlyVolume += setVol;
                    }
                }
            }
        }

        // Fallback: calcular totalVolume desde workouts si no tenemos records
        if (totalVolume === 0) {
            for (const w of allWorkouts) {
                const historicWeight = w.user_weight || currentWeight;
                const workoutData = safeParseWorkout(w.structured_data);
                if (!workoutData.exercises || !Array.isArray(workoutData.exercises)) continue;

                for (const ex of workoutData.exercises) {
                    const id = getCanonicalId(ex.name, catalog);
                    const exerciseDef = catalog.find(e => e.id === id);
                    const exerciseType = exerciseDef?.type || 'strength';
                    
                    // Solo procesar ejercicios de fuerza (igual que en recordsService)
                    if (exerciseType !== 'strength') continue;
                    
                    const isCalis = isCalisthenic(id);
                    const isUnilateral = ex.unilateral || false;

                    for (const s of ex.sets) {
                        const setVol = calculateSetVolume(s.reps || 0, s.weight, s.unit, historicWeight, isCalis, isUnilateral);
                        totalVolume += setVol;
                    }
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
                        id: getCanonicalId(ex.name, catalog),
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
        
        // Schema JSON estricto para garantizar el formato correcto de la respuesta
        const schema = {
            type: Type.OBJECT,
            properties: {
                equiv_global: {
                    type: Type.STRING,
                    description: "Comparación VISUAL del peso total histórico con algo masivo (ej: '3 Ballenas Azules')"
                },
                equiv_monthly: {
                    type: Type.STRING,
                    description: "Comparación VISUAL del peso mensual con objetos cotidianos o animales"
                },
                analysis: {
                    type: Type.STRING,
                    description: "Markdown detallado con el análisis completo del entrenamiento"
                },
                score: {
                    type: Type.NUMBER,
                    description: "Puntuación de eficiencia del 1 al 10"
                }
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

        // Extraer el texto de la respuesta (puede venir en diferentes formatos)
        let rawText = '';
        if (response.text) {
            rawText = response.text;
        } else if (response.candidates && response.candidates[0]?.content?.parts?.[0]?.text) {
            rawText = response.candidates[0].content.parts[0].text;
        } else if (typeof response === 'string') {
            rawText = response;
        } else {
            // Intentar extraer de cualquier estructura posible
            rawText = JSON.stringify(response);
        }

        // Intentar parsear el JSON con múltiples intentos y limpieza progresiva
        let aiRes: any;
        let cleanedJson = cleanJson(rawText || '{}');
        
        let parseAttempts = 0;
        const maxAttempts = 3;
        
        while (parseAttempts < maxAttempts) {
          try {
            aiRes = JSON.parse(cleanedJson);
            
            // Validar que tenga los campos requeridos
            if (!aiRes.equiv_global || !aiRes.equiv_monthly || !aiRes.analysis || aiRes.score === undefined) {
              throw new Error('Faltan campos requeridos en la respuesta de la IA');
            }
            
            break;
          } catch (parseError: any) {
            parseAttempts++;
            
            if (parseAttempts >= maxAttempts) {
              // Último intento: reparación agresiva de strings sin cerrar
              console.warn('Intento de parseo fallido, aplicando reparación agresiva de strings...');
              console.warn('Respuesta cruda recibida:', rawText.substring(0, 500));
              
              // Intentar reparar strings sin cerrar
              let fixed = cleanedJson;
              let inString = false;
              let escapeNext = false;
              let result = '';
              
              for (let i = 0; i < fixed.length; i++) {
                const char = fixed[i];
                
                if (escapeNext) {
                  result += char;
                  escapeNext = false;
                  continue;
                }
                
                if (char === '\\') {
                  result += char;
                  escapeNext = true;
                  continue;
                }
                
                if (char === '"' && !escapeNext) {
                  inString = !inString;
                  result += char;
                  continue;
                }
                
                // Si estamos en un string y encontramos un carácter problemático, escapar o cerrar
                if (inString) {
                  // Si encontramos un salto de línea o caracteres problemáticos, escapar
                  if (char === '\n' || char === '\r') {
                    result += '\\n';
                  } else if (char === '\t') {
                    result += '\\t';
                  } else {
                    result += char;
                  }
                } else {
                  result += char;
                }
              }
              
              // Si el string no se cerró, cerrarlo
              if (inString) {
                result += '"';
              }
              
              try {
                aiRes = JSON.parse(result);
                
                // Validar campos después del parseo reparado
                if (!aiRes.equiv_global || !aiRes.equiv_monthly || !aiRes.analysis || aiRes.score === undefined) {
                  throw new Error('Faltan campos requeridos después de la reparación');
                }
                
                break;
              } catch (finalError: any) {
                // Si aún falla, intentar extraer solo los campos necesarios con valores por defecto
                console.error('Error final de parseo:', finalError);
                console.error('JSON reparado (últimos 500 chars):', result.substring(Math.max(0, result.length - 500)));
                
                // Intentar extraer campos manualmente como último recurso
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
                
                throw new Error(`JSON inválido en la respuesta de la IA. Error: ${parseError.message}. Por favor, intenta de nuevo.`);
              }
            } else {
              // Limpieza adicional para el siguiente intento
              cleanedJson = cleanedJson
                .replace(/,\s*,+/g, ',')
                .replace(/,\s*}/g, '}')
                .replace(/,\s*]/g, ']')
                .replace(/([^,}\]])\s*}/g, '$1}')
                .replace(/([^,}\]])\s*]/g, '$1]');
            }
          }
        }
        
        // Validación final de campos requeridos
        if (!aiRes || !aiRes.equiv_global || !aiRes.equiv_monthly || !aiRes.analysis || aiRes.score === undefined) {
          console.error('Respuesta de IA incompleta:', aiRes);
          throw new Error('La respuesta de la IA no tiene el formato esperado. Faltan campos requeridos.');
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

export const processWorkoutAudio = async (audioBase64: string, mimeType: string, catalog?: ExerciseDef[]): Promise<WorkoutData> => {
  try {
    const ai = getAIClient();
    
    // Obtener catálogo de ejercicios si no se proporciona
    let exerciseCatalog = catalog;
    if (!exerciseCatalog) {
      const { getExerciseCatalog } = await import('./supabase');
      exerciseCatalog = await getExerciseCatalog();
    }
    
    // Crear lista reducida de nombres de ejercicios más comunes (solo 30 para no sobrecargar)
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

    // System instruction más conciso y directo
    const systemInstruction = `Extrae datos de entrenamiento desde audio en español. Usa nombres de ejercicios en español. Formato: "ejercicio, peso, series, reps". Ejemplos: "Press Banca 80kg 3x10" → {name:"Press Banca", sets:[{reps:10, weight:80, unit:"kg"} x3]}. Si dice "kilos" o "kg" → unit:"kg". Si dice "libras" o "lbs" → unit:"lbs". Extrae TODOS los ejercicios mencionados.`;

    const prompt = `Extrae los ejercicios del audio.${commonExercises ? ` Ejercicios comunes: ${commonExercises}` : ''}`;

    // MODIFICACIÓN: Usar generateWithFallback con AUDIO_MODELS
    const response = await generateWithFallback(
        ai,
        AUDIO_MODELS, // Intenta el nativo, luego el 1.5 flash
        prompt,
        systemInstruction,
        schema,
        { inlineData: { mimeType, data: audioBase64 } }
    );

    let cleanedJson = cleanJson(response.text || '');
    
    let rawData;
    let parseAttempts = 0;
    const maxAttempts = 3;
    
    while (parseAttempts < maxAttempts) {
      try {
        rawData = JSON.parse(cleanedJson);
        break; // Si el parse es exitoso, salir del loop
      } catch (parseError: any) {
        parseAttempts++;
        
        if (parseAttempts >= maxAttempts) {
          console.error('Error parsing JSON después de múltiples intentos:', parseError);
          console.error('Cleaned JSON (first 1000 chars):', cleanedJson.substring(0, 1000));
          console.error('Cleaned JSON (last 1000 chars):', cleanedJson.substring(Math.max(0, cleanedJson.length - 1000)));
          console.error('Error position:', parseError.message);
          
          // Último intento: extraer solo la parte de exercises si es posible
          try {
            // Buscar el array de exercises de forma más flexible
            const exercisesPattern = /"exercises"\s*:\s*\[([\s\S]*?)\]/;
            const match = cleanedJson.match(exercisesPattern);
            
            if (match && match[1]) {
              // Intentar limpiar y parsear solo el contenido del array
              let exercisesContent = match[1].trim();
              
              // Si el contenido está vacío o es muy corto, crear un array vacío
              if (exercisesContent.length < 10) {
                rawData = { exercises: [], notes: '' };
                break;
              }
              
              // Intentar reparar el contenido del array
              exercisesContent = exercisesContent
                .replace(/}\s*{/g, '},{')
                .replace(/,\s*,/g, ',')
                .replace(/,\s*}/g, '}')
                .replace(/,\s*]/g, ']');
              
              try {
                const exercisesArray = JSON.parse(`[${exercisesContent}]`);
                rawData = { exercises: exercisesArray, notes: '' };
                break;
              } catch (e) {
                // Si aún falla, intentar extraer ejercicios individuales
                const exerciseMatches = cleanedJson.match(/"name"\s*:\s*"([^"]+)"[\s\S]*?"sets"\s*:\s*\[([\s\S]*?)\]/g);
                if (exerciseMatches && exerciseMatches.length > 0) {
                  // Crear ejercicios básicos desde los matches
                  const basicExercises = exerciseMatches.map(match => {
                    const nameMatch = match.match(/"name"\s*:\s*"([^"]+)"/);
                    const setsMatch = match.match(/"sets"\s*:\s*\[([\s\S]*?)\]/);
                    return {
                      name: nameMatch ? nameMatch[1] : 'Ejercicio',
                      sets: setsMatch ? [] : [{ reps: 0 }]
                    };
                  });
                  rawData = { exercises: basicExercises, notes: '' };
                  break;
                }
              }
            }
            
            // Si llegamos aquí, no pudimos extraer nada útil
            throw new Error(`No se pudo interpretar el audio. La IA generó una respuesta con formato inválido. Intenta grabar de nuevo hablando más claro, mencionando: nombre del ejercicio, peso y repeticiones. Ejemplo: "Press banca, 80 kilos, 3 series de 10".`);
          } catch (extractError: any) {
            throw new Error(extractError.message || `JSON inválido en la respuesta de la IA. Error: ${parseError.message}. Intenta grabar de nuevo con una descripción más clara.`);
          }
        }
        
        // Intentar limpiar más agresivamente en el siguiente intento
        cleanedJson = cleanedJson
          .replace(/,\s*,+/g, ',')
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']')
          .replace(/([^,}\]])\s*}/g, '$1}')
          .replace(/([^,}\]])\s*]/g, '$1]');
      }
    }
    
    // Validar que rawData tenga la estructura esperada
    if (!rawData || typeof rawData !== 'object') {
      throw new Error('La respuesta de la IA no tiene el formato esperado. Intenta grabar de nuevo.');
    }
    
    if (!rawData.exercises || !Array.isArray(rawData.exercises)) {
      rawData.exercises = [];
    }
    
    // Normalizar los nombres de ejercicios usando el catálogo
    if (exerciseCatalog && rawData.exercises) {
      const { sanitizeWorkoutData } = await import('../utils');
      return sanitizeWorkoutData(rawData, exerciseCatalog);
    }
    
    return rawData;
  } catch (error: any) { 
    // Si el error ya tiene un mensaje personalizado, lanzarlo directamente
    if (error.message && error.message.includes('JSON inválido') || error.message.includes('formato esperado')) {
      throw error;
    }
    handleAIError(error); 
    throw error; 
  }
};

// ------------------------------------------------------------------
// GENERATE GROUP ANALYSIS (ARENA MODE)
// ------------------------------------------------------------------

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