// Maand- en periodelogica. Periodes lopen van maand `van` t/m maand `tot` (1–12)
// en mogen over de jaarwisseling lopen (bijv. van 11 tot 2).

export const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli',
  'augustus', 'september', 'oktober', 'november', 'december'];
export const MAANDEN_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
export const MAANDEN_LETTER = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

const DAG = 24 * 60 * 60 * 1000;

/** De datum waarmee de app rekent: ?datum=JJJJ-MM-DD (om te testen) of vandaag. */
export function vandaag() {
  const param = new URLSearchParams(location.search).get('datum');
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
    const [j, m, d] = param.split('-').map(Number);
    return new Date(j, m - 1, d, 12);
  }
  return new Date();
}

export function isTestdatum() {
  return new URLSearchParams(location.search).has('datum');
}

export function inPeriode(taak, maand) {
  const { van, tot } = taak;
  return van <= tot ? maand >= van && maand <= tot : maand >= van || maand <= tot;
}

export function volgendeMaand(maand) {
  return (maand % 12) + 1;
}

export function periodeTekst(taak) {
  const { van, tot } = taak;
  if (van === tot) return MAANDEN[van - 1];
  if (volgendeMaand(tot) === van) return 'hele jaar';
  return `${MAANDEN_KORT[van - 1]} – ${MAANDEN_KORT[tot - 1]}`;
}

export function seizoen(datum) {
  const m = datum.getMonth() + 1;
  if (m === 12 || m <= 2) return 'winter';
  if (m <= 5) return 'voorjaar';
  if (m <= 8) return 'zomer';
  return 'herfst';
}

/** Broedseizoen volgens de gangbare richtlijn: 15 maart t/m 15 juli. */
export function isBroedseizoen(datum) {
  const m = datum.getMonth() + 1;
  const d = datum.getDate();
  if (m === 3) return d >= 15;
  if (m === 7) return d <= 15;
  return m >= 4 && m <= 6;
}

/** Begin (1e van de maand) van de periode waar `datum` in valt. */
function startHuidigePeriode(taak, datum) {
  const j = datum.getFullYear();
  const m = datum.getMonth() + 1;
  if (taak.van <= taak.tot || m >= taak.van) return new Date(j, taak.van - 1, 1);
  return new Date(j - 1, taak.van - 1, 1);
}

/** Begin van de eerstvolgende periode na `datum`. */
function startVolgendePeriode(taak, datum) {
  const start = new Date(datum.getFullYear(), taak.van - 1, 1);
  return start > datum ? start : new Date(datum.getFullYear() + 1, taak.van - 1, 1);
}

/**
 * Is de taak 'gedaan' voor de huidige (of eerstvolgende) periode?
 * Wekelijkse taken tellen 7 dagen als gedaan, maandelijkse tot het eind van de maand,
 * jaarlijkse voor de hele periode (en tot 45 dagen te vroeg afgevinkt telt ook).
 */
export function isGedaan(taak, laatsteIso, datum) {
  if (!laatsteIso) return false;
  const gedaan = new Date(laatsteIso);
  const verschil = datum - gedaan;
  if (verschil < -DAG) return false; // afgevinkt 'in de toekomst' t.o.v. een testdatum
  const herhaal = taak.herhaal || 'jaarlijks';
  if (herhaal === 'wekelijks') return verschil < 7 * DAG;
  if (herhaal === 'maandelijks') {
    return gedaan.getFullYear() === datum.getFullYear() && gedaan.getMonth() === datum.getMonth();
  }
  const maand = datum.getMonth() + 1;
  const start = inPeriode(taak, maand) ? startHuidigePeriode(taak, datum) : startVolgendePeriode(taak, datum);
  return gedaan >= new Date(start - 45 * DAG);
}

/**
 * Deelt taken in voor het 'Nu'-scherm.
 * @param taken lijst met {…taak, key, plant}
 * @param gedaan Map key -> lijst ISO-datums
 */
export function indelen(taken, gedaan, datum) {
  const m = datum.getMonth() + 1;
  const volgende = volgendeMaand(m);
  const uit = { letOp: [], laatsteKans: [], moet: [], kan: [], binnenkort: [], gedaan: [] };
  for (const t of taken) {
    const datums = gedaan.get(t.key);
    const laatste = datums && datums[datums.length - 1];
    if (t.prioriteit === 'niet') {
      if (inPeriode(t, m)) uit.letOp.push(t);
      continue;
    }
    if (inPeriode(t, m)) {
      if (isGedaan(t, laatste, datum)) uit.gedaan.push(t);
      else if (t.tot === m && t.van !== t.tot && !t.herhaal) uit.laatsteKans.push(t);
      else if (t.prioriteit === 'moet') uit.moet.push(t);
      else uit.kan.push(t);
    } else if (inPeriode(t, volgende) && !isGedaan(t, laatste, datum)) {
      uit.binnenkort.push(t);
    }
  }
  return uit;
}
