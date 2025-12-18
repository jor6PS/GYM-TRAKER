
import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { processWorkoutAudio } from '../services/workoutProcessor';
import { WorkoutData } from '../types';

interface AudioRecorderProps {
  onWorkoutProcessed: (data: WorkoutData) => void;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({ onWorkoutProcessed }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("");

  useEffect(() => {
    if (error) {
        const timer = setTimeout(() => {
            setError(null);
        }, error.includes("NEXO") ? 10000 : 7000); 
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
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        const rawBase64 = base64data.split(',')[1];
        
        try {
          const typeToSend = blob.type || mimeTypeRef.current;
          const data = await processWorkoutAudio(rawBase64, typeToSend);
          onWorkoutProcessed(data);
        } catch (err: any) {
            console.error("AI Processing Error:", err);
            setError(err.message || "Error al procesar el audio.");
        } finally {
            setIsProcessing(false);
        }
      };
    } catch (e: any) {
      console.error("File Reader Error:", e);
      setError("Error interno del audio.");
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 relative">
      <div className="absolute bottom-full mb-4 flex flex-col items-center pointer-events-none w-screen max-w-sm px-4 left-1/2 -translate-x-1/2 z-50">
        {error && (
            <div className="bg-surface border border-red-500 rounded-2xl p-4 shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex flex-col items-center gap-2 animate-in slide-in-from-bottom-2 fade-in zoom-in-95 mb-3 w-full max-w-[280px] text-center pointer-events-auto">
                <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center shrink-0">
                    <AlertCircle className="w-6 h-6 text-red-500" />
                </div>
                <div className="space-y-1">
                    <p className="text-red-500 font-bold text-[10px] uppercase tracking-wider">Fallo de Nexo</p>
                    <p className="text-zinc-500 text-xs font-medium leading-relaxed">
                        {error}
                    </p>
                </div>
                <button onClick={() => setError(null)} className="mt-2 text-[10px] font-black text-zinc-600 hover:text-white uppercase tracking-widest underline transition-colors">Cerrar</button>
            </div>
        )}

        {(isRecording || isProcessing) && !error && (
            <div className="bg-black/90 border border-primary/50 text-primary font-mono text-xs px-5 py-3 rounded-full shadow-glow flex items-center gap-3 backdrop-blur-md animate-in slide-in-from-bottom-2">
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
  );
};
