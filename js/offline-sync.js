(() => {
  'use strict';

  const DB_NAME = 'xcmg_report_offline_v1';
  const DB_VERSION = 1;
  const STORE = 'sync_queue';
  const CHECK_INTERVAL_MS = 5000;
  const CHECK_TIMEOUT_MS = 4500;
  const IS_FILE_PROTOCOL = window.location.protocol === 'file:';
  const HEARTBEAT_URL = new URL('connectivity-check.txt', window.location.href).href;

  let dbPromise = null;
  let detectedOnline = false;
  let checkingPromise = null;
  let checkSequence = 0;
  let lastCheckedAt = 0;
  let lastDetail = { online: false, pending: 0, checking: true, syncing: false, syncError: false };

  function openDB() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(error => {
      console.warn('IndexedDB indisponível; sincronização offline limitada.', error);
      return null;
    });
    return dbPromise;
  }

  async function put(item) {
    const db = await openDB();
    if (!db) return false;
    return new Promise(resolve => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ ...item, queuedAt: new Date().toISOString() });
      tx.oncomplete = () => { emit(); resolve(true); };
      tx.onerror = () => resolve(false);
    });
  }

  async function remove(key) {
    const db = await openDB();
    if (!db) return false;
    return new Promise(resolve => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => { emit(); resolve(true); };
      tx.onerror = () => resolve(false);
    });
  }

  async function all() {
    const db = await openDB();
    if (!db) return [];
    return new Promise(resolve => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  }

  async function count() {
    const db = await openDB();
    if (!db) return 0;
    return new Promise(resolve => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).count();
      request.onsuccess = () => resolve(request.result || 0);
      request.onerror = () => resolve(0);
    });
  }

  async function emit(extra = {}) {
    const pending = await count();
    lastDetail = {
      ...lastDetail,
      online: detectedOnline,
      pending,
      lastCheckedAt,
      ...extra
    };
    window.dispatchEvent(new CustomEvent('xcmg-sync-status', { detail: { ...lastDetail } }));
  }

  async function setOffline() {
    checkSequence += 1;
    detectedOnline = false;
    lastCheckedAt = Date.now();
    await emit({ online: false, checking: false, syncing: false, syncError: false });
    return false;
  }

  async function performNetworkCheck() {
    const sequence = ++checkSequence;

    if (navigator.onLine === false) return setOffline();

    // Ao abrir diretamente pelo Explorador (file://), o navegador bloqueia o
    // heartbeat por segurança e Service Worker/PWA não funciona. Nesse modo,
    // usamos o estado de rede do próprio navegador para não gerar falso Offline.
    // Em localhost, Vercel ou qualquer servidor HTTP/HTTPS, usamos o heartbeat real.
    if (IS_FILE_PROTOCOL) {
      detectedOnline = true;
      lastCheckedAt = Date.now();
      await emit({ online: true, checking: false, syncing: false, syncError: false, localFileMode: true });
      return true;
    }

    await emit({ checking: true, syncing: false });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

    try {
      const separator = HEARTBEAT_URL.includes('?') ? '&' : '?';
      const response = await fetch(`${HEARTBEAT_URL}${separator}t=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'Cache-Control': 'no-cache' },
        signal: controller.signal
      });
      if (sequence !== checkSequence) return detectedOnline;
      detectedOnline = response.ok;
    } catch (error) {
      if (sequence !== checkSequence) return detectedOnline;
      detectedOnline = false;
    } finally {
      clearTimeout(timeout);
    }

    lastCheckedAt = Date.now();
    await emit({ online: detectedOnline, checking: false, syncing: false });
    return detectedOnline;
  }

  function checkConnection() {
    if (checkingPromise) return checkingPromise;
    checkingPromise = performNetworkCheck().finally(() => { checkingPromise = null; });
    return checkingPromise;
  }

  async function markSyncError() {
    await emit({ checking: false, syncing: false, syncError: true });
  }

  async function flush(processor) {
    const online = detectedOnline || await checkConnection();
    if (!online) return { sent: 0, pending: await count() };

    const items = (await all()).sort((a, b) => String(a.queuedAt).localeCompare(String(b.queuedAt)));
    let sent = 0;
    await emit({ syncing: items.length > 0, checking: false, syncError: false });

    for (const item of items) {
      if (!detectedOnline) break;
      try {
        const ok = await processor(item);
        if (!ok) {
          await markSyncError();
          break;
        }
        await remove(item.key);
        sent += 1;
      } catch (error) {
        if (navigator.onLine === false) await setOffline();
        else await markSyncError();
        console.warn('Item ainda não sincronizado.', error);
        break;
      }
    }

    const pending = await count();
    await emit({ syncing: false, sent, pending, syncError: pending > 0 && detectedOnline });
    return { sent, pending };
  }

  function buildStatusUI() {
    if (document.getElementById('offlineSyncStatus')) return;

    const el = document.createElement('button');
    el.id = 'offlineSyncStatus';
    el.type = 'button';
    el.className = 'offline-sync-status';
    el.setAttribute('aria-live', 'polite');
    el.title = 'Clique para verificar a conexão';
    document.body.appendChild(el);

    const style = document.createElement('style');
    style.textContent = `
      .offline-sync-status{position:fixed;left:14px;right:auto;bottom:14px;z-index:1200;border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:8px 12px;color:#fff;font:600 12px/1.2 system-ui;box-shadow:0 8px 24px rgba(0,0,0,.24);display:flex;align-items:center;gap:7px;cursor:pointer;max-width:calc(100vw - 28px);transition:background .2s ease,transform .2s ease}
      .offline-sync-status:hover{transform:translateY(-1px)}
      .offline-sync-status.is-online{background:#0f6b3e}
      .offline-sync-status.is-offline{background:#b42323}
      .offline-sync-status.is-syncing{background:#b77900}
      @media(max-width:800px){.offline-sync-status{left:10px;right:auto;bottom:82px;padding:7px 10px;font-size:11px;max-width:calc(100vw - 20px)}}
    `;
    document.head.appendChild(style);

    const render = detail => {
      const online = detail?.online === true;
      const pending = Number(detail?.pending || 0);
      if (detail?.checking || detail?.syncing || (online && pending > 0)) {
        el.className = 'offline-sync-status is-syncing';
        el.textContent = '● Sincronizando...';
      } else if (!online) {
        el.className = 'offline-sync-status is-offline';
        el.textContent = '● Offline';
      } else {
        el.className = 'offline-sync-status is-online';
        el.textContent = '● Online sincronizado';
      }
    };

    window.addEventListener('xcmg-sync-status', event => render(event.detail));
    window.addEventListener('offline', setOffline);
    window.addEventListener('online', checkConnection);
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    connection?.addEventListener?.('change', checkConnection);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkConnection();
    });
    window.addEventListener('focus', checkConnection);
    el.addEventListener('click', checkConnection);

    render(lastDetail);
    checkConnection();
    setInterval(checkConnection, CHECK_INTERVAL_MS);
  }

  window.XCMGOfflineSync = {
    enqueueSet: (key, value) => put({ key, type: 'set', value }),
    enqueueDelete: key => put({ key, type: 'delete' }),
    clearKey: remove,
    pendingCount: count,
    flush,
    emit,
    checkConnection,
    isOnline: () => detectedOnline,
    markOffline: setOffline,
    markSyncError
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildStatusUI);
  else buildStatusUI();
})();
