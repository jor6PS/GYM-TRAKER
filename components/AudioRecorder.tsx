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

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleAudioProcessing(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error(err);
      setError("Could not access microphone.");
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
          const data = await processWorkoutAudio(rawBase64, 'audio/webm');
          onWorkoutProcessed(data);
        } catch (err) {
            console.error(err);
            setError("Failed to process audio.");
        } finally {
            setIsProcessing(false);
        }
      };
    } catch (e) {
      setError("Error preparing audio file.");
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-500 font-mono text-xs px-3 py-2 rounded mb-2 shadow-lg backdrop-blur flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
           <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Status Label */}
      {(isRecording || isProcessing) && (
        <div className="bg-black/80 border border-primary/50 text-primary font-mono text-xs px-4 py-2 rounded mb-2 shadow-glow flex items-center gap-2">
          {isRecording && (
            <>
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_red]" />
              REC_ON
            </>
          )}
          {isProcessing && (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              PROCESSING_DATA...
            </>
          )}
        </div>
      )}

      <button
        onClick={isRecording ? stopRecording : startRecording}
        disabled={isProcessing}
        className={clsx(
          "w-16 h-16 rounded flex items-center justify-center shadow-lg transition-all duration-300 transform hover:scale-105 active:scale-95 border-2",
          isRecording ? "bg-red-500/10 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]" : "bg-primary border-primary hover:bg-primaryHover hover:shadow-glow",
          isProcessing ? "opacity-50 cursor-not-allowed grayscale" : "opacity-100"
        )}
      >
        {isRecording ? (
          <Square className="w-6 h-6 text-red-500 fill-current" />
        ) : isProcessing ? (
          <Loader2 className="w-8 h-8 text-black animate-spin" />
        ) : (
          <Mic className="w-8 h-8 text-black" />
        )}
      </button>
    </div>
  );
};