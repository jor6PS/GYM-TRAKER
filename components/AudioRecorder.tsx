
import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { processWorkoutAudio } from '../services/workoutProcessor';
import { WorkoutData } from '../types';
import { useExercises } from '../contexts/ExerciseContext';
import { AIErrorDisplay } from './AIErrorDisplay';
import { formatAIError, FormattedAIError } from '../services/workoutProcessor/helpers';

interface AudioRecorderProps {
  onWorkoutProcessed: (data: WorkoutData) => void;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({ onWorkoutProcessed }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formattedError, setFormattedError] = useState<FormattedAIError | null>(null);
  const { catalog } = useExercises();
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("");

  useEffect(() => {
    if (error) {
        const timer = setTimeout(() => {
            setError(null);
        }, 7000); 
        return () => clearTimeout(timer);
    }
  }, [error]);

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        } 
      });
      
      const mimeTypes = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg', 'audio/wav'];
      let selectedType = '';
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          selectedType = type;
          break;
        }
      }

      const options = selectedType ? { mimeType: selectedType, audioBitsPerSecond: 32000 } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      
      mimeTypeRef.current = mediaRecorder.mimeType || selectedType || 'audio/webm';
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeTypeRef.current });
        await handleAudioProcessing(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.error(err);
      setError("No se pudo acceder al micrófono. Verifica permisos.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleAudioProcessing = async (blob: Blob) => {
    setIsProcessing(true);
    setError(null); // Limpiar errores previos
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        const rawBase64 = base64data.split(',')[1];
        
        try {
          const typeToSend = blob.type || mimeTypeRef.current;
          const data = await processWorkoutAudio(rawBase64, typeToSend, catalog);
          
          // Validar que se haya interpretado algo
          if (!data || !data.exercises || data.exercises.length === 0) {
            setError("No se pudo interpretar ningún ejercicio del audio. Intenta hablar más claro, mencionando el nombre del ejercicio, el peso y las repeticiones. Ejemplo: 'Press banca, 80 kilos, 3 series de 10'.");
            setIsProcessing(false);
            return;
          }
          
          // Validar que los ejercicios tengan sets válidos
          const validExercises = data.exercises.filter(ex => 
            ex.sets && Array.isArray(ex.sets) && ex.sets.length > 0
          );
          
          if (validExercises.length === 0) {
            setError("Se detectaron ejercicios pero sin series válidas. Asegúrate de mencionar las repeticiones. Ejemplo: 'Press banca, 80 kilos, 3 series de 10'.");
            setIsProcessing(false);
            return;
          }
          
          // Si todo está bien, procesar los datos
          onWorkoutProcessed(data);
          setIsProcessing(false);
        } catch (err: any) {
            console.error("AI Processing Error:", err);
            const errorMessage = err.message || "Error al procesar el audio.";
            
            // Si es un error de IA (quota, API key, etc.), formatearlo
            if (errorMessage.includes('ERROR DE INTELIGENCIA') || errorMessage.includes('quota') || errorMessage.includes('429') || errorMessage.includes('API_KEY')) {
              try {
                const formatted = formatAIError(err);
                setFormattedError(formatted);
              } catch {
                setError(errorMessage.includes('JSON inválido') || errorMessage.includes('formato esperado') 
                  ? errorMessage 
                  : `Error al procesar el audio: ${errorMessage}`);
              }
            } else {
              setError(errorMessage.includes('JSON inválido') || errorMessage.includes('formato esperado') 
                ? errorMessage 
                : `Error al procesar el audio: ${errorMessage}`);
            }
        } finally {
            setIsProcessing(false);
        }
      };
    } catch (e: any) {
      console.error("File Reader Error:", e);
      setError("Error interno del audio. Intenta grabar de nuevo.");
      setIsProcessing(false);
    }
  };

  return (
    <>
      {formattedError && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-black/95 backdrop-blur-xl">
          <AIErrorDisplay 
            error={formattedError} 
            onDismiss={() => {
              setError(null);
              setFormattedError(null);
              setIsProcessing(false);
            }}
            onRetry={() => {
              setError(null);
              setFormattedError(null);
              // El usuario necesitará grabar de nuevo
            }}
          />
        </div>
      )}
      <div className="flex flex-col items-center gap-2 relative">
        <div className="absolute bottom-full mb-4 flex flex-col items-center pointer-events-none w-screen max-w-sm px-4 left-1/2 -translate-x-1/2 z-50">
          {error && !formattedError && (
            <div className="bg-surface border border-red-500/50 rounded-2xl p-4 shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex flex-col items-center gap-3 animate-in slide-in-from-bottom-2 fade-in zoom-in-95 mb-3 w-full max-w-[320px] text-center pointer-events-auto">
                <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center shrink-0 border border-red-500/20">
                    <AlertCircle className="w-6 h-6 text-red-500" />
                </div>
                <div className="space-y-2">
                    <p className="text-red-500 font-black text-[11px] uppercase tracking-wider">Error de Interpretación</p>
                    <p className="text-zinc-400 text-xs font-medium leading-relaxed px-2">
                        {error}
                    </p>
                </div>
                <div className="flex gap-2 mt-1">
                    <button 
                        onClick={() => {
                            setError(null);
                            setIsProcessing(false);
                        }} 
                        className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors border border-red-500/30"
                    >
                        Entendido
                    </button>
                </div>
            </div>
        )}

        {(isRecording || isProcessing) && !error && (
            <div className="bg-black/90 border border-primary/50 text-primary font-mono text-xs px-5 py-3 rounded-full shadow-glow flex items-center gap-3 backdrop-blur-md animate-in slide-in-from-bottom-2 fade-in">
            {isRecording && (
                <>
                <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_red]" />
                <span className="font-black italic">ESCUCHANDO...</span>
                </>
            )}
            {isProcessing && (
                <>
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="font-black italic">ANALIZANDO...</span>
                </>
            )}
            </div>
        )}
      </div>

      <button
        onClick={isRecording ? stopRecording : startRecording}
        disabled={isProcessing}
        className={clsx(
          "w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 relative group",
          isRecording ? "bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.6)] scale-110" : "bg-primary text-black hover:bg-primaryHover hover:shadow-glow hover:scale-105",
          isProcessing ? "opacity-50 cursor-not-allowed grayscale" : "opacity-100"
        )}
      >
        {isRecording && (
            <span className="absolute inset-0 rounded-full border-2 border-red-500 animate-ping opacity-75"></span>
        )}
        {isRecording ? <Square className="w-6 h-6 fill-current" /> : isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Mic className="w-7 h-7" />}
      </button>
    </div>
    </>
  );
};
