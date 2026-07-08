// Minimal service worker — exists solely to satisfy PWA install criteria.
// No offline caching: every request goes straight to the network.
// ponytail: passthrough fetch handler, add a cache strategy here if offline mode is wanted.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // Intentionally empty: let the browser handle the request normally.
  // The mere presence of this handler is what makes the app installable.
});
