
import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader2, Send, Zap } from 'lucide-react';
import { processWorkoutText } from '../services/workoutProcessor';
import { WorkoutData, Exercise } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

interface ManualEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWorkoutProcessed: (data: WorkoutData) => void;
}

export const ManualEntryModal: React.FC<ManualEntryModalProps> = ({ 
  isOpen, 
  onClose, 
  onWorkoutProcessed 
}) => {
  const [text, setText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useLanguage();

  // Auto-dismiss error after 7 seconds
  useEffect(() => {
    if (error) {
        const timer = setTimeout(() => {
            setError(null);
        }, 7000);
        return () => clearTimeout(timer);
    }
  }, [error]);

  // --- LOCAL PARSER LOGIC (OFFLINE) ---
  const localData = useMemo<WorkoutData | null>(() => {
    if (!text.trim()) return null;

    const lines = text.split(/\n/);
    const detectedExercises: Exercise[] = [];

    for (const line of lines) {
        const cleanLine = line.trim();
        if (!cleanLine) continue;

        const setRepRegex = /(\d+)\s*(?:x|\*|sets?|series?)\s*(\d+)/i;
        const setRepMatch = cleanLine.match(setRepRegex);
        const weightRegex = /(\d+(?:\.\d+)?)\s*(kg|lbs|lb|kilos)?/i;
        let lineWithoutSets = cleanLine;
        if (setRepMatch) lineWithoutSets = cleanLine.replace(setRepMatch[0], '');
        const weightMatch = lineWithoutSets.match(weightRegex);
        let name = cleanLine;
        if (setRepMatch) name = name.replace(setRepMatch[0], '');
        if (weightMatch) name = name.replace(weightMatch[0], '');
        name = name.replace(/[-–:;]/g, '').trim();

        if (name.length > 2 && (setRepMatch || weightMatch)) {
            const sets = setRepMatch ? parseInt(setRepMatch[1]) : 3;
            const reps = setRepMatch ? parseInt(setRepMatch[2]) : 10;
            const weight = weightMatch ? parseFloat(weightMatch[1]) : 0;
            const unit = weightMatch && weightMatch[2] ? weightMatch[2].toLowerCase() : 'kg';
            const finalUnit = unit.includes('lb') ? 'lbs' : 'kg';

            detectedExercises.push({
                name: name.charAt(0).toUpperCase() + name.slice(1),
                sets: Array(sets).fill({ reps: reps, weight: weight, unit: finalUnit })
            });
        }
    }

    if (detectedExercises.length === 0) return null;
    return { exercises: detectedExercises, notes: "Offline Auto-Parse" };
  }, [text]);

  if (!isOpen) return null;

  const handleSubmitAI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    setIsProcessing(true);
    setError(null);

    try {
      const data = await processWorkoutText(text);
      onWorkoutProcessed(data);
      setText('');
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to process text.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveLocal = () => {
      if (localData) {
          onWorkoutProcessed(localData);
          setText('');
          onClose();
      }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-surface border border-white/10 rounded-2xl shadow-[0_0_20px_rgba(250,204,21,0.1)] overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-300 flex flex-col max-h-[90vh]">
        
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black shrink-0">
          <h3 className="text-lg font-bold text-primary font-mono uppercase tracking-widest">{t('input_log')}</h3>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition-colors text-subtext hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-black p-4 space-y-4">
          <div className="relative group">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="> Press banca 3x10 80kg&#10;> Sentadillas 4x12"
              className="w-full h-32 bg-zinc-900/30 border border-white/10 rounded p-4 text-text placeholder:text-zinc-700 font-mono text-sm focus:outline-none focus:border-primary/70 focus:bg-zinc-900/50 resize-none transition-colors"
              autoFocus
              disabled={isProcessing}
            />
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-primary/30 group-focus-within:border-primary"></div>
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-primary/30 group-focus-within:border-primary"></div>
          </div>

          {localData && (
              <div className="bg-zinc-900/80 border border-primary/30 rounded-xl p-3 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
                          <Zap className="w-3 h-3 fill-current" />
                          Offline Preview
                      </div>
                      <span className="text-[10px] text-zinc-500 bg-white/5 px-2 py-0.5 rounded">0 AI Credits</span>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                      {localData.exercises.map((ex, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-black/40 p-2 rounded border border-white/5">
                              <span className="text-sm text-white font-medium">{ex.name}</span>
                              <span className="text-xs text-zinc-400 font-mono">{ex.sets.length} x {ex.sets[0].reps} @ {ex.sets[0].weight}{ex.sets[0].unit}</span>
                          </div>
                      ))}
                  </div>
              </div>
          )}

          {error && (
            <div className="bg-surface border border-red-500/50 rounded-xl p-4 shadow-xl animate-in zoom-in-95">
              <div className="text-red-500 font-mono text-xs whitespace-pre-wrap text-center leading-relaxed">
                <span className="font-bold block mb-1 text-sm">ERROR DE PROCESAMIENTO</span>
                {error}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-white/10 bg-black shrink-0 flex flex-col gap-2">
            {localData && (
                <button onClick={handleSaveLocal} className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primaryHover text-black font-bold font-mono text-xs uppercase tracking-wider rounded shadow-glow active:scale-95 transition-all group">
                    <Zap className="w-4 h-4 fill-black group-hover:scale-110 transition-transform" />
                    Fast Save (Offline)
                </button>
            )}

            <div className="flex gap-2">
                <button onClick={onClose} disabled={isProcessing} className="flex-1 px-4 py-3 text-xs font-mono font-bold text-subtext hover:text-white transition-colors uppercase border border-white/10 rounded hover:bg-white/5">
                    {t('abort')}
                </button>

                <button
                    onClick={handleSubmitAI}
                    disabled={!text.trim() || isProcessing}
                    className={`flex-[2] flex items-center justify-center gap-2 px-6 py-3 font-bold font-mono text-xs uppercase tracking-wider rounded transition-all active:scale-95 ${localData ? "bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700" : "bg-primary text-black hover:bg-primaryHover shadow-glow"} disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed`}
                >
                    {isProcessing ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('processing')}</> : <><Send className="w-4 h-4" /> {localData ? "Use AI (Advanced)" : "Process with AI"}</>}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};
