import React, { useState } from 'react';
import { ShieldCheck, Lock, Save, Loader2, CheckCircle2 } from 'lucide-react';
import { updateUserPassword } from '../services/supabase';
import { AppLogo } from '../utils';

interface ResetPasswordScreenProps {
  onSuccess: () => void;
}

export const ResetPasswordScreen: React.FC<ResetPasswordScreenProps> = ({ onSuccess }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (password.length < 6) {
        throw new Error("La contraseña debe tener al menos 6 caracteres.");
      }
      if (password !== confirmPassword) {
        throw new Error("Las contraseñas no coinciden.");
      }

      await updateUserPassword(password);
      setSuccess(true);
      
      // Delay slightly to show success message before redirecting
      setTimeout(() => {
        onSuccess();
      }, 2000);

    } catch (err: any) {
      setError(err.message || "Error al actualizar la contraseña.");
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500">
        <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mb-6 border border-green-500/20">
           <CheckCircle2 className="w-10 h-10 text-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">¡Contraseña Actualizada!</h2>
        <p className="text-zinc-400">Redirigiendo a tu entrenamiento...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 relative">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px]"></div>
      </div>

      <div className="w-full max-w-sm z-10 bg-zinc-900/50 border border-white/10 rounded-3xl p-8 shadow-2xl backdrop-blur-xl">
        
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-surface border border-white/10 rounded-2xl flex items-center justify-center shadow-lg mb-4 text-white">
             <AppLogo className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-black text-white uppercase tracking-wide text-center">
            Seguridad
          </h1>
          <p className="text-sm text-zinc-400 text-center mt-2">
            Establece una nueva contraseña para recuperar el acceso a tu cuenta.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-mono text-primary uppercase ml-1 font-bold">Nueva Contraseña</label>
            <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 group-focus-within:text-primary transition-colors" />
                <input 
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-black border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-zinc-700 focus:outline-none focus:border-primary/50 focus:bg-zinc-900 transition-all"
                    placeholder="Mínimo 6 caracteres"
                    required
                />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-mono text-zinc-500 uppercase ml-1">Confirmar</label>
            <div className="relative group">
                <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 group-focus-within:text-primary transition-colors" />
                <input 
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-black border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-zinc-700 focus:outline-none focus:border-primary/50 focus:bg-zinc-900 transition-all"
                    placeholder="Repite la contraseña"
                    required
                />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs font-bold text-center animate-pulse">
              {error}
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading || !password}
            className="w-full mt-4 bg-primary hover:bg-primaryHover text-black font-black py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(212,255,0,0.2)] hover:shadow-[0_0_30px_rgba(212,255,0,0.4)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            GUARDAR Y ENTRAR
          </button>
        </form>
      </div>
    </div>
  );
};