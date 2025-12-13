import React, { useState } from 'react';
import { Dumbbell, ArrowRight, Lock, Mail, Loader2, AlertCircle, User as UserIcon, CheckCircle2 } from 'lucide-react';
import { supabase } from '../services/supabase';

interface LoginScreenProps {
  // We no longer pass mock functions, the parent listens to Supabase auth state changes
  onLoginSuccess?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = () => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (isRegistering) {
        // --- REAL SIGN UP ---
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: name,
            },
            // FIX: Force redirect to current location (origin)
            emailRedirectTo: window.location.origin,
          },
        });

        if (signUpError) throw signUpError;

        // CRITICAL FIX FOR DEV ENVIRONMENT:
        // If "Confirm Email" is disabled in Supabase, data.session will exist immediately.
        // If it exists, we don't need to show "Check your inbox", the App.tsx listener will log us in.
        if (data.session) {
            // Auto-login successful
            return;
        }

        // If no session, Supabase is waiting for email confirmation
        setConfirmationSent(true);

      } else {
        // --- REAL SIGN IN ---
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      // Only stop loading if we aren't successful (successful login unmounts this component via parent)
      // Or if we need to show the confirmation screen
      setIsLoading(false);
    }
  };

  if (confirmationSent) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mb-6 border border-green-500/20 animate-in zoom-in">
           <CheckCircle2 className="w-8 h-8 text-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Check your inbox</h2>
        <p className="text-zinc-400 max-w-xs mx-auto mb-8">
          We've sent a confirmation link to <span className="text-white font-mono">{email}</span>. Please verify your email to continue.
        </p>
        <button 
           onClick={() => setConfirmationSent(false)}
           className="text-primary text-sm font-mono uppercase hover:underline"
        >
          Back to Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
         <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[100px]"></div>
         <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[100px]"></div>
      </div>

      <div className="w-full max-w-sm z-10 animate-in fade-in zoom-in-95 duration-500">
        
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-[0_0_30px_-5px_rgba(250,204,21,0.4)] mb-4 transform rotate-3">
            <Dumbbell className="w-8 h-8 text-black" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight font-mono">GYM_AI</h1>
          <p className="text-zinc-500 text-sm mt-2 font-mono uppercase tracking-widest">
            {isRegistering ? 'Create Account' : 'Neural Workout Tracker'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          <div className="space-y-4">
            {isRegistering && (
              <div className="relative group animate-in slide-in-from-top-2 fade-in">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-600 group-focus-within:text-primary transition-colors" />
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full Name"
                  required
                  className="w-full bg-zinc-900/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-text placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 focus:bg-zinc-900 transition-all"
                />
              </div>
            )}

            <div className="relative group">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-600 group-focus-within:text-primary transition-colors" />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email Address"
                required
                className="w-full bg-zinc-900/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-text placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 focus:bg-zinc-900 transition-all"
              />
            </div>

            <div className="relative group">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-600 group-focus-within:text-primary transition-colors" />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min 6 chars)"
                minLength={6}
                required
                className="w-full bg-zinc-900/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-text placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 focus:bg-zinc-900 transition-all"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-500 text-xs font-mono bg-red-500/10 p-3 rounded-lg border border-red-500/20 animate-in shake">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <button 
            type="submit"
            disabled={isLoading}
            className="w-full bg-white text-black font-bold py-3.5 rounded-xl hover:bg-primary transition-all shadow-lg hover:shadow-[0_0_20px_rgba(250,204,21,0.3)] active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                {isRegistering ? 'Create Account' : 'Sign In'} <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        {/* Toggle Mode */}
        <div className="mt-6 text-center">
            <button 
                onClick={() => {
                    setIsRegistering(!isRegistering);
                    setError(null);
                }}
                className="text-xs text-zinc-500 hover:text-white transition-colors font-mono underline underline-offset-4"
            >
                {isRegistering ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
            </button>
        </div>
        
      </div>
    </div>
  );
};