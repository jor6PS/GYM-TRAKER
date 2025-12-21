
import React, { createContext, useContext, useState, useEffect } from 'react';
import { getExerciseCatalog } from '../services/supabase';

export interface ExerciseDef {
  id: string;
  en: string;
  es: string;
  category?: string;
  type?: 'strength' | 'cardio';
}

interface ExerciseContextType {
  catalog: ExerciseDef[];
  isLoading: boolean;
}

const ExerciseContext = createContext<ExerciseContextType | undefined>(undefined);

export const ExerciseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [catalog, setCatalog] = useState<ExerciseDef[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const data = await getExerciseCatalog();
        if (data && data.length > 0) {
          setCatalog(data);
        } else {
          console.warn("No exercises found in Supabase catalog.");
        }
      } catch (e) {
        console.error("Error loading exercise catalog from Supabase:", e);
      } finally {
        setIsLoading(false);
      }
    };
    loadCatalog();
  }, []);

  return (
    <ExerciseContext.Provider value={{ catalog, isLoading }}>
      {children}
    </ExerciseContext.Provider>
  );
};

export const useExercises = () => {
  const context = useContext(ExerciseContext);
  if (context === undefined) {
    throw new Error('useExercises must be used within an ExerciseProvider');
  }
  return context;
};
