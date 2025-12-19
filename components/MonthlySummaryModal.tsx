import React, { useEffect, useState } from 'react';
import { X, ShieldAlert, AlertTriangle, Radar, Zap, Scale, Trophy, ArrowUpRight, Target, Activity, FileText, Dumbbell } from 'lucide-react';
import { Workout, GlobalReportData, User } from '../types';
import { generateGlobalReport } from '../services/workoutProcessor';
import { useLanguage } from '../contexts/LanguageContext';
import { AppLogo } from '../utils';
import { useScrollLock } from '../hooks/useScrollLock';

interface MonthlySummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  workouts: Workout[];
  currentUser: User;
}

// --- RENDERIZADOR DE TEXTO & MARKDOWN (Mejorado para tablas y planes) ---
const DossierRenderer = ({ text }: { text: string }) => {
  if (!text) return null;
  
  const lines = text.split('\n').map(l => l.trim());
  const elements: React.ReactNode[] = [];
  
  // Función para procesar negritas y palabras clave
  const renderFormattedText = (content: string) => {
    const parts = content.split(/(\*\*.*?\*\*)/g);
    return (
      <>{parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            const boldText = part.slice(2, -2).trim();
            const upper = boldText.toUpperCase();
            
            // Detección de palabras clave para colorear
            const isCritical = upper.includes('ALERTA');
            const isPlanDay = upper.includes('DÍA 1') || upper.includes('DÍA 2') || upper.includes('DÍA 3');
            const isPositive = upper.includes('ÓPTIMO') || upper.includes('MAV') || upper.includes('PR');

            if (isCritical) {
                return (
                    <span key={i} className="text-red-400 font-black bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/30 inline-flex items-center gap-1 mx-1">
                        <AlertTriangle className="w-3 h-3" /> {boldText}
                    </span>
                );
            }
            if (isPlanDay) {
                return (
                    <span key={i} className="text-primary font-black bg-primary/10 px-2 py-0.5 rounded border border-primary/30 inline-block mt-2 mb-1 shadow-[0_0_10px_rgba(212,255,0,0.1)]">
                         {boldText}
                    </span>
                );
            }
            if (isPositive) {
                return <span key={i} className="text-green-400 font-black underline decoration-green-500/30">{boldText}</span>;
            }

            return <strong key={i} className="text-white font-bold">{boldText}</strong>;
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

    // 1. TABLAS (Lógica Responsive: Ajuste de texto automático)
    if (line.startsWith('|')) {
      const tableRows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        const rowContent = lines[i];
        // Ignorar líneas de separación markdown (ej: |---|)
        const isSeparator = /^\|[\s-:|]+\|$/.test(rowContent);
        
        if (!isSeparator) {
            const cells = rowContent
            .split('|')
            .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
            .map(c => c.trim());
            tableRows.push(cells);
        }
        i++;
      }

      if (tableRows.length > 0) {
        elements.push(
          <div key={`table-${i}`} className="my-6 w-full overflow-hidden rounded-xl border border-white/10 bg-black/40 shadow-lg relative group">
             <div className="absolute top-0 right-0 p-1 opacity-20"><Activity className="w-4 h-4 text-primary" /></div>
             {/* Wrapper con overflow-x por seguridad, pero intentamos que no se use */}
             <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-xs table-auto">
                <thead>
                    <tr className="bg-white/5 border-b border-white/10">
                    {tableRows[0].map((cell, idx) => (
                        <th key={idx} className="px-3 py-3 font-black text-primary uppercase tracking-wider bg-zinc-900/50 whitespace-normal min-w-[80px]">
                            {cell}
                        </th>
                    ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {tableRows.slice(1).map((row, rowIdx) => (
                    <tr key={rowIdx} className="hover:bg-white/5 transition-colors">
                        {row.map((cell, cellIdx) => (
                        <td key={cellIdx} className="px-3 py-3 font-mono text-zinc-300 group-hover:text-white transition-colors border-r border-white/5 last:border-0 whitespace-normal min-w-[80px] leading-relaxed">
                            {/* whitespace-normal permite el salto de línea. min-w evita columnas colapsadas */}
                            {renderFormattedText(cell)}
                        </td>
                        ))}
                    </tr>
                    ))}
                </tbody>
                </table>
            </div>
          </div>
        );
      }
      continue;
    }

    // 2. TÍTULOS PRINCIPALES (##)
    if (line.startsWith('## ')) {
      const title = line.replace('## ', '').trim();
      elements.push(
        <div key={i} className="flex items-center gap-3 pt-8 border-b border-white/10 pb-2 mb-4 first:pt-0 mt-4">
           <div className="bg-primary/20 p-1.5 rounded text-primary border border-primary/20"><Target className="w-4 h-4" /></div>
           <h4 className="text-sm font-black uppercase tracking-[0.2em] text-white italic">{title}</h4>
        </div>
      );
      i++;
      continue;
    }

    // 3. SUBTÍTULOS (###)
    if (line.startsWith('### ')) {
      const subtitle = line.replace('### ', '').trim();
      elements.push(
        <div key={i} className="pt-4 mb-2 flex items-center gap-2">
            <div className="w-1 h-4 bg-zinc-700 rounded-full"></div>
            <h5 className="text-xs font-black text-zinc-400 uppercase tracking-widest">{subtitle}</h5>
        </div>
      );
      i++;
      continue;
    }

    // 4. LISTAS / EJERCICIOS DEL PLAN (Detecta "* Ejercicio | Sets | Peso")
    if (/^(\*\s|\-\s|\•\s)/.test(line)) {
      const content = line.replace(/^(\*\s|\-\s|\•\s)/, '').trim();
      
      // Si parece una línea del Plan de Acción (contiene separadores | )
      if (content.includes('|')) {
         elements.push(
            <div key={i} className="flex gap-3 pl-2 py-2 group items-center border-b border-white/5 last:border-0">
                <Dumbbell className="w-3 h-3 text-zinc-600 group-hover:text-primary transition-colors shrink-0" />
                <p className="text-sm text-zinc-300 font-mono leading-relaxed group-hover:text-white transition-colors w-full">
                    {renderFormattedText(content)}
                </p>
            </div>
         );
      } else {
        // Bullet normal
        elements.push(
            <div key={i} className="flex gap-3 pl-2 py-1 group items-start">
            <div className="mt-2 w-1.5 h-1.5 rounded-full bg-zinc-600 group-hover:bg-primary shrink-0 transition-colors shadow-[0_0_5px_rgba(212,255,0,0)]" />
            <p className="text-sm text-zinc-400 leading-relaxed group-hover:text-zinc-300 transition-colors">{renderFormattedText(content)}</p>
            </div>
        );
      }
      i++;
      continue;
    }

    // 5. TEXTO GENERAL
    elements.push(
      <div key={i} className="flex gap-3 mb-2">
         <p className="text-sm text-zinc-500 leading-relaxed italic">{renderFormattedText(line)}</p>
      </div>
    );
    i++;
  }

  return <div className="space-y-1 font-sans selection:bg-primary selection:text-black pb-10">{elements}</div>;
};

// --- COMPONENTE PRINCIPAL ---

export const MonthlySummaryModal: React.FC<MonthlySummaryModalProps> = ({ isOpen, onClose, workouts, currentUser }) => {
  const [data, setData] = useState<GlobalReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t, language } = useLanguage();

  useScrollLock(isOpen);

  useEffect(() => {
    if (isOpen) {
      generateReport();
    } else {
      const timer = setTimeout(() => {
          setData(null); 
          setError(null);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const generateReport = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!workouts || workouts.length === 0) {
        throw new Error("Sin datos de combate. El sistema requiere al menos un entrenamiento registrado.");
      }
      const reportData = await generateGlobalReport(workouts, language, currentUser.weight || 80, currentUser.height || 180);
      setData(reportData);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "ERROR CRÍTICO: Fallo en la red neuronal.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop con Blur */}
      <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={onClose} />
      
      {/* Contenedor Modal */}
      <div className="relative w-full max-w-lg bg-[#0a0a0a] border border-white/10 rounded-[2rem] shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col h-[92vh] animate-in zoom-in-95 duration-300 text-text overflow-hidden ring-1 ring-white/5">
        
        {/* --- HEADER --- */}
        <div className="flex items-center justify-between p-6 border-b border-white/5 bg-gradient-to-b from-zinc-900/80 to-transparent shrink-0 relative overflow-hidden">
          {/* Neon Line */}
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent"></div>
          
          <div className="flex items-center gap-4">
             <div className="p-3 bg-zinc-900 border border-white/10 text-primary rounded-2xl shadow-inner relative overflow-hidden">
                 <div className="absolute inset-0 bg-primary/10 animate-pulse"></div>
                 <ShieldAlert className="w-6 h-6 relative z-10" />
             </div>
             <div>
                <h3 className="text-xl font-black text-white italic tracking-tighter uppercase leading-none">CRÓNICAS DEL HIERRO</h3>
                <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-[0.2em]">{currentUser.name || 'OPERATOR'} // {new Date().getFullYear()}</span>
                </div>
             </div>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-600 hover:text-white transition-colors hover:rotate-90 duration-300 bg-white/5 rounded-full"><X className="w-5 h-5" /></button>
        </div>

        {/* --- BODY SCROLLABLE --- */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#050505] relative">
            
            {/* Background Texture */}
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] pointer-events-none fixed"></div>

            {loading ? (
                <div className="flex flex-col items-center justify-center h-full space-y-8 animate-in fade-in duration-700">
                    <div className="relative">
                        <div className="w-32 h-32 rounded-full border border-primary/20 flex items-center justify-center relative overflow-hidden bg-black shadow-[0_0_50px_rgba(212,255,0,0.1)]">
                            <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent animate-spin-slow"></div>
                            {/* Radar Scan Effect */}
                            <div className="absolute inset-0 border-t border-primary/40 animate-spin"></div>
                            <Radar className="w-12 h-12 text-primary animate-pulse" />
                        </div>
                        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
                            <span className="text-[10px] font-mono text-primary blink bg-primary/10 px-3 py-1 rounded border border-primary/20">CALCULANDO PLAN 3 DÍAS...</span>
                        </div>
                    </div>
                </div>
            ) : error ? (
                <div className="flex flex-col items-center justify-center h-full p-10 text-center space-y-4">
                    <div className="bg-red-500/10 p-5 rounded-full border border-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.2)]"><AlertTriangle className="w-12 h-12 text-red-500" /></div>
                    <p className="text-red-500 font-black uppercase font-mono tracking-widest text-lg">Fallo de Sistema</p>
                    <p className="text-zinc-500 text-sm max-w-xs mx-auto">{error}</p>
                </div>
            ) : data ? (
                <div className="pb-12 animate-in fade-in slide-in-from-bottom-8 duration-700 relative z-10">
                    
                    {/* 1. METRICS CARDS */}
                    <div className="p-6 grid grid-cols-1 gap-4">
                        {/* TOTAL VOL */}
                        <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-5 relative overflow-hidden group hover:border-white/10 transition-colors">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <Scale className="w-4 h-4 text-zinc-500" />
                                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Total Histórico</span>
                                </div>
                                <Activity className="w-4 h-4 text-zinc-700 group-hover:text-primary transition-colors" />
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-4xl font-black text-white font-mono tracking-tighter">{(data.totalVolumeKg / 1000).toFixed(1)}</span>
                                <span className="text-sm font-bold text-zinc-500 uppercase">TONS</span>
                            </div>
                            <div className="mt-4 pt-4 border-t border-white/5 flex items-start gap-2">
                                <ArrowUpRight className="w-3.5 h-3.5 text-primary mt-0.5" />
                                <span className="text-xs text-zinc-400 font-medium italic">"{data.volumeEquivalentGlobal || 'Sin datos'}"</span>
                            </div>
                        </div>

                        {/* MONTHLY VOL */}
                        <div className="bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 rounded-2xl p-5 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-3 opacity-20"><Zap className="w-16 h-16 text-primary -rotate-12" /></div>
                            <div className="flex items-center justify-between mb-4 relative z-10">
                                <div className="flex items-center gap-2">
                                    <Zap className="w-4 h-4 text-primary" />
                                    <span className="text-[10px] font-black text-primary uppercase tracking-widest">Carga {data.monthName}</span>
                                </div>
                            </div>
                            <div className="flex items-baseline gap-2 relative z-10">
                                <span className="text-4xl font-black text-primary font-mono tracking-tighter">{(data.monthlyVolumeKg / 1000).toFixed(1)}</span>
                                <span className="text-sm font-bold text-primary/60 uppercase">TONS</span>
                            </div>
                             <div className="mt-4 pt-4 border-t border-primary/10 flex items-start gap-2 relative z-10">
                                <Target className="w-3.5 h-3.5 text-primary mt-0.5" />
                                <span className="text-xs text-zinc-300 font-medium italic">"{data.volumeEquivalentMonthly || 'Sin datos'}"</span>
                            </div>
                        </div>
                    </div>

                    {/* 2. MAX COMPARISON TABLE (RÉCORDS) */}
                    <div className="px-6 mb-8">
                         <div className="flex items-center gap-2 mb-3 px-1">
                            <Trophy className="w-3.5 h-3.5 text-yellow-500" />
                            <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Récords vs Global</h4>
                         </div>
                         <div className="bg-zinc-900/30 border border-white/5 rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-white/5 text-[9px] font-mono text-zinc-500 uppercase tracking-widest border-b border-white/5">
                                    <tr>
                                        <th className="px-4 py-3 font-bold">Ejercicio</th>
                                        <th className="px-4 py-3 text-right">Mes</th>
                                        <th className="px-4 py-3 text-right">Best</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {data.maxComparison.slice(0, 8).map((max, idx) => {
                                        const isNewRecord = max.monthlyMax >= max.globalMax && max.monthlyMax > 0;
                                        return (
                                            <tr key={idx} className="hover:bg-white/5 transition-colors">
                                                {/* truncate y max-w para evitar desbordes en nombres largos */}
                                                <td className="px-4 py-3 font-bold text-zinc-300 truncate max-w-[120px]" title={max.exercise}>
                                                    {max.exercise}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono font-black text-white">
                                                    {max.monthlyMax}<span className="text-[8px] text-zinc-600 ml-0.5">{max.unit}</span>
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-zinc-500 relative">
                                                    {max.globalMax}
                                                    {isNewRecord && (
                                                        <span className="absolute top-2 right-1 flex h-2 w-2">
                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                            {data.maxComparison.length > 8 && (
                                <div className="text-center py-2 text-[9px] text-zinc-600 bg-black/20 italic border-t border-white/5">
                                    + {data.maxComparison.length - 8} ejercicios ocultos
                                </div>
                            )}
                         </div>
                    </div>

                    {/* 3. AI REPORT & PLAN SECTION */}
                    <div className="px-6">
                        <div className="bg-zinc-900/20 border border-white/5 rounded-[2rem] p-6 md:p-8 relative min-h-[400px] shadow-2xl">
                            {/* Score Badge */}
                            <div className="absolute -top-3 right-6 bg-[#050505] border border-primary/30 px-3 py-1.5 rounded-full shadow-glow z-10 flex items-center gap-2">
                                <span className="text-[9px] font-black text-zinc-500 uppercase">SCORE</span>
                                <span className="text-lg font-black text-primary font-mono leading-none">{data.efficiencyScore}/10</span>
                            </div>

                            <div className="flex items-center gap-2 mb-6 opacity-50 border-b border-white/5 pb-4">
                                <FileText className="w-4 h-4 text-zinc-400" />
                                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Informe Técnico</span>
                            </div>

                            <DossierRenderer text={data.monthlyAnalysisText} />
                            
                            <div className="absolute bottom-6 right-6 pointer-events-none select-none opacity-[0.05]">
                                <AppLogo className="w-32 h-32 text-white" />
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 text-center pb-20 px-10">
                        <p className="text-[9px] text-zinc-800 font-mono uppercase tracking-[0.2em]">Powered by Gemini AI Neural Core</p>
                    </div>
                </div>
            ) : null}
        </div>
      </div>
    </div>
  );
};