// V9: disattiva la vecchia cache offline.
self.addEventListener("install",e=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(self.registration.unregister()));
