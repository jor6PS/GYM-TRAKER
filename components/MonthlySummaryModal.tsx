
import React, { useEffect, useState } from 'react';
import { X, Sparkles, Loader2, Globe2, Dumbbell, TrendingUp, Trophy, Flame, CalendarRange, Scale } from 'lucide-react';
import { Workout, GlobalReportData } from '../types';
import { generateGlobalReport } from '../services/workoutProcessor';
import { useLanguage } from '../contexts/LanguageContext';

interface MonthlySummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  workouts: Workout[];
  viewDate?: Date;
}

export const MonthlySummaryModal: React.FC<MonthlySummaryModalProps> = ({ isOpen, onClose, workouts }) => {
  const [data, setData] = useState<GlobalReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t, language } = useLanguage();

  useEffect(() => {
    if (isOpen) {
      generateReport();
    } else {
        setData(null);
        setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
      if (error) {
          const timer = setTimeout(() => setError(null), 7000);
          return () => clearTimeout(timer);
      }
  }, [error]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const generateReport = async () => {
    setLoading(true);
    setError(null);

    try {
        if (workouts.length === 0) {
            setError(t('no_data_month'));
            setLoading(false);
            return;
        }
        const reportData = await generateGlobalReport(workouts, language);
        setData(reportData);

    } catch (e: any) {
        console.error(e);
        setError(e.message || "Error al generar el reporte.");
    } finally {
        setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-lg bg-surface border border-primary/20 rounded-3xl shadow-[0_0_30px_rgba(212,255,0,0.15)] flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300 text-text overflow-hidden">
        
        <div className="flex items-center justify-between p-5 border-b border-border bg-gradient-to-r from-primary/5 to-transparent shrink-0">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-primary text-black rounded-xl shadow-glow">
                <Globe2 className="w-5 h-5" />
             </div>
             <div>
                <h3 className="text-xl font-bold text-text leading-none tracking-tight">{t('ai_report_title')}</h3>
                <p className="text-xs text-subtext font-mono mt-1 uppercase tracking-wider flex items-center gap-1">
                   {t('global_monthly_subtitle')}
                </p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surfaceHighlight rounded-full text-subtext hover:text-text transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                    <Loader2 className="w-12 h-12 text-primary animate-spin" />
                    <p className="text-sm font-mono text-subtext animate-pulse">{t('consulting_ai')}</p>
                </div>
            ) : error ? (
                <div className="p-8 flex flex-col items-center text-center">
                    <div className="bg-surface border border-red-500/50 rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 w-full">
                         <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Sparkles className="w-6 h-6 text-red-500" />
                        </div>
                        <p className="text-red-500 font-bold whitespace-pre-wrap text-sm leading-relaxed">{error}</p>
                    </div>
                </div>
            ) : data ? (
                <div className="space-y-0">
                    <div className="p-5 space-y-6">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-4 flex flex-col min-h-[140px] relative overflow-hidden group">
                                <div className="mb-2">
                                    <div className="flex items-center gap-2 mb-1 text-zinc-500">
                                        <Globe2 className="w-4 h-4" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">Global</span>
                                    </div>
                                    <div className="text-xl font-black text-zinc-300 font-mono leading-none">
                                        {(data.totalVolumeKg / 1000).toFixed(1)}k kg
                                    </div>
                                </div>
                                <div className="mt-auto pt-2 border-t border-white/5">
                                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-600 font-mono mb-1">
                                        <Scale className="w-3 h-3 text-zinc-600" /> EQUIVALENTE A:
                                    </div>
                                    <p className="text-xs font-bold text-zinc-400 italic leading-tight">
                                        {data.volumeComparison}
                                    </p>
                                </div>
                            </div>
                            <div className="bg-surfaceHighlight/50 border border-primary/20 rounded-2xl p-4 flex flex-col min-h-[140px] relative overflow-hidden group">
                                <div className="mb-2">
                                    <div className="flex items-center gap-2 mb-1 text-primary">
                                        <CalendarRange className="w-4 h-4" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">{data.monthName}</span>
                                    </div>
                                    <div className="text-xl font-black text-white font-mono leading-none">
                                        {Math.round(data.monthlyVolumeKg).toLocaleString('en-US')} kg
                                    </div>
                                </div>
                                <div className="mt-auto pt-2 border-t border-primary/10">
                                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono mb-1">
                                        <Scale className="w-3 h-3 text-zinc-400" /> EQUIVALENTE A:
                                    </div>
                                    <p className="text-sm font-bold text-white italic leading-tight">
                                        {data.monthlyVolumeComparison}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-white/10 p-5 bg-black/40">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-green-400" /> 
                                Análisis Detallado
                            </h3>
                        </div>
                        <div className="bg-surfaceHighlight/20 p-4 rounded-xl border border-white/5 mb-6">
                            <p className="text-sm text-zinc-300 leading-relaxed font-medium">
                                {data.monthlyAnalysisText}
                            </p>
                        </div>
                        {data.highlights && data.highlights.length > 0 && (
                            <div className="space-y-3 mb-6">
                                {data.highlights.map((highlight, idx) => (
                                    <div key={idx} className="bg-zinc-900 border border-white/10 rounded-xl p-4 flex gap-4 items-start relative overflow-hidden group">
                                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${highlight.type === 'strength' ? 'bg-primary' : 'bg-orange-400'}`}></div>
                                        <div className={`p-2 rounded-lg shrink-0 ${highlight.type === 'strength' ? 'bg-primary/10 text-primary' : 'bg-orange-400/10 text-orange-400'}`}>
                                            {highlight.type === 'strength' && <Trophy className="w-5 h-5" />}
                                            {highlight.type === 'consistency' && <Flame className="w-5 h-5" />}
                                        </div>
                                        <div>
                                            <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-0.5">{highlight.title}</div>
                                            <div className="text-base font-black text-white">{highlight.value}</div>
                                            <div className="text-xs text-zinc-400 mt-1 italic">"{highlight.description}"</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {data.monthlyMaxes && data.monthlyMaxes.length > 0 && (
                            <div>
                                <h3 className="text-xs font-bold text-subtext uppercase tracking-widest mb-3 flex items-center gap-2">
                                    <Dumbbell className="w-3.5 h-3.5" /> {t('monthly_maxes')}
                                </h3>
                                <div className="grid grid-cols-2 gap-2">
                                    {data.monthlyMaxes.map((entry, idx) => (
                                        <div key={idx} className="bg-zinc-900/50 border border-white/5 rounded-lg p-2.5 flex flex-col">
                                            <span className="text-xs text-zinc-400 truncate mb-1">{entry.exercise}</span>
                                            <span className="text-sm font-bold text-white font-mono">
                                                {entry.value}{entry.unit === 'reps' ? ' reps' : entry.unit}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            ) : null}
        </div>
      </div>
    </div>
  );
};
