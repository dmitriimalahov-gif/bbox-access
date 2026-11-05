const CACHE="bbox-prod-shared-v1";
self.addEventListener("install", e=>{self.skipWaiting();});
self.addEventListener("activate", e=>{e.waitUntil(self.clients.claim());});
// For shared DB we keep SW minimal (no aggressive caching of API).
