import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const usePWAInstall = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [installInfo, setInstallInfo] = useState<{ reason: string; instructions: string } | null>(null);

  useEffect(() => {
    // Verificar si ya está instalada (múltiples métodos)
    const checkInstalled = () => {
      // Método 1: display-mode standalone
      if (window.matchMedia('(display-mode: standalone)').matches) {
        setIsInstalled(true);
        return true;
      }
      
      // Método 2: navigator.standalone (iOS)
      if ((window.navigator as any).standalone === true) {
        setIsInstalled(true);
        return true;
      }
      
      // Método 3: Verificar si está en modo pantalla completa
      if (window.matchMedia('(display-mode: fullscreen)').matches) {
        setIsInstalled(true);
        return true;
      }
      
      return false;
    };

    if (checkInstalled()) {
      return;
    }

    // Detectar navegador y plataforma
    const userAgent = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    const isAndroid = /android/.test(userAgent);
    const isChrome = /chrome/.test(userAgent) && !/edge|edg/.test(userAgent);
    const isSafari = /safari/.test(userAgent) && !/chrome/.test(userAgent);
    const isMobile = isIOS || isAndroid;

    // Escuchar el evento beforeinstallprompt (solo Chrome/Edge en Android/Desktop)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
      setInstallInfo(null);
    };

    // Escuchar cuando se instala
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      setInstallInfo(null);
    };

    // Verificar requisitos de PWA
    const checkPWARequirements = () => {
      const issues: string[] = [];
      
      // Verificar HTTPS (excepto localhost)
      if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        issues.push('Se requiere HTTPS para instalar PWA');
      }
      
      // Verificar service worker
      if (!('serviceWorker' in navigator)) {
        issues.push('Tu navegador no soporta Service Workers');
      }
      
      // Verificar manifest
      const manifestLink = document.querySelector('link[rel="manifest"]');
      if (!manifestLink) {
        issues.push('Manifest no encontrado');
      }
      
      return issues;
    };

    // Si no se dispara el evento después de un tiempo, mostrar instrucciones manuales
    const timeout = setTimeout(() => {
      if (!isInstallable && !isInstalled) {
        const requirements = checkPWARequirements();
        
        if (requirements.length > 0) {
          setInstallInfo({
            reason: 'Requisitos no cumplidos',
            instructions: requirements.join('. ') + '. Verifica la consola del navegador para más detalles.'
          });
        } else if (isIOS && isSafari) {
          setInstallInfo({
            reason: 'iOS requiere instalación manual',
            instructions: 'Toca el botón "Compartir" (flecha hacia arriba) → "Añadir a pantalla de inicio"'
          });
        } else if (isAndroid && isChrome) {
          setInstallInfo({
            reason: 'Instalación manual requerida',
            instructions: 'Menú (3 puntos) → "Instalar aplicación" o "Añadir a pantalla de inicio"'
          });
        } else if (!isMobile) {
          setInstallInfo({
            reason: 'Desktop: Busca el icono de instalación',
            instructions: 'Busca el icono "+" en la barra de direcciones o menú → "Instalar GymTracker AI"'
          });
        } else {
          setInstallInfo({
            reason: 'Navegador no compatible',
            instructions: 'Usa Chrome (Android) o Safari (iOS) para instalar la app'
          });
        }
      }
    }, 2000);

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [isInstallable, isInstalled]);

  const install = async (): Promise<boolean> => {
    if (!deferredPrompt) {
      return false;
    }

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setIsInstallable(false);
        setDeferredPrompt(null);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error al instalar PWA:', error);
      return false;
    }
  };

  return {
    isInstallable,
    isInstalled,
    install,
    installInfo
  };
};

