import React, { useEffect, useState } from 'react';
import { X, Sparkles, Loader2, Calendar, Dumbbell, TrendingUp, Quote } from 'lucide-react';
import { Workout } from '../types';
import { generateMonthlyReport, MonthlyReportData } from '../services/workoutProcessor';
import { endOfMonth, isWithinInterval, format } from 'date-fns';
import startOfMonth from 'date-fns/startOfMonth';
import subMonths from 'date-fns/subMonths';
import es from 'date-fns/locale/es';
import enUS from 'date-fns/locale/en-US';
import { useLanguage } from '../contexts/LanguageContext';

interface MonthlySummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  viewDate: Date;
  workouts: Workout[];
}

// Simple Markdown Renderer component
const MarkdownText = ({ text }: { text: string }) => {
  if (!text) return null;

  // Split by double newlines for paragraphs
  const paragraphs = text.split('\n\n');

  return (
    <div className="space-y-3 text-sm text-text">
      {paragraphs.map((para, idx) => {
        // Check for headers
        if (para.startsWith('###')) {
            return <h4 key={idx} className="text-primary font-bold text-lg mt-4">{para.replace(/###\s*/, '')}</h4>;
        }
        if (para.startsWith('##')) {
            return <h3 key={idx} className="text-primary font-bold text-xl mt-5">{para.replace(/##\s*/, '')}</h3>;
        }

        // Handle Lists
        if (para.startsWith('- ') || para.startsWith('* ')) {
            const items = para.split('\n');
            return (
                <ul key={idx} className="list-disc list-inside space-y-1 ml-2 marker:text-primary">
                    {items.map((item, i) => (
                        <li key={i} dangerouslySetInnerHTML={{ __html: parseInlineStyles(item.replace(/^[-*]\s/, '')) }} />
                    ))}
                </ul>
            );
        }

        // Handle Horizontal Rules
        if (para.trim() === '---' || para.trim() === '***') {
            return <hr key={idx} className="border-border my-4" />;
        }

        // Default Paragraph
        return <p key={idx} className="leading-relaxed" dangerouslySetInnerHTML={{ __html: parseInlineStyles(para) }} />;
      })}
    </div>
  );
};

// Helper to handle bold (**text**) and italic (*text*)
const parseInlineStyles = (text: string) => {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-text font-extrabold">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em class="text-primary">$1</em>')
    .replace(/__(.*?)__/g, '<u>$1</u>');
};

export const MonthlySummaryModal: React.FC<MonthlySummaryModalProps> = ({ isOpen, onClose, viewDate, workouts }) => {
  const [data, setData] = useState<MonthlyReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t, language } = useLanguage();
  const dateLocale = language === 'es' ? es : enUS;

  useEffect(() => {
    if (isOpen) {
      generateReport();
    } else {
        setData(null);
        setError(null);
    }
  }, [isOpen, viewDate]);

  const generateReport = async () => {
    setLoading(true);
    setError(null);

    try {
        const currentMonthStart = startOfMonth(viewDate);
        const currentMonthEnd = endOfMonth(viewDate);
        
        const prevMonthStart = startOfMonth(subMonths(viewDate, 1));
        const prevMonthEnd = endOfMonth(subMonths(viewDate, 1));

        const currentWorkouts = workouts.filter(w => 
            isWithinInterval(new Date(w.date), { start: currentMonthStart, end: currentMonthEnd })
        );

        const prevWorkouts = workouts.filter(w => 
            isWithinInterval(new Date(w.date), { start: prevMonthStart, end: prevMonthEnd })
        );

        if (currentWorkouts.length === 0) {
            setError(t('no_data_month'));
            setLoading(false);
            return;
        }

        const reportData = await generateMonthlyReport(
            currentWorkouts, 
            prevWorkouts, 
            format(viewDate, 'MMMM', { locale: dateLocale }),
            language
        );
        setData(reportData);

    } catch (e: any) {
        console.error(e);
        setError("La IA se ha lesionado pensando. Intenta de nuevo.");
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
                <Sparkles className="w-5 h-5" />
             </div>
             <div>
                <h3 className="text-xl font-bold text-text leading-none tracking-tight">{t('monthly_report')}</h3>
                <p className="text-xs text-subtext font-mono mt-1 uppercase tracking-wider flex items-center gap-1">
                   <Calendar className="w-3 h-3" /> {format(viewDate, 'MMMM yyyy', { locale: dateLocale })}
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
                <div className="divide-y divide-border">
                    
                    {/* SECTION 1: EXERCISE HIGHLIGHTS */}
                    <div className="p-5">
                        <div className="flex items-center gap-2 mb-4 text-subtext text-xs font-bold uppercase tracking-widest">
                            <Dumbbell className="w-4 h-4 text-primary" />
                            <span>{t('exercise_highlights')}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {data.stats.map((stat, idx) => (
                                <div key={idx} className="bg-surfaceHighlight/50 border border-border rounded-xl p-3 flex flex-col">
                                    <div className="text-sm font-bold text-text truncate mb-2" title={stat.name}>{stat.name}</div>
                                    <div className="flex justify-between items-end mt-auto">
                                        <div>
                                            <div className="text-[10px] text-subtext font-mono uppercase">{t('top_lift')}</div>
                                            <div className="text-lg font-bold text-primary leading-none">{stat.topWeight}<span className="text-xs font-normal text-primary/70 ml-0.5">kg</span></div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] text-subtext font-mono uppercase">{t('vol')}</div>
                                            <div className="text-xs font-bold text-text">{stat.totalSets} <span className="text-[9px] font-normal text-subtext">sets</span></div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* SECTION 2: AI ANALYSIS */}
                    <div className="p-5 bg-surfaceHighlight/10">
                        <div className="flex items-center gap-2 mb-4 text-subtext text-xs font-bold uppercase tracking-widest">
                            <TrendingUp className="w-4 h-4 text-blue-400" />
                            <span>{t('gym_bro_analysis')}</span>
                        </div>
                        <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm">
                            <MarkdownText text={data.analysis} />
                        </div>
                    </div>

                    {/* SECTION 3: VERDICT */}
                    <div className="p-6 bg-gradient-to-b from-surface to-surfaceHighlight/30 text-center">
                        <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-full mb-3">
                            <Quote className="w-6 h-6 text-primary" />
                        </div>
                        <h3 className="text-sm font-bold text-subtext uppercase tracking-widest mb-2">{t('final_verdict')}</h3>
                        <p 
                            className="text-xl md:text-2xl font-black text-text italic leading-tight"
                            dangerouslySetInnerHTML={{ __html: `"${parseInlineStyles(data.verdict)}"` }}
                        />
                    </div>

                </div>
            ) : null}
        </div>

      </div>
    </div>
  );
};