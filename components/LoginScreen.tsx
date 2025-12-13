import React, { useState } from 'react';
import { ArrowRight, Lock, Loader2, AlertCircle, User as UserIcon, CheckCircle2, AtSign } from 'lucide-react';
import { supabase, resolveUserEmail } from '../services/supabase';
import { AppLogo } from '../utils';

interface LoginScreenProps {}

export const LoginScreen: React.FC<LoginScreenProps> = () => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true); setError(null);
    try {
      if (isRegistering) {
        if (!identifier.includes('@')) throw new Error("Please enter a valid email.");
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: identifier, password, options: { data: { name: name }, emailRedirectTo: window.location.origin },
        });
        if (signUpError) throw signUpError;
        if (data.session) return;
        setConfirmationSent(true);
      } else {
        const resolvedEmail = await resolveUserEmail(identifier);
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: resolvedEmail, password });
        if (signInError) throw signInError;
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  if (confirmationSent) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mb-6 animate-in zoom-in">
           <CheckCircle2 className="w-10 h-10 text-green-500" />
        </div>
        <h2 className="text-3xl font-bold text-white mb-3">Check your inbox</h2>
        <p className="text-zinc-400 max-w-sm mx-auto mb-8 text-sm leading-relaxed">
          We've sent a verification link to <span className="text-white font-bold">{identifier}</span>.
        </p>
        <button onClick={() => setConfirmationSent(false)} className="text-primary font-bold hover:underline">Back to Sign In</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      
      {/* Background Animated Blobs */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
         <div className="absolute top-[10%] left-[20%] w-[300px] h-[300px] bg-primary/20 rounded-full blur-[120px] animate-float"></div>
         <div className="absolute bottom-[10%] right-[10%] w-[250px] h-[250px] bg-purple-500/10 rounded-full blur-[100px]"></div>
      </div>

      <div className="w-full max-w-sm z-10 animate-in fade-in zoom-in-95 duration-500">
        
        <div className="flex flex-col items-center mb-10">
          <div className="w-24 h-24 bg-surface border border-white/5 rounded-3xl flex items-center justify-center shadow-2xl mb-6 transform hover:scale-105 transition-transform duration-500">
            <AppLogo className="w-14 h-14 object-contain" />
          </div>
          <h1 className="text-4xl font-extrabold text-white tracking-tight mb-2">GYM<span className="text-primary">.AI</span></h1>
          <p className="text-zinc-500 font-medium">The Intelligent Tracker</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            {isRegistering && (
              <div className="relative group">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                   <UserIcon className="w-5 h-5 text-zinc-600 group-focus-within:text-primary transition-colors" />
                </div>
                <input 
                  type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full Name" required
                  className="w-full bg-surface border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 focus:bg-surfaceHighlight transition-all shadow-lg"
                />
              </div>
            )}

            <div className="relative group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                 <AtSign className="w-5 h-5 text-zinc-600 group-focus-within:text-primary transition-colors" />
              </div>
              <input 
                type={isRegistering ? "email" : "text"} value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={isRegistering ? "Email Address" : "Username or Email"} required
                className="w-full bg-surface border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 focus:bg-surfaceHighlight transition-all shadow-lg"
              />
            </div>

            <div className="relative group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                 <Lock className="w-5 h-5 text-zinc-600 group-focus-within:text-primary transition-colors" />
              </div>
              <input 
                type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" minLength={6} required
                className="w-full bg-surface border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 focus:bg-surfaceHighlight transition-all shadow-lg"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-3 text-danger text-sm font-medium bg-danger/5 p-4 rounded-xl border border-danger/10">
              <AlertCircle className="w-5 h-5 shrink-0" />
              {error}
            </div>
          )}

          <button 
            type="submit" disabled={isLoading}
            className="w-full bg-white hover:bg-zinc-200 text-black font-extrabold py-4 rounded-2xl transition-all shadow-xl hover:shadow-2xl active:scale-95 flex items-center justify-center gap-2 mt-4"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>{isRegistering ? 'Start Journey' : 'Sign In'} <ArrowRight className="w-5 h-5" /></>}
          </button>
        </form>

        <div className="mt-8 text-center">
            <button 
                onClick={() => { setIsRegistering(!isRegistering); setError(null); }}
                className="text-sm font-medium text-zinc-500 hover:text-white transition-colors"
            >
                {isRegistering ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
            </button>
        </div>
      </div>
    </div>
  );
};