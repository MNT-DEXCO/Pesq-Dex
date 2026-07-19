const CACHE_NAME = 'dexco-estoque-v3';

const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './logo.png'
];

// INSTALAÇÃO: Guarda os ficheiros base no telemóvel
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// ATIVAÇÃO: Apaga as caches antigas (V40 para trás) e liberta memória
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// FETCH (Stale-While-Revalidate): Responde rápido com a cache, mas atualiza em background
self.addEventListener('fetch', event => {
  // Ignora chamadas estranhas (ex: extensões do browser)
  if (!(event.request.url.indexOf('http') === 0)) return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        // Guarda a versão mais fresca na cache para a próxima vez
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, networkResponse.clone());
          });
        }
        return networkResponse;
      }).catch(() => {
        // Se estiver offline, falha em silêncio e usa o cachedResponse que já foi devolvido
      });
      
      // Devolve imediatamente o que tem na cache (rápido), ou espera pela rede se não tiver
      return cachedResponse || fetchPromise;
    })
  );
});

// MENSAGEM: Ouve o clique no botão "RECARREGAR" da notificação e injeta a versão nova
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
