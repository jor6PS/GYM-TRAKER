
import React, { useEffect, useState } from 'react';
import { X, ShieldAlert, AlertTriangle, Target, Activity, FileText, Dumbbell, Save, Check } from 'lucide-react';
import { Workout, GlobalReportData, User, WorkoutPlan, Exercise, Set as WorkoutSet } from '../types';
import { generateGlobalReport } from '../services/workoutProcessor';
import { useLanguage } from '../contexts/LanguageContext';
import { useExercises, ExerciseDef } from '../contexts/ExerciseContext';
import { getCanonicalId, getLocalizedName } from '../utils';
import { useScrollLock } from '../hooks/useScrollLock';

interface MonthlySummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  workouts: Workout[];
  currentUser: User;
  onSavePlan?: (plan: WorkoutPlan) => Promise<void>;
}

const DossierRenderer = ({ text, catalog, onSaveDay }: { text: string, catalog: ExerciseDef[], onSaveDay: (dayName: string, exercises: Exercise[]) => void }) => {
  if (!text) return null;
  
  const lines = text.split('\n').map(l => l.trim());
  const elements: React.ReactNode[] = [];
  const [savedDays, setSavedDays] = useState<Set<string>>(new Set());
  
  const handleSaveInternal = (dayName: string, exercises: Exercise[]) => {
      onSaveDay(dayName, exercises);
      setSavedDays(prev => new Set(prev).add(dayName));
      setTimeout(() => setSavedDays(prev => { const n = new Set(prev); n.delete(dayName); return n; }), 3000);
  };

  const renderFormattedText = (content: string) => {
    const parts = content.split(/(\*\*.*?\*\*)/g);
    return (
      <>{parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            const boldText = part.slice(2, -2).trim();
            const upper = boldText.toUpperCase();
            if (upper.includes('ALERTA')) return <span key={i} className="text-red-400 font-black bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/30 mx-1 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {boldText}</span>;
            if (upper.includes('DÍA')) return <span key={i} className="text-primary font-black bg-primary/10 px-2 py-0.5 rounded border border-primary/30 inline-block mt-2 mb-1">{boldText}</span>;
            return <strong key={i} className="text-white font-bold">{boldText}</strong>;
          }
          return part;
        })}</>
    );
  };

  const extractExercises = (linesChunk: string[]): Exercise[] => {
      return linesChunk.filter(l => l.startsWith('*') && l.includes('|')).map(l => {
          const parts = l.replace(/^(\*\s|\-\s|\•\s)/, '').trim().split('|').map(p => p.trim());
          const rawName = parts[0] || 'Ejercicio';
          const setsPart = parts[1] || '3x10';
          const weightPart = parts[2] || '0';
          
          const canonicalId = getCanonicalId(rawName, catalog);
          const normalizedName = getLocalizedName(canonicalId, catalog, 'es');
          
          const [setsCountStr, repsCountStr] = setsPart.toLowerCase().split('x');
          const setsCount = parseInt(setsCountStr) || 1;
          const repsCount = parseInt(repsCountStr) || 10;
          const weightVal = parseFloat(weightPart.match(/\d+(\.\d+)?/)?.[0] || '0');

          return { name: normalizedName, sets: Array(setsCount).fill({ reps: repsCount, weight: weightVal, unit: weightPart.toLowerCase().includes('lbs') ? 'lbs' : 'kg' }) };
      });
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line) { i++; continue; }

    if (line.startsWith('|')) {
      const tableRows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        const cells = lines[i].split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1).map(c => c.trim());
        if (cells.length > 0 && !cells.every(c => /^[-:\s]+$/.test(c))) tableRows.push(cells);
        i++;
      }
      if (tableRows.length > 0) {
        elements.push(
          <div key={`table-${i}`} className="my-6 w-full overflow-hidden rounded-xl border border-white/10 bg-black/40 shadow-lg overflow-x-auto">
            <table className="w-full text-left text-xs table-auto">
              <thead><tr className="bg-zinc-900/50">{tableRows[0].map((cell, idx) => <th key={idx} className="px-3 py-3 font-black text-primary uppercase tracking-wider">{cell}</th>)}</tr></thead>
              <tbody className="divide-y divide-white/5">{tableRows.slice(1).map((row, rIdx) => <tr key={rIdx}>{row.map((c, cIdx) => <td key={cIdx} className="px-3 py-3 font-mono text-zinc-300 border-r border-white/5 last:border-0">{renderFormattedText(c)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    if (line.startsWith('## ')) {
      elements.push(<div key={i} className="flex items-center gap-3 pt-8 border-b border-white/10 pb-2 mb-4 first:pt-0 mt-4"><Target className="w-4 h-4 text-primary" /><h4 className="text-sm font-black uppercase tracking-[0.2em] text-white italic">{line.replace('## ', '')}</h4></div>);
      i++; continue;
    }

    const isDayLine = line.startsWith('###') || (line.startsWith('**') && line.includes('DÍA'));
    if (isDayLine) {
      const dayName = line.replace(/\*|#/g, '').trim();
      const exerciseLines: string[] = [];
      let nextIdx = i + 1;
      while (nextIdx < lines.length && !lines[nextIdx].startsWith('##') && !lines[nextIdx].match(/\*\*D[ÍI]A/i)) {
          if (lines[nextIdx].startsWith('*')) exerciseLines.push(lines[nextIdx]);
          nextIdx++;
      }
      const exercises = extractExercises(exerciseLines);
      elements.push(
        <div key={i} className="pt-4 mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2"><div className="w-1 h-4 bg-zinc-700 rounded-full"></div><h5 className="text-xs font-black text-zinc-400 uppercase tracking-widest">{renderFormattedText(line)}</h5></div>
            {exercises.length > 0 && (
                <button onClick={() => handleSaveInternal(dayName, exercises)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase transition-all border ${savedDays.has(dayName) ? 'bg-green-500/20 text-green-400 border-green-500/30 shadow-glow' : 'bg-white/5 text-zinc-500 border-white/10 hover:bg-primary/10 hover:text-primary'}`}>{savedDays.has(dayName) ? <><Check className="w-3 h-3" /> Añadida</> : <><Save className="w-3 h-3" /> Añadir como Rutina</>}</button>
            )}
        </div>
      );
      i++; continue;
    }

    if (/^(\*\s|\-\s|\•\s)/.test(line)) {
      const content = line.replace(/^(\*\s|\-\s|\•\s)/, '').trim();
      elements.push(<div key={i} className="flex gap-3 pl-2 py-1 group items-start"><div className="mt-2 w-1.5 h-1.5 rounded-full bg-zinc-700 shrink-0" /><p className="text-sm text-zinc-400 leading-relaxed">{renderFormattedText(content)}</p></div>);
      i++; continue;
    }

    elements.push(<div key={i} className="flex gap-3 mb-2"><p className="text-sm text-zinc-500 leading-relaxed italic">{renderFormattedText(line)}</p></div>);
    i++;
  }
  return <div className="space-y-1 font-sans pb-10">{elements}</div>;
};

export const MonthlySummaryModal: React.FC<MonthlySummaryModalProps> = ({ isOpen, onClose, workouts, currentUser, onSavePlan }) => {
  const [data, setData] = useState<GlobalReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { language } = useLanguage();
  const { catalog } = useExercises();

  useScrollLock(isOpen);

  useEffect(() => {
    if (isOpen) generateReport();
    else { setData(null); setError(null); }
  }, [isOpen]);

  const generateReport = async () => {
    setLoading(true); setError(null);
    try {
      if (!workouts || workouts.length === 0) throw new Error("Sin datos registrados.");
      const reportData = await generateGlobalReport(workouts, language, currentUser.weight || 80, currentUser.height || 180);
      setData(reportData);
    } catch (e: any) { 
        setError(e.message || "Error neuronal."); 
    } finally { 
        setLoading(false); 
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[#0a0a0a] border border-white/10 rounded-[2rem] shadow-2xl flex flex-col h-[92vh] animate-in zoom-in-95 duration-300 text-text overflow-hidden ring-1 ring-white/5">
        <div className="flex items-center justify-between p-6 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-4"><div className="p-3 bg-zinc-900 border border-white/10 text-primary rounded-2xl"><ShieldAlert className="w-6 h-6" /></div><div><h3 className="text-xl font-black text-white italic uppercase leading-none">CRÓNICAS DEL HIERRO</h3><span className="text-[10px] text-zinc-500 font-mono uppercase tracking-[0.2em]">{currentUser.name}</span></div></div>
          <button onClick={onClose} className="p-2 text-zinc-600 hover:text-white bg-white/5 rounded-full"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#050505] p-6">
            {loading ? (
                <div className="flex flex-col items-center justify-center h-full space-y-4">
                    <Loader2 className="w-10 h-10 text-primary animate-spin" />
                    <span className="text-[10px] font-mono text-primary uppercase tracking-widest">Generando Inteligencia...</span>
                </div>
            ) : error ? (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4 px-6">
                    <AlertTriangle className="w-12 h-12 text-yellow-500" />
                    <p className="text-white font-black uppercase font-mono tracking-widest text-sm leading-relaxed">{error}</p>
                    {error.includes("API KEY") && (
                        <p className="text-zinc-500 text-xs italic">Puedes conseguir una clave gratis en Google AI Studio.</p>
                    )}
                </div>
            ) : data ? (
                <div className="animate-in fade-in slide-in-from-bottom-4">
                    <div className="grid grid-cols-1 gap-4 mb-6">
                        <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-5"><span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Carga Total Histórica</span><div className="flex items-baseline gap-2"><span className="text-3xl font-black text-white font-mono">{(data.totalVolumeKg / 1000).toFixed(1)}</span><span className="text-xs font-bold text-zinc-500 uppercase">TONS</span></div></div>
                        <div className="bg-primary/10 border border-primary/20 rounded-2xl p-5"><span className="text-[10px] font-black text-primary uppercase tracking-widest block mb-2">Carga Mensual ({data.monthName})</span><div className="flex items-baseline gap-2"><span className="text-3xl font-black text-primary font-mono">{(data.monthlyVolumeKg / 1000).toFixed(1)}</span><span className="text-xs font-bold text-primary/60 uppercase">TONS</span></div></div>
                    </div>
                    <div className="bg-zinc-900/20 border border-white/5 rounded-[2rem] p-6">
                        <div className="flex items-center gap-2 mb-6 border-b border-white/5 pb-4"><FileText className="w-4 h-4 text-primary" /><span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Dossier de Inteligencia</span></div>
                        <DossierRenderer text={data.monthlyAnalysisText} catalog={catalog} onSaveDay={(name, ex) => onSavePlan?.({ id: crypto.randomUUID(), name, exercises: ex })} />
                    </div>
                </div>
            ) : null}
        </div>
      </div>
    </div>
  );
};

const Loader2 = ({ className }: { className?: string }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
);
