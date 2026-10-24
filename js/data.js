// Laadt de standaardplanten (data/planten.json) en combineert ze met eigen planten en foto's.
import { alles, instelling } from './opslag.js';

const OVERNEMEN = ['categorie', 'standplaats', 'bodem', 'hoogte', 'bloei', 'bloeiMaanden', 'winterhard',
  'waterVoeding', 'ziekten', 'insecten', 'opmerkingen', 'bronnen', 'taken'];

let objectUrls = [];

export async function laadTuin() {
  const antwoord = await fetch('data/planten.json');
  if (!antwoord.ok) throw new Error('Kon de plantgegevens niet laden.');
  const basis = await antwoord.json();

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

  // Eigen foto's (alle planten) als object-URL's.
  objectUrls.forEach((u) => URL.revokeObjectURL(u));
  objectUrls = [];
  const fotosPerPlant = new Map();
  for (const f of await alles('fotos')) {
    const url = URL.createObjectURL(f.blob);
    objectUrls.push(url);
    if (!fotosPerPlant.has(f.plantId)) fotosPerPlant.set(f.plantId, []);
    fotosPerPlant.get(f.plantId).push({ id: f.id, url, datum: f.datum });
  }

  const eigen = (await alles('planten')).map((p) => {
    const fotos = fotosPerPlant.get(p.id) || [];
    return { ...p, eigen: true, foto: fotos[0]?.url || null, thumb: fotos[0]?.url || null };
  });

  const verborgen = new Set(await instelling('verborgen', []));
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
