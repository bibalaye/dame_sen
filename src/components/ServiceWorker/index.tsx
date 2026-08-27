'use client';

import { useEffect } from 'react';

/**
 * Enregistre le service worker qui rend le jeu jouable hors-ligne et
 * installable sur l'écran d'accueil. Aucun rendu : uniquement l'inscription.
 */
const ServiceWorker = () => {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Contexte non sécurisé ou enregistrement refusé : le jeu fonctionne
        // normalement, il ne sera simplement pas disponible hors-ligne.
      });
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register);
      return () => window.removeEventListener('load', register);
    }
  }, []);

  return null;
};

export default ServiceWorker;
