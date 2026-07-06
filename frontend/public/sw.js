const CACHE = 'ctt-v1'
const ASSETS = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  if (event.request.url.includes('/api/')) return

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      return fetch(event.request).then((response) => {
        const copy = response.clone()
        caches.open(CACHE).then((cache) => cache.put(event.request, copy))
        return response
      })
    })
  )
})