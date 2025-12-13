import { GoogleGenAI, Type } from "@google/genai";
import { WorkoutData } from "../types";

// This file represents the "Service Layer".
// We use VITE_ variables for browser compatibility.

// Using type assertion to bypass TypeScript error with ImportMeta
const API_KEY = (import.meta as any).env?.VITE_GOOGLE_API_KEY || '';

// Initialize AI
// The API key must be obtained from the environment variable.
const ai = new GoogleGenAI({ apiKey: API_KEY });

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
                unit: { type: Type.STRING, enum: ["kg", "lbs"], description: "Weight unit" }
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

/**
 * Core Service Function: Processes audio blob into structured workout data.
 */
export const processWorkoutAudio = async (audioBase64: string, mimeType: string): Promise<WorkoutData> => {
  if (!API_KEY) throw new Error("Google API Key is missing. Please set VITE_GOOGLE_API_KEY in Vercel.");

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
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
              Extract the exercises, sets, reps, and weights.
              If the user mentions the date of the workout, note it, otherwise assume it is for the current entry.
              Normalize exercise names to standard gym terminology.
              Return ONLY JSON.
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

    const data = JSON.parse(response.text) as WorkoutData;
    return data;

  } catch (error) {
    console.error("Error processing workout audio:", error);
    throw error;
  }
};

/**
 * Processes raw text input into structured workout data.
 */
export const processWorkoutText = async (text: string): Promise<WorkoutData> => {
  if (!API_KEY) throw new Error("Google API Key is missing. Please set VITE_GOOGLE_API_KEY in Vercel.");

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            text: `
              You are an expert fitness tracker. Parse the following workout text.
              Extract the exercises, sets, reps, and weights.
              CRITICAL: Normalize exercise names to standard gym terminology (e.g. "bench" -> "Bench Press", "squat" -> "Barbell Squat").
              Even if the text is informal (e.g. "chest press 3x10 50"), structure it correctly.
              
              Text to parse:
              "${text}"
              
              Return ONLY JSON adhering to the schema.
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

    return JSON.parse(response.text) as WorkoutData;

  } catch (error) {
    console.error("Error processing workout text:", error);
    throw error;
  }
};