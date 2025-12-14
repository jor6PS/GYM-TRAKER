import React, { useState, useRef, useMemo } from 'react';
import { 
  X, 
  Camera, 
  User, 
  Mail, 
  Calendar, 
  Shield, 
  ShieldCheck,
  Save, 
  Loader2, 
  LogOut, 
  Check,
  Lock,
  Activity,
  Trophy,
  Flame
} from 'lucide-react';
import { User as UserType, Workout } from '../types';
import { uploadAvatar, updateUserProfile, updateUserPassword } from '../services/supabase';
import { format } from 'date-fns';
import { useLanguage } from '../contexts/LanguageContext';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserType;
  workouts: Workout[]; // Changed from totalWorkouts to full array for calculation
  onUpdateUser: (updatedUser: Partial<UserType>) => void;
  onLogout: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ 
  isOpen, 
  onClose, 
  user, 
  workouts,
  onUpdateUser,
  onLogout
}) => {
  const [name, setName] = useState(user.name);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useLanguage();

  // Calculate Stats based on Unique Days
  const stats = useMemo(() => {
    // Get unique dates (Set removes duplicates)
    const uniqueDates = Array.from(new Set(workouts.map(w => w.date)));
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    let total = uniqueDates.length;
    let year = 0;
    let month = 0;

    uniqueDates.forEach((dateStr) => {
        // Assume dateStr is YYYY-MM-DD
        const [y, m, d] = (dateStr as string).split('-').map(Number);
        
        if (y === currentYear) {
            year++;
            // Note: m from split is 1-12, currentMonth is 0-11
            if (m - 1 === currentMonth) {
                month++;
            }
        }
    });

    return { total, year, month };
  }, [workouts]);

  if (!isOpen) return null;

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) {
      return;
    }
    setIsUploading(true);
    setMessage(null);
    try {
      const file = event.target.files[0];
      const publicUrl = await uploadAvatar(file, user.id);
      
      if (publicUrl) {
        await updateUserProfile(user.id, { avatar_url: publicUrl });
        onUpdateUser({ avatar_url: publicUrl });
        setMessage({ type: 'success', text: 'Profile picture updated!' });
      } else {
        throw new Error("Upload failed");
      }
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Failed to upload image.' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      // 1. Update Name if changed
      if (name !== user.name) {
        await updateUserProfile(user.id, { name });
        onUpdateUser({ name });
      }

      // 2. Update Password if provided
      if (password) {
        if (password !== confirmPassword) {
            throw new Error("Passwords do not match.");
        }
        if (password.length < 6) {
            throw new Error("Password must be at least 6 characters.");
        }
        await updateUserPassword(password);
        setPassword('');        // Clear after save
        setConfirmPassword(''); // Clear confirm field
      }

      setMessage({ type: 'success', text: 'Profile updated successfully.' });
      
      // Auto close after success if only name changed or password updated
      if (!password) {
          setTimeout(() => {
              setMessage(null);
          }, 3000);
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to update profile.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/90 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md bg-surface border border-white/10 rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
        
        {/* Header Decoration */}
        <div className="h-32 bg-gradient-to-br from-primary/20 via-black to-black relative">
            <div className="absolute top-4 right-4 z-10">
                <button onClick={onClose} className="p-2 bg-black/50 hover:bg-white/10 rounded-full text-white transition-colors backdrop-blur-sm">
                    <X className="w-5 h-5" />
                </button>
            </div>
            <div className="absolute inset-0 bg-[radial-gradient(#FACC15_1px,transparent_1px)] [background-size:16px_16px] opacity-10"></div>
        </div>

        {/* Profile Content */}
        <div className="px-6 pb-6 -mt-16 flex-1 overflow-y-auto custom-scrollbar">
            
            {/* Avatar Section */}
            <div className="flex flex-col items-center mb-6">
                <div className="relative group cursor-pointer" onClick={handleAvatarClick}>
                    <div className="w-32 h-32 rounded-full border-4 border-black bg-zinc-900 shadow-xl overflow-hidden relative">
                        {user.avatar_url ? (
                            <img src={user.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-zinc-500">
                                <User className="w-12 h-12" />
                            </div>
                        )}
                        
                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Camera className="w-8 h-8 text-white" />
                        </div>

                        {isUploading && (
                            <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10">
                                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                            </div>
                        )}
                    </div>
                    <div className="absolute bottom-1 right-1 bg-primary text-black p-2 rounded-full border-4 border-black shadow-lg">
                        <Camera className="w-4 h-4" />
                    </div>
                </div>
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*"
                    onChange={handleFileChange}
                />
                
                <h2 className="mt-3 text-xl font-bold text-white tracking-wide">{user.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-mono text-zinc-400 bg-white/5 px-2 py-0.5 rounded border border-white/5">
                        {user.role === 'admin' ? t('admin') : t('member')}
                    </span>
                    <span className="text-xs font-mono text-zinc-500">
                        {t('joined')} {format(new Date(user.created_at), 'MMM yyyy')}
                    </span>
                </div>
            </div>

            {/* Stats Cards - Updated to show Month/Year/Total Days */}
            <div className="grid grid-cols-3 gap-2 mb-6">
                <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-3 flex flex-col items-center justify-center text-center">
                    <div className="text-zinc-500 text-[9px] uppercase font-mono tracking-widest mb-1">{t('stats_month')}</div>
                    <div className="flex items-center gap-1.5 text-primary font-bold text-xl">
                        <Flame className="w-4 h-4" />
                        {stats.month}
                    </div>
                </div>
                <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-3 flex flex-col items-center justify-center text-center">
                    <div className="text-zinc-500 text-[9px] uppercase font-mono tracking-widest mb-1">{t('stats_year')}</div>
                    <div className="flex items-center gap-1.5 text-blue-400 font-bold text-xl">
                        <Calendar className="w-4 h-4" />
                        {stats.year}
                    </div>
                </div>
                <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-3 flex flex-col items-center justify-center text-center">
                    <div className="text-zinc-500 text-[9px] uppercase font-mono tracking-widest mb-1">{t('stats_total')}</div>
                    <div className="flex items-center gap-1.5 text-white font-bold text-xl">
                        <Trophy className="w-4 h-4 text-yellow-500" />
                        {stats.total}
                    </div>
                </div>
            </div>

            {/* Form Section */}
            <div className="space-y-4">
                
                {/* Email (Read Only) */}
                <div className="space-y-1">
                    <label className="text-xs font-mono text-zinc-400 uppercase ml-1">{t('email')}</label>
                    <div className="flex items-center gap-3 bg-black/40 border border-white/10 rounded-xl p-3 text-zinc-400 cursor-not-allowed">
                        <Mail className="w-5 h-5 text-zinc-500" />
                        <span className="text-sm truncate flex-1">{user.email}</span>
                        <Lock className="w-3.5 h-3.5 text-zinc-600" />
                    </div>
                </div>

                {/* Name */}
                <div className="space-y-1">
                    <label className="text-xs font-mono text-zinc-400 uppercase ml-1">{t('display_name')}</label>
                    <div className="relative group">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 group-focus-within:text-primary transition-colors" />
                        <input 
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-black border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-primary/50 focus:bg-zinc-900/50 transition-all"
                            placeholder="Your Name"
                        />
                    </div>
                </div>

                {/* Password Change */}
                <div className="pt-2 border-t border-white/5 mt-2">
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-xs font-mono text-zinc-400 uppercase ml-1">{t('new_password')}</label>
                            <div className="relative group">
                                <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 group-focus-within:text-primary transition-colors" />
                                <input 
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-black border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 focus:bg-zinc-900/50 transition-all"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        {/* Confirm Password - Only shown if user starts typing a password */}
                        <div className={`space-y-1 transition-all duration-300 ${password ? 'opacity-100 max-h-20' : 'opacity-50 max-h-20 grayscale'}`}>
                            <label className="text-xs font-mono text-zinc-400 uppercase ml-1">{t('confirm_password')}</label>
                            <div className="relative group">
                                <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 group-focus-within:text-primary transition-colors" />
                                <input 
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    disabled={!password}
                                    className="w-full bg-black border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 focus:bg-zinc-900/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    placeholder={t('confirm_password')}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Feedback Message */}
                {message && (
                    <div className={`p-3 rounded-lg text-xs font-mono flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 ${
                        message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                        {message.type === 'success' ? <Check className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                        {message.text}
                    </div>
                )}

                {/* Action Buttons */}
                <div className="pt-4 flex flex-col gap-3">
                    <button 
                        onClick={handleSaveProfile}
                        disabled={isSaving || (name === user.name && !password)}
                        className="w-full bg-primary hover:bg-primaryHover text-black font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-glow active:scale-95"
                    >
                        {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        {t('save_changes')}
                    </button>

                    <button 
                        onClick={onLogout}
                        className="w-full bg-zinc-900 hover:bg-red-900/20 border border-white/5 hover:border-red-500/30 text-zinc-400 hover:text-red-500 py-3 rounded-xl flex items-center justify-center gap-2 transition-all text-sm font-bold"
                    >
                        <LogOut className="w-4 h-4" /> {t('sign_out')}
                    </button>
                </div>

            </div>
        </div>
      </div>
    </div>
  );
};