// Controleert data/planten.json.  Gebruik:  node tools/controleer_data.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(root, 'data', 'planten.json'), 'utf8'));
const fouten = [];
const ids = new Set();

for (const p of data.planten) {
  const waar = `plant '${p.id}'`;
  if (!p.id || !p.naam) fouten.push(`${waar}: id en naam zijn verplicht`);
  if (ids.has(p.id)) fouten.push(`${waar}: id komt dubbel voor`);
  ids.add(p.id);
  for (const f of p.fotos || []) {
    for (const map of ['planten', 'thumbs']) {
      if (!existsSync(join(root, 'img', map, `${f}.jpg`))) fouten.push(`${waar}: foto img/${map}/${f}.jpg ontbreekt`);
    }
  }
  if (p.zelfdeZorgAls) continue;
  if (!Array.isArray(p.taken) || !p.taken.length) fouten.push(`${waar}: geen taken`);
  const taakIds = new Set();
  for (const t of p.taken || []) {
    const tw = `${waar}, taak '${t.id}'`;
    if (taakIds.has(t.id)) fouten.push(`${tw}: id dubbel`);
    taakIds.add(t.id);
    if (!t.titel || !t.uitleg) fouten.push(`${tw}: titel en uitleg zijn verplicht`);
    for (const k of ['van', 'tot']) {
      if (!Number.isInteger(t[k]) || t[k] < 1 || t[k] > 12) fouten.push(`${tw}: ${k} moet 1–12 zijn`);
    }
    if (!['moet', 'kan', 'niet'].includes(t.prioriteit)) fouten.push(`${tw}: prioriteit moet moet/kan/niet zijn`);
    if (t.herhaal && !['wekelijks', 'maandelijks'].includes(t.herhaal)) fouten.push(`${tw}: onbekende herhaal`);
    if (t.groep && !data.groepen[t.groep]) fouten.push(`${tw}: onbekende groep '${t.groep}'`);
    if (t.soort && !['water', 'snoeien', 'maaien', 'bemesten', 'zaaien', 'vorst', 'storm'].includes(t.soort)) {
      fouten.push(`${tw}: onbekende soort '${t.soort}'`);
    }
  }
  for (const m of p.bloeiMaanden || []) if (m < 1 || m > 12) fouten.push(`${waar}: bloeimaand ${m} ongeldig`);
}
for (const p of data.planten) {
  if (p.zelfdeZorgAls && !ids.has(p.zelfdeZorgAls)) fouten.push(`plant '${p.id}': zelfdeZorgAls verwijst naar onbekende plant`);
}

const aantalTaken = data.planten.reduce((n, p) => n + (p.taken?.length || 0), 0);
if (fouten.length) {
  console.error(`${fouten.length} fout(en):\n- ${fouten.join('\n- ')}`);
  process.exit(1);
}
console.log(`OK: ${data.planten.length} items, ${aantalTaken} taken, alle foto's aanwezig.`);
