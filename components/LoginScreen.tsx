import React, { useState } from 'react';
import { ArrowRight, Lock, Loader2, AlertCircle, User as UserIcon, CheckCircle2, AtSign, Mail } from 'lucide-react';
import { supabase, resolveUserEmail, sendPasswordResetEmail } from '../services/supabase';
import { AppLogo } from '../utils';
import { useLanguage } from '../contexts/LanguageContext';

interface LoginScreenProps {}

type AuthMode = 'signin' | 'signup' | 'recovery';

export const LoginScreen: React.FC<LoginScreenProps> = () => {
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Confirmation states
  const [signUpConfirmation, setSignUpConfirmation] = useState(false);
  const [recoveryConfirmation, setRecoveryConfirmation] = useState(false);
  
  const { t } = useLanguage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true); setError(null);
    
    try {
      if (authMode === 'signup') {
        if (!identifier.includes('@')) throw new Error("Please enter a valid email.");
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: identifier, password, options: { data: { name: name }, emailRedirectTo: window.location.origin },
        });
        if (signUpError) throw signUpError;
        if (data.session) return;
        setSignUpConfirmation(true);
      } 
      else if (authMode === 'recovery') {
        if (!identifier.includes('@')) throw new Error("Please enter a valid email.");
        await sendPasswordResetEmail(identifier);
        setRecoveryConfirmation(true);
      }
      else {
        // Sign In
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

  const resetState = (mode: AuthMode) => {
    setAuthMode(mode);
    setError(null);
    setSignUpConfirmation(false);
    setRecoveryConfirmation(false);
  };

  if (signUpConfirmation || recoveryConfirmation) {
    const isRecovery = recoveryConfirmation;
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mb-6 animate-in zoom-in">
           <CheckCircle2 className="w-10 h-10 text-green-500" />
        </div>
        <h2 className="text-3xl font-bold text-text mb-3">
            {isRecovery ? t('recovery_sent_title') : t('check_inbox')}
        </h2>
        <p className="text-subtext max-w-sm mx-auto mb-8 text-sm leading-relaxed">
          {isRecovery ? t('recovery_sent_desc') : (
            <>
                {t('verification_sent')} <span className="text-text font-bold">{identifier}</span>.
            </>
          )}
        </p>
        <button onClick={() => resetState('signin')} className="text-primary font-bold hover:underline">{t('back_signin')}</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden transition-colors duration-500">
      
      {/* Background Animated Blobs - Adjusted for Light Mode visibility */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
         <div className="absolute top-[10%] left-[20%] w-[300px] h-[300px] bg-primary/20 rounded-full blur-[120px] animate-float"></div>
         <div className="absolute bottom-[10%] right-[10%] w-[250px] h-[250px] bg-purple-500/10 rounded-full blur-[100px]"></div>
      </div>

      <div className="w-full max-w-sm z-10 animate-in fade-in zoom-in-95 duration-500">
        
        <div className="flex flex-col items-center mb-10">
          <div className="w-24 h-24 bg-surface border border-border rounded-3xl flex items-center justify-center shadow-2xl mb-6 transform hover:scale-105 transition-transform duration-500 text-text">
            <AppLogo className="w-14 h-14 object-contain text-text" />
          </div>
          <h1 className="text-4xl font-extrabold text-text tracking-tight mb-2">GYM<span className="text-primary">.AI</span></h1>
          <p className="text-subtext font-medium">The Intelligent Tracker</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {authMode === 'recovery' ? (
              // RECOVERY VIEW
              <div className="space-y-4">
                  <div className="text-center mb-4">
                      <h3 className="text-xl font-bold text-text mb-2">{t('recover_password')}</h3>
                      <p className="text-sm text-subtext">{t('recover_intro')}</p>
                  </div>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                        <Mail className="w-5 h-5 text-subtext group-focus-within:text-primary transition-colors" />
                    </div>
                    <input 
                        type="email" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={t('email')} required
                        className="w-full bg-surface border border-border rounded-2xl py-4 pl-12 pr-4 text-text placeholder:text-subtext focus:outline-none focus:border-primary/50 focus:bg-surfaceHighlight transition-all shadow-lg"
                    />
                 </div>
              </div>
          ) : (
              // SIGN IN / SIGN UP VIEW
              <div className="space-y-4">
                {authMode === 'signup' && (
                <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                    <UserIcon className="w-5 h-5 text-subtext group-focus-within:text-primary transition-colors" />
                    </div>
                    <input 
                    type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('full_name')} required
                    className="w-full bg-surface border border-border rounded-2xl py-4 pl-12 pr-4 text-text placeholder:text-subtext focus:outline-none focus:border-primary/50 focus:bg-surfaceHighlight transition-all shadow-lg"
                    />
                </div>
                )}

                <div className="relative group">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                    <AtSign className="w-5 h-5 text-subtext group-focus-within:text-primary transition-colors" />
                </div>
                <input 
                    type={authMode === 'signup' ? "email" : "text"} value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={authMode === 'signup' ? t('email') : t('email_user')} required
                    className="w-full bg-surface border border-border rounded-2xl py-4 pl-12 pr-4 text-text placeholder:text-subtext focus:outline-none focus:border-primary/50 focus:bg-surfaceHighlight transition-all shadow-lg"
                />
                </div>

                <div className="relative group">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                    <Lock className="w-5 h-5 text-subtext group-focus-within:text-primary transition-colors" />
                </div>
                <input 
                    type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('password')} minLength={6} required
                    className="w-full bg-surface border border-border rounded-2xl py-4 pl-12 pr-4 text-text placeholder:text-subtext focus:outline-none focus:border-primary/50 focus:bg-surfaceHighlight transition-all shadow-lg"
                />
                </div>
              </div>
          )}

          {/* Forgot Password Link (Only in Sign In mode) */}
          {authMode === 'signin' && (
              <div className="flex justify-end">
                  <button 
                    type="button"
                    onClick={() => resetState('recovery')}
                    className="text-xs font-medium text-subtext hover:text-primary transition-colors"
                  >
                      {t('forgot_password')}
                  </button>
              </div>
          )}

          {error && (
            <div className="flex items-center gap-3 text-danger text-sm font-medium bg-danger/5 p-4 rounded-xl border border-danger/10">
              <AlertCircle className="w-5 h-5 shrink-0" />
              {error}
            </div>
          )}

          <button 
            type="submit" disabled={isLoading}
            className="w-full bg-text hover:bg-subtext text-background font-extrabold py-4 rounded-2xl transition-all shadow-xl hover:shadow-2xl active:scale-95 flex items-center justify-center gap-2 mt-4"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                <>
                    {authMode === 'recovery' ? t('send_recovery') : (
                        authMode === 'signup' ? t('start_journey') : t('sign_in')
                    )} 
                    <ArrowRight className="w-5 h-5" />
                </>
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
            {authMode === 'recovery' ? (
                <button 
                    onClick={() => resetState('signin')}
                    className="text-sm font-medium text-subtext hover:text-text transition-colors"
                >
                    {t('back_signin')}
                </button>
            ) : (
                <button 
                    onClick={() => { resetState(authMode === 'signin' ? 'signup' : 'signin'); }}
                    className="text-sm font-medium text-subtext hover:text-text transition-colors"
                >
                    {authMode === 'signup' ? t('have_account') : t('no_account')}
                </button>
            )}
        </div>
      </div>
    </div>
  );
};