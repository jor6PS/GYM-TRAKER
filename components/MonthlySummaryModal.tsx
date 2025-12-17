
import React, { useEffect, useState, useMemo } from 'react';
import { X, Sparkles, Loader2, Globe2, Dumbbell, TrendingUp, CalendarRange, Scale, ShieldAlert, LineChart, Target, Zap, AlertTriangle, ChevronRight, Activity, Radar } from 'lucide-react';
import { Workout, GlobalReportData } from '../types';
import { generateGlobalReport } from '../services/workoutProcessor';
import { useLanguage } from '../contexts/LanguageContext';

interface MonthlySummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  workouts: Workout[];
  viewDate?: Date;
}

/**
 * DossierRenderer: Parsea el markdown de la IA en bloques de UI técnicos.
 * Ahora distingue correctamente entre negritas al inicio de línea y bullets.
 */
const DossierRenderer = ({ text }: { text: string }) => {
  if (!text) return null;

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  const renderFormattedText = (content: string) => {
    // Procesar Negritas **texto**
    const parts = content.split(/(\*\*.*?\*\*)/g);
    
    return (
      <>
        {parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            const boldText = part.slice(2, -2).trim();
            const isAlert = boldText.includes('ALERTA ROJA');
            return (
              <strong 
                key={i} 
                className={isAlert ? "text-red-500 font-black animate-pulse" : "text-white font-bold"}
              >
                {boldText}
              </strong>
            );
          }
          return part;
        })}
      </>
    );
  };

  return (
    <div className="space-y-6">
      {lines.map((line, idx) => {
        // 1. Detección de Headers (Si empieza por # o es solo una línea en negrita sin ":"")
        const isHeader = line.startsWith('#') || (line.startsWith('**') && line.endsWith('**') && !line.includes(':'));
        
        if (isHeader) {
          const title = line.replace(/[#\*]/g, '').trim();
          let icon = <ChevronRight className="w-4 h-4 text-primary" />;
          
          const upperT = title.toUpperCase();
          if (upperT.includes('AUDITORÍA') || upperT.includes('GUERRA') || upperT.includes('FORENSE')) icon = <ShieldAlert className="w-5 h-5 text-primary" />;
          if (upperT.includes('EVOLUCIÓN')) icon = <LineChart className="w-5 h-5 text-blue-400" />;
          if (upperT.includes('VEREDICTO') || upperT.includes('ATAQUE')) icon = <Target className="w-5 h-5 text-yellow-400" />;

          return (
            <div key={idx} className="flex items-center gap-3 pt-6 border-b border-white/5 pb-2 first:pt-0">
               {icon}
               <h4 className="text-sm font-black uppercase tracking-widest text-white">{title}</h4>
            </div>
          );
        }

        // 2. Detección de Bullets (Obligatorio espacio después del marcador para no confundir con **)
        const isBullet = /^([\*\-\•]\s+)/.test(line) || /^\d+\.\s+/.test(line);
        
        if (isBullet) {
          const content = line.replace(/^([\*\-\•\s]+|\d+\.\s*)/, '').trim();
          return (
            <div key={idx} className="flex gap-3 pl-2 group">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0 group-hover:scale-125 transition-transform" />
              <p className="text-sm text-zinc-400 leading-relaxed font-sans">
                {renderFormattedText(content)}
              </p>
            </div>
          );
        }

        // 3. Texto normal (Aquí entraría el "**Nota: 4/10**")
        return (
          <p key={idx} className="text-sm text-zinc-500 leading-relaxed pl-1">
            {renderFormattedText(line)}
          </p>
        );
      })}
    </div>
  );
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={onClose} />
      
      <div className="relative w-full max-w-lg bg-surface border border-primary/20 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col h-[90vh] animate-in zoom-in-95 duration-300 text-text overflow-hidden">
        
        {/* Dossier Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-zinc-900 shrink-0 relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent"></div>
          <div className="flex items-center gap-4">
             <div className="p-2.5 bg-primary text-black rounded-xl shadow-glow">
                <ShieldAlert className="w-6 h-6" />
             </div>
             <div>
                <h3 className="text-xl font-black text-white italic tracking-tighter uppercase leading-none">
                  {t('ai_report_title')}
                </h3>
                <p className="text-[10px] text-zinc-500 font-mono mt-1.5 uppercase tracking-[0.2em]">
                   Auditoría Forense • {data?.monthName || 'Mes Actual'}
                </p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-zinc-500 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Dossier Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-0 bg-[#0a0a0a]">
            {loading ? (
                <div className="flex flex-col items-center justify-center py-32 space-y-6">
                    <div className="relative">
                        <Radar className="w-16 h-16 text-primary animate-spin duration-[4s]" />
                        <Activity className="absolute inset-0 m-auto w-6 h-6 text-primary animate-pulse" />
                    </div>
                    <div className="text-center">
                        <p className="text-xs font-mono text-primary uppercase tracking-[0.3em] mb-2">Analizando Datos...</p>
                        <p className="text-[10px] text-zinc-600 font-mono">Buscando debilidades estructurales</p>
                    </div>
                </div>
            ) : error ? (
                <div className="p-10 flex flex-col items-center text-center">
                    <AlertTriangle className="w-12 h-12 text-red-500 mb-4 animate-bounce" />
                    <p className="text-red-500 font-bold text-sm leading-relaxed uppercase font-mono">{error}</p>
                </div>
            ) : data ? (
                <div className="pb-12">
                    {/* COMPARATIVAS MASIVAS */}
                    <div className="p-6 grid grid-cols-2 gap-4">
                        <div className="bg-zinc-900 border border-white/5 rounded-2xl p-4 relative group">
                            <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Carga Histórica</div>
                            <div className="text-2xl font-black text-white font-mono tracking-tighter">{(data.totalVolumeKg / 1000).toFixed(1)}k <span className="text-xs text-zinc-600 font-normal">KG</span></div>
                            <div className="mt-2 text-xs text-primary font-black italic uppercase truncate">
                                {data.volumeComparison}
                            </div>
                        </div>
                        <div className="bg-zinc-900 border border-primary/10 rounded-2xl p-4 relative group">
                            <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Carga Mensual</div>
                            <div className="text-2xl font-black text-primary font-mono tracking-tighter">{Math.round(data.monthlyVolumeKg).toLocaleString()} <span className="text-xs text-zinc-600 font-normal">KG</span></div>
                            <div className="mt-2 text-xs text-white font-black italic uppercase truncate">
                                {data.monthlyVolumeComparison}
                            </div>
                        </div>
                    </div>

                    {/* DOSSIER ANALÍTICO */}
                    <div className="px-6">
                        <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 shadow-inner">
                            <DossierRenderer text={data.monthlyAnalysisText} />
                        </div>
                    </div>

                    {/* EFFICIENCY SCORE */}
                    <div className="px-6 mt-6">
                        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 flex flex-col items-center">
                             <div className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.4em] mb-4">Programming Score</div>
                             <div className="flex items-end gap-1">
                                <span className="text-6xl font-black text-white italic tracking-tighter">{data.efficiencyScore}</span>
                                <span className="text-xl font-black text-primary italic mb-2">/ 10</span>
                             </div>
                             <div className="w-full h-1.5 bg-zinc-800 mt-6 rounded-full overflow-hidden">
                                <div className="h-full bg-primary shadow-glow transition-all duration-1000" style={{ width: `${data.efficiencyScore * 10}%` }}></div>
                             </div>
                        </div>
                    </div>

                    {/* CATÁLOGO DE MÁXIMOS */}
                    {data.monthlyMaxes && data.monthlyMaxes.length > 0 && (
                        <div className="mt-10 px-6">
                            <div className="flex items-center gap-2 mb-4">
                                <Dumbbell className="w-4 h-4 text-zinc-600" />
                                <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Catálogo de Máximos del Mes</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {data.monthlyMaxes.map((entry, idx) => (
                                    <div key={idx} className="bg-zinc-900/40 border border-white/5 rounded-xl p-3 flex flex-col justify-between hover:border-primary/20 transition-colors">
                                        <div className="text-[9px] text-zinc-600 truncate mb-1 uppercase font-bold">{entry.exercise}</div>
                                        <div className="text-sm font-black text-white font-mono flex items-baseline gap-1">
                                            {entry.value}
                                            <span className="text-[9px] text-zinc-500 uppercase">{entry.unit}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : null}
        </div>
      </div>
    </div>
  );
};
