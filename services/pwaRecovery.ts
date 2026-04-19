const APP_BUILD_KEY = 'gym_ai_app_build_id';
const APP_RELOAD_GUARD_KEY = 'gym_ai_reload_after_update';

const isProductionHost = () => {
  const host = window.location.hostname;
  return window.location.protocol === 'https:' && host !== 'localhost' && host !== '127.0.0.1';
};

const safeStorageGet = (storage: Storage, key: string) => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const safeStorageSet = (storage: Storage, key: string, value: string) => {
  try {
    storage.setItem(key, value);
  } catch {
    // Storage can be unavailable in some privacy modes.
  }
};

const safeStorageRemove = (storage: Storage, key: string) => {
  try {
    storage.removeItem(key);
  } catch {
    // Storage can be unavailable in some privacy modes.
  }
};

const deleteAppCaches = async () => {
  if (!('caches' in window)) return;

  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((name) =>
        ['workbox', 'precache', 'pages', 'assets', 'google-fonts-cache'].some((prefix) => name.includes(prefix))
      )
      .map((name) => caches.delete(name))
  );
};

export const repairInstalledAppCache = async () => {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  await deleteAppCaches();
};

export const isLikelyConnectivityError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  return /failed to fetch|network|fetch|timeout|abort|conexi|comunicaci|servidor/i.test(message);
};

export const startPwaHealthChecks = () => {
  if (!isProductionHost() || !('serviceWorker' in navigator)) return;

  let hasReloadedForControllerChange = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hasReloadedForControllerChange) return;
    hasReloadedForControllerChange = true;
    window.location.reload();
  });

  const refreshInstalledApp = async () => {
    try {
      const previousBuildId = safeStorageGet(localStorage, APP_BUILD_KEY);
      const currentBuildId = __APP_BUILD_ID__;
      const alreadyReloaded = safeStorageGet(sessionStorage, APP_RELOAD_GUARD_KEY) === currentBuildId;

      if (previousBuildId && previousBuildId !== currentBuildId && !alreadyReloaded) {
        safeStorageSet(sessionStorage, APP_RELOAD_GUARD_KEY, currentBuildId);
        await deleteAppCaches();
        const registration = await navigator.serviceWorker.getRegistration();
        await registration?.update();
        safeStorageSet(localStorage, APP_BUILD_KEY, currentBuildId);
        window.location.reload();
        return;
      }

      safeStorageSet(localStorage, APP_BUILD_KEY, currentBuildId);
      safeStorageRemove(sessionStorage, APP_RELOAD_GUARD_KEY);

      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    } catch (error) {
      console.warn('[PWA] No se pudo refrescar la app instalada:', error);
    }
  };

  if (document.readyState === 'complete') {
    void refreshInstalledApp();
  } else {
    window.addEventListener('load', () => void refreshInstalledApp(), { once: true });
  }
};
