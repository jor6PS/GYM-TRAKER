
import React from 'react';
import { Edit3 } from 'lucide-react';
import { AudioRecorder } from './AudioRecorder';
import { WorkoutData } from '../types';

interface ActionDockProps {
  label: string;
  onOpenUnified: () => void;
  onWorkoutProcessed: (data: WorkoutData) => void;
}

export const ActionDock: React.FC<ActionDockProps> = ({ label, onOpenUnified, onWorkoutProcessed }) => {
  return (
    <div className="fixed bottom-8 left-0 right-0 z-50 flex flex-col items-center justify-end pointer-events-none">
      <div className="mb-2 bg-surface/80 backdrop-blur-md px-3 py-1 rounded-full border border-border text-[10px] font-bold text-subtext tracking-widest uppercase shadow-lg animate-in fade-in slide-in-from-bottom-2">
        {label}
      </div>
      <div className="pointer-events-auto bg-surfaceHighlight/80 backdrop-blur-xl border border-border rounded-full p-2 pl-2 pr-2 shadow-[0_0_50px_rgba(0,0,0,0.5)] flex items-center gap-2 transition-transform hover:scale-105 duration-300">
        <button
          onClick={onOpenUnified}
          className="flex items-center justify-center w-14 h-14 rounded-full bg-surface hover:bg-surfaceHighlight border border-border text-subtext hover:text-text transition-all group"
          title="Input / Clone"
        >
           <Edit3 className="w-6 h-6 group-hover:text-primary transition-colors" />
        </button>
        <div className="w-px h-8 bg-border"></div>
        <AudioRecorder onWorkoutProcessed={onWorkoutProcessed} />
      </div>
    </div>
  );
};
