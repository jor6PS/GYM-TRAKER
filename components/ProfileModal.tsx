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
  User as UserIcon,
  Calendar, // Added Calendar icon for Age
  Eye,
  EyeOff,
  Download
} from 'lucide-react';
import { User as UserType, Workout } from '../types';
import { uploadAvatar, updateUserProfile, updateUserPassword } from '../services/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useScrollLock } from '../hooks/useScrollLock';

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
  const [name, setName] = useState(user.name || '');
  const [weight, setWeight] = useState(user.weight ?? 80);
  const [height, setHeight] = useState(user.height ?? 180);
  const [age, setAge] = useState(user.age ?? 25);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  useScrollLock(isOpen);
  const apiKeyInitialized = useRef(false);
  const valuesInitialized = useRef(false);
  const lastUserId = useRef<string | null>(null);
  const { t } = useLanguage();
  const { isInstallable, isInstalled, install, installInfo } = usePWAInstall();

  // Inicializar valores solo una vez cuando se abre el modal o cuando cambia el usuario
  // Esto evita que se reseteen mientras el usuario está escribiendo
  useEffect(() => {
    if (isOpen) {
        // Inicializar solo si es la primera vez que se abre o si cambió el usuario
        const userIdChanged = lastUserId.current !== user.id;
        if (!valuesInitialized.current || userIdChanged) {
          setName(user.name || '');
          setWeight(user.weight ?? 80);
          setHeight(user.height ?? 180);
          setAge(user.age ?? 25);
          valuesInitialized.current = true;
          lastUserId.current = user.id;
        }
        
        // Solo cargar API key del localStorage si no está inicializada
        // Esto evita sobrescribir lo que el usuario está escribiendo
        if (!apiKeyInitialized.current) {
          const savedKey = localStorage.getItem('USER_GEMINI_API_KEY');
          if (savedKey) {
            setApiKey(savedKey);
          }
          apiKeyInitialized.current = true;
        }
    } else {
        // Resetear los flags cuando se cierra el modal para que se carguen de nuevo la próxima vez
        valuesInitialized.current = false;
        apiKeyInitialized.current = false;
    }
  }, [isOpen, user.id]); // Solo ejecutar cuando se abre/cierra el modal o cuando cambia el ID del usuario

  const handleSaveProfile = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      // 1. Guardar API Key en LocalStorage
      if (apiKey.trim()) {
          const trimmedKey = apiKey.trim();
          // Validar que la API key tenga al menos 20 caracteres (las de Gemini suelen tener más)
          if (trimmedKey.length < 20) {
            setMessage({ type: 'error', text: 'La API Key parece ser demasiado corta. Verifica que sea correcta.' });
            setIsSaving(false);
            return;
          }
          localStorage.setItem('USER_GEMINI_API_KEY', trimmedKey);
          console.log('✅ API Key guardada en localStorage:', trimmedKey.substring(0, 10) + '...');
      } else {
          localStorage.removeItem('USER_GEMINI_API_KEY');
          console.log('🗑️ API Key eliminada de localStorage');
      }

      // 2. Actualizar Perfil en Supabase
      const updates: any = {};
      if (name !== user.name) updates.name = name.trim();
      
      // Actualizar peso, altura y edad - siempre enviar valores si son válidos
      // Validar que sean números válidos y mayores a 0
      const newWeight = Number(weight);
      const newHeight = Number(height);
      const newAge = Number(age);
      
      // Actualizar peso si es válido y diferente del actual
      if (!isNaN(newWeight) && newWeight > 0) {
        if (user.weight === undefined || newWeight !== user.weight) {
          updates.weight = newWeight;
        }
      }
      
      // Actualizar altura si es válida y diferente de la actual
      if (!isNaN(newHeight) && newHeight > 0) {
        if (user.height === undefined || newHeight !== user.height) {
          updates.height = newHeight;
        }
      }
      
      // Actualizar edad si es válida y diferente de la actual
      if (!isNaN(newAge) && newAge > 0) {
        if (user.age === undefined || newAge !== user.age) {
          updates.age = newAge;
        }
      }

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
                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-primary transition-colors z-10" />
                        <input 
                            type={showApiKey ? "text" : "password"} 
                            value={apiKey} 
                            onChange={(e) => setApiKey(e.target.value)} 
                            onPaste={(e) => {
                              // Manejar el pegado explícitamente para evitar problemas
                              e.preventDefault();
                              e.stopPropagation();
                              const pastedText = e.clipboardData.getData('text');
                              if (pastedText) {
                                setApiKey(pastedText.trim());
                                // Marcar como inicializado para evitar que se sobrescriba
                                apiKeyInitialized.current = true;
                              }
                            }}
                            placeholder="Pega tu Gemini API Key..." 
                            className="w-full bg-black border border-white/10 rounded-xl py-3 pl-10 pr-12 text-sm text-white focus:border-primary/50 font-mono" 
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-primary transition-colors z-10"
                          title={showApiKey ? "Ocultar API Key" : "Mostrar API Key"}
                        >
                          {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                    <p className="text-[9px] text-zinc-600 leading-relaxed italic">Usa tu propia clave para evitar límites de cuota compartidos. Tus datos de voz se procesan directamente con Google.</p>
                </div>

                {/* BIOMETRY */}
                <div className="space-y-4">
                    <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2"><Scale className="w-3 h-3" /> Biometría</div>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                            <label className="text-[10px] text-zinc-500 uppercase ml-1">Peso (kg)</label>
                            <input 
                                type="number" 
                                value={weight === 0 ? '' : weight} 
                                onChange={(e) => {
                                    const val = e.target.value === '' ? 0 : Number(e.target.value);
                                    if (!isNaN(val) && val >= 0) {
                                        setWeight(val);
                                    }
                                }}
                                placeholder="80"
                                min="0"
                                step="0.1"
                                className="w-full bg-black border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:border-primary/50" 
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] text-zinc-500 uppercase ml-1">Altura (cm)</label>
                            <input 
                                type="number" 
                                value={height === 0 ? '' : height} 
                                onChange={(e) => {
                                    const val = e.target.value === '' ? 0 : Number(e.target.value);
                                    if (!isNaN(val) && val >= 0) {
                                        setHeight(val);
                                    }
                                }}
                                placeholder="180"
                                min="0"
                                step="1"
                                className="w-full bg-black border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:border-primary/50" 
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] text-zinc-500 uppercase ml-1">Edad</label>
                            <input 
                                type="number" 
                                value={age === 0 ? '' : age} 
                                onChange={(e) => {
                                    const val = e.target.value === '' ? 0 : Number(e.target.value);
                                    if (!isNaN(val) && val >= 0) {
                                        setAge(val);
                                    }
                                }}
                                placeholder="25"
                                min="0"
                                max="150"
                                step="1"
                                className="w-full bg-black border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:border-primary/50" 
                            />
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

                {/* PWA INSTALLATION */}
                {!isInstalled && (
                    <div className="space-y-4">
                        <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2"><Download className="w-3 h-3" /> Instalar App</div>
                        {isInstallable ? (
                            <button 
                                onClick={async () => {
                                    const success = await install();
                                    if (success) {
                                        setMessage({ type: 'success', text: '¡App instalada correctamente!' });
                                    } else {
                                        setMessage({ type: 'error', text: 'La instalación fue cancelada.' });
                                    }
                                }}
                                className="w-full bg-primary/20 hover:bg-primary/30 border border-primary/50 text-primary font-black py-3 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95"
                            >
                                <Download className="w-4 h-4" />
                                INSTALAR COMO APLICACIÓN
                            </button>
                        ) : installInfo ? (
                            <div className="p-4 bg-zinc-900/50 border border-white/5 rounded-xl space-y-2">
                                <p className="text-[10px] text-zinc-400 font-bold uppercase">{installInfo.reason}</p>
                                <p className="text-[9px] text-zinc-500 leading-relaxed">{installInfo.instructions}</p>
                                <p className="text-[8px] text-zinc-600 mt-2 italic">
                                    💡 Asegúrate de estar en HTTPS y que el service worker esté activo.
                                </p>
                            </div>
                        ) : (
                            <div className="p-4 bg-zinc-900/50 border border-white/5 rounded-xl">
                                <p className="text-[10px] text-zinc-500 text-center">
                                    Verificando disponibilidad de instalación...
                                </p>
                            </div>
                        )}
                    </div>
                )}

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