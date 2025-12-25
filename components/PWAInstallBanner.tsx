import React, { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Mostrar el banner si es instalable y no está instalada
    if (isInstallable && !isInstalled && !isDismissed) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [isInstallable, isInstalled, isDismissed]);

  const handleInstall = async () => {
    const success = await install();
    if (success) {
      setIsVisible(false);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    setIsVisible(false);
    // Guardar en localStorage para no mostrar de nuevo en esta sesión
    localStorage.setItem('pwa-banner-dismissed', 'true');
  };

  // Verificar si fue descartado anteriormente
  useEffect(() => {
    const dismissed = localStorage.getItem('pwa-banner-dismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
    }
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 animate-in slide-in-from-bottom-2">
      <div className="max-w-md mx-auto bg-surface border border-primary/30 rounded-2xl p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
            <Download className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-text mb-1">Instalar GymTracker AI</h3>
            <p className="text-xs text-subtext mb-3">
              Instala la app para acceso rápido y mejor experiencia
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleInstall}
                className="flex-1 bg-primary hover:bg-primaryHover text-black font-black py-2.5 px-4 rounded-xl text-xs transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                INSTALAR
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-2.5 text-subtext hover:text-text transition-colors rounded-xl hover:bg-surfaceHighlight"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

