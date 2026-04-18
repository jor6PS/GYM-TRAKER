import React from 'react';
import { AlertTriangle, Database, KeyRound } from 'lucide-react';
import { AppLogo } from '../utils';

export const SetupScreen: React.FC = () => {
  return (
    <div className="min-h-screen bg-background text-text flex items-center justify-center p-6">
      <div className="w-full max-w-xl bg-surface border border-border rounded-[2rem] p-8 shadow-2xl space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-surfaceHighlight border border-border flex items-center justify-center text-text">
            <AppLogo className="w-10 h-10" />
          </div>
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight">Configura Gym.AI</h1>
            <p className="text-sm text-subtext">
              La app no puede arrancar todavia porque faltan las credenciales del proyecto.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-50/90">
            Crea un archivo <code>.env</code> en la raiz del proyecto copiando <code>.env.example</code> y rellena las variables reales.
          </div>
        </div>

        <div className="grid gap-3">
          <div className="rounded-2xl border border-border bg-surfaceHighlight/40 p-4 flex gap-3">
            <Database className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">Supabase obligatorio</div>
              <div className="text-sm text-subtext">
                Define <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>.
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surfaceHighlight/40 p-4 flex gap-3">
            <KeyRound className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">Gemini opcional</div>
              <div className="text-sm text-subtext">
                Puedes anadir <code>VITE_API_KEY</code> si quieres una clave por defecto para IA.
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-black text-zinc-100 p-4 text-sm font-mono overflow-x-auto">
          <pre>{`cp .env.example .env

VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-clave-publica
VITE_API_KEY=tu-clave-opcional`}</pre>
        </div>
      </div>
    </div>
  );
};
