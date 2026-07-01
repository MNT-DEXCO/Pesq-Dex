const CACHE_NAME = 'dexco-estoque-v36';

// Ficheiros essenciais que garantem que a App abre mesmo sem internet (App Shell)
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './logo.png'
];

// 1. FASE DE INSTALAÇÃO: O motor guarda a interface básica na memória do telemóvel
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

// 2. FASE DE ATIVAÇÃO: Limpa as versões antigas da cache para não ocupar espaço no telemóvel
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[ServiceWorker] A limpar cache antiga:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// 3. INTERCETOR DE REDE: Estratégia "Network-First" (Rede primeiro, Cache como plano B)
self.addEventListener('fetch', (event) => {
  // Ignora os pedidos do Firebase Firestore, pois o próprio Firebase já gere o seu modo offline
  if (event.request.url.includes('firestore.googleapis.com')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Se a rede funcionar, clona a resposta e atualiza a cache silenciosamente
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Se estiver sem internet, vai buscar a interface à Cache
        return caches.match(event.request);
      })
  );
});

// 4. A MÁGICA DA ATUALIZAÇÃO SILENCIOSA (O Cérebro Proativo)
// Ouve a ordem do botão "RECARREGAR" da nossa notificação preta no index.html
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    // Comando militar: "Mata a versão antiga e ativa a nova IMEDIATAMENTE"
    self.skipWaiting();
  }
});
