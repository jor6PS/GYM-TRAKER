import { GoogleGenAI, Type } from "@google/genai";
import { WorkoutData } from "../types";

// Initialize AI
// The API key must be obtained from the environment variable process.env.API_KEY.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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

// Helper to clean Markdown code blocks from JSON response
const cleanJson = (text: string): string => {
  if (!text) return "{}";
  // Remove markdown code blocks if present
  let clean = text.replace(/```json/g, '').replace(/```/g, '');
  
  // Extract just the JSON object (first '{' to last '}') to handle any preamble text
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

/**
 * Core Service Function: Processes audio blob into structured workout data.
 */
export const processWorkoutAudio = async (audioBase64: string, mimeType: string): Promise<WorkoutData> => {
  if (!process.env.API_KEY) {
     throw new Error("API Key is missing. Ensure process.env.API_KEY is configured.");
  }

  try {
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
              Extract the exercises, sets, reps, and weights.
              If the user mentions the date of the workout, note it, otherwise assume it is for the current entry.
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

/**
 * Processes raw text input into structured workout data.
 */
export const processWorkoutText = async (text: string): Promise<WorkoutData> => {
  if (!process.env.API_KEY) {
     throw new Error("API Key is missing. Ensure process.env.API_KEY is configured.");
  }

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