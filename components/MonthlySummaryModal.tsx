
import React, { useEffect, useState } from 'react';
import { X, Sparkles, Loader2, Globe2, Dumbbell, MapPin, Quote, TrendingUp, Trophy, Flame, Zap } from 'lucide-react';
import { Workout } from '../types';
import { generateGlobalReport, GlobalReportData } from '../services/workoutProcessor';
import { useLanguage } from '../contexts/LanguageContext';

interface MonthlySummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  workouts: Workout[]; // All workouts
  viewDate?: Date; // Deprecated but kept for interface compat if needed, unused now
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

  const generateReport = async () => {
    setLoading(true);
    setError(null);

    try {
        if (workouts.length === 0) {
            setError(t('no_data_month')); // Reuse error string, implies no data
            setLoading(false);
            return;
        }

        const reportData = await generateGlobalReport(workouts, language);
        setData(reportData);

    } catch (e: any) {
        console.error(e);
        setError("La IA está descansando entre series. Intenta de nuevo.");
    } finally {
        setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-lg bg-surface border border-primary/20 rounded-3xl shadow-[0_0_30px_rgba(212,255,0,0.15)] flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300 text-text overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-gradient-to-r from-primary/5 to-transparent shrink-0">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-primary text-black rounded-xl shadow-glow">
                <Globe2 className="w-5 h-5" />
             </div>
             <div>
                <h3 className="text-xl font-bold text-text leading-none tracking-tight">AI Report</h3>
                <p className="text-xs text-subtext font-mono mt-1 uppercase tracking-wider flex items-center gap-1">
                   Global & Monthly
                </p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surfaceHighlight rounded-full text-subtext hover:text-text transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Scrollable Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                    <Loader2 className="w-12 h-12 text-primary animate-spin" />
                    <p className="text-sm font-mono text-subtext animate-pulse">{t('consulting_ai')}</p>
                </div>
            ) : error ? (
                <div className="p-8 flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                        <Sparkles className="w-8 h-8 text-red-500" />
                    </div>
                    <p className="text-red-500 font-bold">{error}</p>
                </div>
            ) : data ? (
                <div className="space-y-0">
                    
                    {/* SECTION A: GLOBAL LIFETIME */}
                    <div className="p-5 space-y-6">
                        <div className="bg-surfaceHighlight/50 border border-border rounded-2xl p-5 relative overflow-hidden group">
                            <div className="absolute -right-5 -top-5 w-24 h-24 bg-primary/10 rounded-full blur-2xl group-hover:bg-primary/20 transition-colors"></div>
                            
                            <div className="flex items-center justify-between mb-4 relative z-10">
                                <div className="flex items-center gap-2">
                                    <Dumbbell className="w-5 h-5 text-primary" />
                                    <span className="text-sm font-bold text-text uppercase tracking-widest">Total Volume</span>
                                </div>
                            </div>

                            <div className="text-3xl font-black text-white font-mono mb-6">
                                {Math.round(data.totalVolumeKg).toLocaleString('en-US')} <span className="text-base text-subtext font-normal">kg</span>
                            </div>

                            <div className="bg-black/30 rounded-xl p-4 border border-white/5 flex items-center gap-4">
                                <div className="text-4xl">{data.volumeEmoji}</div>
                                <div className="text-sm text-zinc-300 font-medium italic leading-relaxed">
                                    "{data.volumeComparison}"
                                </div>
                            </div>
                        </div>

                        <div className="bg-surfaceHighlight/50 border border-border rounded-2xl p-5 relative overflow-hidden group">
                             <div className="absolute -right-5 -top-5 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-colors"></div>

                            <div className="flex items-center justify-between mb-4 relative z-10">
                                <div className="flex items-center gap-2">
                                    <MapPin className="w-5 h-5 text-blue-400" />
                                    <span className="text-sm font-bold text-text uppercase tracking-widest">Total Distance</span>
                                </div>
                            </div>

                            <div className="text-3xl font-black text-white font-mono mb-6">
                                {data.totalDistanceKm.toFixed(2)} <span className="text-base text-subtext font-normal">km</span>
                            </div>

                            <div className="bg-black/30 rounded-xl p-4 border border-white/5 flex items-center gap-4">
                                <div className="text-4xl">{data.distanceEmoji}</div>
                                <div className="text-sm text-zinc-300 font-medium italic leading-relaxed">
                                    "{data.distanceComparison}"
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-gradient-to-b from-surfaceHighlight/30 to-black rounded-2xl border border-white/5 text-center">
                            <p className="text-lg font-bold text-primary italic leading-tight">
                                "{data.globalVerdict}"
                            </p>
                        </div>
                    </div>

                    {/* SECTION B: MONTHLY ANALYSIS (Divider style) */}
                    <div className="border-t border-white/10 p-5 bg-black/40">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-green-400" /> {data.monthName} Report
                            </h3>
                        </div>
                        
                        <div className="bg-surfaceHighlight/20 p-4 rounded-xl border border-white/5 mb-6">
                            <p className="text-sm text-zinc-300 leading-relaxed font-medium">
                                {data.monthlyAnalysisText}
                            </p>
                        </div>

                        {/* HIGHLIGHTS CARDS */}
                        {data.highlights && data.highlights.length > 0 && (
                            <div className="space-y-3">
                                {data.highlights.map((highlight, idx) => (
                                    <div key={idx} className="bg-zinc-900 border border-white/10 rounded-xl p-4 flex gap-4 items-start relative overflow-hidden group">
                                        {/* Colored Accent based on type */}
                                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                                            highlight.type === 'strength' ? 'bg-primary' : 
                                            highlight.type === 'cardio' ? 'bg-blue-400' : 'bg-orange-400'
                                        }`}></div>

                                        <div className={`p-2 rounded-lg shrink-0 ${
                                            highlight.type === 'strength' ? 'bg-primary/10 text-primary' : 
                                            highlight.type === 'cardio' ? 'bg-blue-400/10 text-blue-400' : 'bg-orange-400/10 text-orange-400'
                                        }`}>
                                            {highlight.type === 'strength' && <Trophy className="w-5 h-5" />}
                                            {highlight.type === 'cardio' && <Zap className="w-5 h-5" />}
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
                    </div>

                </div>
            ) : null}
        </div>

      </div>
    </div>
  );
};
