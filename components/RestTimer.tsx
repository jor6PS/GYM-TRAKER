import React, { useState, useEffect, useRef } from 'react';
import { Timer, X, Minus, Plus, Play, Pause, RotateCcw } from 'lucide-react';
import { clsx } from 'clsx';

export const RestTimer: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0); // in seconds
  const [isActive, setIsActive] = useState(false);
  const [initialTime, setInitialTime] = useState(60);
  const intervalRef = useRef<number | null>(null);

  // Audio Context for Beep
  const playBeep = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5);
      
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
      console.error("Audio play failed", e);
    }
  };

  useEffect(() => {
    if (isActive && timeLeft > 0) {
      intervalRef.current = window.setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isActive) {
      setIsActive(false);
      playBeep();
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, timeLeft]);

  const toggleTimer = () => setIsActive(!isActive);
  
  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(initialTime);
  };

  const addTime = (seconds: number) => {
    setTimeLeft(prev => prev + seconds);
    if (!isActive) setInitialTime(prev => prev + seconds);
  };

  const setPreset = (seconds: number) => {
    setInitialTime(seconds);
    setTimeLeft(seconds);
    setIsActive(true);
    setIsOpen(true);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className={clsx(
          "w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg border border-white/10 relative overflow-hidden group",
          isActive ? "bg-black text-primary border-primary" : "bg-surfaceHighlight text-zinc-400 hover:text-white"
        )}
      >
        {isActive && (
            <div className="absolute bottom-0 left-0 h-1 bg-primary transition-all duration-1000" style={{ width: `${(timeLeft / initialTime) * 100}%` }}></div>
        )}
        <Timer className={clsx("w-5 h-5", isActive && "animate-pulse")} />
      </button>
    );
  }

  return (
    <div className="bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-[0_0_30px_rgba(0,0,0,0.5)] w-[280px] animate-in slide-in-from-bottom-5 fade-in zoom-in-95 origin-bottom-center relative overflow-hidden">
        {/* Progress Background */}
        {isActive && (
            <div className="absolute inset-0 bg-primary/5 pointer-events-none z-0" style={{ transform: `scaleX(${timeLeft / initialTime})`, transformOrigin: 'left', transition: 'transform 1s linear' }}></div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-4 relative z-10">
            <span className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest">Rest Timer</span>
            <button onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        {/* Time Display */}
        <div className="flex items-center justify-center gap-4 mb-4 relative z-10">
            <button onClick={() => addTime(-10)} className="p-2 bg-white/5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white"><Minus className="w-4 h-4" /></button>
            <div className={clsx("text-4xl font-bold font-mono tabular-nums tracking-tighter", isActive ? "text-primary text-shadow-glow" : "text-white")}>
                {formatTime(timeLeft)}
            </div>
            <button onClick={() => addTime(10)} className="p-2 bg-white/5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white"><Plus className="w-4 h-4" /></button>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3 mb-4 relative z-10">
            <button 
                onClick={toggleTimer} 
                className={clsx(
                    "w-12 h-12 rounded-full flex items-center justify-center transition-all",
                    isActive ? "bg-zinc-800 text-white border border-white/10" : "bg-primary text-black shadow-glow"
                )}
            >
                {isActive ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
            </button>
            <button onClick={resetTimer} className="p-3 bg-white/5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white"><RotateCcw className="w-4 h-4" /></button>
        </div>

        {/* Presets */}
        <div className="grid grid-cols-4 gap-2 relative z-10">
            {[30, 60, 90, 180].map(t => (
                <button 
                    key={t} 
                    onClick={() => setPreset(t)}
                    className="bg-white/5 hover:bg-white/10 border border-white/5 rounded py-1.5 text-[10px] font-bold text-zinc-400 hover:text-primary transition-colors font-mono"
                >
                    {t >= 60 ? `${t/60}m` : `${t}s`}
                </button>
            ))}
        </div>
    </div>
  );
};