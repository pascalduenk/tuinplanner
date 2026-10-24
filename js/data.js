// Combineert de standaardplanten (data/planten.json) met eigen planten en foto's uit de opslag.
import * as opslag from './opslag.js';

const OVERNEMEN = ['categorie', 'standplaats', 'bodem', 'hoogte', 'bloei', 'bloeiMaanden', 'winterhard',
  'waterVoeding', 'ziekten', 'insecten', 'opmerkingen', 'bronnen', 'taken'];

let basisPromise;

function laadBasis() {
  if (!basisPromise) {
    basisPromise = fetch('data/planten.json').then((antwoord) => {
      if (!antwoord.ok) throw new Error('Kon de plantgegevens niet laden.');
      return antwoord.json();
    });
    basisPromise.catch(() => { basisPromise = null; });
  }
  return basisPromise;
}

export async function laadTuin() {
  const basis = await laadBasis();

  const perId = new Map(basis.planten.map((p) => [p.id, p]));
  const standaard = basis.planten.map((p) => {
    const plant = { ...p, eigen: false };
    const bron = p.zelfdeZorgAls && perId.get(p.zelfdeZorgAls);
    if (bron) {
      for (const veld of OVERNEMEN) if (plant[veld] === undefined) plant[veld] = bron[veld];
      plant.zorgVan = bron.naam;
    }
    plant.foto = p.fotos && p.fotos[0] ? `img/planten/${p.fotos[0]}.jpg` : null;
    plant.thumb = p.fotos && p.fotos[0] ? `img/thumbs/${p.fotos[0]}.jpg` : null;
    return plant;
  });

  const fotosPerPlant = new Map();
  for (const f of [...opslag.fotos()].sort((a, b) => a.datum.localeCompare(b.datum))) {
    if (!fotosPerPlant.has(f.plantId)) fotosPerPlant.set(f.plantId, []);
    fotosPerPlant.get(f.plantId).push({ id: f.id, url: f.data, datum: f.datum, door: f.door });
  }

  const eigen = opslag.eigenPlanten().map((p) => {
    const fotos = fotosPerPlant.get(p.id) || [];
    return { ...p, eigen: true, foto: fotos[0]?.url || null, thumb: fotos[0]?.url || null };
  });

  const verborgen = new Set(opslag.instelling('verborgen', []));
  const planten = [...standaard, ...eigen].map((p) => ({ ...p, eigenFotos: fotosPerPlant.get(p.id) || [] }));

  return {
    groepen: basis.groepen || {},
    alle: planten,
    planten: planten.filter((p) => !verborgen.has(p.id)),
    verborgen,
  };
}

/** Alle taken van de zichtbare planten, met een unieke key en een verwijzing naar de plant. */
export function alleTaken(planten) {
  const lijst = [];
  for (const plant of planten) {
    for (const taak of plant.taken || []) {
      lijst.push({ ...taak, key: `${plant.id}/${taak.id}`, plant });
    }
  }
  return lijst;
}
