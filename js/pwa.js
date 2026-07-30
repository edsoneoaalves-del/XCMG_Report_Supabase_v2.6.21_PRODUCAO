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
    const SW_URL = new URL('/service-worker.js', window.location.origin).href;

    // Remove registros órfãos de versões antigas do app (escopo ou script
    // diferentes do atual) antes de registrar o Service Worker vigente. Um
    // registro esquecido de uma versão anterior pode permanecer ativo no
    // navegador do usuário mesmo depois de publicarmos correções, e nunca é
    // removido automaticamente — isso pode deixar o dispositivo instalado
    // preso a uma lógica antiga de cache/navegação.
    const removeForeignRegistrations = async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.allSettled(
          registrations
            .filter(reg => {
              const scriptUrls = [reg.active, reg.installing, reg.waiting]
                .map(worker => worker?.scriptURL)
                .filter(Boolean);
              return scriptUrls.length > 0 && !scriptUrls.includes(SW_URL);
            })
            .map(reg => reg.unregister())
        );
      } catch (error) {
        console.warn('Não foi possível verificar registros antigos do Service Worker.', error);
      }
    };

    // Registro único e simples, sem verificação de atualização forçada, sem
    // mensagens de SKIP_WAITING e sem reload automático. O próprio
    // service-worker.js já ativa e assume o controle das próximas
    // navegações sozinho quando uma nova versão é publicada; a aba em uso
    // continua funcionando normalmente, sem ser recarregada ou fechada.
    // updateViaCache: 'none' garante que o navegador nunca sirva uma cópia
    // antiga do service-worker.js (ou de scripts importados por ele) a partir
    // do HTTP cache ao verificar atualizações.
    const registerServiceWorker = async () => {
      await removeForeignRegistrations();
      navigator.serviceWorker
        .register('/service-worker.js', { scope: '/', updateViaCache: 'none' })
        .catch(error => console.warn('Não foi possível registrar o modo PWA.', error));
    };

    if (document.readyState === 'complete') registerServiceWorker();
    else window.addEventListener('load', registerServiceWorker);
  }
})();
