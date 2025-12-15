
import React from 'react';
import { Users, Trophy, Sparkles } from 'lucide-react';
import { AppLogo } from '../utils';
import { User } from '../types';

interface AppHeaderProps {
  currentUser: User;
  language: string;
  toggleLanguage: () => void;
  pendingRequestsCount: number;
  activeFriendsCount: number;
  onOpenSocial: () => void;
  onOpenPR: () => void;
  onOpenMonthly: () => void;
  onOpenProfile: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  currentUser,
  language,
  toggleLanguage,
  pendingRequestsCount,
  activeFriendsCount,
  onOpenSocial,
  onOpenPR,
  onOpenMonthly,
  onOpenProfile
}) => {
  return (
    <div className="fixed top-0 left-0 right-0 z-40 px-4 py-4 pointer-events-none">
      <div className="max-w-md mx-auto pointer-events-auto">
        <header className="glass-panel rounded-full px-5 py-3 flex items-center justify-between shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-surface border border-border">
               <AppLogo className="w-full h-full object-contain" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-text">
              GYM<span className="text-primary">.AI</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-1">
             <button 
              onClick={toggleLanguage}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surfaceHighlight transition-colors text-subtext hover:text-text font-mono text-xs font-bold"
            >
              {language.toUpperCase()}
            </button>

            <button 
              onClick={onOpenSocial}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surfaceHighlight transition-colors text-subtext hover:text-blue-400 relative"
            >
              <Users className="w-5 h-5" />
              {pendingRequestsCount > 0 ? (
                   <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-surface"></span>
              ) : activeFriendsCount > 0 && (
                   <span className="absolute top-1 right-1 w-2 h-2 bg-blue-400 rounded-full"></span>
              )}
            </button>

            <button 
              onClick={onOpenPR}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surfaceHighlight transition-colors text-subtext hover:text-primary"
            >
              <Trophy className="w-5 h-5" />
            </button>

            <button 
              onClick={onOpenMonthly}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surfaceHighlight transition-colors text-subtext hover:text-yellow-400"
            >
              <Sparkles className="w-5 h-5" />
            </button>
            
            <button onClick={onOpenProfile} className="ml-1">
              <div className="w-9 h-9 rounded-full bg-surface border border-border p-0.5 overflow-hidden shadow-lg transition-transform hover:scale-105 active:scale-95">
                {currentUser.avatar_url ? (
                  <img src={currentUser.avatar_url} alt="Profile" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-surfaceHighlight flex items-center justify-center text-xs font-bold text-text">
                    {currentUser.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            </button>
          </div>
        </header>
      </div>
    </div>
  );
};
