// O 'v2' é o gatilho. Ele força os telemóveis a apagarem a cache antiga e a puxarem o novo ícone.
const CACHE_NAME = 'dexco-estoque-v3';
const urlsToCache = [
    './',
    './index.html',
    './manifest.json',
    './logo.png'
];

// Evento de Instalação (Cache inicial)
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

// Evento de Ativação (Limpeza da cache antiga)
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
    self.clients.claim();
});

// Evento Fetch (Estratégia Stale-While-Revalidate - Padrão Ouro)
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            const fetchPromise = fetch(event.request).then(networkResponse => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => cachedResponse);
            
            return cachedResponse || fetchPromise;
        })
    );
});

// Escuta a mensagem para forçar a Atualização Silenciosa
self.addEventListener('message', event => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});
