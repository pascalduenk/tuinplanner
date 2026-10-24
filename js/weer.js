// Weeradvies: haalt het weer op bij Open-Meteo (KNMI-model) en bepaalt per taak of het
// weer reden geeft om iets nu te doen, uit te stellen of over te slaan.
// De functies `analyseer` en `advies` zijn puur (geen browser nodig), zodat ze te testen zijn.

export const BRON = 'Open-Meteo.com (KNMI-model), CC BY 4.0';

const CACHE_SLEUTEL = 'tuinplanner-weer';
const VERVERS_NA = 3 * 60 * 60 * 1000;   // elke 3 uur opnieuw ophalen
const TE_OUD_NA = 12 * 60 * 60 * 1000;   // ouder dan 12 uur: geen advies meer

// Drempels
export const DREMPEL = {
  genoegRegenWeek: 10,      // mm afgelopen 7 dagen (én meer dan de verdamping)
  genoegRegenVerwacht: 5,   // mm in vandaag + morgen
  droogteTekort: -10,       // mm (regen − verdamping, afgelopen 7 dagen)
  hitte: 28,                // °C maximum in de komende 3 dagen
  storm: 75,                // km/u windstoten in de komende 3 dagen
  natVandaag: 2,            // mm regen vandaag: niet snoeien/maaien
  natGisteren: 5,           // mm regen gisteren: gras nog nat
  zwareRegen: 15,           // mm in vandaag + morgen: mest spoelt weg
};

const DAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];

// ------------------------------------------------------------------ ophalen

export function weerUrl(lat, lon) {
  const p = new URLSearchParams({
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    daily: 'precipitation_sum,temperature_2m_min,temperature_2m_max,et0_fao_evapotranspiration,wind_gusts_10m_max',
    past_days: '7',
    forecast_days: '7',
    timezone: 'Europe/Amsterdam',
    models: 'knmi_seamless',
  });
  return `https://api.open-meteo.com/v1/forecast?${p}`;
}

function leesCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_SLEUTEL)); } catch { return null; }
}

/** Laatst opgehaalde weerdata voor deze locatie (of null). */
export function bewaardWeer(locatie) {
  const c = leesCache();
  if (!c || !locatie || c.lat !== locatie.lat || c.lon !== locatie.lon) return null;
  return c;
}

/** Haalt het weer op als het bewaarde bericht ouder is dan 3 uur. Geeft true als er nieuw weer is. */
export async function ververs(locatie, { forceer = false } = {}) {
  if (!locatie) return false;
  const c = bewaardWeer(locatie);
  if (!forceer && c && Date.now() - c.opgehaald < VERVERS_NA) return false;
  const antwoord = await fetch(weerUrl(locatie.lat, locatie.lon));
  if (!antwoord.ok) throw new Error(`Weer ophalen mislukt (${antwoord.status})`);
  const json = await antwoord.json();
  const data = { lat: locatie.lat, lon: locatie.lon, opgehaald: Date.now(), daily: json.daily };
  try { localStorage.setItem(CACHE_SLEUTEL, JSON.stringify(data)); } catch { /* vol of geblokkeerd */ }
  return true;
}

export const isTeOud = (c) => !c || Date.now() - c.opgehaald > TE_OUD_NA;

// ------------------------------------------------------------------ zoeken van een plaats

export async function zoekPlaats(naam) {
  const p = new URLSearchParams({ name: naam, count: '5', language: 'nl', format: 'json' });
  const antwoord = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${p}`);
  if (!antwoord.ok) throw new Error('Zoeken mislukt');
  const json = await antwoord.json();
  return (json.results || []).map((r) => ({
    naam: [r.name, r.admin1, r.country_code !== 'NL' ? r.country : null].filter(Boolean).join(', '),
    lat: Math.round(r.latitude * 100) / 100,
    lon: Math.round(r.longitude * 100) / 100,
  }));
}

// ------------------------------------------------------------------ analyse

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function dagNaam(datumTekst, vandaagTekst) {
  const [j, m, d] = datumTekst.split('-').map(Number);
  const [vj, vm, vd] = vandaagTekst.split('-').map(Number);
  const verschil = Math.round((new Date(j, m - 1, d) - new Date(vj, vm - 1, vd)) / 86400000);
  if (verschil === 0) return 'vandaag';
  if (verschil === 1) return 'morgen';
  return DAGEN[new Date(j, m - 1, d).getDay()];
}

const som = (lijst) => lijst.reduce((a, b) => a + (b || 0), 0);
const rond = (x) => Math.round(x);

/**
 * Vat de weerdata samen rond `nu`.
 * daily: { time[], precipitation_sum[], temperature_2m_min[], temperature_2m_max[],
 *          et0_fao_evapotranspiration[], wind_gusts_10m_max[] }
 */
export function analyseer(daily, nu = new Date()) {
  const vandaag = iso(nu);
  const i = daily.time.indexOf(vandaag);
  if (i < 0) return null;
  const regen = daily.precipitation_sum;
  const verdamping = daily.et0_fao_evapotranspiration;
  const tmin = daily.temperature_2m_min;
  const tmax = daily.temperature_2m_max;
  const wind = daily.wind_gusts_10m_max;

  const verleden = (reeks) => reeks.slice(Math.max(0, i - 7), i);
  const regen7 = som(verleden(regen));
  const verdamping7 = som(verleden(verdamping));
  const regenKomend = (regen[i] || 0) + (regen[i + 1] || 0);

  const komend = (n) => daily.time.slice(i, i + n).map((t, k) => ({
    datum: t, dag: dagNaam(t, vandaag), regen: regen[i + k] || 0,
    tmin: tmin[i + k], tmax: tmax[i + k], wind: wind[i + k] || 0,
  }));

  const drieDagen = komend(4); // vandaag + 3
  const koudste = drieDagen.reduce((a, b) => (b.tmin < a.tmin ? b : a));
  const eersteStorm = drieDagen.find((d) => d.wind >= DREMPEL.storm);
  const heetste = drieDagen.reduce((a, b) => (b.tmax > a.tmax ? b : a));
  const week = komend(7);
  const volgendeDrogeDag = week.slice(1).find((d) => d.regen < 1 && d.tmin > 0);

  return {
    vandaag,
    regen7: Math.round(regen7 * 10) / 10,
    verdamping7: Math.round(verdamping7 * 10) / 10,
    balans: Math.round((regen7 - verdamping7) * 10) / 10,
    regenVandaag: regen[i] || 0,
    regenGisteren: regen[i - 1] || 0,
    regenKomend: Math.round(regenKomend * 10) / 10,
    vorst: koudste.tmin <= 0 ? { dag: koudste.dag, tmin: koudste.tmin } : null,
    koudste,
    storm: eersteStorm ? { dag: eersteStorm.dag, wind: rond(eersteStorm.wind) } : null,
    hitte: heetste.tmax >= DREMPEL.hitte ? { dag: heetste.dag, tmax: rond(heetste.tmax) } : null,
    volgendeDrogeDag: volgendeDrogeDag ? volgendeDrogeDag.dag : null,
    week,
  };
}

export function isGenoegRegen(a) {
  return (a.balans >= 0 && a.regen7 >= DREMPEL.genoegRegenWeek) || a.regenKomend >= DREMPEL.genoegRegenVerwacht;
}
export function isDroogte(a) {
  return a.balans <= DREMPEL.droogteTekort && a.regenKomend < 2;
}

// ------------------------------------------------------------------ advies per taak

export const graden = (t) => `${t > 0 ? '' : t < 0 ? '−' : ''}${Math.abs(Math.round(t))}°`;

/**
 * Advies voor één taak, of null als het weer niet uitmaakt.
 * effect: 'belangrijk' (nu doen), 'wachten' (even uitstellen) of 'nietNodig'.
 */
export function advies(taak, a) {
  if (!a || !taak.soort || taak.prioriteit === 'niet') return null;
  const vorstDag = a.vorst ? `${a.vorst.dag} (${graden(a.vorst.tmin)})` : '';
  const drogeDag = a.volgendeDrogeDag ? `; ${a.volgendeDrogeDag} lijkt droog` : '';

  switch (taak.soort) {
    case 'water':
      if (isDroogte(a)) {
        const heet = a.hitte ? ` en heet (${a.hitte.tmax}° ${a.hitte.dag})` : '';
        return { effect: 'belangrijk', icoon: '🌵', tekst: `Droog: ${Math.abs(rond(a.balans))} mm tekort afgelopen week, geen regen op komst${heet}` };
      }
      if (isGenoegRegen(a)) {
        const reden = a.regen7 >= DREMPEL.genoegRegenWeek && a.balans >= 0
          ? `${rond(a.regen7)} mm regen afgelopen week`
          : `${rond(a.regenKomend)} mm regen verwacht`;
        return { effect: 'nietNodig', icoon: '☔', tekst: `Niet nodig: ${reden}` };
      }
      return null;

    case 'snoeien':
      if (a.vorst) return { effect: 'wachten', icoon: '❄️', tekst: `Vorst verwacht ${vorstDag}: wacht met snoeien tot het weer vorstvrij is` };
      if (a.regenVandaag >= DREMPEL.natVandaag) return { effect: 'wachten', icoon: '☔', tekst: `Het is nat vandaag; snoei liever op een droge dag${drogeDag}` };
      return null;

    case 'maaien':
      if (a.koudste.tmin <= 0 && ['vandaag', 'morgen'].includes(a.koudste.dag)) {
        return { effect: 'wachten', icoon: '❄️', tekst: 'Vorst/rijp: niet maaien en niet over het gras lopen' };
      }
      if (a.regenVandaag >= DREMPEL.natVandaag || a.regenGisteren >= DREMPEL.natGisteren) {
        return { effect: 'wachten', icoon: '☔', tekst: `Het gras is nat; maai liever als het droog is${drogeDag}` };
      }
      return null;

    case 'bemesten':
      if (a.vorst) return { effect: 'wachten', icoon: '❄️', tekst: `Vorst verwacht ${vorstDag}: wacht met bemesten` };
      if (isDroogte(a) || a.hitte) return { effect: 'wachten', icoon: '🌵', tekst: 'Niet bemesten bij droogte of hitte; wacht op een regenachtige periode' };
      if (a.regenKomend >= DREMPEL.zwareRegen) return { effect: 'wachten', icoon: '🌧️', tekst: `Zware regen verwacht (${rond(a.regenKomend)} mm): mest spoelt weg, wacht een paar dagen` };
      return null;

    case 'zaaien':
      if (a.vorst) return { effect: 'wachten', icoon: '❄️', tekst: `Vorst verwacht ${vorstDag}: niet planten, scheuren of zaaien` };
      if (isDroogte(a)) return { effect: 'wachten', icoon: '🌵', tekst: 'Droog: alleen doen als je daarna goed water kunt geven' };
      return null;

    case 'vorst': {
      const grens = taak.vorstGrens ?? 0;
      if (a.koudste.tmin <= grens) {
        return { effect: 'belangrijk', icoon: '❄️', tekst: `Vorst verwacht ${a.koudste.dag} (${graden(a.koudste.tmin)}): nu beschermen` };
      }
      return null;
    }

    case 'storm':
      if (a.storm) return { effect: 'belangrijk', icoon: '🌬️', tekst: `Storm verwacht ${a.storm.dag} (windstoten ${a.storm.wind} km/u): nu controleren` };
      return null;

    default:
      return null;
  }
}

// ------------------------------------------------------------------ testscenario's (?weer=...)

/** Kunstmatige weerdata rond `nu`, om de app te testen: vorst, droog, nat, storm of normaal. */
export function scenario(naam, nu = new Date()) {
  const dagen = [];
  for (let k = -7; k < 7; k += 1) {
    const d = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() + k, 12);
    dagen.push(iso(d));
  }
  const n = dagen.length;
  const reeks = (waarde) => Array.from({ length: n }, (_, k) => (typeof waarde === 'function' ? waarde(k - 7) : waarde));
  const basis = {
    time: dagen,
    precipitation_sum: reeks(1),
    temperature_2m_min: reeks(6),
    temperature_2m_max: reeks(14),
    et0_fao_evapotranspiration: reeks(1),
    wind_gusts_10m_max: reeks(35),
  };
  switch (naam) {
    case 'vorst':
      basis.temperature_2m_min = reeks((k) => (k === 2 ? -4 : k === 1 ? -1 : 3));
      basis.temperature_2m_max = reeks(5);
      break;
    case 'droog':
      basis.precipitation_sum = reeks(0);
      basis.et0_fao_evapotranspiration = reeks(4);
      basis.temperature_2m_max = reeks((k) => (k === 1 ? 31 : 26));
      basis.temperature_2m_min = reeks(15);
      break;
    case 'nat':
      basis.precipitation_sum = reeks((k) => (k <= 0 ? 8 : k === 1 ? 6 : 0));
      break;
    case 'storm':
      basis.wind_gusts_10m_max = reeks((k) => (k === 2 ? 95 : 40));
      break;
    default:
  }
  return { lat: 0, lon: 0, opgehaald: Date.now(), daily: basis, scenario: naam };
}
