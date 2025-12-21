import { GoogleGenAI } from "@google/genai";

export const getAIClient = (): GoogleGenAI => {
  // Priorizamos la clave del perfil del usuario (localStorage)
  const userKey = localStorage.getItem('USER_GEMINI_API_KEY');
  let finalKey: string | undefined;
  
  // Validar y usar la clave del usuario si existe y es válida
  if (userKey) {
    const trimmedKey = userKey.trim();
    // Las API keys de Gemini suelen tener al menos 20 caracteres
    if (trimmedKey.length >= 20 && trimmedKey !== 'undefined' && trimmedKey !== 'null') {
      finalKey = trimmedKey;
    }
  }
  
  // Si no hay clave del usuario, intentar con la variable de entorno
  if (!finalKey) {
    const envKey = import.meta.env.VITE_API_KEY || import.meta.env.API_KEY;
    if (envKey && envKey.trim().length >= 20 && envKey !== 'undefined' && envKey !== 'null') {
      finalKey = envKey.trim();
    }
  }
  
  if (!finalKey) {
    console.error('API Key no encontrada. UserKey:', userKey ? `${userKey.substring(0, 5)}...` : 'null', 'EnvKey:', import.meta.env.VITE_API_KEY ? 'presente' : 'ausente');
    throw new Error("API_KEY_MISSING: Por favor, configura tu API Key en el Perfil para activar la inteligencia.");
  }
  
  return new GoogleGenAI({ apiKey: finalKey });
};

