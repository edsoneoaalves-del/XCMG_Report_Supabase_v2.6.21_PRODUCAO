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
  let deferredPrompt = null;

  const showBanner = () => {
    if (!banner || !isMobile || isStandalone || !canShow) return;
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

  if (isIOS && isMobile && !isStandalone && canShow) {
    installBtn.textContent = 'Como instalar';
    window.setTimeout(showBanner, 1800);
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
        registration.update().catch(() => {});
      } catch (error) {
        console.warn('Não foi possível registrar o modo PWA.', error);
      }
    });
  }
})();
