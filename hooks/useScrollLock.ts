import { useEffect, useRef } from 'react';

export const useScrollLock = (isOpen: boolean) => {
  // Guardamos el estilo original para soportar modales anidados
  const originalStyle = useRef(window.getComputedStyle(document.body).overflow);

  useEffect(() => {
    if (isOpen) {
      originalStyle.current = document.body.style.overflow;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      
      document.body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
    }

    return () => {
      // Solo restauramos si el componente se desmonta o se cierra
      if (isOpen) {
        document.body.style.overflow = originalStyle.current;
        document.body.style.paddingRight = '';
      }
    };
  }, [isOpen]);
};