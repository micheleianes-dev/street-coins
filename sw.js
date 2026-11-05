// Street Coins V7: service worker intentionally disabled to avoid stale cached app files.
self.addEventListener("install", event => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.registration.unregister()));
