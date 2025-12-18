
import React, { useMemo } from 'react';
import { 
  format, 
  startOfMonth,
  endOfMonth, 
  startOfWeek,
  endOfWeek,
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths
} from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { clsx } from 'clsx';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { Workout } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { parseLocalDate } from '../utils';

interface CalendarViewProps {
  viewDate: Date;
  onViewDateChange: (date: Date) => void;
  workouts: Workout[];
  selectedFriendsWorkouts?: { userId: string; color: string; workouts: Workout[] }[];
  onSelectDate: (date: Date) => void;
  selectedDate: Date;
  onSummaryClick: () => void;
}

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']; 

export const CalendarView: React.FC<CalendarViewProps> = ({ 
  viewDate,
  onViewDateChange,
  workouts, 
  selectedFriendsWorkouts = [],
  onSelectDate,
  selectedDate,
}) => {
  const { language } = useLanguage();
  const dateLocale = language === 'es' ? es : enUS;

  const { calendarDays, monthStart, trainingDaysInMonth } = useMemo(() => {
    const monthStart = startOfMonth(viewDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
    
    const daysInMonth = workouts.filter(w => isSameMonth(parseLocalDate(w.date), monthStart));
    const uniqueTrainingDays = new Set(daysInMonth.map(w => w.date)).size;

    return {
      calendarDays: eachDayOfInterval({ start: startDate, end: endDate }),
      monthStart,
      trainingDaysInMonth: uniqueTrainingDays
    };
  }, [viewDate, workouts]);

  const handlePrevMonth = () => onViewDateChange(addMonths(viewDate, -1));
  const handleNextMonth = () => onViewDateChange(addMonths(viewDate, 1));
  
  const isCurrentMonth = isSameMonth(viewDate, new Date());
  
  return (
    <div className="w-full bg-surface border border-border rounded-[2rem] overflow-hidden shadow-2xl relative transition-colors duration-300">
      <div className="p-5 flex items-center justify-between border-b border-border bg-surfaceHighlight/30">
        <button onClick={handlePrevMonth} className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-white">
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center">
            <h2 className="text-sm font-black text-text tracking-widest uppercase italic leading-none">
                {format(viewDate, 'MMMM yyyy', { locale: dateLocale })}
            </h2>
            <div className="flex items-center gap-2 mt-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></div>
                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em]">
                    {trainingDaysInMonth} Días Registrados
                </span>
            </div>
        </div>

        <button onClick={handleNextMonth} className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-white">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
      
      {!isCurrentMonth && (
         <button 
           onClick={() => { const now = new Date(); onViewDateChange(now); onSelectDate(now); }}
           className="absolute top-5 right-16 p-2 text-primary hover:bg-primary/10 rounded-full transition-colors"
           title="Today"
         >
           <RotateCcw className="w-4 h-4" />
         </button>
      )}

      <div className="p-5">
        <div className="grid grid-cols-7 mb-4">
          {WEEKDAYS.map((day, i) => (
            <div key={i} className="text-center text-[10px] font-black text-subtext opacity-50 uppercase">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-3 gap-x-2">
          {calendarDays.map((day) => {
            const parsedDay = day.getTime();
            const hasMyWorkout = workouts.some(w => isSameDay(parseLocalDate(w.date), day));
            const friendDots = selectedFriendsWorkouts
                .filter(fw => fw.workouts.some(w => isSameDay(parseLocalDate(w.date), day)))
                .map(fw => fw.color);

            const isSelected = isSameDay(day, selectedDate);
            const isMonthDay = isSameMonth(day, monthStart);
            const isToday = isSameDay(day, new Date());

            return (
              <button
                key={parsedDay}
                onClick={() => {
                  onSelectDate(day);
                  if (!isMonthDay) onViewDateChange(day);
                }}
                className={clsx(
                  'relative h-12 w-full flex flex-col items-center justify-center rounded-2xl transition-all duration-300 border-2',
                  !isMonthDay ? 'opacity-10 border-transparent' : '',
                  isSelected 
                    ? 'border-primary bg-primary/10 scale-105 z-10 shadow-[0_0_15px_rgba(212,255,0,0.2)]' 
                    : isToday 
                        ? 'border-text/40' 
                        : 'border-transparent bg-white/5',
                  !isSelected && isMonthDay && 'hover:bg-white/10'
                )}
              >
                <span className={clsx(
                    "text-xs font-black transition-colors", 
                    isSelected ? "text-primary" : "text-text"
                )}>
                    {format(day, 'd')}
                </span>
                
                <div className="flex gap-0.5 justify-center flex-wrap px-0.5 w-full absolute bottom-1.5">
                    {hasMyWorkout && (
                        <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-glow"></div>
                    )}
                    {friendDots.map((color, i) => (
                        <div key={i} className="w-1 h-1 rounded-full" style={{ backgroundColor: color }}></div>
                    ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
