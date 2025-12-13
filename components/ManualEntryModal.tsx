import React, { useState } from 'react';
import { X, Loader2, Send } from 'lucide-react';
import { processWorkoutText } from '../services/workoutProcessor';
import { WorkoutData } from '../types';

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

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    setIsProcessing(true);
    setError(null);

    try {
      const data = await processWorkoutText(text);
      onWorkoutProcessed(data);
      setText('');
      onClose();
    } catch (err) {
      setError("Failed to process text. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-lg bg-surface border border-white/10 rounded shadow-[0_0_20px_rgba(250,204,21,0.1)] overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-300">
        
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black">
          <h3 className="text-lg font-bold text-primary font-mono uppercase tracking-widest">Input Data Log</h3>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded transition-colors text-subtext hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 bg-black">
          <div className="relative group">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="> Initialize log: 3 sets of bench press 80kg..."
              className="w-full h-40 bg-zinc-900/30 border border-white/10 rounded p-4 text-text placeholder:text-zinc-700 font-mono text-sm focus:outline-none focus:border-primary/70 focus:bg-zinc-900/50 resize-none transition-colors"
              autoFocus
              disabled={isProcessing}
            />
            {/* Corner Accents */}
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-primary/30 group-focus-within:border-primary"></div>
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-primary/30 group-focus-within:border-primary"></div>
          </div>

          {error && (
            <div className="text-red-500 font-mono text-xs px-2 flex items-center gap-2 border-l-2 border-red-500 bg-red-900/10 py-1">
              <span>ERROR:</span>
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 text-xs font-mono font-bold text-subtext hover:text-white transition-colors uppercase"
            >
              Abort
            </button>
            <button
              type="submit"
              disabled={!text.trim() || isProcessing}
              className="flex items-center gap-2 px-6 py-2 bg-primary hover:bg-primaryHover text-black font-bold font-mono text-xs uppercase tracking-wider rounded shadow-glow disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed active:scale-95 transition-all"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Submit_Log
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};