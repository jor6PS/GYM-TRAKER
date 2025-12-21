import { WorkoutData } from '../../types';

// Constants
// Solo ejercicios que realmente son de peso corporal (bodyweight)
// Fondos (dips) y Dominadas (pull-ups/chin-ups) son los únicos que se consideran bodyweight
export const CALISTHENIC_IDS = new Set([
  'pull_up', 'chin_up', 'dips_chest', 'dips_triceps', 'dominadas'
]);

// Helper functions
export const isCalisthenic = (id: string): boolean => {
  // Solo verificar si está en la lista explícita (muy restrictivo)
  if (CALISTHENIC_IDS.has(id)) return true;
  
  // Verificar por palabras clave específicas (solo dips y pull-ups/chin-ups)
  const lowerId = id.toLowerCase();
  
  // Solo considerar dips (excluyendo cable/machine)
  const isDip = lowerId.includes('dip') 
                && !lowerId.includes('cable') 
                && !lowerId.includes('machine')
                && !lowerId.includes('face');
  
  // Solo considerar pull-ups/chin-ups/dominadas (muy específico)
  // Debe contener explícitamente "pull_up", "chin_up", o "dominada"
  // NO debe ser "face pull", "cable pull", "row", etc.
  const isPullUp = (lowerId.includes('pull_up') || lowerId.includes('chin_up') || lowerId.includes('dominada'))
                   && !lowerId.includes('cable')
                   && !lowerId.includes('machine')
                   && !lowerId.includes('row')
                   && !lowerId.includes('face');
  
  return isDip || isPullUp;
};

// Función eliminada - los ejercicios de core NO se tratan como bodyweight
// Solo dips y pull-ups son bodyweight

export const getMuscleGroup = (id: string): string => {
  const lowerId = id.toLowerCase();
  if (lowerId.includes('bench') || lowerId.includes('push_up') || lowerId.includes('dips') || lowerId.includes('chest') || lowerId.includes('tricep') || lowerId.includes('press_banca')) {
    return 'PUSH (Pecho/Tríceps)';
  }
  if (lowerId.includes('pull') || lowerId.includes('row') || lowerId.includes('deadlift') || lowerId.includes('bicep') || lowerId.includes('curl') || lowerId.includes('dominadas')) {
    return 'PULL (Espalda/Bíceps)';
  }
  if (lowerId.includes('squat') || lowerId.includes('leg') || lowerId.includes('lunge') || lowerId.includes('calf') || lowerId.includes('sentadilla')) {
    return 'LEGS (Pierna)';
  }
  if (lowerId.includes('shoulder') || lowerId.includes('press') || lowerId.includes('raise') || lowerId.includes('hombro')) {
    return 'SHOULDERS (Hombro)';
  }
  return 'OTROS';
};

export const calculateSetVolume = (
  reps: number, 
  weight: number | undefined, 
  unit: string | undefined, 
  userWeight: number, 
  isCalisthenicExercise: boolean,
  isUnilateral?: boolean
): number => {
  const safeReps = reps || 0;
  let weightInKg = 0;

  if (weight && weight > 0) {
    weightInKg = unit === 'lbs' ? weight * 0.453592 : weight;
    // Considerar ejercicios unilaterales (peso registrado × 2)
    if (isUnilateral) {
      weightInKg *= 2;
    }
  }

  if (isCalisthenicExercise) {
    return (userWeight + weightInKg) * safeReps;
  } else {
    return weightInKg * safeReps; 
  }
};

export const safeParseWorkout = (structuredData: any): WorkoutData => {
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

export const cleanJson = (text: string): string => {
  if (!text) return "{}";
  
  let clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  
  // Buscar el JSON válido más grande
  const firstOpen = clean.indexOf('{');
  const lastClose = clean.lastIndexOf('}');
  if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
    clean = clean.substring(firstOpen, lastClose + 1);
  }

  // NO reemplazar saltos de línea y tabs dentro de strings JSON
  // Usar un enfoque más robusto: procesar carácter por carácter
  let inString = false;
  let escapeNext = false;
  let protectedText = '';
  
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    
    if (escapeNext) {
      protectedText += char;
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      protectedText += char;
      escapeNext = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      protectedText += char;
      continue;
    }
    
    // Si estamos dentro de un string, preservar el carácter (pero escapar saltos de línea)
    if (inString) {
      if (char === '\n') {
        protectedText += '\\n';
      } else if (char === '\r') {
        protectedText += '\\r';
      } else if (char === '\t') {
        protectedText += '\\t';
      } else {
        protectedText += char;
      }
    } else {
      // Fuera del string, reemplazar saltos de línea con espacios
      if (char === '\n' || char === '\r' || char === '\t') {
        protectedText += ' ';
      } else {
        protectedText += char;
      }
    }
  }
  
  clean = protectedText;
  
  // Limpiar espacios múltiples (solo fuera de strings)
  // Esto es más seguro hacerlo después de proteger strings
  clean = clean.replace(/\s+/g, " ");
  
  // Reparar JSON comúnmente malformado de forma más agresiva
  // 1. Comas faltantes antes de llaves de cierre (más específico)
  clean = clean.replace(/([^,}\]])\s*}/g, '$1}');
  clean = clean.replace(/([^,}\]])\s*]/g, '$1]');
  
  // 2. Comas dobles o múltiples
  clean = clean.replace(/,\s*,+/g, ',');
  
  // 3. Comas antes de llaves/corchetes de cierre
  clean = clean.replace(/,\s*}/g, '}');
  clean = clean.replace(/,\s*]/g, ']');
  
  // 4. Comas faltantes entre objetos en arrays
  clean = clean.replace(/}\s*{/g, '},{');
  
  // 5. Comas faltantes entre elementos en arrays
  clean = clean.replace(/]\s*\[/g, '],[');
  clean = clean.replace(/}\s*\[/g, '},[');
  clean = clean.replace(/]\s*{/g, '],{');
  
  // 6. Valores sin comillas en claves (intentar reparar)
  clean = clean.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
  
  // 7. Strings sin cerrar - reparación mejorada
  // Reutilizar las variables ya declaradas arriba, pero resetearlas
  inString = false;
  escapeNext = false;
  let result = '';
  let stringStart = -1;
  
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const nextChar = clean[i + 1];
    
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
    
    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }
    
    // Si estamos en un string, solo agregar el carácter
    if (inString) {
      result += char;
      continue;
    }
    
    // Si encontramos : o , o } y el string no está cerrado, cerrarlo
    // Pero solo si no es parte de un escape válido
    if ((char === ':' || char === ',' || char === '}') && inString && !escapeNext) {
      result += '"' + char;
      inString = false;
      continue;
    }
    
    result += char;
  }
  
  clean = result;
  
  // Escapar caracteres especiales problemáticos
  clean = clean.replace(/\\(?![/\\bfnrtu"']|u[0-9a-fA-F]{4})/g, "\\\\");
  
  // Validar y balancear llaves y corchetes
  let openBraces = 0;
  let openBrackets = 0;
  inString = false;
  escapeNext = false;
  
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    
    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === '{') openBraces++;
      if (char === '}') openBraces--;
      if (char === '[') openBrackets++;
      if (char === ']') openBrackets--;
    }
  }
  
  // Si hay llaves o corchetes sin cerrar, intentar cerrarlos
  if (openBraces > 0) {
    clean += '}'.repeat(openBraces);
  }
  if (openBrackets > 0) {
    clean += ']'.repeat(openBrackets);
  }

  return clean;
};

export interface FormattedAIError {
  title: string;
  message: string;
  type: 'quota' | 'api_key' | 'model_not_found' | 'timeout' | 'json_parse' | 'network' | 'unknown';
  retryAfter?: number; // segundos
  details?: string;
}

export const formatAIError = (error: any): FormattedAIError => {
  const errorMessage = error?.message || error?.error?.message || String(error || 'Error desconocido');
  const errorCode = error?.error?.code || error?.code || error?.status;
  const errorString = JSON.stringify(error);

  // Error de quota excedida (429)
  if (errorCode === 429 || errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
    let retryAfter = 0;
    const retryMatch = errorMessage.match(/retry in ([\d.]+)s/i) || errorString.match(/retryDelay["']?\s*:\s*["']?(\d+)/i);
    if (retryMatch) {
      retryAfter = Math.ceil(parseFloat(retryMatch[1]));
    }
    
    const quotaMatch = errorMessage.match(/limit:\s*(\d+)/i);
    const limit = quotaMatch ? quotaMatch[1] : '20';
    
    return {
      title: 'Cuota de API Excedida',
      message: `Has alcanzado el límite diario de solicitudes (${limit} por día en el plan gratuito). Por favor, espera antes de intentar de nuevo.`,
      type: 'quota',
      retryAfter,
      details: retryAfter > 0 ? `Puedes intentar de nuevo en aproximadamente ${retryAfter} segundos.` : 'Por favor, espera unas horas antes de intentar de nuevo.'
    };
  }

  // Error de API key faltante o inválida
  if (errorCode === 401 || errorCode === 403 || errorMessage.includes('API_KEY') || errorMessage.includes('API key') || errorMessage.includes('authentication')) {
    return {
      title: 'API Key No Configurada',
      message: 'Tu API Key de Gemini no está configurada o es inválida. Por favor, configura tu API Key en el Perfil.',
      type: 'api_key',
      details: 'Ve a tu Perfil y pega tu API Key de Google Gemini.'
    };
  }

  // Error de modelo no encontrado (404)
  if (errorCode === 404 || errorMessage.includes('404') || errorMessage.includes('not found') || errorMessage.includes('NOT_FOUND')) {
    return {
      title: 'Modelo No Disponible',
      message: 'El modelo de IA seleccionado no está disponible en tu región o versión de API. El sistema intentará con otro modelo automáticamente.',
      type: 'model_not_found',
      details: 'Si el problema persiste, verifica tu configuración de API.'
    };
  }

  // Error de timeout
  if (errorMessage.includes('Timeout') || errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
    return {
      title: 'Tiempo de Espera Agotado',
      message: 'La solicitud tardó demasiado tiempo en procesarse. Por favor, intenta de nuevo.',
      type: 'timeout',
      details: 'Esto puede deberse a una conexión lenta o a una carga alta en los servidores de IA.'
    };
  }

  // Error de parseo JSON
  if (errorMessage.includes('JSON') || errorMessage.includes('parse') || errorMessage.includes('Unexpected token')) {
    return {
      title: 'Error de Formato',
      message: 'La respuesta de la IA no tiene el formato esperado. Por favor, intenta de nuevo.',
      type: 'json_parse',
      details: 'Si el problema persiste, intenta reformular tu solicitud o grabar el audio de nuevo con una descripción más clara.'
    };
  }

  // Error de red
  if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('connection') || errorMessage.includes('ECONNREFUSED')) {
    return {
      title: 'Error de Conexión',
      message: 'No se pudo conectar con el servicio de IA. Verifica tu conexión a internet.',
      type: 'network',
      details: 'Asegúrate de tener una conexión a internet estable y vuelve a intentar.'
    };
  }

  // Error desconocido
  return {
    title: 'Error de Inteligencia Artificial',
    message: errorMessage.length > 200 ? errorMessage.substring(0, 200) + '...' : errorMessage,
    type: 'unknown',
    details: 'Si el problema persiste, verifica tu configuración de API Key o contacta con soporte.'
  };
};

export const handleAIError = (error: any) => {
  console.error("AI Module Error:", error);
  const formatted = formatAIError(error);
  const errorObj = new Error(`ERROR DE INTELIGENCIA: ${formatted.title} - ${formatted.message}`);
  (errorObj as any).formatted = formatted;
  throw errorObj;
};

