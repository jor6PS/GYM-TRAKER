import React, { useState, useEffect } from 'react';
import { X, Swords, Crown, Skull, Sparkles, Loader2, Trophy, Flame, Medal, Scale, Dumbbell, Activity, TrendingUp, AlertTriangle, BicepsFlexed, Zap } from 'lucide-react';
import { generateGroupAnalysis } from '../services/workoutProcessor';
import { Workout, User } from '../types';
import { clsx } from 'clsx';
import { useLanguage } from '../contexts/LanguageContext';

interface ArenaModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  friendsData: { userId: string; name: string; workouts: Workout[]; color: string }[];
}

export const ArenaModal: React.FC<ArenaModalProps> = ({ isOpen, onClose, currentUser, friendsData }) => {
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t, language } = useLanguage();

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

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
            workouts: f.workouts
        }));

        // 1. Llamada al Backend Nuevo
        const rawResult: any = await generateGroupAnalysis(usersPayload, language);

        // 2. Lógica de Adaptación para Visualización
        const maxVol = Math.max(...rawResult.rawStats.map((s: any) => s.totalVolume));
        const maxDays = Math.max(...rawResult.rawStats.map((s: any) => s.workoutCount));
        
        // Calcular Puntuaciones y detectar Músculo Dominante
        const scoredUsers = rawResult.rawStats.map((s: any) => {
            const volScore = maxVol > 0 ? (s.totalVolume / maxVol) * 60 : 0; // 60% peso volumen
            const dayScore = maxDays > 0 ? (s.workoutCount / maxDays) * 40 : 0; // 40% peso constancia
            
            // Encontrar el grupo muscular con mayor volumen
            let topMuscle = "General";
            let maxMuscleVol = 0;
            if (s.muscleVol) {
                Object.entries(s.muscleVol).forEach(([m, v]: [string, any]) => {
                    if (v > maxMuscleVol) {
                        maxMuscleVol = v;
                        topMuscle = m.split(' ')[0]; // Tomar solo la primera palabra (PUSH, LEGS...)
                    }
                });
            }

            return { 
                ...s, 
                score: volScore + dayScore,
                topMuscleName: topMuscle
            };
        }).sort((a: any, b: any) => b.score - a.score);

        // Construir Ranking
        const rankings = scoredUsers.map((u: any, index: number) => ({
            rank: index + 1,
            name: u.name,
            reason: `${Math.round(u.totalVolume / 1000)}t / ${u.workoutCount}d`,
            score: u.score,
            topMuscle: u.topMuscleName
        }));

        const processedData = {
            winner: rawResult.alpha_user || rankings[0].name,
            loser: rawResult.beta_user || rankings[rankings.length - 1].name,
            rankings: rankings,
            
            volume_table: rawResult.rawStats
                .sort((a: any, b: any) => b.totalVolume - a.totalVolume)
                .map((s: any) => ({ name: s.name, total_volume_kg: Math.round(s.totalVolume) })),
            
            points_table: rawResult.rawStats
                .sort((a: any, b: any) => b.workoutCount - a.workoutCount)
                .map((s: any) => ({ name: s.name, points: s.workoutCount * 100 })),
            
            comparison_table: rawResult.headToHeadData.map((h: any) => ({
                exercise: h.exerciseName,
                winnerName: h.winner,
                results: h.entries.map((e: any) => ({
                    userName: e.userName,
                    // Formatear display bonito
                    display: e.weight > 0 ? `${e.weight}kg` : `${e.reps} reps`,
                    subDisplay: e.weight > 0 ? `x${e.reps}` : '',
                    isWinner: e.userName === h.winner
                }))
            })),

            individual_records: rawResult.rawStats.map((s: any) => {
                const userData = scoredUsers.find((u: any) => u.name === s.name);
                return {
                    name: s.name,
                    topMuscle: userData?.topMuscleName || 'FLEX',
                    stats: Object.entries(s.maxLifts).slice(0, 4).map(([k, v]: [string, any]) => ({
                        exercise: k,
                        display: v.weight > 0 ? `${v.weight}${v.unit === 'lbs' ? 'lbs' : 'kg'}` : `${v.reps} reps`,
                        metric: v.weight > 0 ? 'load' : 'reps'
                    }))
                };
            }),

            roast: rawResult.markdown_report.split('ROAST TÉCNICO')[1]?.replace(/[:*#]/g, '').trim() || "Análisis completado."
        };

        setAnalysis(processedData);

    } catch (e: any) {
        console.error("Arena Error:", e);
        setError(e.message || "Error desconocido al contactar con la IA.");
    } finally {
        setLoading(false);
    }
  };

  const isDraw = analysis?.winner === 'DRAW';
  const getColor = (name: string) => friendsData.find(f => f.name === name)?.color || '#ffffff';

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
            
            {/* BACKGROUND TEXTURE */}
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.04] pointer-events-none fixed"></div>

            {/* ERROR NOTIFICATION */}
            {error && (
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
                        AI-Powered Analysis • Volume • Consistency • 1RM Est
                     </p>
                </div>
            ) : (
                // --- RESULTS STATE ---
                <div className="space-y-12 animate-in slide-in-from-bottom-10 fade-in duration-700 relative z-10">
                    
                    {/* 1. PODIUM SECTION */}
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
                                            <Medal className="w-5 h-5 text-zinc-400" />
                                        </div>
                                        <span className="font-bold text-zinc-200 text-xs truncate w-full px-2 text-center mb-1">{analysis.rankings[1].name}</span>
                                        <span className="text-[8px] font-mono text-zinc-400 bg-black/40 px-2 py-0.5 rounded">{Math.round(analysis.rankings[1].score)} PTS</span>
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
                                        <span className="text-[10px] font-mono text-black font-bold bg-primary px-3 py-1 rounded-full shadow-glow">{Math.round(analysis.rankings[0].score)} PTS</span>
                                    </div>
                                </div>
                            )}
                            {/* BRONZE */}
                            {analysis.rankings[2] && (
                                <div className="flex flex-col items-center group w-1/3">
                                    <div className="text-[9px] font-black text-orange-900 mb-2 font-mono tracking-widest opacity-0 animate-in fade-in slide-in-from-bottom-2 delay-300 fill-mode-forwards">BRONZE</div>
                                    <div className="w-full max-w-[100px] bg-gradient-to-b from-[#4d331f] to-zinc-900 rounded-t-lg h-24 flex flex-col items-center justify-end pb-3 border-t border-x border-orange-900/40 relative shadow-2xl group-hover:-translate-y-1 transition-transform duration-300">
                                        <div className="absolute -top-4 p-2 bg-zinc-900 rounded-full border border-orange-900/60 shadow-xl">
                                            <Medal className="w-5 h-5 text-orange-700" />
                                        </div>
                                        <span className="font-bold text-orange-200/80 text-xs truncate w-full px-2 text-center mb-1">{analysis.rankings[2].name}</span>
                                        <span className="text-[8px] font-mono text-zinc-500 bg-black/40 px-2 py-0.5 rounded">{Math.round(analysis.rankings[2].score)} PTS</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* 2. VOLUME GRAPH */}
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* 3. CONSISTENCY */}
                        <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-6 flex flex-col backdrop-blur-sm">
                             <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2"><Trophy className="w-3 h-3 text-yellow-500" /> Consistency (XP)</h3>
                             <div className="flex-1 space-y-2">
                                {analysis.points_table.map((p: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/5 hover:border-white/10 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <span className={`text-[10px] font-mono w-5 h-5 flex items-center justify-center rounded ${i === 0 ? 'bg-yellow-500/20 text-yellow-500 font-bold' : 'text-zinc-600'}`}>#{i+1}</span>
                                            <span className="text-xs font-bold text-white">{p.name}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 px-2 py-0.5"><Flame className="w-3 h-3 text-orange-500" /><span className="text-xs font-mono font-bold text-zinc-300">{p.points} XP</span></div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 4. KEY MATCHUPS */}
                        <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-6 flex flex-col backdrop-blur-sm">
                            <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2"><Swords className="w-3 h-3 text-primary" /> Head-to-Head</h3>
                            {analysis.comparison_table.length === 0 ? <div className="text-center py-10 text-xs text-zinc-600 border border-dashed border-white/5 rounded-xl flex-1 flex items-center justify-center">Sin ejercicios comunes</div> : (
                                <div className="space-y-3 h-48 overflow-y-auto custom-scrollbar pr-2">
                                    {analysis.comparison_table.map((row: any, i: number) => (
                                        <div key={i} className="bg-black/60 p-3 rounded-2xl border border-white/5 flex flex-col gap-2 group hover:border-white/10 transition-colors">
                                            <div className="text-[10px] font-black text-white/50 border-b border-white/5 pb-1 uppercase tracking-wider">{row.exercise}</div>
                                            <div className="space-y-1">
                                                {row.results.map((res: any, j: number) => (
                                                    <div key={j} className={clsx("flex justify-between items-center text-[10px] px-2 py-1.5 rounded-lg", res.isWinner ? "bg-primary/10 border border-primary/20" : "")}>
                                                        <span className={res.isWinner ? "text-white font-bold" : "text-zinc-500"}>{res.userName}</span>
                                                        <div className="flex items-center gap-2">
                                                            <span className={clsx("font-mono", res.isWinner ? "text-primary font-bold" : "text-zinc-600")}>
                                                                {res.display} <span className="text-[9px] opacity-60 ml-0.5">{res.subDisplay}</span>
                                                            </span>
                                                            {res.isWinner && <Crown className="w-3 h-3 text-primary fill-primary" />}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 5. HALL OF FAME (CARDS) */}
                    {analysis.individual_records && (
                        <div className="space-y-4">
                            <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2 px-2"><Sparkles className="w-3 h-3 text-cyan-400" /> Hall of Fame</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {analysis.individual_records.map((profile: any, idx: number) => {
                                    const friendData = friendsData.find(f => f.name === profile.name);
                                    const color = friendData?.color || '#ffffff';
                                    return (
                                        <div key={idx} className="bg-zinc-900/40 border border-white/5 rounded-[1.5rem] p-5 relative overflow-hidden hover:bg-zinc-900/60 transition-colors group">
                                            {/* Accent Line */}
                                            <div className="absolute top-0 left-0 w-1 h-full opacity-70" style={{ backgroundColor: color }}></div>
                                            
                                            <div className="flex justify-between items-start mb-4 pl-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-black text-xs shadow-lg" style={{ backgroundColor: color }}>{profile.name.charAt(0)}</div>
                                                    <div>
                                                        <h4 className="font-bold text-white text-sm">{profile.name}</h4>
                                                        <span className="text-[9px] text-zinc-500 uppercase tracking-wider">Top Lifts</span>
                                                    </div>
                                                </div>
                                                {/* MUSCLE FOCUS BADGE */}
                                                <div className="flex items-center gap-1.5 bg-black/60 px-2 py-1 rounded-md border border-white/10">
                                                    <BicepsFlexed className="w-3 h-3 text-zinc-400" />
                                                    <span className="text-[9px] font-bold text-zinc-300 uppercase">{profile.topMuscle}</span>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 pl-3">
                                                {profile.stats.map((stat: any, sIdx: number) => (
                                                    <div key={sIdx} className="bg-black/30 rounded-lg p-2 border border-white/5 flex flex-col group-hover:border-white/10 transition-colors">
                                                        <div className="text-[9px] text-zinc-500 truncate mb-1 uppercase tracking-wide">{stat.exercise}</div>
                                                        <div className="text-xs font-mono font-bold text-white tracking-tight flex items-baseline gap-1">
                                                            {stat.display} 
                                                            {stat.metric === 'reps' && <span className="text-[9px] text-zinc-600 font-normal">reps</span>}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* 6. AI ROAST */}
                    {analysis.roast && (
                        <div className="bg-gradient-to-br from-zinc-900 to-black p-8 rounded-3xl border border-white/10 relative mt-6 text-center shadow-2xl overflow-hidden group">
                             <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10"></div>
                             <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-black px-4 py-1 text-[10px] font-black uppercase tracking-widest border border-white rounded-full shadow-glow z-10">
                                AI Verdict
                             </div>
                            <p className="text-sm md:text-base text-zinc-300 leading-relaxed italic font-serif opacity-90 relative z-10">
                                "{analysis.roast}"
                            </p>
                            <div className="mt-4 flex justify-center opacity-30 group-hover:opacity-100 transition-opacity">
                                <Activity className="w-5 h-5 text-primary" />
                            </div>
                        </div>
                    )}

                    <div className="pb-8 text-center">
                        <p className="text-[9px] text-zinc-700 font-mono uppercase tracking-[0.3em]">Arena Engine v2.0</p>
                    </div>

                </div>
            )}
        </div>
      </div>
    </div>
  );
};