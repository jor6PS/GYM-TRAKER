import React, { useState } from 'react';
import { X, Swords, Crown, Skull, Sparkles, Loader2, Trophy, Flame } from 'lucide-react';
import { generateGroupAnalysis } from '../services/workoutProcessor';
import { Workout, User, GroupAnalysisData } from '../types';
import { clsx } from 'clsx';
import { useLanguage } from '../contexts/LanguageContext';

interface ArenaModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  friendsData: { userId: string; name: string; workouts: Workout[]; color: string }[];
}

export const ArenaModal: React.FC<ArenaModalProps> = ({ isOpen, onClose, currentUser, friendsData }) => {
  const [analysis, setAnalysis] = useState<GroupAnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const { t, language } = useLanguage();

  if (!isOpen) return null;

  const handleBattle = async () => {
    setLoading(true);
    try {
        // Prepare payload (using real names and workouts)
        const usersPayload = friendsData.map(f => ({
            name: f.name,
            workouts: f.workouts
        }));

        const result = await generateGroupAnalysis(usersPayload, language);
        setAnalysis(result);
    } catch (e) {
        console.error(e);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />
      
      <div className="relative w-full max-w-2xl bg-surface border border-primary/30 rounded-3xl shadow-[0_0_50px_rgba(212,255,0,0.1)] flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="p-6 border-b border-border bg-gradient-to-r from-zinc-900 to-black flex justify-between items-center shrink-0">
             <div>
                 <h2 className="text-2xl font-black text-white italic tracking-tighter flex items-center gap-2">
                    {t('arena_title')} <Swords className="w-6 h-6 text-primary" />
                 </h2>
                 <p className="text-xs text-subtext font-mono uppercase tracking-widest mt-1">
                    {friendsData.length} {t('gladiators_ready')}
                 </p>
             </div>
             <button onClick={onClose} className="text-subtext hover:text-white"><X className="w-6 h-6" /></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-background custom-scrollbar">
            
            {!analysis ? (
                <div className="flex flex-col items-center justify-center py-10 min-h-[300px]">
                    {/* Competitors Chips (Only show before fight) */}
                    <div className="flex flex-wrap gap-2 mb-10 justify-center">
                        {friendsData.map(f => (
                            <div key={f.userId} className="px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-2" style={{ borderColor: f.color, color: f.color, backgroundColor: `${f.color}10` }}>
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: f.color }}></div>
                                {f.name}
                            </div>
                        ))}
                    </div>

                     <button 
                        onClick={handleBattle}
                        disabled={loading}
                        className="group relative px-8 py-4 bg-primary text-black font-black text-xl italic uppercase tracking-widest clip-path-polygon hover:scale-105 transition-transform disabled:opacity-50 disabled:scale-100 shadow-glow"
                        style={{ clipPath: 'polygon(10% 0, 100% 0, 90% 100%, 0% 100%)' }}
                     >
                        {loading ? (
                            <span className="flex items-center gap-2"><Loader2 className="animate-spin" /> {t('judging')}</span>
                        ) : (
                            <span className="flex items-center gap-2">{t('fight')} <Swords className="w-5 h-5" /></span>
                        )}
                     </button>
                     <p className="mt-4 text-xs text-subtext font-mono">
                        Calculates PRs, Consistency (Points), and Volume.
                     </p>
                </div>
            ) : (
                <div className="space-y-8 animate-in slide-in-from-bottom-10 fade-in duration-500">
                    
                    {/* 1. Verdict Section (Alpha/Beta) */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-yellow-500/10 border border-yellow-500/30 p-4 rounded-2xl flex flex-col items-center text-center relative overflow-hidden">
                             <div className="absolute top-0 right-0 p-2 opacity-20"><Crown className="w-12 h-12 text-yellow-500" /></div>
                             <span className="text-[10px] font-bold text-yellow-500 uppercase tracking-widest mb-1">{t('alpha')}</span>
                             <h3 className="text-xl md:text-2xl font-black text-white truncate w-full">{analysis.winner}</h3>
                        </div>
                        <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-2xl flex flex-col items-center text-center relative overflow-hidden">
                             <div className="absolute top-0 right-0 p-2 opacity-20"><Skull className="w-12 h-12 text-red-500" /></div>
                             <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-1">{t('beta')}</span>
                             <h3 className="text-xl md:text-2xl font-black text-white truncate w-full">{analysis.loser}</h3>
                        </div>
                    </div>

                    {/* 2. Points & Comparison Table Container */}
                    <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-4 md:p-6 space-y-6">
                        
                        {/* Points Leaderboard */}
                        <div>
                            <h3 className="text-xs font-bold text-subtext uppercase tracking-widest mb-3 flex items-center gap-2">
                                <Trophy className="w-4 h-4 text-yellow-500" /> {t('consistency_points')}
                            </h3>
                            <div className="space-y-2">
                                {analysis.points_table.map((p, i) => (
                                    <div key={i} className="flex items-center justify-between p-2 rounded bg-black/40 border border-white/5">
                                        <div className="flex items-center gap-3">
                                            <span className={`text-xs font-mono w-4 ${i === 0 ? 'text-yellow-500 font-bold' : 'text-zinc-600'}`}>#{i+1}</span>
                                            <span className="text-sm font-bold text-white">{p.name}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
                                            <Flame className="w-3 h-3 text-orange-500" />
                                            <span className="text-xs font-mono font-bold text-white">{p.points} XP</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="h-px bg-white/5 w-full"></div>

                        {/* Comparison Table */}
                        <div>
                            <h3 className="text-xs font-bold text-subtext uppercase tracking-widest mb-3 flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-primary" /> {t('key_matchups')}
                            </h3>
                            
                            {analysis.comparison_table.length === 0 ? (
                                <div className="text-center py-4 text-xs text-subtext border border-dashed border-white/10 rounded-lg">
                                    {t('no_common_exercises')}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {analysis.comparison_table.map((row, i) => (
                                        <div key={i} className="bg-black/40 p-3 rounded-xl border border-white/5 flex flex-col gap-2">
                                            <div className="text-sm font-bold text-white/90 border-b border-white/5 pb-1 mb-1">
                                                {row.exercise}
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                {row.results.map((res, j) => {
                                                    const isWinner = res.userName === row.winnerName;
                                                    return (
                                                        <div key={j} className={clsx(
                                                            "flex justify-between items-center text-xs px-2 py-1.5 rounded",
                                                            isWinner ? "bg-primary/10 border border-primary/30" : "bg-white/5 border border-transparent"
                                                        )}>
                                                            <span className={isWinner ? "text-white font-bold" : "text-zinc-400"}>
                                                                {res.userName}
                                                            </span>
                                                            <span className={clsx(
                                                                "font-mono font-bold",
                                                                isWinner ? "text-primary" : "text-zinc-500"
                                                            )}>
                                                                {res.weight}kg
                                                            </span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 3. Roast Section */}
                    <div className="bg-surfaceHighlight/30 p-6 rounded-2xl border border-white/5 relative">
                        <QuoteIcon className="absolute top-4 left-4 w-6 h-6 text-primary opacity-20" />
                        <p className="text-sm text-zinc-300 leading-relaxed italic text-center font-medium relative z-10 px-4">
                            "{analysis.roast}"
                        </p>
                    </div>

                </div>
            )}
        </div>

      </div>
    </div>
  );
};

const QuoteIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M14.017 21L14.017 18C14.017 16.8954 14.9124 16 16.017 16H19.017C19.5693 16 20.017 15.5523 20.017 15V9C20.017 8.44772 19.5693 8 19.017 8H15.017C14.4647 8 14.017 8.44772 14.017 9V11C14.017 11.5523 13.5693 12 13.017 12H12.017V5H22.017V15C22.017 18.3137 19.3307 21 16.017 21H14.017ZM5.0166 21L5.0166 18C5.0166 16.8954 5.91203 16 7.0166 16H10.0166C10.5689 16 11.0166 15.5523 11.0166 15V9C11.0166 8.44772 10.5689 8 10.0166 8H6.0166C5.46432 8 5.0166 8.44772 5.0166 9V11C5.0166 11.5523 4.56889 12 4.0166 12H3.0166V5H13.0166V15C13.0166 18.3137 10.3303 21 7.0166 21H5.0166Z" />
    </svg>
);