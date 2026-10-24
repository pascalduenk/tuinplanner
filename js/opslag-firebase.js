// Online opslag in Firestore (gedeeld), met inloggen via Google.
// Firestore bewaart een kopie op het apparaat, zodat de app ook offline werkt;
// wijzigingen worden gesynchroniseerd zodra er weer internet is.

const VERSIE = '12.19.0';
const CDN = `https://www.gstatic.com/firebasejs/${VERSIE}`;

const { initializeApp } = await import(`${CDN}/firebase-app.js`);
const {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut,
} = await import(`${CDN}/firebase-auth.js`);
const {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch, arrayUnion,
} = await import(`${CDN}/firebase-firestore.js`);

const COLLECTIES = ['gedaan', 'notities', 'planten', 'fotos', 'instellingen'];

let auth;
let db;
let ctx;            // { cache, status, melding, lokaleGegevens }
let stoppers = [];

// Een taak-key bevat een '/', dat mag niet in een document-id.
const gedaanId = (key) => key.replace(/\//g, '__');

export async function start(config, context) {
  ctx = context;
  const app = initializeApp(config);
  auth = getAuth(app);
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });

  await new Promise((klaar) => {
    let eerste = true;
    onAuthStateChanged(auth, async (user) => {
      stopLuisteren();
      leegCache();
      ctx.status.fout = null;
      ctx.status.gebruiker = user ? {
        naam: (user.displayName || user.email || '').split(' ')[0],
        email: user.email,
      } : null;
      if (user) {
        await luister();
        migreerLokaal();
      }
      if (eerste) { eerste = false; klaar(); } else ctx.melding();
    });
  });
}

export async function inloggen() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provider);
  } catch (fout) {
    if (fout.code === 'auth/popup-blocked' || fout.code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
    } else if (fout.code !== 'auth/popup-closed-by-user' && fout.code !== 'auth/cancelled-popup-request') {
      throw fout;
    }
  }
}

export const uitloggen = () => signOut(auth);

function leegCache() {
  const { cache } = ctx;
  cache.gedaan = new Map();
  cache.notities = [];
  cache.planten = [];
  cache.fotos = [];
  cache.instellingen = new Map();
}

function stopLuisteren() {
  stoppers.forEach((stop) => stop());
  stoppers = [];
}

/** Luistert naar alle collecties; wacht op de eerste lading van elk. */
function luister() {
  const { cache, status, melding } = ctx;
  return Promise.all(COLLECTIES.map((naam) => new Promise((geladen) => {
    let eerste = true;
    const stop = onSnapshot(collection(db, naam), (snap) => {
      const rijen = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      if (naam === 'gedaan') cache.gedaan = new Map(rijen.map((r) => [r.key, sorteer(r.datums || [])]));
      else if (naam === 'instellingen') cache.instellingen = new Map(rijen.map((r) => [r.id, r.waarde]));
      else cache[naam] = rijen;
      if (eerste) { eerste = false; geladen(); } else melding();
    }, (fout) => {
      status.fout = fout.code === 'permission-denied' ? 'geenToegang' : fout.message;
      if (eerste) { eerste = false; geladen(); } else melding();
    });
    stoppers.push(stop);
  })));
}

const sorteer = (lijst) => [...lijst].sort((a, b) => a.datum.localeCompare(b.datum));

/** Schrijfacties wachten niet op de server (dat zou offline blijven hangen). */
function schrijf(belofte) {
  belofte.catch((fout) => {
    ctx.status.fout = fout.code === 'permission-denied' ? 'geenToegang' : fout.message;
    ctx.melding();
  });
}

export function vinkAf(key, regel) {
  schrijf(setDoc(doc(db, 'gedaan', gedaanId(key)), { key, datums: arrayUnion(regel) }, { merge: true }));
}

export function zetGedaan(key, lijst) {
  const ref = doc(db, 'gedaan', gedaanId(key));
  schrijf(lijst.length ? setDoc(ref, { key, datums: lijst }) : deleteDoc(ref));
}

export function zet(naam, rij) {
  const { id, ...rest } = rij;
  schrijf(setDoc(doc(db, naam, String(id)), rest));
}

export function verwijder(naam, id) {
  schrijf(deleteDoc(doc(db, naam, String(id))));
}

/** Schrijft veel documenten in porties (Firestore staat max. 500 per batch toe). */
async function inPorties(acties) {
  for (let i = 0; i < acties.length; i += 400) {
    const batch = writeBatch(db);
    acties.slice(i, i + 400).forEach((actie) => actie(batch));
    schrijf(batch.commit());
  }
}

function schrijfActies(data) {
  return [
    ...data.gedaan.map((r) => (b) => b.set(doc(db, 'gedaan', gedaanId(r.key)), { key: r.key, datums: arrayUnion(...r.datums) }, { merge: true })),
    ...['notities', 'planten', 'fotos'].flatMap((naam) => data[naam].map(({ id, ...rest }) => (b) => b.set(doc(db, naam, String(id)), rest))),
    ...data.instellingen.map((r) => (b) => b.set(doc(db, 'instellingen', r.key), { waarde: r.waarde })),
  ];
}

export async function vervangAlles(data) {
  const { cache } = ctx;
  const weg = [
    ...[...cache.gedaan.keys()].map((k) => (b) => b.delete(doc(db, 'gedaan', gedaanId(k)))),
    ...['notities', 'planten', 'fotos'].flatMap((naam) => cache[naam].map((r) => (b) => b.delete(doc(db, naam, String(r.id))))),
    ...[...cache.instellingen.keys()].map((k) => (b) => b.delete(doc(db, 'instellingen', k))),
  ];
  await inPorties(weg);
  await inPorties(schrijfActies(data));
}

/**
 * Eenmalig per apparaat: gegevens die eerder alleen lokaal zijn opgeslagen
 * (vóór de overstap naar de online database) toevoegen aan de gedeelde database.
 */
async function migreerLokaal() {
  const vlag = 'tuinplanner-lokaal-gemigreerd';
  try {
    if (localStorage.getItem(vlag)) return;
    const data = await ctx.lokaleGegevens();
    const aantal = data.gedaan.length + data.notities.length + data.planten.length + data.fotos.length;
    if (aantal) await inPorties(schrijfActies(data));
    localStorage.setItem(vlag, new Date().toISOString());
  } catch (fout) {
    console.warn('Lokale gegevens overzetten mislukt', fout);
  }
}
