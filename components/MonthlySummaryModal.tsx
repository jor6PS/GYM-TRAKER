
import React, { useEffect, useState } from 'react';
import { X, Sparkles, Loader2, Globe2, Dumbbell, TrendingUp, Trophy, Flame } from 'lucide-react';
import { Workout, GlobalReportData } from '../types';
import { generateGlobalReport } from '../services/workoutProcessor';
import { useLanguage } from '../contexts/LanguageContext';

interface MonthlySummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  workouts: Workout[]; // All workouts
  viewDate?: Date; // Deprecated but kept for interface compat if needed, unused now
}

const COMPARISON_IMAGES: Record<string, string> = {
  car: "https://images.unsplash.com/photo-1542282088-fe8426682b8f?q=80&w=1000&auto=format&fit=crop", // Sports Car
  animal: "https://images.unsplash.com/photo-1557050543-4d5f4e07ef46?q=80&w=1000&auto=format&fit=crop", // Elephant
  building: "https://images.unsplash.com/photo-1486744360430-659c7f191e3e?q=80&w=1000&auto=format&fit=crop", // Skyscraper
  plane: "https://images.unsplash.com/photo-1436891624125-5948000a7b97?q=80&w=1000&auto=format&fit=crop", // Plane
  rocket: "https://images.unsplash.com/photo-1517976487492-5750f3195933?q=80&w=1000&auto=format&fit=crop", // Rocket
  mountain: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=1000&auto=format&fit=crop", // Mountain
  ship: "https://images.unsplash.com/photo-1548206259-2c673eb64e97?q=80&w=1000&auto=format&fit=crop", // Ship
  default: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=1000&auto=format&fit=crop" // Gym
};

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

  // Scroll Lock Effect
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

  const getComparisonImage = (type: string | undefined) => {
      const key = type && COMPARISON_IMAGES[type] ? type : 'default';
      return COMPARISON_IMAGES[key];
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
                    
                    {/* SECTION A: GLOBAL LIFETIME (Volume Only - Full Width) */}
                    <div className="p-5 space-y-6">
                        <div className="bg-surfaceHighlight/50 border border-border rounded-2xl p-6 relative overflow-hidden group">
                            <div className="absolute -right-5 -top-5 w-32 h-32 bg-primary/10 rounded-full blur-3xl group-hover:bg-primary/20 transition-colors"></div>
                            
                            <div className="flex items-center justify-between mb-4 relative z-10">
                                <div className="flex items-center gap-2">
                                    <Dumbbell className="w-6 h-6 text-primary" />
                                    <span className="text-sm font-bold text-text uppercase tracking-widest">{t('lifetime_load')}</span>
                                </div>
                            </div>

                            <div className="text-4xl font-black text-white font-mono mb-6 text-center">
                                {Math.round(data.totalVolumeKg).toLocaleString('en-US')} <span className="text-lg text-subtext font-normal">kg</span>
                            </div>

                            {/* VISUAL COMPARISON CARD (INSTAGRAM STYLE) */}
                            <div className="relative rounded-xl overflow-hidden h-40 flex items-center justify-center border border-white/10 group shadow-lg">
                                {/* Background Image */}
                                <img 
                                    src={getComparisonImage(data.volumeType)} 
                                    alt="Comparison" 
                                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                                />
                                
                                {/* Gradient Overlay */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

                                {/* Content */}
                                <div className="relative z-10 p-4 text-center w-full">
                                    <div className="inline-block bg-primary/90 text-black text-[10px] font-bold px-2 py-0.5 rounded mb-2 uppercase tracking-wide">Equivalent to</div>
                                    <p className="text-white text-xl font-black italic leading-tight drop-shadow-md">
                                        "{data.volumeComparison}"
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-gradient-to-b from-surfaceHighlight/30 to-black rounded-2xl border border-white/5 text-center">
                            <p className="text-lg font-bold text-primary italic leading-tight">
                                "{data.globalVerdict}"
                            </p>
                        </div>
                    </div>

                    {/* SECTION B: MONTHLY ANALYSIS */}
                    <div className="border-t border-white/10 p-5 bg-black/40">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-green-400" /> 
                                {language === 'es' ? `${t('report_of')} ${data.monthName}` : `${data.monthName} Report`}
                            </h3>
                        </div>
                        
                        <div className="bg-surfaceHighlight/20 p-4 rounded-xl border border-white/5 mb-6">
                            <p className="text-sm text-zinc-300 leading-relaxed font-medium">
                                {data.monthlyAnalysisText}
                            </p>
                        </div>

                        {/* HIGHLIGHTS CARDS */}
                        {data.highlights && data.highlights.length > 0 && (
                            <div className="space-y-3 mb-6">
                                {data.highlights.map((highlight, idx) => (
                                    <div key={idx} className="bg-zinc-900 border border-white/10 rounded-xl p-4 flex gap-4 items-start relative overflow-hidden group">
                                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                                            highlight.type === 'strength' ? 'bg-primary' : 'bg-orange-400'
                                        }`}></div>

                                        <div className={`p-2 rounded-lg shrink-0 ${
                                            highlight.type === 'strength' ? 'bg-primary/10 text-primary' : 'bg-orange-400/10 text-orange-400'
                                        }`}>
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

                        {/* MONTHLY MAX LIST */}
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
                                                {entry.weight}{entry.unit}
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
