import React, { useState, useRef } from 'react';
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

  // Detect supported MIME type for the browser (fixes iOS/Safari issues)
  const getSupportedMimeType = () => {
    if (typeof MediaRecorder === 'undefined') return null;
    
    const types = [
      'audio/webm', // Desktop Chrome/Firefox
      'audio/mp4',  // iOS Safari
      'audio/ogg',
      'audio/wav',
      'audio/aac'
    ];
    
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return ''; // Let browser pick default
  };

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const supportedType = getSupportedMimeType();
      if (supportedType === null) {
         setError("Audio recording not supported in this browser.");
         return;
      }

      const options = supportedType ? { mimeType: supportedType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      
      // Store the actual mime type being used
      mimeTypeRef.current = mediaRecorder.mimeType || supportedType || 'audio/webm';
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Create blob with the correct mime type
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeTypeRef.current });
        await handleAudioProcessing(audioBlob);
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Could not access microphone.");
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
        // Extract raw base64 (remove data:audio/xyz;base64, prefix)
        const rawBase64 = base64data.split(',')[1];
        
        try {
          // Use the actual detected mime type
          const typeToSend = blob.type || mimeTypeRef.current || 'audio/webm';
          console.log(`Sending audio to AI with mimeType: ${typeToSend}`);
          
          const data = await processWorkoutAudio(rawBase64, typeToSend);
          onWorkoutProcessed(data);
        } catch (err: any) {
            console.error("AI Processing Error:", err);
            setError(err.message || "Failed to process audio.");
        } finally {
            setIsProcessing(false);
        }
      };
    } catch (e: any) {
      console.error("File Reader Error:", e);
      setError("Error preparing audio file.");
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 relative">
      {/* Status Messages - Floating above the dock */}
      <div className="absolute bottom-full mb-4 w-max flex flex-col items-center pointer-events-none">
        {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-500 font-mono text-xs px-3 py-2 rounded shadow-lg backdrop-blur flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 mb-2">
            <AlertCircle className="w-4 h-4" /> {error}
            </div>
        )}

        {(isRecording || isProcessing) && (
            <div className="bg-black/80 border border-primary/50 text-primary font-mono text-xs px-4 py-2 rounded-full shadow-glow flex items-center gap-2 backdrop-blur-md">
            {isRecording && (
                <>
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_red]" />
                LISTENING...
                </>
            )}
            {isProcessing && (
                <>
                <Loader2 className="w-3 h-3 animate-spin text-primary" />
                PROCESSING...
                </>
            )}
            </div>
        )}
      </div>

      {/* Main Mic Button */}
      <button
        onClick={isRecording ? stopRecording : startRecording}
        disabled={isProcessing}
        className={clsx(
          "w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 relative group",
          isRecording ? "bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.6)] scale-110" : "bg-primary text-black hover:bg-primaryHover hover:shadow-glow hover:scale-105",
          isProcessing ? "opacity-50 cursor-not-allowed grayscale" : "opacity-100"
        )}
      >
        {/* Ripple effect when recording */}
        {isRecording && (
            <span className="absolute inset-0 rounded-full border-2 border-red-500 animate-ping opacity-75"></span>
        )}

        {isRecording ? (
          <Square className="w-6 h-6 fill-current" />
        ) : isProcessing ? (
          <Loader2 className="w-6 h-6 animate-spin" />
        ) : (
          <Mic className="w-7 h-7" />
        )}
      </button>
    </div>
  );
};