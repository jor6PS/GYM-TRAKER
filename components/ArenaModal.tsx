import React, { useState, useEffect } from 'react';
// 1. Añadimos el icono 'Info'
import { X, Swords, Crown, Loader2, Scale, Activity, Zap, AlertTriangle, FileText, Target, Info } from 'lucide-react';
import { generateGroupAnalysis } from '../services/workoutProcessor';
import { Workout, User } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useExercises } from '../contexts/ExerciseContext';
import { useScrollLock } from '../hooks/useScrollLock';
import { AIErrorDisplay } from './AIErrorDisplay';
import { formatAIError, FormattedAIError } from '../services/workoutProcessor/helpers';

interface ArenaModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  friendsData: { userId: string; name: string; workouts: Workout[]; color: string }[];
}

// ... (DossierRenderer se mantiene IGUAL, no es necesario cambiarlo para esto) ...
const DossierRenderer = ({ text }: { text: string }) => {
  if (!text) return null;
  
  let normalizedText = text.replace(/\\n/g, '\n').replace(/\\n/g, '\n');
  const lines = normalizedText.split('\n').map(l => l.trim());
  
  const elements: React.ReactNode[] = [];
  
  const renderFormattedText = (content: string) => {
    const parts = content.split(/(\*\*.*?\*\*)/g);
    return (
      <>{parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i} className="text-white font-bold drop-shadow-sm">{part.slice(2, -2).trim()}</strong>;
          }
          return part;
        })}</>
    );
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line) { i++; continue; }

    if (line.startsWith('|')) {
      const tableRows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        const rowContent = lines[i];
        if (!/^\|[\s-:|]+\|$/.test(rowContent)) { 
            const cells = rowContent.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1).map(c => c.trim());
            tableRows.push(cells);
        }
        i++;
      }
      if (tableRows.length > 0) {
        const isMatrix = tableRows[0].length > 3; 
        elements.push(
          <div key={`table-${i}`} className="my-4 w-full overflow-hidden rounded-xl border border-white/10 bg-black/40 shadow-lg flex flex-col">
            <div className={isMatrix ? "overflow-x-auto custom-scrollbar" : "w-full"}>
                <table className={`w-full text-left border-collapse ${isMatrix ? 'min-w-[400px]' : 'table-fixed'}`}>
                <thead>
                    <tr className="bg-white/5 border-b border-white/10">
                    {tableRows[0].map((cell, idx) => (
                        <th key={idx} className="px-3 py-2.5 font-black text-primary uppercase tracking-widest bg-zinc-900/50 text-[10px] whitespace-nowrap border-r border-white/5 last:border-0 sticky left-0 z-10">
                            {cell}
                        </th>
                    ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {tableRows.slice(1).map((row, rowIdx) => (
                    <tr key={rowIdx} className="hover:bg-white/5 transition-colors group">
                        {row.map((cell, cellIdx) => (
                        <td key={cellIdx} className={`px-3 py-2 font-mono text-zinc-300 border-r border-white/5 last:border-0 text-[10px] align-middle ${cellIdx === 0 ? 'font-bold text-white whitespace-nowrap bg-zinc-900/20' : 'whitespace-normal text-center min-w-[80px]'}`}>
                            {cell === '---' || cell === '' ? <span className="opacity-10">-</span> : renderFormattedText(cell)}
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

    if (line.startsWith('## ')) {
    }
    
    if (line.startsWith('###')) {
        let cleanTitle = line.replace(/^#+\s*/, '').trim().replace(/^\*\*(.*)\*\*$/, '$1');
        elements.push(
            <div key={`h-${i}`} className="mt-4 mb-2 flex items-center gap-2 px-1">
                <Target className="w-3 h-3 text-zinc-500" />
                <span className="text-xs font-black uppercase tracking-wider text-zinc-400">{cleanTitle}</span>
            </div>
        );
        i++; continue;
    }

    if (line.includes('🏆') || line.includes('⚖️')) {
        const isDraw = line.includes('⚖️');
        const content = line.replace(/🏆|⚖️/, '').trim();
        
        elements.push(
            <div key={`win-${i}`} className={`relative p-3 rounded-lg border flex items-center gap-3 mb-1 shadow-md overflow-hidden ${isDraw ? 'bg-zinc-800/50 border-zinc-600/30' : 'bg-primary/10 border-primary/30'}`}>
                <div className={`shrink-0 p-1.5 rounded-full ${isDraw ? 'bg-zinc-700' : 'bg-primary/20'}`}>
                    {isDraw ? <Scale className="w-4 h-4 text-zinc-300" /> : <Crown className="w-4 h-4 text-primary fill-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                    <div className={`text-xs font-mono truncate ${isDraw ? 'text-zinc-200' : 'text-primary-foreground font-bold'}`}>
                        {renderFormattedText(content)}
                    </div>
                </div>
                {!isDraw && <div className="absolute right-0 top-0 bottom-0 w-1 bg-primary/50"></div>}
            </div>
        );
        i++; continue;
    }

    if (line.includes('⚔️') || line.trim().startsWith('vs')) {
        const content = line.replace(/⚔️|vs/i, '').trim();
        elements.push(
            <div key={`vs-${i}`} className="ml-11 mb-3 text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                <span className="opacity-50 text-[9px]">vs</span> {renderFormattedText(content)}
            </div>
        );
        i++; continue;
    }

    if (line.length > 0) {
        if (line.startsWith('#')) {
             let cleanTitle = line.replace(/^#+\s*/, '').trim().replace(/^\*\*(.*)\*\*$/, '$1');
             elements.push(
                <div key={i} className="flex items-center gap-2 pt-6 border-b border-white/10 pb-2 mb-3 mt-2">
                   <FileText className="w-3 h-3 text-primary shrink-0" />
                   <h4 className="text-xs font-black uppercase tracking-[0.2em] text-white italic">{renderFormattedText(cleanTitle)}</h4>
                </div>
             );
        } else {
             elements.push(
                <div key={i} className="mb-2 text-[11px] text-zinc-400 leading-relaxed font-mono whitespace-normal break-words">
                    {renderFormattedText(line)}
                </div>
            );
        }
    }
    i++;
  }
  return <div className="space-y-1">{elements}</div>;
};

export const ArenaModal: React.FC<ArenaModalProps> = ({ isOpen, onClose, currentUser, friendsData }) => {
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formattedError, setFormattedError] = useState<FormattedAIError | null>(null);
  const { t } = useLanguage();
  const { catalog } = useExercises();

  useScrollLock(isOpen);

  useEffect(() => {
    if (error) {
        const timer = setTimeout(() => setError(null), 7000);
        return () => clearTimeout(timer);
    }
  }, [error]);

  if (!isOpen) return null;

  const handleBattle = async () => {
    setLoading(true);
    setError(null);
    try {
        const usersPayload = friendsData.map(f => ({
            name: f.name,
            workouts: f.workouts,
            userId: f.userId
        }));

        const rawResult: any = await generateGroupAnalysis(usersPayload, catalog);

        const maxVol = Math.max(...rawResult.rawStats.map((s: any) => s.totalVolume));
        const rankings = rawResult.rawStats
            .map((s: any) => ({
                name: s.name,
                // 2. Guardamos el volumen crudo para mostrarlo
                rawVolume: s.totalVolume, 
                score: maxVol > 0 ? (s.totalVolume / maxVol) * 100 : 0
            }))
            .sort((a: any, b: any) => b.score - a.score)
            .map((u: any, index: number) => ({ ...u, rank: index + 1 }));

        setAnalysis({
            winner: rawResult.alpha_user || rankings[0].name,
            rankings: rankings,
            markdown_body: rawResult.markdown_report || "",
            volume_table: rawResult.rawStats
                .sort((a: any, b: any) => b.totalVolume - a.totalVolume)
                .map((s: any) => ({ name: s.name, total_volume_kg: Math.round(s.totalVolume) })),
        });

    } catch (e: any) {
        console.error("Arena Error:", e);
        const errorMessage = e.message || "Error desconocido al contactar con la IA.";
        setError(errorMessage);
        
        // Intentar formatear el error
        try {
          const formatted = formatAIError(e);
          setFormattedError(formatted);
        } catch {
          setFormattedError(null);
        }
    } finally {
        setLoading(false);
    }
  };

  const isDraw = analysis?.winner === 'DRAW';
  const getColor = (name: string) => friendsData.find(f => f.name === name)?.color || '#ffffff';

  // Helper para formatear volumen (15000 -> 15k)
  const formatVolume = (vol: number) => {
      if (vol >= 1000) return `${(vol / 1000).toFixed(1)}T`;
      return `${Math.round(vol)}kg`;
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={onClose} />
      
      <div className="relative w-full max-w-2xl bg-[#0a0a0a] border border-white/10 rounded-[2rem] shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-500 ring-1 ring-white/5">
        
        {/* --- HEADER --- */}
        <div className="p-6 border-b border-white/5 bg-gradient-to-b from-zinc-900/50 to-transparent flex justify-between items-center shrink-0 relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent"></div>
             <div>
                 <h2 className="text-3xl font-black text-white italic tracking-tighter flex items-center gap-3 uppercase">
                    {t('arena_title')} <Swords className="w-8 h-8 text-primary animate-pulse" />
                 </h2>
                 <div className="flex items-center gap-2 mt-2">
                     <span className="px-2 py-0.5 bg-white/5 rounded text-[10px] font-mono text-zinc-400 uppercase tracking-widest border border-white/10">
                        {friendsData.length} Fighters
                     </span>
                     <span className="px-2 py-0.5 bg-primary/10 rounded text-[10px] font-mono text-primary uppercase tracking-widest border border-primary/20 flex items-center gap-1">
                        <Zap className="w-3 h-3" /> Ranked Match
                     </span>
                 </div>
             </div>
             <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-full"><X className="w-6 h-6" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar relative">
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.04] pointer-events-none fixed"></div>

            {formattedError && (
                <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
                    <AIErrorDisplay 
                        error={formattedError} 
                        onDismiss={() => {
                            setError(null);
                            setFormattedError(null);
                        }}
                        onRetry={() => {
                            setError(null);
                            setFormattedError(null);
                            handleBattle();
                        }}
                    />
                </div>
            )}
            {error && !formattedError && (
                <div className="absolute top-6 left-6 right-6 z-50 animate-in slide-in-from-top-4">
                    <div className="bg-red-500/10 border border-red-500/50 rounded-2xl p-4 shadow-2xl flex flex-col items-center text-center backdrop-blur-md">
                        <AlertTriangle className="w-8 h-8 text-red-500 mb-2" />
                        <p className="text-red-500 font-bold text-sm">{error}</p>
                    </div>
                </div>
            )}

            {!analysis ? (
                // --- INITIAL STATE ---
                <div className="flex flex-col items-center justify-center py-20 min-h-[400px]">
                     <div className="flex flex-wrap gap-3 mb-12 justify-center max-w-md">
                        {friendsData.map(f => (
                            <div key={f.userId} className="pl-1 pr-4 py-1 rounded-full text-xs font-bold border border-white/10 flex items-center gap-3 bg-zinc-900/50">
                                <div className="w-6 h-6 rounded-full flex items-center justify-center font-black text-[10px] text-black shadow-[0_0_10px_rgba(255,255,255,0.2)]" style={{ backgroundColor: f.color }}>
                                    {f.name.charAt(0)}
                                </div>
                                <span className="text-zinc-300">{f.name}</span>
                            </div>
                        ))}
                    </div>

                     <button 
                        onClick={handleBattle}
                        disabled={loading}
                        className="group relative px-12 py-6 bg-white text-black font-black text-2xl italic uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100 shadow-[0_0_40px_rgba(255,255,255,0.15)] hover:shadow-[0_0_60px_rgba(255,255,255,0.4)] active:scale-95 clip-path-polygon"
                        style={{ clipPath: 'polygon(10% 0, 100% 0, 90% 100%, 0% 100%)' }}
                     >
                        {loading ? (
                            <span className="flex items-center gap-3"><Loader2 className="animate-spin w-6 h-6" /> {t('judging')}</span>
                        ) : (
                            <span className="flex items-center gap-3">{t('fight')} <Swords className="w-6 h-6" /></span>
                        )}
                     </button>
                     <p className="mt-8 text-[10px] text-zinc-500 font-mono uppercase tracking-[0.2em] text-center opacity-60">
                        AI-Powered Analysis • Volume • Matrix
                     </p>
                </div>
            ) : (
                // --- RESULTS STATE ---
                <div className="space-y-8 animate-in slide-in-from-bottom-10 fade-in duration-700 relative z-10">
                    
                    {/* 3. EXPLICACIÓN DEL SISTEMA DE PUNTUACIÓN */}
                    <div className="flex items-center justify-center gap-2 mb-2 text-center bg-white/5 border border-white/5 p-2 rounded-xl mx-auto max-w-sm">
                        <Info className="w-3 h-3 text-zinc-400" />
                        <p className="text-[10px] text-zinc-400 font-mono uppercase tracking-wide">
                            Scoring based on <span className="text-primary font-bold">Total Volume (Tonnage)</span>
                        </p>
                    </div>

                    {/* PODIUM SECTION */}
                    {isDraw ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-zinc-800 rounded-3xl bg-zinc-900/20">
                            <Scale className="w-16 h-16 text-zinc-600 mb-4" />
                            <h3 className="text-4xl font-black text-white italic uppercase tracking-tighter">EMPATE TÉCNICO</h3>
                        </div>
                    ) : (
                        <div className="flex items-end justify-center gap-4 md:gap-8 pt-4 pb-8 px-4">
                            {/* SILVER */}
                            {analysis.rankings[1] && (
                                <div className="flex flex-col items-center group w-1/3">
                                    <div className="text-[9px] font-black text-zinc-500 mb-2 font-mono tracking-widest opacity-0 animate-in fade-in slide-in-from-bottom-2 delay-300 fill-mode-forwards">SILVER</div>
                                    <div className="w-full max-w-[100px] bg-gradient-to-b from-zinc-700 to-zinc-900 rounded-t-lg h-28 flex flex-col items-center justify-end pb-3 border-t border-x border-white/10 relative shadow-2xl group-hover:-translate-y-1 transition-transform duration-300">
                                        <div className="absolute -top-4 p-2 bg-zinc-800 rounded-full border border-zinc-600 shadow-xl">
                                            <Crown className="w-5 h-5 text-zinc-400" />
                                        </div>
                                        <span className="font-bold text-zinc-200 text-xs truncate w-full px-2 text-center mb-1">{analysis.rankings[1].name}</span>
                                        {/* AÑADIDO: VOLUMEN REAL */}
                                        <span className="text-[10px] font-mono text-zinc-400 mb-1">{formatVolume(analysis.rankings[1].rawVolume)}</span>
                                        <span className="text-[8px] font-mono text-black font-bold bg-white/50 px-2 py-0.5 rounded">{Math.round(analysis.rankings[1].score)} PTS</span>
                                    </div>
                                </div>
                            )}
                            {/* GOLD */}
                            {analysis.rankings[0] && (
                                <div className="flex flex-col items-center z-10 w-1/3 -mx-2 md:mx-0">
                                    <div className="text-[10px] font-black text-primary mb-2 font-mono tracking-widest flex items-center gap-2 opacity-0 animate-in fade-in slide-in-from-bottom-2 delay-500 fill-mode-forwards">
                                        <Crown className="w-3 h-3 fill-primary" /> ALPHA
                                    </div>
                                    <div className="w-full max-w-[120px] bg-gradient-to-b from-primary/30 via-primary/10 to-transparent rounded-t-lg h-40 flex flex-col items-center justify-end pb-4 border-t border-x border-primary/40 relative shadow-[0_0_60px_rgba(212,255,0,0.2)]">
                                        <div className="absolute -top-7 animate-bounce">
                                            <Crown className="w-14 h-14 text-primary drop-shadow-[0_0_15px_rgba(212,255,0,0.6)]" />
                                        </div>
                                        <span className="font-black text-white text-base md:text-xl truncate w-full px-2 text-center mb-1 tracking-tight">{analysis.rankings[0].name}</span>
                                        {/* AÑADIDO: VOLUMEN REAL */}
                                        <span className="text-xs font-mono text-primary/80 mb-2 font-bold">{formatVolume(analysis.rankings[0].rawVolume)}</span>
                                        <span className="text-[10px] font-mono text-black font-bold bg-primary px-3 py-1 rounded-full shadow-glow">100 PTS</span>
                                    </div>
                                </div>
                            )}
                            {/* BRONZE */}
                            {analysis.rankings[2] && (
                                <div className="flex flex-col items-center group w-1/3">
                                    <div className="text-[9px] font-black text-orange-900 mb-2 font-mono tracking-widest opacity-0 animate-in fade-in slide-in-from-bottom-2 delay-300 fill-mode-forwards">BRONZE</div>
                                    <div className="w-full max-w-[100px] bg-gradient-to-b from-[#4d331f] to-zinc-900 rounded-t-lg h-24 flex flex-col items-center justify-end pb-3 border-t border-x border-orange-900/40 relative shadow-2xl group-hover:-translate-y-1 transition-transform duration-300">
                                        <div className="absolute -top-4 p-2 bg-zinc-900 rounded-full border border-orange-900/60 shadow-xl">
                                            <Crown className="w-5 h-5 text-orange-700" />
                                        </div>
                                        <span className="font-bold text-orange-200/80 text-xs truncate w-full px-2 text-center mb-1">{analysis.rankings[2].name}</span>
                                        {/* AÑADIDO: VOLUMEN REAL */}
                                        <span className="text-[10px] font-mono text-orange-300/60 mb-1">{formatVolume(analysis.rankings[2].rawVolume)}</span>
                                        <span className="text-[8px] font-mono text-black font-bold bg-orange-500/50 px-2 py-0.5 rounded">{Math.round(analysis.rankings[2].score)} PTS</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* --- AI TACTICAL REPORT --- */}
                    {analysis.markdown_body && (
                        <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-5 relative overflow-hidden backdrop-blur-sm">
                            <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-2">
                                <FileText className="w-4 h-4 text-primary" />
                                <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Tactical Analysis</h3>
                            </div>
                            <DossierRenderer text={analysis.markdown_body} />
                        </div>
                    )}
                    
                    {/* VOLUME GRAPH */}
                    <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-6 relative overflow-hidden backdrop-blur-sm">
                        <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Activity className="w-3 h-3 text-purple-400" /> Volume Dominance
                        </h3>
                        <div className="space-y-5">
                            {analysis.volume_table.map((vol: any, idx: number) => {
                                const maxVol = analysis.volume_table[0].total_volume_kg || 1;
                                const percentage = (vol.total_volume_kg / maxVol) * 100;
                                const color = getColor(vol.name);
                                return (
                                    <div key={idx} className="relative group">
                                        <div className="flex justify-between items-end mb-2 text-xs relative z-10">
                                            <span className="font-bold text-white flex items-center gap-3">
                                                <div className="w-2 h-2 rounded-full shadow-[0_0_10px_currentColor]" style={{ backgroundColor: color, color: color }}></div>
                                                {vol.name}
                                            </span>
                                            <span className="font-mono text-zinc-400 group-hover:text-white transition-colors">{vol.total_volume_kg.toLocaleString()} kg</span>
                                        </div>
                                        <div className="h-2 w-full bg-black/60 rounded-full overflow-hidden border border-white/5">
                                            <div className="h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(0,0,0,0.5)]" style={{ width: `${percentage}%`, backgroundColor: color }}></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="pb-8 text-center">
                        <p className="text-[9px] text-zinc-700 font-mono uppercase tracking-[0.3em]">Arena Engine v2.1 (Matrix)</p>
                    </div>

                </div>
            )}
        </div>
      </div>
    </div>
  );
};