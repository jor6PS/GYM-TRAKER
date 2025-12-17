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

// Static constant to avoid recreation
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']; 

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

  // Memoize date calculations to prevent expensive re-runs on every render
  const { calendarDays, monthStart } = useMemo(() => {
    const monthStart = startOfMonth(viewDate);
    const monthEnd = endOfMonth(monthStart);
    // Force week to start on Monday (1)
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
    
    return {
      calendarDays: eachDayOfInterval({ start: startDate, end: endDate }),
      monthStart
    };
  }, [viewDate]); // Only recalculate if viewDate changes

  const handlePrevMonth = () => onViewDateChange(addMonths(viewDate, -1));
  const handleNextMonth = () => onViewDateChange(addMonths(viewDate, 1));
  
  const isCurrentMonth = isSameMonth(viewDate, new Date());
  
  return (
    <div className="w-full bg-surface border border-border rounded-3xl overflow-hidden shadow-2xl relative transition-colors duration-300">
      {/* Glossy Header */}
      <div className="p-4 flex items-center justify-between border-b border-border bg-surfaceHighlight/30">
        <button onClick={handlePrevMonth} className="p-2 hover:bg-surfaceHighlight rounded-full transition-colors text-subtext hover:text-text">
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-text tracking-wide uppercase">
                {format(viewDate, 'MMMM yyyy', { locale: dateLocale })}
            </h2>
        </div>

        <button onClick={handleNextMonth} className="p-2 hover:bg-surfaceHighlight rounded-full transition-colors text-subtext hover:text-text">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
      
      {!isCurrentMonth && (
         <button 
           onClick={() => { const now = new Date(); onViewDateChange(now); onSelectDate(now); }}
           className="absolute top-4 right-16 p-2 text-primary hover:bg-primary/10 rounded-full transition-colors"
           title="Today"
         >
           <RotateCcw className="w-4 h-4" />
         </button>
      )}

      <div className="p-4">
        <div className="grid grid-cols-7 mb-2">
          {WEEKDAYS.map((day, i) => (
            <div key={i} className="text-center text-[10px] font-bold text-subtext opacity-70">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-2 gap-x-1">
          {calendarDays.map((day) => {
            // Optimizing the loop: check existence directly
            const parsedDay = day.getTime();
            
            // Check own workouts
            const hasMyWorkout = workouts.some(w => {
                const wDate = parseLocalDate(w.date);
                return isSameDay(wDate, day);
            });

            // Check friends workouts (Memoized visually below)
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
                  'relative h-11 w-full flex flex-col items-center justify-start pt-1 rounded-xl transition-all duration-300 border box-border',
                  !isMonthDay ? 'opacity-20 border-transparent' : '',
                  isSelected 
                    ? 'bg-surfaceHighlight border-primary/50 scale-105 shadow-glow z-10' 
                    : isToday 
                        ? 'border-text/30 border-solid' 
                        : 'border-transparent',
                  !isSelected && 'hover:bg-surfaceHighlight'
                )}
              >
                <span className={clsx(
                    "text-xs font-bold mb-1 transition-colors", 
                    isSelected ? "text-primary" : "text-subtext"
                )}>
                    {format(day, 'd')}
                </span>
                
                <div className="flex gap-0.5 justify-center flex-wrap px-0.5 w-full absolute bottom-1 max-w-[90%]">
                    {hasMyWorkout && (
                        <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_5px_#D4FF00]"></div>
                    )}
                    {friendDots.map((color, i) => (
                        <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 4px ${color}` }}></div>
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