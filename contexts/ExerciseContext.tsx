
import React, { createContext, useContext, useState, useEffect } from 'react';
import { getExerciseCatalog } from '../services/supabase';
import { EXERCISE_DB } from '../data/exerciseDb';

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
  // Fallback inicial: Usar la base de datos local para que la app siempre sea funcional
  const [catalog, setCatalog] = useState<ExerciseDef[]>(EXERCISE_DB);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const data = await getExerciseCatalog();
        // Solo actualizamos el estado si realmente recibimos datos de la base de datos
        if (data && data.length > 0) {
          setCatalog(data);
        }
      } catch (e) {
        // En caso de error (como el de tabla no encontrada), fallamos silenciosamente
        // ya que el estado inicial ya tiene el catálogo local.
        console.warn("Supabase catalog not found, using local fallback DB.");
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
