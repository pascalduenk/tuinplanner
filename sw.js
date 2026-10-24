// Service worker: zorgt dat de app offline werkt.
// Verhoog VERSIE na elke wijziging aan de app, dan halen telefoons de nieuwe versie op.
const VERSIE = 'tuinplanner-v2';
const FIREBASE = 'https://www.gstatic.com/firebasejs/12.19.0/';

const SCHIL = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/seizoen.js',
  'js/opslag.js',
  'js/opslag-firebase.js',
  'js/firebase-config.js',
  'js/data.js',
  'js/fotos.js',
  'data/planten.json',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSIE);
    await cache.addAll(SCHIL);
    // Firebase-bibliotheek (vaste versie) alvast ophalen voor offline gebruik.
    try {
      await cache.addAll(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map((f) => FIREBASE + f));
    } catch { /* lukt later bij gebruik */ }
    // Thumbnails alvast ophalen, zodat het Nu-scherm offline compleet is.
    try {
      const data = await (await fetch('data/planten.json')).json();
      const thumbs = data.planten.flatMap((p) => (p.fotos || []).map((f) => `img/thumbs/${f}.jpg`));
      await cache.addAll(thumbs);
    } catch { /* lukt het niet, dan later bij gebruik */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const naam of await caches.keys()) if (naam !== VERSIE) await caches.delete(naam);
    await self.clients.claim();
  })());
});

// Foto's: eerst uit de cache. Overige bestanden: eerst het netwerk (verse versie),
// met de cache als terugval als er geen of traag internet is.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // De Firebase-bibliotheek verandert nooit (vaste versie): uit de cache.
  if (req.url.startsWith(FIREBASE)) { event.respondWith(cacheEerst(req)); return; }
  // Overige externe verzoeken (Firestore, inloggen) niet aanraken.
  if (new URL(req.url).origin !== location.origin) return;
  const url = new URL(req.url);
  if (url.pathname.includes('/img/')) event.respondWith(cacheEerst(req));
  else event.respondWith(netwerkEerst(req));
});

async function cacheEerst(req) {
  const cache = await caches.open(VERSIE);
  const gevonden = await cache.match(req);
  if (gevonden) return gevonden;
  const antwoord = await fetch(req);
  if (antwoord.ok) cache.put(req, antwoord.clone());
  return antwoord;
}

async function netwerkEerst(req) {
  const cache = await caches.open(VERSIE);
  const netwerk = fetch(req).then((antwoord) => {
    if (antwoord.ok) cache.put(req, antwoord.clone());
    return antwoord;
  });
  try {
    return await Promise.race([
      netwerk,
      new Promise((_, reject) => setTimeout(() => reject(new Error('traag')), 3000)),
    ]);
  } catch {
    const gevonden = await cache.match(req, { ignoreSearch: true })
      || (req.mode === 'navigate' ? await cache.match('index.html') : null);
    return gevonden || netwerk; // niets in de cache: toch op het netwerk wachten
  }
}
