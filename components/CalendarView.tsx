import React from 'react';
import { 
  format, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  endOfWeek,
  addMonths
} from 'date-fns';
import { clsx } from 'clsx';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { Workout } from '../types';

interface CalendarViewProps {
  viewDate: Date;
  onViewDateChange: (date: Date) => void;
  workouts: Workout[];
  onSelectDate: (date: Date) => void;
  selectedDate: Date;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const startOfMonth = (date: Date) => {
  const d = new Date(date);
  d.setDate(1); d.setHours(0, 0, 0, 0); return d;
};

const startOfWeek = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  d.setDate(diff); d.setHours(0, 0, 0, 0); return d;
};

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

  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const getWorkoutsForDay = (day: Date) => workouts.filter(w => isSameDay(new Date(w.date), day));
  const handlePrevMonth = () => onViewDateChange(addMonths(viewDate, -1));
  const handleNextMonth = () => onViewDateChange(addMonths(viewDate, 1));
  
  const isCurrentMonth = isSameMonth(viewDate, new Date());

  return (
    <div className="w-full bg-surface border border-white/5 rounded-3xl overflow-hidden shadow-2xl relative">
      {/* Glossy Header */}
      <div className="p-4 flex items-center justify-between border-b border-white/5 bg-white/[0.02]">
        <button onClick={handlePrevMonth} className="p-2 hover:bg-white/10 rounded-full transition-colors text-zinc-400 hover:text-white">
          <ChevronLeft className="w-5 h-5" />
        </button>

        <h2 className="text-sm font-bold text-white tracking-wide uppercase">
             {format(viewDate, 'MMMM yyyy')}
        </h2>

        <button onClick={handleNextMonth} className="p-2 hover:bg-white/10 rounded-full transition-colors text-zinc-400 hover:text-white">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
      
      {!isCurrentMonth && (
         <button 
           onClick={() => { const now = new Date(); onViewDateChange(now); onSelectDate(now); }}
           className="absolute top-4 right-14 p-2 text-primary hover:bg-primary/10 rounded-full transition-colors"
           title="Today"
         >
           <RotateCcw className="w-4 h-4" />
         </button>
      )}

      <div className="p-4">
        {/* Weekday Headers */}
        <div className="grid grid-cols-7 mb-2">
          {WEEKDAYS.map((day) => (
            <div key={day} className="text-center text-[10px] font-bold text-zinc-600">
              {day}
            </div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-y-2 gap-x-1">
          {calendarDays.map((day) => {
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
                  if (!isMonthDay) onViewDateChange(day);
                }}
                className={clsx(
                  'relative h-10 w-full flex flex-col items-center justify-center rounded-xl transition-all duration-300',
                  !isMonthDay && 'opacity-20',
                  isSelected ? 'bg-primary text-black scale-105 font-bold shadow-glow' : 'hover:bg-white/5 text-zinc-300',
                  isToday && !isSelected && 'bg-white/10 text-white font-bold ring-1 ring-white/20'
                )}
              >
                <span className="text-xs">{format(day, 'd')}</span>
                
                {hasWorkout && (
                  <div className={clsx(
                    "w-1 h-1 rounded-full mt-1",
                    isSelected ? "bg-black" : "bg-primary shadow-[0_0_5px_#D4FF00]"
                  )} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};