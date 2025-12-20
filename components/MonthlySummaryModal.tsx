import React, { useEffect, useState } from 'react';
import { X, ShieldAlert, AlertTriangle, Target, FileText, Dumbbell, Save, Check } from 'lucide-react';
import { Workout, GlobalReportData, User, WorkoutPlan, Exercise } from '../types';
import { generateGlobalReport } from '../services/workoutProcessor';
import { useLanguage } from '../contexts/LanguageContext';
import { useExercises, ExerciseDef } from '../contexts/ExerciseContext';
import { getCanonicalId, getLocalizedName } from '../utils';
import { useScrollLock } from '../hooks/useScrollLock';

// Componente Loader interno
const Loader2 = ({ className }: { className?: string }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
);

interface MonthlySummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  workouts: Workout[];
  currentUser: User;
  onSavePlan?: (plan: WorkoutPlan) => Promise<void>;
}

// --- RENDERIZADOR BLINDADO V3 ---
const DossierRenderer = ({ text, catalog, onSaveDay }: { text: string, catalog: ExerciseDef[], onSaveDay: (dayName: string, exercises: Exercise[]) => void }) => {
  if (!text) return null;
  
  // Dividir y limpiar líneas vacías
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
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
            return <strong key={i} className="text-white font-bold">{boldText}</strong>;
          }
          return part;
        })}</>
    );
  };

  // Extracción tolerante a fallos
  const extractExercises = (linesChunk: string[]): Exercise[] => {
      return linesChunk.map(l => {
          // Eliminar viñetas, números, guiones
          const cleanLine = l.replace(/^[\*\-\d\.\s]+/, '').trim();
          
          let name = cleanLine;
          let sets = 3;
          let reps = 10;
          let weightVal = 0;
          let unit = 'kg';

          if (cleanLine.includes('|')) {
              const parts = cleanLine.split('|').map(p => p.trim());
              name = parts[0];
              const setsStr = parts[1] || '';
              const weightStr = parts[2] || '';
              const match = setsStr.match(/(\d+)\s*x\s*(\d+)/i);
              if (match) { sets = parseInt(match[1]); reps = parseInt(match[2]); }
              const wMatch = weightStr.match(/(\d+(\.\d+)?)/);
              if (wMatch) weightVal = parseFloat(wMatch[0]);
              if (weightStr.toLowerCase().includes('lbs')) unit = 'lbs';
          } else {
             const match = cleanLine.match(/(\d+)\s*x\s*(\d+)/i);
             if (match) {
                 sets = parseInt(match[1]);
                 reps = parseInt(match[2]);
                 const splitIdx = cleanLine.indexOf(match[0]);
                 if (splitIdx > 0) name = cleanLine.substring(0, splitIdx).trim();
             }
          }
          
          const canonicalId = getCanonicalId(name, catalog);
          const normalizedName = getLocalizedName(canonicalId, catalog, 'es');

          return { name: normalizedName, sets: Array(sets).fill({ reps, weight: weightVal, unit }) };
      });
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // 1. TABLAS
    if (line.startsWith('|')) {
      const tableRows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        const cells = lines[i].split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1).map(c => c.trim());
        if (cells.length > 0) tableRows.push(cells);
        i++;
      }
      if (tableRows.length > 0) {
        elements.push(
          <div key={`table-${i}`} className="my-6 w-full rounded-xl border border-white/10 bg-black/40 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="bg-zinc-900/50">{tableRows[0].map((cell, idx) => <th key={idx} className="px-3 py-3 font-black text-primary uppercase">{cell}</th>)}</tr></thead>
              <tbody className="divide-y divide-white/5">{tableRows.slice(1).map((row, rIdx) => <tr key={rIdx}>{row.map((c, cIdx) => <td key={cIdx} className="px-3 py-3 font-mono text-zinc-300 border-r border-white/5">{renderFormattedText(c)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // 2. TÍTULOS GRANDES (##)
    if (line.startsWith('## ')) {
      elements.push(
        <div key={`header-${i}`} className="flex items-center gap-3 pt-8 border-b border-white/10 pb-2 mb-4 mt-4">
            <Target className="w-4 h-4 text-primary" />
            <h4 className="text-sm font-black uppercase tracking-[0.2em] text-white italic">{line.replace(/#/g, '').trim()}</h4>
        </div>
      );
      i++; continue;
    }

    // 3. DETECCIÓN DE DÍAS (ULTRA TOLERANTE)
    // Detecta "DÍA", "DIA", "DAY" en cualquier parte del inicio de la línea
    const cleanLineUpper = line.toUpperCase().replace(/^[\*\#\-\d\.\s]+/, '').trim();
    if (cleanLineUpper.startsWith('DÍA') || cleanLineUpper.startsWith('DIA') || cleanLineUpper.startsWith('DAY')) {
      const dayNameRaw = line.replace(/[*#]/g, '').trim(); 
      const exerciseLinesRaw: string[] = [];
      let nextIdx = i + 1;
      
      // Capturamos hasta el siguiente título o día
      while (nextIdx < lines.length) {
          const nextLine = lines[nextIdx];
          const nextClean = nextLine.toUpperCase().replace(/^[\*\#\-\d\.\s]+/, '').trim();
          
          if (nextLine.startsWith('## ')) break; 
          if (nextClean.startsWith('DÍA') || nextClean.startsWith('DIA') || nextClean.startsWith('DAY')) break;
          
          // Capturamos cualquier línea que parezca un ejercicio (con o sin pipe, lista o texto)
          if (nextLine.length > 3) { 
              exerciseLinesRaw.push(nextLine);
          }
          nextIdx++;
      }

      // Filtramos las líneas que realmente parecen ejercicios (empiezan por símbolo o tienen números de series)
      const validExerciseLines = exerciseLinesRaw.filter(l => 
          l.trim().match(/^[\*\-\•\d]/) || l.includes('|') || l.match(/\dx\d/i)
      );

      const exercises = extractExercises(validExerciseLines);
      
      elements.push(
        <div key={`day-${i}`} className="mb-6 bg-white/5 rounded-xl p-4 border border-white/5">
            <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></div>
                    <h5 className="text-sm font-black text-white uppercase tracking-widest">{renderFormattedText(dayNameRaw)}</h5>
                </div>
                {exercises.length > 0 && (
                    <button onClick={() => handleSaveInternal(dayNameRaw, exercises)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase transition-all border ${savedDays.has(dayNameRaw) ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20'}`}>
                        {savedDays.has(dayNameRaw) ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                        {savedDays.has(dayNameRaw) ? 'Guardado' : 'Guardar'}
                    </button>
                )}
            </div>
            <div className="space-y-2">
                {validExerciseLines.map((exLine, idx) => (
                    <div key={idx} className="flex items-start gap-3 pl-2">
                        <Dumbbell className="w-3.5 h-3.5 text-zinc-600 mt-1 shrink-0" />
                        <p className="text-xs text-zinc-300 font-mono leading-relaxed">
                            {renderFormattedText(exLine.replace(/^[\*\-\d\.\s]+/, ''))}
                        </p>
                    </div>
                ))}
            </div>
        </div>
      );
      i = nextIdx; 
      continue;
    }

    // 4. SUBTÍTULOS (###)
    if (line.startsWith('###')) {
        elements.push(<h5 key={`sub-${i}`} className="text-xs font-bold text-primary/80 mt-4 mb-2 pl-3 border-l-2 border-primary/30 uppercase">{line.replace(/#/g, '').trim()}</h5>);
        i++; continue;
    }

    // 5. LISTAS NORMALES
    if (/^[\*\-\•]/.test(line)) {
      elements.push(
        <div key={`list-${i}`} className="flex gap-3 pl-2 py-1 items-start">
            <div className="mt-2 w-1 h-1 rounded-full bg-zinc-600 shrink-0" />
            <p className="text-sm text-zinc-400 leading-relaxed">{renderFormattedText(line.replace(/^[\*\-\•]\s*/, ''))}</p>
        </div>
      );
    } else {
        // Texto normal
        elements.push(<p key={`p-${i}`} className="text-sm text-zinc-500 leading-relaxed mb-1">{renderFormattedText(line)}</p>);
    }
    i++;
  }

  return <div className="space-y-1 font-sans pb-10">{elements}</div>;
};

// --- COMPONENTE PRINCIPAL ---
export const MonthlySummaryModal: React.FC<MonthlySummaryModalProps> = ({ isOpen, onClose, workouts, currentUser, onSavePlan }) => {
  const [data, setData] = useState<GlobalReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { language } = useLanguage();
  const { catalog } = useExercises();

  useScrollLock(isOpen);

  useEffect(() => {
    if (isOpen) {
        setLoading(true); setError(null);
        // Pequeño delay para asegurar que la animación de entrada se vea fluida
        const timer = setTimeout(() => {
             if (!workouts || workouts.length === 0) {
                setError("Sin datos registrados."); setLoading(false);
                return;
            }
            generateGlobalReport(workouts, language, currentUser.weight || 80, currentUser.height || 180)
                .then(setData)
                .catch(e => setError(e.message || "Error neuronal."))
                .finally(() => setLoading(false));
        }, 100);
        return () => clearTimeout(timer);
    } else {
        setData(null); setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[#0a0a0a] border border-white/10 rounded-[2rem] shadow-2xl flex flex-col h-[92vh] animate-in zoom-in-95 duration-300 text-white overflow-hidden ring-1 ring-white/5">
        <div className="flex items-center justify-between p-6 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-zinc-900 border border-white/10 text-primary rounded-2xl"><ShieldAlert className="w-6 h-6" /></div>
            <div><h3 className="text-xl font-black text-white italic uppercase leading-none">CRÓNICAS DEL HIERRO</h3><span className="text-[10px] text-zinc-500 font-mono uppercase tracking-[0.2em]">{currentUser.name}</span></div>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-600 hover:text-white bg-white/5 rounded-full"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#050505] p-6">
            {loading ? (
                <div className="flex flex-col items-center justify-center h-full space-y-4">
                    <Loader2 className="w-10 h-10 text-primary animate-spin" />
                    <span className="text-[10px] font-mono text-primary uppercase tracking-widest animate-pulse">Analizando Biomecánica...</span>
                </div>
            ) : error ? (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                    <AlertTriangle className="w-12 h-12 text-red-500" />
                    <p className="text-red-500 font-black uppercase font-mono tracking-widest">{error}</p>
                </div>
            ) : data ? (
                <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6">
                    <div className="grid grid-cols-1 gap-4">
                        <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-5 relative overflow-hidden group">
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Volumen Histórico</span>
                            <div className="flex items-baseline gap-2 mb-2"><span className="text-4xl font-black text-white font-mono tracking-tighter">{(data.totalVolumeKg / 1000).toFixed(1)}</span><span className="text-xs font-bold text-zinc-500 uppercase">TONS</span></div>
                            {data.volumeEquivalentGlobal && <div className="text-xs font-medium text-zinc-400 border-t border-white/5 pt-2 flex items-center gap-2"><span className="text-[10px] bg-white/10 px-1.5 rounded text-white">=</span> {data.volumeEquivalentGlobal}</div>}
                        </div>
                        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 relative overflow-hidden group">
                            <span className="text-[10px] font-black text-primary uppercase tracking-widest block mb-2">Volumen {data.monthName}</span>
                            <div className="flex items-baseline gap-2 mb-2"><span className="text-4xl font-black text-primary font-mono tracking-tighter">{(data.monthlyVolumeKg / 1000).toFixed(1)}</span><span className="text-xs font-bold text-primary/60 uppercase">TONS</span></div>
                            {data.volumeEquivalentMonthly && <div className="text-xs font-medium text-primary/80 border-t border-primary/10 pt-2 flex items-center gap-2"><span className="text-[10px] bg-primary/20 px-1.5 rounded text-primary">=</span> {data.volumeEquivalentMonthly}</div>}
                        </div>
                    </div>

                    <div className="bg-zinc-900/20 border border-white/5 rounded-[2rem] p-6 shadow-inner">
                        <div className="flex items-center gap-2 mb-6 border-b border-white/5 pb-4">
                            <FileText className="w-4 h-4 text-primary" />
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Informe Táctico</span>
                        </div>
                        <DossierRenderer text={data.monthlyAnalysisText} catalog={catalog} onSaveDay={(name, ex) => onSavePlan?.({ id: crypto.randomUUID(), name, exercises: ex })} />
                    </div>
                </div>
            ) : null}
        </div>
      </div>
    </div>
  );
};