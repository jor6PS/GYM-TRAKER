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
import { es, enUS } from 'date-fns/locale';
import { clsx } from 'clsx';
import { ChevronLeft, ChevronRight, RotateCcw, Sparkles } from 'lucide-react';
import { Workout } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

interface CalendarViewProps {
  viewDate: Date;
  onViewDateChange: (date: Date) => void;
  workouts: Workout[];
  selectedFriendsWorkouts?: { userId: string; color: string; workouts: Workout[] }[]; // New Prop
  onSelectDate: (date: Date) => void;
  selectedDate: Date;
  onSummaryClick: () => void;
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
  selectedFriendsWorkouts = [],
  onSelectDate,
  selectedDate,
  onSummaryClick
}) => {
  const { language } = useLanguage();
  const dateLocale = language === 'es' ? es : enUS;

  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const handlePrevMonth = () => onViewDateChange(addMonths(viewDate, -1));
  const handleNextMonth = () => onViewDateChange(addMonths(viewDate, 1));
  
  const isCurrentMonth = isSameMonth(viewDate, new Date());
  
  const workoutsInMonth = workouts.filter(w => isSameMonth(new Date(w.date), viewDate));
  const hasEnoughData = workoutsInMonth.length > 0;

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
            {/* AI Summary Trigger */}
            <button 
                onClick={onSummaryClick}
                disabled={!hasEnoughData}
                className={clsx(
                    "p-1.5 rounded-full transition-all border",
                    hasEnoughData 
                        ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 hover:scale-105 cursor-pointer shadow-[0_0_10px_rgba(212,255,0,0.1)]" 
                        : "bg-surfaceHighlight text-subtext border-border cursor-not-allowed opacity-50"
                )}
                title="Generate AI Monthly Report"
            >
                <Sparkles className="w-3.5 h-3.5" />
            </button>
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
        {/* Weekday Headers */}
        <div className="grid grid-cols-7 mb-2">
          {WEEKDAYS.map((day) => (
            <div key={day} className="text-center text-[10px] font-bold text-subtext">
              {day}
            </div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-y-2 gap-x-1">
          {calendarDays.map((day) => {
            const hasMyWorkout = workouts.some(w => isSameDay(new Date(w.date), day));
            const isSelected = isSameDay(day, selectedDate);
            const isMonthDay = isSameMonth(day, monthStart);
            const isToday = isSameDay(day, new Date());

            // Check friends workouts
            const friendDots = selectedFriendsWorkouts
                .filter(fw => fw.workouts.some(w => isSameDay(new Date(w.date), day)))
                .map(fw => fw.color);

            return (
              <button
                key={day.toString()}
                onClick={() => {
                  onSelectDate(day);
                  if (!isMonthDay) onViewDateChange(day);
                }}
                className={clsx(
                  'relative h-11 w-full flex flex-col items-center justify-start pt-1 rounded-xl transition-all duration-300',
                  !isMonthDay && 'opacity-20',
                  isSelected 
                    ? 'bg-surfaceHighlight border border-primary/50 scale-105 shadow-glow' 
                    : 'hover:bg-surfaceHighlight',
                  isToday && !isSelected && 'ring-1 ring-border bg-surfaceHighlight/30'
                )}
              >
                <span className={clsx("text-xs font-bold mb-1", isSelected ? "text-primary" : "text-subtext")}>
                    {format(day, 'd')}
                </span>
                
                {/* Dots Container - Multiplayer */}
                <div className="flex gap-1 justify-center flex-wrap px-1 w-full">
                    {/* My Dot */}
                    {hasMyWorkout && (
                        <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_5px_#D4FF00]"></div>
                    )}
                    
                    {/* Friends Dots */}
                    {friendDots.map((color, i) => (
                        <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 5px ${color}` }}></div>
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