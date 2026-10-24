// Opslag op dit apparaat (IndexedDB): afgevinkte taken, notities, eigen planten en foto's.

const DB_NAAM = 'tuinplanner';
const DB_VERSIE = 1;
const STORES = ['gedaan', 'notities', 'planten', 'fotos', 'instellingen'];

let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAAM, DB_VERSIE);
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

function verzoek(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(naam, modus = 'readonly') {
  const db = await open();
  return db.transaction(naam, modus).objectStore(naam);
}

export async function alles(naam) {
  return verzoek((await store(naam)).getAll());
}
export async function haal(naam, key) {
  return verzoek((await store(naam)).get(key));
}
export async function bewaar(naam, waarde) {
  return verzoek((await store(naam, 'readwrite')).put(waarde));
}
export async function verwijder(naam, key) {
  return verzoek((await store(naam, 'readwrite')).delete(key));
}
export async function perPlant(naam, plantId) {
  return verzoek((await store(naam)).index('plantId').getAll(plantId));
}

// --- Afgevinkte taken -------------------------------------------------------

/** Map van taak-key naar lijst ISO-datums waarop de taak is afgevinkt. */
export async function gedaanMap() {
  const rijen = await alles('gedaan');
  return new Map(rijen.map((r) => [r.key, r.datums]));
}

export async function vinkAf(key, datum) {
  const rij = (await haal('gedaan', key)) || { key, datums: [] };
  rij.datums.push(datum.toISOString());
  rij.datums.sort();
  await bewaar('gedaan', rij);
}

export async function maakOngedaan(key) {
  const rij = await haal('gedaan', key);
  if (!rij) return;
  rij.datums.pop();
  if (rij.datums.length) await bewaar('gedaan', rij);
  else await verwijder('gedaan', key);
}

// --- Instellingen ------------------------------------------------------------

export async function instelling(key, standaard) {
  const rij = await haal('instellingen', key);
  return rij ? rij.waarde : standaard;
}
export async function zetInstelling(key, waarde) {
  await bewaar('instellingen', { key, waarde });
}

// --- Export / import ---------------------------------------------------------

function blobNaarDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function dataUrlNaarBlob(url) {
  return (await fetch(url)).blob();
}

export async function exporteer() {
  const uit = { app: 'tuinplanner', versie: 1, datum: new Date().toISOString() };
  for (const naam of STORES) uit[naam] = await alles(naam);
  uit.fotos = await Promise.all(uit.fotos.map(async (f) => ({ ...f, blob: await blobNaarDataUrl(f.blob) })));
  return uit;
}

/** Vervangt alle gegevens op dit apparaat door de inhoud van een exportbestand. */
export async function importeer(data) {
  if (!data || data.app !== 'tuinplanner') throw new Error('Dit is geen Tuinplanner-exportbestand.');
  const fotos = await Promise.all((data.fotos || []).map(async (f) => ({ ...f, blob: await dataUrlNaarBlob(f.blob) })));
  const db = await open();
  const tx = db.transaction(STORES, 'readwrite');
  for (const naam of STORES) {
    const s = tx.objectStore(naam);
    s.clear();
    for (const rij of naam === 'fotos' ? fotos : data[naam] || []) s.put(rij);
  }
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/** Vraag de browser om de gegevens niet automatisch op te ruimen. */
export async function vraagBlijvendeOpslag() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch { /* niet ondersteund */ }
  return false;
}
