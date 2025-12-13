import React from 'react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  startOfWeek, 
  endOfWeek,
  addMonths
} from 'date-fns';
import { clsx } from 'clsx';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, RotateCcw } from 'lucide-react';
import { Workout } from '../types';

interface CalendarViewProps {
  viewDate: Date;
  onViewDateChange: (date: Date) => void;
  workouts: Workout[];
  onSelectDate: (date: Date) => void;
  selectedDate: Date;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export const CalendarView: React.FC<CalendarViewProps> = ({ 
  viewDate,
  onViewDateChange,
  workouts, 
  onSelectDate,
  selectedDate
}) => {
  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const getWorkoutsForDay = (day: Date) => {
    return workouts.filter(w => isSameDay(new Date(w.date), day));
  };

  const handlePrevMonth = () => onViewDateChange(addMonths(viewDate, -1));
  const handleNextMonth = () => onViewDateChange(addMonths(viewDate, 1));
  const handleJumpToToday = () => {
    const now = new Date();
    onViewDateChange(now);
    onSelectDate(now);
  };

  const isCurrentMonth = isSameMonth(viewDate, new Date());

  return (
    <div className="w-full max-w-md mx-auto bg-surface rounded-lg border border-white/10 overflow-hidden shadow-xl">
      {/* Header */}
      <div className="p-4 border-b border-white/10 bg-black flex items-center justify-between relative">
        <button 
          onClick={handlePrevMonth}
          className="p-2 hover:bg-white/10 rounded-full transition-colors text-subtext hover:text-white"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center justify-center">
           <h2 className="text-lg font-bold text-text font-mono uppercase tracking-widest text-center">
             {format(viewDate, 'MMMM yyyy')}
           </h2>
           
           {/* Prominent Jump to Today Button */}
           {!isCurrentMonth && (
             <button 
               onClick={handleJumpToToday}
               className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mt-8 flex items-center gap-1 bg-primary text-black px-2 py-0.5 rounded text-[10px] font-bold uppercase shadow-glow-sm hover:bg-primaryHover transition-all animate-in fade-in zoom-in-95"
               title="Return to current month"
             >
               <RotateCcw className="w-3 h-3" />
               Go to Today
             </button>
           )}
        </div>

        <button 
          onClick={handleNextMonth}
          className="p-2 hover:bg-white/10 rounded-full transition-colors text-subtext hover:text-white"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Days Header */}
      <div className="grid grid-cols-7 border-b border-white/10 bg-surface/50">
        {WEEKDAYS.map((day) => (
          <div key={day} className="py-2 text-center text-xs font-bold text-subtext font-mono uppercase">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 auto-rows-fr bg-black/50">
        {calendarDays.map((day, dayIdx) => {
          const dayWorkouts = getWorkoutsForDay(day);
          const hasWorkout = dayWorkouts.length > 0;
          const isSelected = isSameDay(day, selectedDate);
          const isMonthDay = isSameMonth(day, monthStart);
          const isToday = isSameDay(day, new Date());

          return (
            <button
              key={day.toString()}
              onClick={() => {
                onSelectDate(day);
                if (!isMonthDay) {
                  onViewDateChange(day);
                }
              }}
              className={clsx(
                'relative h-14 w-full flex flex-col items-center justify-start pt-2 transition-all duration-200',
                !isMonthDay && 'text-zinc-800 bg-zinc-900/10',
                isMonthDay && 'text-subtext hover:bg-white/5',
                isSelected && 'bg-white/5 ring-1 ring-primary z-10',
                'border-r border-b border-white/5 last:border-r-0'
              )}
            >
              <span className={clsx(
                "text-xs font-mono w-6 h-6 flex items-center justify-center rounded",
                isToday && !isSelected && "bg-primary text-black font-bold shadow-glow-sm",
                isSelected && isToday && "bg-primary text-black font-bold shadow-glow-sm",
                isSelected && !isToday && "bg-white text-black font-bold"
              )}>
                {format(day, 'd')}
              </span>
              
              {/* Workout Dots Indicator */}
              {hasWorkout && (
                <div className="flex gap-0.5 mt-2">
                  {dayWorkouts.map((_, i) => (
                    <div 
                      key={i} 
                      className={clsx(
                        "w-1 h-1 rounded-full",
                        isSelected ? "bg-primary shadow-[0_0_5px_rgba(250,204,21,0.8)]" : "bg-zinc-600"
                      )} 
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};