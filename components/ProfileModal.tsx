
import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Camera, 
  User, 
  Save, 
  Loader2, 
  LogOut, 
  Scale,
  Lock,
  Zap,
  Key,
  ExternalLink,
  User as UserIcon
} from 'lucide-react';
import { User as UserType, Workout } from '../types';
import { uploadAvatar, updateUserProfile, updateUserPassword } from '../services/supabase';
import { useLanguage } from '../contexts/LanguageContext';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserType;
  workouts: Workout[]; 
  onUpdateUser: (updatedUser: Partial<UserType>) => void;
  onLogout: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ 
  isOpen, 
  onClose, 
  user, 
  onUpdateUser,
  onLogout
}) => {
  const [name, setName] = useState(user.name);
  const [weight, setWeight] = useState(user.weight || 80);
  const [height, setHeight] = useState(user.height || 180);
  const [apiKey, setApiKey] = useState(localStorage.getItem('USER_GEMINI_API_KEY') || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useLanguage();

  useEffect(() => {
    if (isOpen) {
        setName(user.name);
        setWeight(user.weight || 80);
        setHeight(user.height || 180);
        setApiKey(localStorage.getItem('USER_GEMINI_API_KEY') || '');
    }
  }, [isOpen, user]);

  const handleSaveProfile = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      // 1. Guardar API Key en LocalStorage
      if (apiKey.trim()) {
          localStorage.setItem('USER_GEMINI_API_KEY', apiKey.trim());
      } else {
          localStorage.removeItem('USER_GEMINI_API_KEY');
      }

      // 2. Actualizar Perfil en Supabase
      const updates: any = {};
      if (name !== user.name) updates.name = name.trim();
      if (weight !== user.weight) updates.weight = Number(weight);
      if (height !== user.height) updates.height = Number(height);

      if (Object.keys(updates).length > 0) {
        await updateUserProfile(user.id, updates);
        onUpdateUser(updates);
      }

      // 3. Actualizar Contraseña si se proporcionó
      if (password) {
        if (password !== confirmPassword) throw new Error("Las contraseñas no coinciden.");
        if (password.length < 6) throw new Error("Mínimo 6 caracteres.");
        await updateUserPassword(password);
        setPassword('');
        setConfirmPassword('');
      }
      
      setMessage({ type: 'success', text: '¡Perfil y configuración guardados!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Error al guardar.' });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/95 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-md bg-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
        <div className="h-24 bg-gradient-to-br from-primary/20 via-black to-black relative">
            <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-white/10 rounded-full text-white backdrop-blur-sm z-10"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="px-6 pb-6 -mt-12 flex-1 overflow-y-auto custom-scrollbar">
            <div className="flex flex-col items-center mb-6">
                <div className="w-24 h-24 rounded-full border-4 border-black bg-zinc-900 shadow-xl overflow-hidden relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    {user.avatar_url ? <img src={user.avatar_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-zinc-500"><UserIcon className="w-10 h-10" /></div>}
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Camera className="w-6 h-6 text-white" /></div>
                    {isUploading && <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>}
                </div>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={async (e) => {
                    if (!e.target.files?.[0]) return;
                    setIsUploading(true);
                    const url = await uploadAvatar(e.target.files[0], user.id);
                    if (url) { onUpdateUser({ avatar_url: url }); }
                    setIsUploading(false);
                }} />
                <h2 className="mt-3 text-xl font-bold text-white tracking-tight uppercase italic">{user.name}</h2>
            </div>

            <div className="space-y-8">
                {/* AI CONFIGURATION */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-2"><Zap className="w-3 h-3" /> Neurona AI</div>
                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-[9px] text-zinc-500 hover:text-white flex items-center gap-1 transition-colors uppercase font-bold">Obtener Key Gratis <ExternalLink className="w-2.5 h-2.5" /></a>
                    </div>
                    <div className="relative group">
                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-primary transition-colors" />
                        <input 
                            type="password" 
                            value={apiKey} 
                            onChange={(e) => setApiKey(e.target.value)} 
                            placeholder="Pega tu Gemini API Key..." 
                            className="w-full bg-black border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:border-primary/50 font-mono" 
                        />
                    </div>
                    <p className="text-[9px] text-zinc-600 leading-relaxed italic">Usa tu propia clave para evitar límites de cuota compartidos. Tus datos de voz se procesan directamente con Google.</p>
                </div>

                {/* BIOMETRY */}
                <div className="space-y-4">
                    <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2"><Scale className="w-3 h-3" /> Biometría</div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] text-zinc-500 uppercase ml-1">Peso (kg)</label>
                            <input type="number" value={weight} onChange={(e) => setWeight(Number(e.target.value))} className="w-full bg-black border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:border-primary/50" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] text-zinc-500 uppercase ml-1">Altura (cm)</label>
                            <input type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))} className="w-full bg-black border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:border-primary/50" />
                        </div>
                    </div>
                </div>

                {/* SECURITY */}
                <div className="space-y-4">
                    <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2"><Lock className="w-3 h-3" /> Seguridad</div>
                    <div className="space-y-3">
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Nueva Contraseña" className="w-full bg-black border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:border-primary/50" />
                        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirmar Contraseña" className="w-full bg-black border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:border-primary/50" />
                    </div>
                </div>

                {message && <div className={`p-4 rounded-xl text-[10px] font-black text-center border animate-in slide-in-from-top-2 ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>{message.text.toUpperCase()}</div>}

                <div className="flex flex-col gap-3 pt-4">
                    <button onClick={handleSaveProfile} disabled={isSaving} className="w-full bg-primary hover:bg-primaryHover text-black font-black py-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-glow">
                        {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        GUARDAR CONFIGURACIÓN
                    </button>
                    <button onClick={onLogout} className="w-full bg-zinc-900 text-zinc-500 py-3 rounded-xl text-[10px] font-black uppercase hover:text-red-500 transition-colors flex items-center justify-center gap-2 tracking-[0.2em]"><LogOut className="w-4 h-4" /> CERRAR SESIÓN</button>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
