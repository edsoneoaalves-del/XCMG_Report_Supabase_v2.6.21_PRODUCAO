(() => {
  'use strict';

  const banner = document.getElementById('pwaInstallBanner');
  const installBtn = document.getElementById('pwaInstallBtn');
  const closeBtn = document.getElementById('pwaInstallClose');
  const iosBackdrop = document.getElementById('pwaIosBackdrop');
  const iosClose = document.getElementById('pwaIosClose');
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isMobile = window.matchMedia('(max-width: 800px)').matches;
  const dismissedAt = Number(localStorage.getItem('xcmg_pwa_prompt_dismissed') || 0);
  const canShow = Date.now() - dismissedAt > 7 * 24 * 60 * 60 * 1000;
  const isFileProtocol = window.location.protocol === 'file:';
  let deferredPrompt = null;

  const showBanner = () => {
    if (!banner || !isMobile || isStandalone || !canShow || isFileProtocol) return;
    banner.classList.remove('hidden');
    document.body.classList.add('pwa-banner-visible');
  };

  const hideBanner = (remember = false) => {
    banner?.classList.add('hidden');
    document.body.classList.remove('pwa-banner-visible');
    if (remember) localStorage.setItem('xcmg_pwa_prompt_dismissed', String(Date.now()));
  };

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    showBanner();
  });

  installBtn?.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      hideBanner(true);
      return;
    }
    if (isIOS) {
      hideBanner(false);
      iosBackdrop?.classList.remove('hidden');
    }
  });

  closeBtn?.addEventListener('click', () => hideBanner(true));
  iosClose?.addEventListener('click', () => iosBackdrop?.classList.add('hidden'));
  iosBackdrop?.addEventListener('click', event => {
    if (event.target === iosBackdrop) iosBackdrop.classList.add('hidden');
  });

  window.addEventListener('appinstalled', () => {
    hideBanner(true);
    localStorage.setItem('xcmg_pwa_installed', '1');
  });

  if (isIOS && isMobile && !isStandalone && canShow && !isFileProtocol) {
    installBtn.textContent = 'Como instalar';
    window.setTimeout(showBanner, 1800);
  }

  // Service Worker não funciona em file://; registra apenas em HTTP/HTTPS.
  if ('serviceWorker' in navigator && !isFileProtocol) {
    // Quando um novo Service Worker assume o controle (após atualização),
    // a aba recarrega uma única vez para garantir que o app e o cache
    // offline estejam sempre na versão mais recente e completa.
    let controllerChanged = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (controllerChanged) return;
      controllerChanged = true;
      if (navigator.serviceWorker.controller) window.location.reload();
    });

    const registerServiceWorker = async () => {
      try {
        const swUrl = new URL('service-worker.js', window.location.href);
        const registration = await navigator.serviceWorker.register(swUrl.href, {
          scope: new URL('./', window.location.href).href
        });
        registration.update().catch(() => {});
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              worker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      } catch (error) {
        console.warn('Não foi possível registrar o modo PWA.', error);
      }
    };

    // Registra o quanto antes: quanto mais cedo o cache offline for
    // preenchido, menor o risco de o usuário ficar sem internet antes de o
    // app terminar de se preparar para funcionar offline.
    if (document.readyState === 'complete') registerServiceWorker();
    else window.addEventListener('load', registerServiceWorker);
  }
})();
