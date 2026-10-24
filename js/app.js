import {
  MAANDEN, MAANDEN_LETTER, vandaag, isTestdatum, inPeriode, periodeTekst, seizoen,
  isBroedseizoen, indelen, isGedaan,
} from './seizoen.js';
import * as opslag from './opslag.js';
import { laadTuin, alleTaken } from './data.js';
import { verkleinFoto } from './fotos.js';
import * as weer from './weer.js';

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');

const state = {
  tuin: null,
  gedaan: new Map(),
  datum: vandaag(),
  kalenderMaand: null,
  zoek: '',
  filter: 'Alle',
  route: '',
  weer: {},
  weerFout: null,
  plaatsen: [],
};

const DAG_KORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

const GROEP_ICOON = { water: '💧', controle: '🔍', wildescheuten: '✂️', paal: '🪵', blad: '🍂' };
const CATEGORIEEN = ['Heester', 'Boom', 'Haag', 'Roos', 'Vaste plant', 'Siergras', 'Bodembedekker',
  'Klimplant', 'Eenjarige', 'Bol/knol', 'Groente/kruid', 'Gazon', 'Overig'];
const HERHAAL_TEKST = { wekelijks: 'wekelijks', maandelijks: 'maandelijks' };

// ---------------------------------------------------------------- hulpjes

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const datumTekst = (d, opties = { weekday: 'long', day: 'numeric', month: 'long' }) =>
  d.toLocaleDateString('nl-NL', opties);

const kortDatum = (iso) => datumTekst(new Date(iso), { day: 'numeric', month: 'short', year: 'numeric' });

function hostnaam(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function laatsteGedaan(key) {
  const d = state.gedaan.get(key);
  return d && d.length ? d[d.length - 1] : null;
}

function laatstTekst(key) {
  const r = opslag.laatsteKeer(key);
  return r ? `Laatst gedaan: ${kortDatum(r.datum)}${r.door ? ` door ${r.door}` : ''}` : '';
}

const laatstRegel = (key) => (laatstTekst(key) ? `<p class="klein">${esc(laatstTekst(key))}</p>` : '');

function thumb(plant, klasse = '') {
  return plant.thumb
    ? `<img class="${klasse}" src="${esc(plant.thumb)}" alt="">`
    : `<span class="${klasse} geen-foto" aria-hidden="true">🌿</span>`;
}

function toast(tekst, actie) {
  toastEl.innerHTML = `<span>${esc(tekst)}</span>${actie ? `<button data-toast>${esc(actie.label)}</button>` : ''}`;
  toastEl.hidden = false;
  clearTimeout(toast.timer);
  const knop = toastEl.querySelector('[data-toast]');
  if (knop) knop.onclick = () => { toastEl.hidden = true; actie.doe(); };
  toast.timer = setTimeout(() => { toastEl.hidden = true; }, 5000);
}

// ---------------------------------------------------------------- taakkaarten

function chips(t, metPeriode = true) {
  const delen = [];
  if (metPeriode) delen.push(`<span class="chip">${esc(periodeTekst(t))}</span>`);
  if (t.prioriteit === 'moet') delen.push('<span class="chip chip--moet">moet</span>');
  if (t.prioriteit === 'kan') delen.push('<span class="chip chip--kan">kan</span>');
  if (HERHAAL_TEKST[t.herhaal]) delen.push(`<span class="chip">${HERHAAL_TEKST[t.herhaal]}</span>`);
  return `<div class="chips">${delen.join('')}</div>`;
}

function vinkKnop(t, gedaan) {
  return gedaan
    ? `<button class="vink vink--aan" data-actie="ongedaan" data-key="${esc(t.key)}" aria-label="Markeer als niet gedaan" title="Ongedaan maken">✓</button>`
    : `<button class="vink" data-actie="vink" data-key="${esc(t.key)}" aria-label="Markeer als gedaan" title="Gedaan">✓</button>`;
}

function weerLabel(adv) {
  return adv ? `<p class="weerlabel weerlabel--${adv.effect}">${adv.icoon} ${esc(adv.tekst)}</p>` : '';
}

function taakKaart(t, { gedaan = false } = {}) {
  return `
    <article class="taak taak--${t.prioriteit}${gedaan ? ' taak--gedaan' : ''}${t.weer ? ` taak--weer-${t.weer.effect}` : ''}">
      <a class="taak__foto" href="#/plant/${esc(t.plant.id)}">${thumb(t.plant)}</a>
      <div class="taak__body">
        <a class="taak__plant" href="#/plant/${esc(t.plant.id)}">${esc(t.plant.naam)}</a>
        <h3 class="taak__titel">${esc(t.titel)}</h3>
        ${chips(t)}
        ${weerLabel(t.weer)}
        <details class="uitleg" data-open-id="u-${esc(t.key)}">
          <summary>Hoe?</summary>
          <p>${esc(t.uitleg)}</p>
          ${laatstRegel(t.key)}
        </details>
      </div>
      ${vinkKnop(t, gedaan)}
    </article>`;
}

function groepKaart(groep, taken) {
  const titel = state.tuin.groepen[groep] || groep;
  const prio = taken.some((t) => t.prioriteit === 'moet') ? 'moet' : 'kan';
  const namen = taken.map((t) => t.plant.naam).join(', ');
  const adv = taken.find((t) => t.weer)?.weer;
  return `
    <article class="taak taak--${prio} groep${adv ? ` taak--weer-${adv.effect}` : ''}">
      <div class="taak__foto groep__icoon" aria-hidden="true">${GROEP_ICOON[groep] || '🌿'}</div>
      <div class="taak__body">
        <h3 class="taak__titel">${esc(titel)}</h3>
        <p class="taak__plant">${taken.length} planten: ${esc(namen)}</p>
        ${weerLabel(adv)}
        <details class="uitleg" data-open-id="g-${esc(groep)}">
          <summary>Per plant</summary>
          <ul class="groep__lijst">
            ${taken.map((t) => `
              <li>
                <a href="#/plant/${esc(t.plant.id)}">${thumb(t.plant, 'mini')}</a>
                <div><strong>${esc(t.plant.naam)}</strong> · <span class="klein">${esc(periodeTekst(t))}</span><p>${esc(t.uitleg)}</p></div>
                ${vinkKnop(t, false)}
              </li>`).join('')}
          </ul>
        </details>
      </div>
      <button class="vink" data-actie="vink-groep" data-keys="${esc(taken.map((t) => t.key).join(' '))}" aria-label="Alles in deze groep gedaan" title="Alles gedaan">✓</button>
    </article>`;
}

/** Kaarten voor een lijst taken; taken met dezelfde groep worden samengevoegd. */
function kaarten(taken) {
  const perGroep = new Map();
  for (const t of taken) if (t.groep) {
    if (!perGroep.has(t.groep)) perGroep.set(t.groep, []);
    perGroep.get(t.groep).push(t);
  }
  const html = [];
  const gehad = new Set();
  for (const t of taken) {
    const groep = t.groep && perGroep.get(t.groep).length > 1 ? t.groep : null;
    if (groep) {
      if (!gehad.has(groep)) { gehad.add(groep); html.push(groepKaart(groep, perGroep.get(groep))); }
    } else {
      html.push(taakKaart(t));
    }
  }
  return html.join('');
}

function sectie(titel, taken, uitleg = '') {
  if (!taken.length) return '';
  return `
    <section class="sectie">
      <h2>${esc(titel)} <span class="teller">${taken.length}</span></h2>
      ${uitleg ? `<p class="sectie__uitleg">${esc(uitleg)}</p>` : ''}
      <div class="kaarten">${kaarten(taken)}</div>
    </section>`;
}

function letOpLijst(taken, { open = false } = {}) {
  if (!taken.length) return '';
  // Zelfde advies bij meerdere planten (bijv. 'Pluimen laten staan') samenvoegen.
  const perTitel = new Map();
  for (const t of taken) {
    if (!perTitel.has(t.titel)) perTitel.set(t.titel, []);
    perTitel.get(t.titel).push(t);
  }
  const regels = [...perTitel.entries()];
  return `
    <section class="sectie">
      <details class="letop-blok" data-open-id="letop"${open ? ' open' : ''}>
        <summary><h2>Let op: liever niet <span class="teller">${regels.length}</span></h2>
          <p class="sectie__uitleg">${esc(regels.map(([titel]) => titel.toLowerCase()).slice(0, 4).join(' · '))}${regels.length > 4 ? ' …' : ''}</p>
        </summary>
        <ul class="letop">
          ${regels.map(([titel, lijst]) => `
            <li>
              <details data-open-id="l-${esc(titel)}">
                <summary><strong>${esc(titel)}</strong> <span class="klein">· ${esc(lijst.map((t) => t.plant.naam).join(', '))}</span></summary>
                ${lijst.map((t) => `<p>${lijst.length > 1 ? `<strong>${esc(t.plant.naam)}:</strong> ` : ''}${esc(t.uitleg)} <a href="#/plant/${esc(t.plant.id)}">Naar plant →</a></p>`).join('')}
              </details>
            </li>`).join('')}
        </ul>
      </details>
    </section>`;
}

// ---------------------------------------------------------------- weer

/** Bepaalt welke weerdata (en analyse) de app nu gebruikt. */
function bepaalWeer() {
  const testWeer = new URLSearchParams(location.search).get('weer');
  if (testWeer) {
    const data = weer.scenario(testWeer, state.datum);
    return { data, analyse: weer.analyseer(data.daily, state.datum), scenario: testWeer };
  }
  if (!opslag.instelling('weerAan', true)) return { uit: true };
  const locatie = opslag.instelling('locatie', null);
  if (!locatie) return { geenLocatie: true };
  if (isTestdatum()) return { locatie, testdatum: true };
  const data = weer.bewaardWeer(locatie);
  if (!data || weer.isTeOud(data)) return { locatie, laden: true };
  const analyse = weer.analyseer(data.daily, new Date());
  return analyse ? { locatie, data, analyse } : { locatie, laden: true };
}

let weerBezig = false;
async function verversWeer({ forceer = false } = {}) {
  const locatie = opslag.instelling('locatie', null);
  if (!locatie || !opslag.instelling('weerAan', true) || weerBezig) return;
  weerBezig = true;
  try {
    const nieuw = await weer.ververs(locatie, { forceer });
    state.weerFout = null;
    if (nieuw) bijWijziging();
  } catch (fout) {
    state.weerFout = fout.message;
  } finally {
    weerBezig = false;
  }
}

function dagIcoon(d) {
  if (d.tmin <= 0) return '❄️';
  if (d.wind >= weer.DREMPEL.storm) return '🌬️';
  if (d.regen >= 5) return '🌧️';
  if (d.regen >= 1) return '🌦️';
  return d.tmax >= 18 ? '☀️' : '⛅';
}

function weerKaart() {
  const w = state.weer;
  if (w.uit) return '';
  if (w.geenLocatie) {
    return '<a class="weerkaart weerkaart--leeg" href="#/meer">🌦️ Stel de locatie van je tuin in voor weeradvies →</a>';
  }
  if (w.testdatum) {
    return '<p class="weerkaart weerkaart--leeg">🌦️ Weeradvies staat uit bij een testdatum.</p>';
  }
  if (w.laden || !w.analyse) {
    return `<p class="weerkaart weerkaart--leeg">🌦️ ${state.weerFout ? `Weer niet beschikbaar (${esc(state.weerFout)}).` : 'Weer wordt opgehaald…'}</p>`;
  }
  const a = w.analyse;
  const punten = [];
  if (weer.isDroogte(a)) punten.push(`🌵 Droog: ${Math.abs(Math.round(a.balans))} mm tekort afgelopen week`);
  else punten.push(`☔ ${Math.round(a.regen7)} mm regen afgelopen week <span class="klein">(verdamping ${Math.round(a.verdamping7)} mm)</span>`);
  if (a.regenKomend >= 1) punten.push(`🌧️ ${Math.round(a.regenKomend)} mm regen verwacht vandaag en morgen`);
  if (a.vorst) punten.push(`❄️ Vorst verwacht ${a.vorst.dag} (${weer.graden(a.vorst.tmin)})`);
  if (a.storm) punten.push(`🌬️ Storm ${a.storm.dag}: windstoten ${a.storm.wind} km/u`);
  if (a.hitte) punten.push(`🔥 Heet ${a.hitte.dag}: ${a.hitte.tmax}°`);
  const bijgewerkt = w.scenario
    ? `<span class="chip chip--test">testweer: ${esc(w.scenario)}</span>`
    : `${esc(w.locatie?.naam || '')} · ${new Date(w.data.opgehaald).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`;
  return `
    <section class="weerkaart">
      <div class="weerkaart__kop"><strong>Weer</strong><span class="klein">${bijgewerkt}</span></div>
      <ul class="weerkaart__punten">${punten.map((p) => `<li>${p}</li>`).join('')}</ul>
      <div class="weerstrip">
        ${a.week.map((d) => {
          const [j, m, dd] = d.datum.split('-').map(Number);
          const dag = d.dag === 'vandaag' ? 'nu' : DAG_KORT[new Date(j, m - 1, dd).getDay()];
          return `
          <div class="weerdag">
            <span class="weerdag__naam">${dag}</span>
            <span class="weerdag__icoon">${dagIcoon(d)}</span>
            <span class="weerdag__regen">${d.regen >= 0.5 ? `${Math.round(d.regen)} mm` : ''}</span>
            <span class="weerdag__temp">${weer.graden(d.tmax)} <span class="klein">${weer.graden(d.tmin)}</span></span>
          </div>`;
        }).join('')}
      </div>
    </section>`;
}

// ---------------------------------------------------------------- schermen

function schermNu() {
  const d = state.datum;
  const taken = alleTaken(state.tuin.planten);
  const ind = indelen(taken, state.gedaan, d);
  const moetEerst = (a, b) => (a.prioriteit === 'moet' ? 0 : 1) - (b.prioriteit === 'moet' ? 0 : 1);
  ind.laatsteKans.sort(moetEerst);
  ind.binnenkort.sort(moetEerst);
  const volgende = MAANDEN[d.getMonth() + 1 > 11 ? 0 : d.getMonth() + 1];

  // Weer: taken naar voren halen ('belangrijk') of laten wachten ('wachten' / 'nietNodig').
  const weerBelangrijk = [];
  const weerWachten = [];
  const analyse = state.weer.analyse;
  if (analyse) {
    const verdeel = (lijst) => lijst.filter((t) => {
      const adv = weer.advies(t, analyse);
      if (!adv) return true;
      t.weer = adv;
      (adv.effect === 'belangrijk' ? weerBelangrijk : weerWachten).push(t);
      return false;
    });
    ind.laatsteKans = verdeel(ind.laatsteKans);
    ind.moet = verdeel(ind.moet);
    ind.kan = verdeel(ind.kan);
    ind.binnenkort = ind.binnenkort.filter((t) => {
      const adv = weer.advies(t, analyse);
      if (adv?.effect !== 'belangrijk') return true;
      t.weer = adv;
      weerBelangrijk.push(t);
      return false;
    });
  }
  const open = weerBelangrijk.length + ind.laatsteKans.length + ind.moet.length + ind.kan.length;

  return `
    <header class="kop">
      <p class="kop__datum">${esc(datumTekst(d))}${isTestdatum() ? ' <span class="chip chip--test">testdatum</span>' : ''}</p>
      <h1>Nu in de tuin</h1>
      <p class="kop__sub">${seizoen(d)} · ${open ? `${open} ${open === 1 ? 'taak' : 'taken'} open` : 'alles gedaan'}</p>
    </header>
    ${weerKaart()}
    ${isBroedseizoen(d) ? `
      <div class="banner">🐦 <div><strong>Broedseizoen (15 maart – 15 juli).</strong> Geen hagen knippen en geen grote snoei. Kijk altijd eerst of er nesten zitten.</div></div>` : ''}
    ${sectie('Nu belangrijk door het weer', weerBelangrijk)}
    ${sectie('Laatste kans deze maand', ind.laatsteKans, `Deze taken lopen eind ${MAANDEN[d.getMonth()]} af.`)}
    ${sectie('Moet nu', ind.moet)}
    ${sectie('Kan nu', ind.kan)}
    ${!open ? '<p class="leeg">Niets openstaands voor nu. Geniet van de tuin! 🌱</p>' : ''}
    ${weerWachten.length ? `
      <section class="sectie">
        <details class="gedaan" data-open-id="weer-wachten">
          <summary><h2>Even wachten vanwege het weer <span class="teller">${weerWachten.length}</span></h2>
            <p class="sectie__uitleg">${esc([...new Set(weerWachten.map((t) => t.weer.icoon))].join(' '))} Deze taken kunnen beter wachten of zijn nu niet nodig.</p></summary>
          <div class="kaarten">${kaarten(weerWachten)}</div>
        </details>
      </section>` : ''}
    ${letOpLijst(ind.letOp)}
    ${sectie(`Binnenkort (${volgende})`, ind.binnenkort)}
    ${ind.gedaan.length ? `
      <section class="sectie">
        <details class="gedaan" data-open-id="gedaan">
          <summary><h2>Gedaan <span class="teller">${ind.gedaan.length}</span></h2></summary>
          <div class="kaarten">${ind.gedaan.map((t) => taakKaart(t, { gedaan: true })).join('')}</div>
        </details>
      </section>` : ''}`;
}

function schermPlanten() {
  const cats = ['Alle', ...new Set(state.tuin.planten.map((p) => p.categorie).filter(Boolean))];
  const zoek = state.zoek.trim().toLowerCase();
  const lijst = state.tuin.planten.filter((p) =>
    (state.filter === 'Alle' || p.categorie === state.filter) &&
    (!zoek || `${p.naam} ${p.latijn}`.toLowerCase().includes(zoek)));
  return `
    <header class="kop kop--rij">
      <h1>Planten</h1>
      <a class="knop" href="#/nieuw">+ Plant toevoegen</a>
    </header>
    <input class="zoek" type="search" placeholder="Zoek op naam…" value="${esc(state.zoek)}" data-invoer="zoek" aria-label="Zoek plant">
    <div class="filters" role="tablist">
      ${cats.map((c) => `<button class="filter${c === state.filter ? ' filter--aan' : ''}" data-actie="filter" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
    </div>
    <div class="raster">
      ${lijst.map((p) => `
        <a class="plantkaart" href="#/plant/${esc(p.id)}">
          ${thumb(p, 'plantkaart__foto')}
          <span class="plantkaart__naam">${esc(p.naam)}</span>
          <span class="plantkaart__latijn">${esc(p.latijn)}</span>
          ${p.zekerheid === 'te controleren' ? '<span class="badge">te controleren</span>' : ''}
          ${p.eigen ? '<span class="badge badge--eigen">eigen</span>' : ''}
        </a>`).join('') || '<p class="leeg">Geen planten gevonden.</p>'}
    </div>`;
}

function jaarstrip(plant) {
  const huidig = state.datum.getMonth() + 1;
  const cellen = (aan, klasse) => MAANDEN_LETTER.map((_, i) =>
    `<span class="cel${aan(i + 1) ? ` aan ${klasse}` : ''}${i + 1 === huidig ? ' nu' : ''}"></span>`).join('');
  const rijen = [];
  if (plant.bloeiMaanden && plant.bloeiMaanden.length) {
    rijen.push(`<div class="jaar__rij"><div class="jaar__label">🌸 Bloei</div><div class="jaar__cellen">${cellen((m) => plant.bloeiMaanden.includes(m), 'bloei')}</div></div>`);
  }
  const taken = [...(plant.taken || [])].sort((a, b) => a.van - b.van);
  for (const t of taken) {
    rijen.push(`<div class="jaar__rij"><div class="jaar__label">${esc(t.titel)}</div><div class="jaar__cellen">${cellen((m) => inPeriode(t, m), t.prioriteit)}</div></div>`);
  }
  return `
    <div class="jaar">
      <div class="jaar__rij jaar__rij--kop"><div class="jaar__label"></div><div class="jaar__cellen">${MAANDEN_LETTER.map((l, i) => `<span class="${i + 1 === huidig ? 'nu' : ''}">${l}</span>`).join('')}</div></div>
      ${rijen.join('')}
      <p class="legenda"><span class="cel aan moet"></span> moet <span class="cel aan kan"></span> kan <span class="cel aan niet"></span> liever niet</p>
    </div>`;
}

async function schermPlant(id) {
  const plant = state.tuin.alle.find((p) => p.id === id);
  if (!plant) return '<p class="leeg">Plant niet gevonden. <a href="#/planten">Terug naar planten</a></p>';
  const notities = opslag.notities(id);
  const m = state.datum.getMonth() + 1;
  const taken = (plant.taken || []).map((t) => ({ ...t, key: `${plant.id}/${t.id}`, plant }));
  const nu = taken.filter((t) => t.prioriteit !== 'niet' && inPeriode(t, m));
  for (const t of nu) t.weer = weer.advies(t, state.weer.analyse);
  const letOp = taken.filter((t) => t.prioriteit === 'niet' && inPeriode(t, m));
  const verborgen = state.tuin.verborgen.has(plant.id);

  const fotos = [
    ...(plant.foto && !plant.eigen ? [{ url: plant.foto }] : []),
    ...plant.eigenFotos,
  ];
  const info = [
    ['Standplaats', plant.standplaats], ['Bodem', plant.bodem], ['Hoogte', plant.hoogte],
    ['Bloei', plant.bloei], ['Winterhardheid', plant.winterhard], ['Water & voeding', plant.waterVoeding],
    ['Ziekten & plagen', plant.ziekten], ['Insecten & vogels', plant.insecten], ['Goed om te weten', plant.opmerkingen],
  ].filter(([, w]) => w);

  return `
    <a class="terug" href="#/planten">← Planten</a>
    <div class="galerij">
      ${fotos.length ? fotos.map((f) => `
        <figure>
          <img src="${esc(f.url)}" alt="${esc(plant.naam)}">
          ${f.id ? `<button class="foto-weg" data-actie="foto-weg" data-id="${esc(f.id)}" aria-label="Foto verwijderen">✕</button>` : ''}
          ${f.datum ? `<figcaption>${kortDatum(f.datum)}${f.door ? ` · ${esc(f.door)}` : ''}</figcaption>` : ''}
        </figure>`).join('') : '<div class="galerij__leeg">🌿 Nog geen foto</div>'}
    </div>
    <label class="knop knop--licht foto-knop">📷 Foto toevoegen
      <input type="file" accept="image/*" data-invoer="foto" data-plant="${esc(plant.id)}" hidden>
    </label>

    <header class="kop">
      <h1>${esc(plant.naam)}</h1>
      <p class="kop__sub"><em>${esc(plant.latijn)}</em>${plant.categorie ? ` · ${esc(plant.categorie)}` : ''}</p>
      ${plant.zekerheid && plant.zekerheid !== 'zeker' ? `<p><span class="badge">${esc(plant.zekerheid)}</span></p>` : ''}
    </header>
    ${plant.beschrijving ? `<p class="beschrijving">${esc(plant.beschrijving)}</p>` : ''}
    ${plant.zorgVan ? `<p class="klein">Verzorging: zelfde als <em>${esc(plant.zorgVan)}</em>.</p>` : ''}

    ${nu.length || letOp.length ? `
      <section class="sectie">
        <h2>Nu (${MAANDEN[m - 1]})</h2>
        <div class="kaarten">${nu.map((t) => taakKaart(t, { gedaan: isGedaan(t, laatsteGedaan(t.key), state.datum) })).join('')}</div>
        ${letOp.map((t) => `<p class="letop-los">⚠️ <strong>${esc(t.titel)}.</strong> ${esc(t.uitleg)}</p>`).join('')}
      </section>` : ''}

    ${taken.length || (plant.bloeiMaanden || []).length ? `
      <section class="sectie">
        <h2>Jaarkalender</h2>
        ${jaarstrip(plant)}
      </section>` : ''}

    ${taken.length ? `
      <section class="sectie">
        <h2>Alle taken</h2>
        <ul class="takenlijst">
          ${[...taken].sort((a, b) => a.van - b.van).map((t) => `
            <li class="takenlijst__item takenlijst__item--${t.prioriteit}">
              <details data-open-id="t-${esc(t.key)}">
                <summary><span class="takenlijst__periode">${esc(periodeTekst(t))}</span> ${esc(t.titel)}</summary>
                ${chips(t, false)}
                <p>${esc(t.uitleg)}</p>
                ${laatstRegel(t.key)}
              </details>
            </li>`).join('')}
        </ul>
      </section>` : ''}

    ${info.length ? `
      <section class="sectie">
        <h2>Over deze plant</h2>
        <dl class="info">${info.map(([k, w]) => `<dt>${esc(k)}</dt><dd>${esc(w)}</dd>`).join('')}</dl>
      </section>` : ''}

    <section class="sectie">
      <h2>Mijn notities</h2>
      <form class="notitie-form" data-form="notitie" data-plant="${esc(plant.id)}">
        <textarea name="tekst" rows="2" placeholder="Bijv. 'gesnoeid tot 30 cm, veel nieuwe scheuten'" required></textarea>
        <button class="knop" type="submit">Opslaan</button>
      </form>
      <ul class="notities">
        ${notities.map((n) => `
          <li><div><span class="klein">${kortDatum(n.datum)}${n.door ? ` · ${esc(n.door)}` : ''}</span><p>${esc(n.tekst)}</p></div>
          <button class="tekstknop" data-actie="notitie-weg" data-id="${esc(n.id)}" aria-label="Notitie verwijderen">✕</button></li>`).join('')}
      </ul>
    </section>

    ${(plant.bronnen || []).length ? `
      <section class="sectie">
        <h2>Bronnen</h2>
        <ul class="bronnen">${plant.bronnen.map((b) => `<li><a href="${esc(b)}" target="_blank" rel="noopener">${esc(hostnaam(b))}</a></li>`).join('')}</ul>
      </section>` : ''}

    <section class="sectie acties">
      ${plant.eigen ? `
        <a class="knop knop--licht" href="#/bewerk/${esc(plant.id)}">Bewerken</a>
        <button class="knop knop--gevaar" data-actie="plant-weg" data-id="${esc(plant.id)}">Plant verwijderen</button>` : verborgen ? `
        <button class="knop knop--licht" data-actie="toon" data-id="${esc(plant.id)}">Weer tonen in mijn tuin</button>` : `
        <button class="knop knop--licht" data-actie="verberg" data-id="${esc(plant.id)}">Verbergen (staat niet meer in mijn tuin)</button>`}
    </section>`;
}

function schermKalender() {
  const m = state.kalenderMaand || state.datum.getMonth() + 1;
  const taken = alleTaken(state.tuin.planten).filter((t) => inPeriode(t, m));
  const letOp = taken.filter((t) => t.prioriteit === 'niet');
  const perPlant = new Map();
  for (const t of taken) if (t.prioriteit !== 'niet') {
    if (!perPlant.has(t.plant.id)) perPlant.set(t.plant.id, { plant: t.plant, taken: [] });
    perPlant.get(t.plant.id).taken.push(t);
  }
  return `
    <header class="kop"><h1>Kalender</h1><p class="kop__sub">Wat staat er per maand op het programma?</p></header>
    <div class="maanden" role="tablist">
      ${MAANDEN.map((naam, i) => `<button class="filter${i + 1 === m ? ' filter--aan' : ''}" data-actie="maand" data-maand="${i + 1}">${naam.slice(0, 3)}</button>`).join('')}
    </div>
    <h2 class="maandtitel">${MAANDEN[m - 1]}</h2>
    ${letOpLijst(letOp)}
    <div class="kalender">
      ${[...perPlant.values()].map(({ plant, taken: lijst }) => `
        <article class="kalplant">
          <a href="#/plant/${esc(plant.id)}" class="kalplant__kop">${thumb(plant, 'mini')}<strong>${esc(plant.naam)}</strong></a>
          <ul>
            ${lijst.map((t) => `
              <li class="kalplant__taak kalplant__taak--${t.prioriteit}">
                <details data-open-id="k-${esc(t.key)}">
                  <summary>${esc(t.titel)} <span class="klein">${esc(periodeTekst(t))}</span></summary>
                  <p>${esc(t.uitleg)}</p>
                </details>
              </li>`).join('')}
          </ul>
        </article>`).join('') || '<p class="leeg">Geen taken in deze maand.</p>'}
    </div>`;
}

function taakRij(t = {}) {
  const maandOpties = (sel) => MAANDEN.map((n, i) => `<option value="${i + 1}"${i + 1 === sel ? ' selected' : ''}>${n}</option>`).join('');
  return `
    <fieldset class="taakrij" data-id="${esc(t.id || '')}">
      <input name="titel" placeholder="Taak, bijv. Snoeien" value="${esc(t.titel || '')}" required>
      <div class="taakrij__rij">
        <label>Van <select name="van">${maandOpties(t.van || 3)}</select></label>
        <label>t/m <select name="tot">${maandOpties(t.tot || t.van || 3)}</select></label>
      </div>
      <div class="taakrij__rij">
        <label>Soort <select name="prioriteit">
          <option value="moet"${t.prioriteit === 'moet' ? ' selected' : ''}>moet</option>
          <option value="kan"${!t.prioriteit || t.prioriteit === 'kan' ? ' selected' : ''}>kan</option>
          <option value="niet"${t.prioriteit === 'niet' ? ' selected' : ''}>liever niet</option>
        </select></label>
        <label>Herhaal <select name="herhaal">
          <option value="">1× per periode</option>
          <option value="maandelijks"${t.herhaal === 'maandelijks' ? ' selected' : ''}>maandelijks</option>
          <option value="wekelijks"${t.herhaal === 'wekelijks' ? ' selected' : ''}>wekelijks</option>
        </select></label>
      </div>
      <label>Soort (voor weeradvies) <select name="soort">
        ${[['', 'geen'], ['snoeien', 'snoeien / knippen'], ['water', 'water geven'], ['maaien', 'maaien'],
          ['bemesten', 'bemesten'], ['zaaien', 'zaaien / planten / scheuren'], ['vorst', 'beschermen tegen vorst'],
          ['storm', 'vastzetten / steunen (storm)']]
          .map(([w, l]) => `<option value="${w}"${(t.soort || '') === w ? ' selected' : ''}>${l}</option>`).join('')}
      </select></label>
      <textarea name="uitleg" rows="2" placeholder="Hoe doe je het?">${esc(t.uitleg || '')}</textarea>
      <button type="button" class="tekstknop" data-actie="taak-weg">Taak verwijderen</button>
    </fieldset>`;
}

function schermFormulier(id) {
  const plant = id ? state.tuin.alle.find((p) => p.id === id && p.eigen) : null;
  if (id && !plant) return '<p class="leeg">Alleen eigen planten kun je bewerken.</p>';
  const p = plant || { taken: [] };
  const veld = (naam, label, rijen = 0, placeholder = '') => rijen
    ? `<label>${label}<textarea name="${naam}" rows="${rijen}" placeholder="${esc(placeholder)}">${esc(p[naam] || '')}</textarea></label>`
    : `<label>${label}<input name="${naam}" value="${esc(p[naam] || '')}" placeholder="${esc(placeholder)}"></label>`;
  return `
    <a class="terug" href="${plant ? `#/plant/${esc(plant.id)}` : '#/planten'}">← Terug</a>
    <header class="kop"><h1>${plant ? 'Plant bewerken' : 'Plant toevoegen'}</h1></header>
    <form class="formulier" data-form="plant" data-id="${esc(plant?.id || '')}">
      <label>Naam *<input name="naam" required value="${esc(p.naam || '')}" placeholder="Bijv. Vlinderstruik"></label>
      ${veld('latijn', 'Latijnse naam', 0, 'Bijv. Buddleja davidii')}
      <label>Soort plant<select name="categorie">${CATEGORIEEN.map((c) => `<option${c === (p.categorie || 'Heester') ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
      ${plant ? '' : `<label>Foto<input type="file" name="foto" accept="image/*"></label>`}
      ${veld('beschrijving', 'Beschrijving', 3)}
      ${veld('standplaats', 'Standplaats', 0, 'zon / halfschaduw / schaduw')}
      ${veld('bloei', 'Bloei', 0, 'Bijv. juli–september')}
      ${veld('opmerkingen', 'Goed om te weten', 3)}
      <h2>Taken</h2>
      <div class="taakrijen">${(p.taken.length ? p.taken : [{}]).map(taakRij).join('')}</div>
      <button type="button" class="knop knop--licht" data-actie="taak-erbij">+ Taak</button>
      <button type="submit" class="knop knop--groot">Opslaan</button>
    </form>`;
}

async function schermMeer() {
  let schatting = '';
  try {
    if (navigator.storage?.estimate) {
      const { usage } = await navigator.storage.estimate();
      schatting = `Gebruikte opslag op dit apparaat: ${(usage / 1024 / 1024).toFixed(1)} MB.`;
    }
  } catch { /* geen schatting */ }
  const verborgen = state.tuin.alle.filter((p) => state.tuin.verborgen.has(p.id));
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `
    <header class="kop"><h1>Meer</h1></header>

    ${opslag.status.modus === 'online' ? `
      <section class="sectie kaartje">
        <h2>Gedeelde tuin</h2>
        <p>Ingelogd als <strong>${esc(opslag.status.gebruiker?.email || '')}</strong>. Afgevinkte taken, notities, eigen planten en foto's worden online bewaard en zijn direct zichtbaar voor iedereen die toegang heeft. Zonder internet werkt de app gewoon door; wijzigingen worden gesynchroniseerd zodra er weer verbinding is.</p>
        <div class="acties"><button class="knop knop--licht" data-actie="uitloggen">Uitloggen</button></div>
      </section>` : `
      <section class="sectie kaartje">
        <h2>Opslag</h2>
        <p>Afgevinkte taken, notities, eigen planten en foto's staan alleen op dit apparaat.</p>
      </section>`}

    <section class="sectie kaartje" id="weer">
      <h2>Weer</h2>
      <p>De app kijkt naar regen, verdamping, vorst, hitte en storm (afgelopen week en komende dagen) en past daar de taken op aan: water geven als het droog is, wachten met snoeien als er vorst komt, palen controleren voor een storm.</p>
      <p>Locatie van de tuin: <strong>${esc(opslag.instelling('locatie', null)?.naam || 'nog niet ingesteld')}</strong></p>
      <div class="acties">
        <button class="knop knop--licht" data-actie="locatie-gps">📍 Gebruik mijn locatie</button>
      </div>
      <form class="acties plaatszoeker" data-form="plaats">
        <input name="plaats" placeholder="Of zoek een plaats, bijv. Wageningen" required>
        <button class="knop knop--licht" type="submit">Zoek</button>
      </form>
      ${state.plaatsen.length ? `<ul class="plaatsen">${state.plaatsen.map((p, i) => `
        <li><button class="tekstknop" data-actie="kies-plaats" data-i="${i}">📍 ${esc(p.naam)}</button></li>`).join('')}</ul>` : ''}
      <label class="schakelaar"><input type="checkbox" data-invoer="weer-aan"${opslag.instelling('weerAan', true) ? ' checked' : ''}> Weeradvies gebruiken</label>
      <p class="klein">Weerdata: <a href="https://open-meteo.com/" target="_blank" rel="noopener">${esc(weer.BRON)}</a>.${state.weer.data && !state.weer.scenario ? ` Laatst opgehaald om ${new Date(state.weer.data.opgehaald).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}.` : ''} Testen kan met <code>?weer=vorst</code>, <code>droog</code>, <code>nat</code> of <code>storm</code> achter het adres.</p>
    </section>

    <section class="sectie kaartje">
      <h2>Back-up</h2>
      <p>Met een export bewaar je alle gegevens als bestand. Met importeren zet je een back-up terug.</p>
      <div class="acties">
        <button class="knop" data-actie="export">Exporteren</button>
        <label class="knop knop--licht">Importeren<input type="file" accept="application/json,.json" data-invoer="import" hidden></label>
      </div>
      <p class="klein">Importeren vervangt alle huidige gegevens${opslag.status.modus === 'online' ? ', ook voor de anderen' : ''}. ${esc(schatting)}</p>
    </section>

    ${verborgen.length ? `
      <section class="sectie kaartje">
        <h2>Verborgen planten</h2>
        <ul class="bronnen">${verborgen.map((p) => `<li>${esc(p.naam)} <button class="tekstknop" data-actie="toon" data-id="${esc(p.id)}">Weer tonen</button></li>`).join('')}</ul>
      </section>` : ''}

    <section class="sectie kaartje">
      <h2>Andere datum bekijken</h2>
      <p>Bekijk hoe het Nu-scherm eruitziet op een andere dag, bijvoorbeeld om vooruit te plannen.</p>
      <form class="acties" data-form="datum">
        <input type="date" name="datum" value="${iso(state.datum)}" required>
        <button class="knop" type="submit">Bekijk</button>
        ${isTestdatum() ? '<button class="knop knop--licht" type="button" data-actie="datum-reset">Terug naar vandaag</button>' : ''}
      </form>
    </section>

    <section class="sectie kaartje">
      <h2>Op je telefoon installeren</h2>
      <p>Open deze pagina in Chrome op je telefoon, tik op het menu (⋮) en kies <strong>Toevoegen aan startscherm</strong> of <strong>App installeren</strong>. Op een iPhone: open de pagina in Safari, tik op Delen en kies <strong>Zet op beginscherm</strong>. Daarna werkt de app ook zonder internet.</p>
    </section>

    <section class="sectie kaartje">
      <h2>Over deze app</h2>
      <p>De planten zijn op 24 oktober 2026 herkend aan de hand van foto's. De verzorgingsinformatie komt uit betrouwbare bronnen (o.a. RHS, MAX Vandaag, tuinadvies.be, Hessenhof, Intratuin, Van den Berk, Vogelbescherming) en is afgestemd op het Nederlandse klimaat. Waar bronnen elkaar tegenspreken, staat dat bij de plant onder 'Goed om te weten'.</p>
      <p>Periodes zijn richtlijnen per maand: kijk ook naar het weer (geen snoei bij vorst, geen hagen knippen als er nesten zijn).</p>
    </section>`;
}

function schermInloggen() {
  return `
    <div class="inlog">
      <img src="icons/icon-192.png" alt="" width="96" height="96">
      <h1>Tuinplanner</h1>
      <p>Log in om de gedeelde tuin te openen. Alleen uitgenodigde accounts hebben toegang.</p>
      <button class="knop knop--groot" data-actie="inloggen">Inloggen met Google</button>
      ${state.inlogFout ? `<p class="fout">${esc(state.inlogFout)}</p>` : ''}
    </div>`;
}

function schermGeenToegang() {
  return `
    <div class="inlog">
      <h1>Geen toegang</h1>
      <p>Het account <strong>${esc(opslag.status.gebruiker?.email || '')}</strong> heeft (nog) geen toegang tot deze tuin. Vraag de beheerder om dit e-mailadres toe te voegen, of log in met een ander account.</p>
      <button class="knop knop--groot" data-actie="uitloggen">Uitloggen</button>
    </div>`;
}

// ---------------------------------------------------------------- router

async function render({ scrollNaarBoven = false } = {}) {
  const { status } = opslag;
  const buiten = status.modus === 'online' && (!status.gebruiker || status.fout === 'geenToegang');
  document.body.classList.toggle('zonder-nav', buiten);
  if (buiten) {
    app.innerHTML = status.gebruiker ? schermGeenToegang() : schermInloggen();
    return;
  }
  const open = new Set([...app.querySelectorAll('details[open][data-open-id]')].map((d) => d.dataset.openId));
  const [, naam = 'nu', arg] = (location.hash || '#/nu').split('/');
  let html;
  switch (naam) {
    case 'planten': html = schermPlanten(); break;
    case 'plant': html = await schermPlant(decodeURIComponent(arg || '')); break;
    case 'kalender': html = schermKalender(); break;
    case 'meer': html = await schermMeer(); break;
    case 'nieuw': html = schermFormulier(null); break;
    case 'bewerk': html = schermFormulier(decodeURIComponent(arg || '')); break;
    default: html = schermNu();
  }
  app.innerHTML = html;
  for (const d of app.querySelectorAll('details[data-open-id]')) if (open.has(d.dataset.openId)) d.open = true;
  const maand = app.querySelector('.maanden .filter--aan');
  if (maand) maand.parentElement.scrollLeft = maand.offsetLeft - maand.parentElement.clientWidth / 2 + maand.clientWidth / 2;
  const tab = { plant: 'planten', nieuw: 'planten', bewerk: 'planten' }[naam] || naam;
  for (const a of document.querySelectorAll('.nav a')) a.classList.toggle('actief', a.dataset.tab === tab);
  if (scrollNaarBoven) window.scrollTo(0, 0);
}

async function vernieuw() {
  uitgesteld = false;
  state.tuin = await laadTuin();
  state.gedaan = opslag.gedaanMap();
  state.weer = bepaalWeer();
  if (state.weer.laden) verversWeer();
  await render();
}

// Wijzigingen van anderen (of van de opslag) komen hier binnen. Niet verversen terwijl
// iemand aan het typen is of een formulier invult; dan wachten we tot dat klaar is.
let uitgesteld = false;
let wijzigTimer;

function bezigMetInvullen() {
  const naam = (location.hash || '').split('/')[1];
  if (naam === 'nieuw' || naam === 'bewerk') return true;
  const actief = document.activeElement;
  if (actief && app.contains(actief) && actief.matches('input:not([type=checkbox]):not([type=file]), textarea, select')) return true;
  return [...app.querySelectorAll('textarea')].some((t) => t.value.trim());
}

function bijWijziging() {
  clearTimeout(wijzigTimer);
  wijzigTimer = setTimeout(() => {
    if (bezigMetInvullen()) uitgesteld = true;
    else vernieuw();
  }, 80);
}

app.addEventListener('focusout', () => {
  setTimeout(() => { if (uitgesteld && !bezigMetInvullen()) vernieuw(); }, 200);
});

// ---------------------------------------------------------------- acties

async function zetLocatie(locatie) {
  if (!locatie) return;
  await opslag.zetInstelling('locatie', locatie);
  await vernieuw();
  toast(`Locatie: ${locatie.naam}`);
  await verversWeer({ forceer: true });
}

async function vinkAf(keys) {
  for (const k of keys) await opslag.vinkAf(k, state.datum);
  await vernieuw();
  toast(keys.length > 1 ? `${keys.length} taken gedaan` : 'Gedaan ✓', {
    label: 'Ongedaan maken',
    doe: async () => {
      for (const k of keys) await opslag.maakOngedaan(k);
      await vernieuw();
    },
  });
}

app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-actie]');
  if (!el) return;
  const { actie } = el.dataset;
  switch (actie) {
    case 'vink': return vinkAf([el.dataset.key]);
    case 'vink-groep': return vinkAf(el.dataset.keys.split(' '));
    case 'ongedaan':
      await opslag.maakOngedaan(el.dataset.key);
      return vernieuw();
    case 'filter': state.filter = el.dataset.cat; return render();
    case 'maand': state.kalenderMaand = Number(el.dataset.maand); return render();
    case 'notitie-weg':
      if (!confirm('Notitie verwijderen?')) return;
      await opslag.verwijderNotitie(el.dataset.id);
      return vernieuw();
    case 'foto-weg':
      if (!confirm('Deze foto verwijderen?')) return;
      await opslag.verwijderFoto(el.dataset.id);
      return vernieuw();
    case 'verberg': case 'toon': {
      const lijst = new Set(opslag.instelling('verborgen', []));
      if (actie === 'verberg') lijst.add(el.dataset.id); else lijst.delete(el.dataset.id);
      await opslag.zetInstelling('verborgen', [...lijst]);
      await vernieuw();
      return toast(actie === 'verberg' ? 'Plant verborgen; terugzetten kan via Meer.' : 'Plant staat weer in de tuin.');
    }
    case 'plant-weg': {
      if (!confirm('Deze plant met alle foto\'s en notities verwijderen?')) return;
      await opslag.verwijderPlant(el.dataset.id);
      location.hash = '#/planten';
      return vernieuw();
    }
    case 'inloggen':
      state.inlogFout = '';
      try {
        await opslag.inloggen();
      } catch (fout) {
        state.inlogFout = `Inloggen mislukt (${fout.code || fout.message}).`;
        return render();
      }
      return;
    case 'uitloggen':
      await opslag.uitloggen();
      location.hash = '#/nu';
      return;
    case 'locatie-gps':
      if (!navigator.geolocation) return toast('Locatie is niet beschikbaar op dit apparaat');
      toast('Locatie bepalen…');
      navigator.geolocation.getCurrentPosition(async (pos) => {
        // Afgerond op ca. 1 km: genoeg voor het weer, zonder precies adres.
        const rond = (x) => Math.round(x * 100) / 100;
        const lat = rond(pos.coords.latitude);
        const lon = rond(pos.coords.longitude);
        await zetLocatie({ naam: `Mijn locatie (${lat}, ${lon})`, lat, lon });
      }, (fout) => toast(`Locatie niet gevonden (${fout.message})`), { timeout: 15000, maximumAge: 600000 });
      return;
    case 'kies-plaats':
      await zetLocatie(state.plaatsen[Number(el.dataset.i)]);
      state.plaatsen = [];
      return render();
    case 'taak-erbij':
      app.querySelector('.taakrijen').insertAdjacentHTML('beforeend', taakRij());
      return;
    case 'taak-weg':
      el.closest('.taakrij').remove();
      return;
    case 'export': {
      const data = opslag.exporteer();
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `tuinplanner-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return;
    }
    case 'datum-reset': {
      const url = new URL(location.href);
      url.searchParams.delete('datum');
      url.hash = '#/nu';
      location.href = url.toString();
      return;
    }
    default:
  }
});

app.addEventListener('input', (e) => {
  if (e.target.dataset.invoer === 'zoek') {
    state.zoek = e.target.value;
    const pos = e.target.selectionStart;
    render().then(() => {
      const veld = app.querySelector('[data-invoer="zoek"]');
      veld.focus();
      veld.setSelectionRange(pos, pos);
    });
  }
});

app.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset.invoer === 'foto' && el.files[0]) {
    toast('Foto verwerken…');
    const blob = await verkleinFoto(el.files[0]);
    await opslag.bewaarFoto(el.dataset.plant, blob);
    await vernieuw();
    toast('Foto toegevoegd');
  }
  if (el.dataset.invoer === 'weer-aan') {
    await opslag.zetInstelling('weerAan', el.checked);
    await vernieuw();
  }
  if (el.dataset.invoer === 'import' && el.files[0]) {
    try {
      const data = JSON.parse(await el.files[0].text());
      if (!confirm('Alle gegevens op dit apparaat vervangen door dit bestand?')) return;
      await opslag.importeer(data);
      await vernieuw();
      toast('Gegevens geïmporteerd');
    } catch (fout) {
      alert(`Importeren mislukt: ${fout.message}`);
    }
  }
});

app.addEventListener('submit', async (e) => {
  const form = e.target;
  e.preventDefault();
  if (form.dataset.form === 'notitie') {
    const tekst = form.tekst.value.trim();
    if (!tekst) return;
    form.tekst.value = '';
    await opslag.bewaarNotitie(form.dataset.plant, tekst);
    await vernieuw();
    toast('Notitie opgeslagen');
  }
  if (form.dataset.form === 'plaats') {
    try {
      state.plaatsen = await weer.zoekPlaats(form.plaats.value.trim());
      if (!state.plaatsen.length) toast('Geen plaats gevonden');
    } catch (fout) {
      toast(`Zoeken mislukt: ${fout.message}`);
    }
    form.plaats.blur();
    await render();
  }
  if (form.dataset.form === 'datum') {
    const url = new URL(location.href);
    url.searchParams.set('datum', form.datum.value);
    url.hash = '#/nu';
    location.href = url.toString();
  }
  if (form.dataset.form === 'plant') {
    const bestaand = form.dataset.id;
    const id = bestaand || `eigen-${Date.now().toString(36)}`;
    const taken = [...form.querySelectorAll('.taakrij')].map((rij, i) => {
      const v = (n) => rij.querySelector(`[name="${n}"]`).value.trim();
      const taak = {
        id: rij.dataset.id || `t${Date.now().toString(36)}${i}`,
        titel: v('titel'), van: Number(v('van')), tot: Number(v('tot')),
        prioriteit: v('prioriteit'), uitleg: v('uitleg'),
      };
      if (v('herhaal')) taak.herhaal = v('herhaal');
      if (v('soort')) taak.soort = v('soort');
      return taak;
    }).filter((t) => t.titel);
    const plant = {
      id,
      naam: form.naam.value.trim(),
      latijn: form.latijn.value.trim(),
      categorie: form.categorie.value,
      beschrijving: form.beschrijving.value.trim(),
      standplaats: form.standplaats.value.trim(),
      bloei: form.bloei.value.trim(),
      opmerkingen: form.opmerkingen.value.trim(),
      zekerheid: 'zeker',
      taken,
    };
    await opslag.bewaarPlant(plant);
    const foto = form.foto?.files?.[0];
    if (foto) await opslag.bewaarFoto(id, await verkleinFoto(foto));
    location.hash = `#/plant/${id}`;
    await vernieuw();
    toast(bestaand ? 'Plant bijgewerkt' : 'Plant toegevoegd');
  }
});

window.addEventListener('hashchange', async () => {
  if (uitgesteld) await vernieuw();
  await render({ scrollNaarBoven: true });
});

// ---------------------------------------------------------------- start

// Weer opnieuw ophalen als de app weer in beeld komt (max. elke 3 uur).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') verversWeer();
});

(async function start() {
  try {
    await opslag.start(bijWijziging);
    await vernieuw();
    verversWeer();
  } catch (fout) {
    app.innerHTML = `<p class="leeg">Er ging iets mis bij het laden: ${esc(fout.message)}</p>`;
    console.error(fout);
  }
  try { navigator.storage?.persist?.(); } catch { /* niet ondersteund */ }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((f) => console.warn('Service worker niet geregistreerd', f));
  }
}());
