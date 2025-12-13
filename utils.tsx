import React from 'react';
import { 
  Footprints,
  Dumbbell as LucideDumbbell
} from 'lucide-react';

// --- Custom SVG Components for Gym Silhouettes ---

const IconWrapper = ({ children, className }: { children?: React.ReactNode, className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    {children}
  </svg>
);

const BenchIcon = ({ className }: { className?: string }) => (
  <IconWrapper className={className}>
    {/* Bench surface */}
    <path d="M2 15h20" />
    {/* Legs */}
    <path d="M5 15v4" />
    <path d="M19 15v4" />
    {/* Barbell Rack Uprights (optional detail for context) */}
    <path d="M7 15v-5" />
    <path d="M17 15v-5" />
    {/* Barbell Bar above */}
    <path d="M4 6h16" />
    <path d="M4 6v2" />
    <path d="M20 6v2" />
  </IconWrapper>
);

const BarbellIcon = ({ className }: { className?: string }) => (
  <IconWrapper className={className}>
    {/* Bar */}
    <path d="M2 12h20" />
    {/* Inner Collars */}
    <path d="M6 9v6" />
    <path d="M18 9v6" />
    {/* Plates (Left) */}
    <path d="M4 7v10" />
    <path d="M2 8v8" />
    {/* Plates (Right) */}
    <path d="M20 7v10" />
    <path d="M22 8v8" />
  </IconWrapper>
);

const PullUpBarIcon = ({ className }: { className?: string }) => (
  <IconWrapper className={className}>
    {/* Frame */}
    <path d="M4 20v-9" />
    <path d="M20 20v-9" />
    {/* Top Bar */}
    <path d="M2 6h20" />
    {/* Handles */}
    <path d="M6 6v3" />
    <path d="M18 6v3" />
  </IconWrapper>
);

const MachineIcon = ({ className }: { className?: string }) => (
  <IconWrapper className={className}>
    {/* Weight Stack Frame */}
    <rect x="6" y="4" width="12" height="16" rx="2" />
    {/* Plates */}
    <path d="M8 8h8" />
    <path d="M8 12h8" />
    <path d="M8 16h8" />
    {/* Cable Line */}
    <path d="M12 4V2" />
    <path d="M12 2h6" />
  </IconWrapper>
);

const BodyweightIcon = ({ className }: { className?: string }) => (
  <IconWrapper className={className}>
    {/* Head */}
    <circle cx="12" cy="5" r="2" />
    {/* Body */}
    <path d="M12 7v5" />
    {/* Arms */}
    <path d="M8 9l4-2 4 2" />
    {/* Legs */}
    <path d="M8 17l4-5 4 5" />
  </IconWrapper>
);

const KettlebellIcon = ({ className }: { className?: string }) => (
  <IconWrapper className={className}>
    <path d="M6 20h12a2 2 0 0 0 2-2V12a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2z" />
    <path d="M8 10V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v4" />
  </IconWrapper>
);

export const getExerciseIcon = (name: string, className: string = "w-5 h-5") => {
  const n = name.toLowerCase();
  
  // 1. BENCH / CHEST PRESS (Use Bench Silhouette)
  if (n.includes('bench') || n.includes('chest press') || n.includes('incline') || n.includes('decline')) {
    if (n.includes('dumbbell')) return <LucideDumbbell className={className} />; // Specificity override
    return <BenchIcon className={className} />;
  }

  // 2. SQUAT / DEADLIFT / ROWS (Use Barbell)
  // These are typically big compound movements
  if (n.includes('squat') || n.includes('deadlift') || n.includes('clean') || n.includes('snatch') || (n.includes('row') && n.includes('barbell')) || n.includes('hip thrust')) {
    if (n.includes('dumbbell') || n.includes('kettlebell')) return <LucideDumbbell className={className} />;
    return <BarbellIcon className={className} />;
  }
  
  // 3. PULLUPS / LAT PULLDOWN (Use Pullup Bar)
  if (n.includes('pull up') || n.includes('chin up') || n.includes('lat') || n.includes('pull down') || n.includes('hanging')) {
    return <PullUpBarIcon className={className} />;
  }

  // 4. MACHINES / CABLES (Use Weight Stack)
  if (n.includes('cable') || n.includes('machine') || n.includes('extension') || n.includes('pushdown') || n.includes('fly') || n.includes('press') || n.includes('pec deck')) {
    if (n.includes('dumbbell')) return <LucideDumbbell className={className} />;
    return <MachineIcon className={className} />;
  }
  
  // 5. CARDIO (Use Footprints)
  if (n.includes('run') || n.includes('cardio') || n.includes('treadmill') || n.includes('elliptical') || n.includes('bike') || n.includes('walk')) {
    return <Footprints className={className} />;
  }

  // 6. BODYWEIGHT / CALISTHENICS
  if (n.includes('push up') || n.includes('dip') || n.includes('sit up') || n.includes('crunch') || n.includes('plank') || n.includes('burpee')) {
    return <BodyweightIcon className={className} />;
  }
  
  // 7. KETTLEBELL
  if (n.includes('kettlebell') || n.includes('swing')) {
    return <KettlebellIcon className={className} />;
  }

  // Default: Dumbbell (Safest generic "gym" icon)
  return <LucideDumbbell className={className} />;
};