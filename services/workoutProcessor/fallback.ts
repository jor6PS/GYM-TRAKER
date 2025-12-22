import { GoogleGenAI } from "@google/genai";

// Model lists for fallback
// Nota: Algunos modelos pueden no estar disponibles en todas las regiones/versiones de API
export const REPORT_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-pro',
  'gemini-2.0-pro-exp-02-05',
  'gemini-3-pro-preview',
  'gemini-3-flash-preview'
];

export const AUDIO_MODELS = [
  'gemini-2.5-flash',      // Más rápido, mejor para audio
  'gemini-2.0-flash',       // Flash es más rápido
  'gemini-3-flash-preview', // Flash es más rápido
  'gemini-1.5-pro',        // Pro como fallback
  'gemini-2.0-pro-exp-02-05',
  'gemini-3-pro-preview'   // Pro como último recurso
];

export const generateWithFallback = async (
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
      const config: any = { 
        responseMimeType: "application/json", 
        temperature: 0.3, // Reducido para respuestas más rápidas y deterministas
        maxOutputTokens: responseSchema ? 8192 : 4096 // Más tokens cuando hay schema (para análisis largos)
      };
      
      if (systemInstruction) config.systemInstruction = systemInstruction;
      if (responseSchema) config.responseSchema = responseSchema;

      const parts: any[] = [];
      if (inlineData) parts.push(inlineData);
      parts.push({ text: prompt });

      console.log(`🧠 Intentando generar con modelo: ${modelName}...`);

      // Agregar timeout de 30 segundos para audio
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout: La solicitud tardó más de 30 segundos')), 30000)
      );

      const responsePromise = ai.models.generateContent({
        model: modelName,
        contents: { parts: parts },
        config: config
      });

      const response = await Promise.race([responsePromise, timeoutPromise]) as any;

      return response;

    } catch (error: any) {
      console.warn(`⚠️ Fallo en modelo ${modelName}:`, error.message);
      lastError = error;
      
      // Si el modelo no está disponible (404) o no es compatible, continuar con el siguiente
      const isModelNotFound = error.message?.includes('404') || 
                              error.message?.includes('not found') ||
                              error.message?.includes('NOT_FOUND') ||
                              error.message?.includes('not supported');
      
      const isRetryable = error.message?.includes('429') || 
                          error.message?.includes('503') || 
                          error.message?.includes('quota') ||
                          error.message?.includes('resource exhausted') ||
                          error.message?.includes('Timeout');

      // Si el modelo no está disponible, continuar con el siguiente automáticamente
      if (isModelNotFound && models.indexOf(modelName) < models.length - 1) {
        console.log(`🔄 Modelo ${modelName} no disponible, intentando siguiente modelo...`);
        continue;
      }

      // Si es timeout y no es el último modelo, continuar con el siguiente
      if (error.message?.includes('Timeout') && models.indexOf(modelName) < models.length - 1) {
        continue;
      }

      // Solo lanzar error si no es retryable y es el último modelo
      if (!isRetryable && !isModelNotFound && models.indexOf(modelName) === models.length - 1) {
        throw error;
      }
      
      // Si es el último modelo y es un error no retryable, lanzar el error
      if (!isRetryable && !isModelNotFound && models.indexOf(modelName) === models.length - 1) {
        throw error;
      }
    }
  }
  // Formatear el último error de forma amigable
  const errorMessage = lastError?.message || lastError?.error?.message || String(lastError || 'Error desconocido');
  const errorCode = lastError?.error?.code || lastError?.code;
  
  // Si es un error de quota, formatearlo mejor
  if (errorCode === 429 || errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
    let retryAfter = 0;
    const retryMatch = errorMessage.match(/retry in ([\d.]+)s/i) || JSON.stringify(lastError).match(/retryDelay["']?\s*:\s*["']?(\d+)/i);
    if (retryMatch) {
      retryAfter = Math.ceil(parseFloat(retryMatch[1]));
    }
    
    const quotaMatch = errorMessage.match(/limit:\s*(\d+)/i);
    const limit = quotaMatch ? quotaMatch[1] : '20';
    
    const quotaError = new Error(`Todos los modelos fallaron. Cuota excedida: límite de ${limit} solicitudes por día alcanzado.`);
    (quotaError as any).formatted = {
      title: 'Cuota de API Excedida',
      message: `Has alcanzado el límite diario de solicitudes (${limit} por día en el plan gratuito). Por favor, espera antes de intentar de nuevo.`,
      type: 'quota' as const,
      retryAfter,
      details: retryAfter > 0 ? `Puedes intentar de nuevo en aproximadamente ${retryAfter} segundos.` : 'Por favor, espera unas horas antes de intentar de nuevo.'
    };
    throw quotaError;
  }
  
  throw new Error(`Todos los modelos fallaron. Último error: ${errorMessage}`);
};

