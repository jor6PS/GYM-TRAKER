
import React, { useEffect, useState } from 'react';
import { X, ShieldAlert, AlertTriangle, ChevronRight, Radar, Dumbbell, Zap, TrendingUp, Search, Info, Scale, Trophy, ArrowUpRight, Target } from 'lucide-react';
import { Workout, GlobalReportData, User, MaxComparisonEntry } from '../types';
import { generateGlobalReport } from '../services/workoutProcessor';
import { useLanguage } from '../contexts/LanguageContext';
import { AppLogo } from '../utils';

interface MonthlySummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  workouts: Workout[];
  currentUser: User;
}

const DossierRenderer = ({ text }: { text: string }) => {
  if (!text) return null;
  
  // Procesador de líneas para manejar tablas y formato
  const lines = text.split('\n').map(l => l.trim());
  const elements: React.ReactNode[] = [];
  
  const renderFormattedText = (content: string) => {
    const parts = content.split(/(\*\*.*?\*\*)/g);
    return (
      <>{parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            const boldText = part.slice(2, -2).trim();
            const isCritical = boldText.toUpperCase().includes('ALERTA ROJA') || boldText.toUpperCase().includes('CRÍTICO') || boldText.toUpperCase().includes('ERROR');
            const isHighlight = boldText.toUpperCase().includes('SANDBAGGING') || boldText.toUpperCase().includes('VEREDICTO');

            if (isCritical) {
                return (
                    <strong key={i} className="text-red-500 font-black bg-red-500/10 px-2 py-0.5 rounded border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.4)] inline-block my-1 animate-pulse">
                        ⚠️ {boldText}
                    </strong>
                );
            }

            return (
              <strong key={i} className={isHighlight ? "text-primary font-black underline decoration-primary/30" : "text-white font-bold"}>
                {boldText}
              </strong>
            );
          }
          return part;
        })}</>
    );
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    
    if (!line) {
      i++;
      continue;
    }

    // DETECCIÓN DE TABLAS
    if (line.startsWith('|')) {
      const tableRows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        // Ignorar líneas de separación |---|
        if (!lines[i].includes('---')) {
          const cells = lines[i]
            .split('|')
            .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
            .map(c => c.trim());
          tableRows.push(cells);
        }
        i++;
      }

      if (tableRows.length > 0) {
        elements.push(
          <div key={`table-${i}`} className="my-6 overflow-hidden rounded-xl border border-white/10 bg-black/40">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  {tableRows[0].map((cell, idx) => (
                    <th key={idx} className="px-4 py-3 font-black text-primary uppercase tracking-widest">{cell}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {tableRows.slice(1).map((row, rowIdx) => (
                  <tr key={rowIdx} className="hover:bg-white/5 transition-colors">
                    {row.map((cell, cellIdx) => (
                      <td key={cellIdx} className="px-4 py-3 font-mono text-zinc-300">{renderFormattedText(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // TÍTULOS PRINCIPALES (##)
    if (line.startsWith('## ')) {
      const title = line.replace('## ', '').trim();
      elements.push(
        <div key={i} className="flex items-center gap-3 pt-8 border-b border-white/10 pb-2 first:pt-0">
           <Target className="w-4 h-4 text-primary" />
           <h4 className="text-sm font-black uppercase tracking-[0.25em] text-white italic">{title}</h4>
        </div>
      );
      i++;
      continue;
    }

    // SUBTÍTULOS (###)
    if (line.startsWith('### ')) {
      const subtitle = line.replace('### ', '').trim();
      elements.push(
        <div key={i} className="pt-4 mb-2">
            <h5 className="text-xs font-black text-zinc-400 uppercase tracking-widest border-l-2 border-zinc-700 pl-3">{subtitle}</h5>
        </div>
      );
      i++;
      continue;
    }

    // LISTAS O PÁRRAFOS DESTACADOS
    if (/^[A-G]\)\s/.test(line) || /^\d\.\s/.test(line)) {
      elements.push(
        <div key={i} className="bg-white/5 border-l-2 border-primary p-4 rounded-r-2xl mt-2 shadow-lg">
            <p className="text-sm font-bold text-white tracking-wide leading-relaxed">{renderFormattedText(line)}</p>
        </div>
      );
      i++;
      continue;
    }

    // PUNTOS DE BALA
    if (/^(\*\s|\-\s|\•\s)/.test(line)) {
      const content = line.replace(/^(\*\s|\-\s|\•\s)/, '').trim();
      elements.push(
        <div key={i} className="flex gap-3 pl-2 group">
          <div className="mt-2 w-1.5 h-1.5 rounded-full bg-primary/40 group-hover:bg-primary shrink-0 transition-colors shadow-[0_0_5px_rgba(212,255,0,0.3)]" />
          <p className="text-sm text-zinc-400 leading-relaxed font-medium">{renderFormattedText(content)}</p>
        </div>
      );
      i++;
      continue;
    }

    // TEXTO NORMAL / PÁRRAFOS
    elements.push(
      <div key={i} className="flex gap-3">
         <div className="w-0.5 h-auto bg-zinc-800 rounded-full shrink-0" />
         <p className="text-sm text-zinc-500 leading-relaxed italic">{renderFormattedText(line)}</p>
      </div>
    );
    i++;
  }

  return <div className="space-y-6 font-sans selection:bg-primary selection:text-black">{elements}</div>;
};

export const MonthlySummaryModal: React.FC<MonthlySummaryModalProps> = ({ isOpen, onClose, workouts, currentUser }) => {
  const [data, setData] = useState<GlobalReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t, language } = useLanguage();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = 'var(--scrollbar-width, 0px)';
      generateReport();
    } else {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
      setData(null); 
      setError(null);
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [isOpen]);

  const generateReport = async () => {
    setLoading(true);
    setError(null);
    try {
      if (workouts.length === 0) {
        setError("NO HAY DATOS SUFICIENTES. El Juez del Hierro exige al menos un entrenamiento.");
        setLoading(false);
        return;
      }
      const reportData = await generateGlobalReport(workouts, language, currentUser.weight || 80, currentUser.height || 180);
      setData(reportData);
    } catch (e: any) {
      setError(e.message || "ERROR CRÍTICO: La conexión con la IA se ha perdido.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/98 backdrop-blur-2xl" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-surface border border-primary/20 rounded-3xl shadow-[0_0_100px_rgba(0,0,0,1)] flex flex-col h-[92vh] animate-in zoom-in-95 duration-300 text-text overflow-hidden">
        
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-zinc-900 shrink-0 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-transparent to-primary opacity-60"></div>
          <div className="flex items-center gap-4">
             <div className="p-2.5 bg-primary text-black rounded-xl shadow-glow"><ShieldAlert className="w-6 h-6" /></div>
             <div>
                <h3 className="text-xl font-black text-white italic tracking-tighter uppercase leading-none">Crónicas del Hierro</h3>
                <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-[0.3em]">AUDITORÍA FORENSE: {currentUser.name.toUpperCase()}</span>
                </div>
             </div>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-600 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-0 bg-[#050505]">
            {loading ? (
                <div className="flex flex-col items-center justify-center py-40 space-y-12 animate-in fade-in duration-500">
                    <div className="relative">
                        <div className="w-32 h-32 rounded-full border border-primary/10 flex items-center justify-center relative overflow-hidden bg-black shadow-[0_0_50px_rgba(212,255,0,0.05)]">
                            <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-transparent animate-spin-slow"></div>
                            <Radar className="w-14 h-14 text-primary" />
                            <div className="absolute inset-0 border border-primary/40 rounded-full animate-ping opacity-20 scale-90"></div>
                        </div>
                    </div>
                    <div className="flex flex-col items-center gap-4">
                        <p className="text-[10px] font-mono text-primary uppercase tracking-[0.8em] animate-pulse">Consultando al Entrenador...</p>
                        <div className="w-40 h-[2px] bg-zinc-900 rounded-full overflow-hidden">
                            <div className="h-full bg-primary w-1/3 animate-progress-loop shadow-glow"></div>
                        </div>
                    </div>
                </div>
            ) : error ? (
                <div className="p-10 text-center space-y-6 flex flex-col items-center justify-center h-full">
                    <AlertTriangle className="w-20 h-20 text-red-500 mb-2" />
                    <p className="text-red-500 font-black uppercase font-mono tracking-widest text-lg italic">Fallo de Auditoría</p>
                    <p className="text-zinc-500 text-sm italic leading-relaxed">{error}</p>
                </div>
            ) : data ? (
                <div className="pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* Sección 1: Equivalencias Absurdas */}
                    <div className="p-6 grid grid-cols-1 gap-4">
                        <div className="bg-zinc-900/90 border border-white/5 rounded-2xl p-5 shadow-2xl relative overflow-hidden group">
                            <div className="flex items-center gap-2 mb-3">
                                <Scale className="w-4 h-4 text-zinc-500" />
                                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Legado Global Acumulado</span>
                            </div>
                            <div className="text-3xl font-black text-white font-mono tracking-tighter">{(data.totalVolumeKg / 1000).toFixed(1)} toneladas</div>
                            <div className="mt-3 text-[11px] text-primary font-black italic uppercase leading-tight bg-primary/5 p-3 rounded-xl border border-primary/10 flex items-center gap-3">
                                <ArrowUpRight className="w-4 h-4 shrink-0" />
                                <span>Equivalencia: {data.volumeEquivalentGlobal}</span>
                            </div>
                        </div>

                        <div className="bg-zinc-900/90 border border-primary/20 rounded-2xl p-5 shadow-2xl relative overflow-hidden group">
                            <div className="flex items-center gap-2 mb-3">
                                <Zap className="w-4 h-4 text-primary" />
                                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Campaña {data.monthName}</span>
                            </div>
                            <div className="text-3xl font-black text-primary font-mono tracking-tighter">{(data.monthlyVolumeKg / 1000).toFixed(1)} toneladas</div>
                            <div className="mt-3 text-[11px] text-white font-black italic uppercase leading-tight bg-white/5 p-3 rounded-xl border border-white/10 flex items-center gap-3">
                                <Target className="w-4 h-4 shrink-0" />
                                <span>Equivalencia: {data.volumeEquivalentMonthly}</span>
                            </div>
                        </div>
                    </div>

                    {/* Sección 2: Tabla de Máximos */}
                    <div className="px-6 mb-10">
                         <div className="flex items-center gap-2 mb-4 px-2">
                            <Trophy className="w-4 h-4 text-yellow-500" />
                            <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.4em]">Tabla de Máximos del Mes</h4>
                         </div>
                         <div className="bg-zinc-900/50 border border-white/5 rounded-2xl overflow-hidden shadow-xl">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-white/5 text-[9px] font-mono text-zinc-500 uppercase tracking-widest border-b border-white/5">
                                    <tr>
                                        <th className="px-4 py-3">Ejercicio</th>
                                        <th className="px-4 py-3 text-center">Mes</th>
                                        <th className="px-4 py-3 text-center">Global</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {data.maxComparison.map((max, idx) => {
                                        const isNewRecord = max.monthlyMax >= max.globalMax;
                                        return (
                                            <tr key={idx} className="hover:bg-white/5 transition-colors">
                                                <td className="px-4 py-3 font-bold text-zinc-300">{max.exercise}</td>
                                                <td className="px-4 py-3 text-center font-mono font-black text-white">
                                                    {max.monthlyMax}
                                                    <span className="text-[8px] text-zinc-600 ml-1 uppercase">{max.unit}</span>
                                                </td>
                                                <td className="px-4 py-3 text-center font-mono text-zinc-500 relative">
                                                    {max.globalMax}
                                                    <span className="text-[8px] ml-1 uppercase">{max.unit}</span>
                                                    {isNewRecord && <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-primary rounded-full animate-pulse shadow-glow"></div>}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                         </div>
                    </div>

                    {/* Auditoría Forense y Veredicto */}
                    <div className="px-6">
                        <div className="bg-zinc-900/60 border border-white/5 rounded-[3rem] p-8 md:p-12 shadow-inner relative min-h-[600px] border-t-primary/10">
                            {/* Eficiencia Score visual */}
                            <div className="absolute -top-4 right-8 bg-black border border-primary/40 px-4 py-2 rounded-full shadow-glow z-10 flex items-center gap-2">
                                <span className="text-[10px] font-black text-zinc-500 uppercase">Eficiencia:</span>
                                <span className="text-xl font-black text-primary font-mono">{data.efficiencyScore}/10</span>
                            </div>

                            <DossierRenderer text={data.monthlyAnalysisText} />
                            
                            <div className="absolute bottom-8 right-8 pointer-events-none select-none opacity-5">
                                <AppLogo className="w-32 h-32 text-white" />
                            </div>
                        </div>
                    </div>

                    <div className="mt-12 text-center pb-20">
                        <p className="text-[9px] text-zinc-700 font-mono uppercase tracking-[0.2em] italic">Dossier Cerrado - Forensic Gym-AI Engine</p>
                    </div>
                </div>
            ) : null}
        </div>
      </div>
    </div>
  );
};
