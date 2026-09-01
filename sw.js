const CACHE_NAME = 'dexco-estoque-v42';

const urlsToCache = [
  './manifest.json',
  './logo.png'
];

// ======================================================
// INSTALAÇÃO
// ======================================================
// Guarda apenas os recursos estáticos.
// O index.html NÃO fica preso ao cache durante a instalação.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// ======================================================
// ATIVAÇÃO
// ======================================================
// Remove caches antigos e assume imediatamente as páginas abertas.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// ======================================================
// FETCH
// ======================================================
self.addEventListener('fetch', event => {
  const request = event.request;

  // Ignora pedidos que não sejam HTTP/HTTPS.
  if (!request.url.startsWith('http')) return;

  // Não interfere em chamadas externas, incluindo Firebase.
  const requestUrl = new URL(request.url);
  const serviceWorkerUrl = new URL(self.location.href);

  if (requestUrl.origin !== serviceWorkerUrl.origin) {
    return;
  }

  // ====================================================
  // NAVEGAÇÃO / INDEX.HTML
  // Estratégia: NETWORK FIRST
  // ====================================================
  //
  // Quando existe internet:
  // sempre tenta buscar a versão mais recente no GitHub.
  //
  // Quando está offline:
  // usa a última versão salva no cache.
  //
  if (
    request.mode === 'navigate' ||
    requestUrl.pathname.endsWith('/index.html')
  ) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(networkResponse => {
          if (
            networkResponse &&
            networkResponse.ok
          ) {
            const responseClone = networkResponse.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put('./index.html', responseClone);
              });
          }

          return networkResponse;
        })
        .catch(async () => {
          const cachedIndex = await caches.match('./index.html');

          if (cachedIndex) {
            return cachedIndex;
          }

          return caches.match('./');
        })
    );

    return;
  }

  // ====================================================
  // RECURSOS ESTÁTICOS
  // Estratégia: STALE-WHILE-REVALIDATE
  // ====================================================
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        const networkPromise = fetch(request)
          .then(networkResponse => {
            if (
              networkResponse &&
              networkResponse.ok &&
              networkResponse.type === 'basic'
            ) {
              const responseClone = networkResponse.clone();

              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(request, responseClone);
                });
            }

            return networkResponse;
          })
          .catch(() => null);

        if (cachedResponse) {
          return cachedResponse;
        }

        return networkPromise;
      })
  );
});

// ======================================================
// ATUALIZAÇÃO IMEDIATA
// ======================================================
// Permite que o index.html mande a mensagem:
// { action: 'skipWaiting' }
//
// Assim uma nova versão pode assumir o controle
// sem esperar o utilizador fechar completamente o PWA.
self.addEventListener('message', event => {
  if (
    event.data &&
    event.data.action === 'skipWaiting'
  ) {
    self.skipWaiting();
  }
});