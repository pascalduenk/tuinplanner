// Opslag van alles wat je in de app doet: afgevinkte taken, notities, eigen planten, foto's
// en instellingen. Twee varianten:
//  - online (Firestore, gedeeld tussen gebruikers) als js/firebase-config.js is ingevuld;
//  - lokaal (IndexedDB, alleen dit apparaat) als terugval.
// De app praat alleen met de functies hieronder; alle gegevens staan in een cache in het geheugen.

export const cache = {
  gedaan: new Map(),       // taak-key -> [{ datum: ISO, door }]
  notities: [],            // { id, plantId, tekst, datum, door }
  planten: [],             // eigen planten
  fotos: [],               // { id, plantId, data: dataURL, datum, door }
  instellingen: new Map(), // key -> waarde
};

export const status = { modus: 'lokaal', gebruiker: null, fout: null };

let backend;
let luisteraar = () => {};
const melding = () => luisteraar();

export const nieuwId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);
const naam = () => status.gebruiker?.naam || null;

/** Start de opslag. `bijWijziging` wordt aangeroepen als er gegevens veranderen (ook door een ander). */
export async function start(bijWijziging) {
  luisteraar = bijWijziging;
  let config = null;
  try {
    ({ firebaseConfig: config } = await import('./firebase-config.js'));
  } catch { /* geen config */ }
  // ?lokaal achter het adres: testen zonder in te loggen (gegevens alleen op dit apparaat).
  const forceerLokaal = new URLSearchParams(location.search).has('lokaal');
  if (config && config.apiKey && !forceerLokaal) {
    status.modus = 'online';
    backend = await import('./opslag-firebase.js');
    await backend.start(config, { cache, status, melding, lokaleGegevens });
  } else {
    backend = lokaal;
    await lokaal.start();
  }
  return status;
}

export const inloggen = () => backend.inloggen?.();
export const uitloggen = () => backend.uitloggen?.();

// --- Lezen (synchroon, uit de cache) ----------------------------------------

/** Map van taak-key naar lijst ISO-datums (oud → nieuw). */
export function gedaanMap() {
  return new Map([...cache.gedaan].map(([k, lijst]) => [k, lijst.map((d) => d.datum)]));
}
export function laatsteKeer(key) {
  const lijst = cache.gedaan.get(key);
  return lijst && lijst.length ? lijst[lijst.length - 1] : null;
}
export const notities = (plantId) => cache.notities.filter((n) => n.plantId === plantId)
  .sort((a, b) => b.datum.localeCompare(a.datum));
export const eigenPlanten = () => cache.planten;
export const fotos = () => cache.fotos;
export const instelling = (key, standaard) => (cache.instellingen.has(key) ? cache.instellingen.get(key) : standaard);

// --- Schrijven -----------------------------------------------------------------

// Elke wijziging komt direct in de cache (zodat het scherm meteen klopt) en gaat daarna naar de opslag.

function zetGedaanInCache(key, lijst) {
  if (lijst.length) cache.gedaan.set(key, lijst); else cache.gedaan.delete(key);
}
function zetInCache(naam, rij) {
  if (naam === 'instellingen') cache.instellingen.set(rij.id, rij.waarde);
  else cache[naam] = [...cache[naam].filter((x) => String(x.id) !== String(rij.id)), rij];
}
function verwijderUitCache(naam, id) {
  cache[naam] = cache[naam].filter((x) => String(x.id) !== String(id));
}

export function vinkAf(key, datum) {
  const regel = { datum: datum.toISOString(), door: naam() };
  zetGedaanInCache(key, [...(cache.gedaan.get(key) || []), regel].sort((a, b) => a.datum.localeCompare(b.datum)));
  return backend.vinkAf(key, regel);
}
export function maakOngedaan(key) {
  const lijst = [...(cache.gedaan.get(key) || [])];
  lijst.pop();
  zetGedaanInCache(key, lijst);
  return backend.zetGedaan(key, lijst);
}

function zet(naam, rij) {
  zetInCache(naam, rij);
  return backend.zet(naam, rij);
}
function verwijder(naam, id) {
  verwijderUitCache(naam, id);
  return backend.verwijder(naam, id);
}

export function bewaarNotitie(plantId, tekst) {
  return zet('notities', { id: nieuwId(), plantId, tekst, datum: new Date().toISOString(), door: naam() });
}
export const verwijderNotitie = (id) => verwijder('notities', id);

export async function bewaarFoto(plantId, blob) {
  const data = await blobNaarDataUrl(blob);
  return zet('fotos', { id: nieuwId(), plantId, data, datum: new Date().toISOString(), door: naam() });
}
export const verwijderFoto = (id) => verwijder('fotos', id);

export const bewaarPlant = (plant) => zet('planten', plant);
export async function verwijderPlant(id) {
  for (const f of cache.fotos.filter((x) => x.plantId === id)) await verwijder('fotos', f.id);
  for (const n of cache.notities.filter((x) => x.plantId === id)) await verwijder('notities', n.id);
  await verwijder('planten', id);
}

export const zetInstelling = (key, waarde) => zet('instellingen', { id: key, waarde });

// --- Export / import -----------------------------------------------------------

export function exporteer() {
  return {
    app: 'tuinplanner',
    versie: 2,
    datum: new Date().toISOString(),
    gedaan: [...cache.gedaan].map(([key, datums]) => ({ key, datums })),
    notities: cache.notities,
    planten: cache.planten,
    fotos: cache.fotos,
    instellingen: [...cache.instellingen].map(([key, waarde]) => ({ key, waarde })),
  };
}

/** Zet een exportbestand (versie 1 of 2) om naar het huidige formaat. */
async function normaliseer(data) {
  if (!data || data.app !== 'tuinplanner') throw new Error('Dit is geen Tuinplanner-exportbestand.');
  return {
    gedaan: (data.gedaan || []).map((r) => ({
      key: r.key,
      datums: r.datums.map((d) => (typeof d === 'string' ? { datum: d, door: null } : d)),
    })),
    notities: (data.notities || []).map((n) => ({ door: null, ...n, id: String(n.id) })),
    planten: data.planten || [],
    fotos: await Promise.all((data.fotos || []).map(async (f) => ({
      id: String(f.id), plantId: f.plantId, datum: f.datum, door: f.door || null,
      data: f.data || (typeof f.blob === 'string' ? f.blob : await blobNaarDataUrl(f.blob)),
    }))),
    instellingen: (data.instellingen || []).map((r) => ({ key: r.key, waarde: r.waarde })),
  };
}

/** Vervangt alle gegevens door de inhoud van een exportbestand. */
export async function importeer(data) {
  await backend.vervangAlles(await normaliseer(data));
}

// --- Hulpjes ---------------------------------------------------------------------

export function blobNaarDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// =================================================================================
// Lokale opslag (IndexedDB)
// =================================================================================

const DB_NAAM = 'tuinplanner';
const STORES = ['gedaan', 'notities', 'planten', 'fotos', 'instellingen'];
let dbPromise;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAAM, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('gedaan', { keyPath: 'key' });
        db.createObjectStore('notities', { keyPath: 'id', autoIncrement: true }).createIndex('plantId', 'plantId');
        db.createObjectStore('planten', { keyPath: 'id' });
        db.createObjectStore('fotos', { keyPath: 'id', autoIncrement: true }).createIndex('plantId', 'plantId');
        db.createObjectStore('instellingen', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function idb(naam, modus, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(naam, modus);
    const req = fn(tx.objectStore(naam));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
  });
}

/** Leest alles uit de lokale IndexedDB, al omgezet naar het huidige formaat. */
export async function lokaleGegevens() {
  const ruw = { app: 'tuinplanner' };
  for (const naam of STORES) ruw[naam] = await idb(naam, 'readonly', (s) => s.getAll());
  return normaliseer(ruw);
}

const lokaal = {
  async start() {
    const data = await lokaleGegevens();
    cache.gedaan = new Map(data.gedaan.map((r) => [r.key, r.datums]));
    cache.notities = data.notities;
    cache.planten = data.planten;
    cache.fotos = data.fotos;
    cache.instellingen = new Map(data.instellingen.map((r) => [r.key, r.waarde]));
  },

  async vinkAf(key, regel) {
    const lijst = [...(cache.gedaan.get(key) || []), regel].sort((a, b) => a.datum.localeCompare(b.datum));
    await lokaal.zetGedaan(key, lijst);
  },

  async zetGedaan(key, lijst) {
    if (lijst.length) cache.gedaan.set(key, lijst); else cache.gedaan.delete(key);
    await idb('gedaan', 'readwrite', (s) => (lijst.length ? s.put({ key, datums: lijst }) : s.delete(key)));
    melding();
  },

  async zet(naam, rij) {
    if (naam === 'instellingen') {
      cache.instellingen.set(rij.id, rij.waarde);
      await idb(naam, 'readwrite', (s) => s.put({ key: rij.id, waarde: rij.waarde }));
    } else {
      const lijst = cache[naam].filter((x) => x.id !== rij.id);
      lijst.push(rij);
      cache[naam] = lijst;
      await idb(naam, 'readwrite', (s) => s.put(rij));
    }
    melding();
  },

  async verwijder(naam, id) {
    cache[naam] = cache[naam].filter((x) => String(x.id) !== String(id));
    // Oude records hebben een numeriek id; verwijder beide varianten.
    await idb(naam, 'readwrite', (s) => { s.delete(String(id)); if (!Number.isNaN(Number(id))) s.delete(Number(id)); return null; });
    melding();
  },

  async vervangAlles(data) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES, 'readwrite');
      for (const naam of STORES) tx.objectStore(naam).clear();
      for (const r of data.gedaan) tx.objectStore('gedaan').put(r);
      for (const naam of ['notities', 'planten', 'fotos']) for (const r of data[naam]) tx.objectStore(naam).put(r);
      for (const r of data.instellingen) tx.objectStore('instellingen').put(r);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    await lokaal.start();
    melding();
  },
};
