// Test de weerregels met de testscenario's.  Gebruik:  node tools/test_weer.mjs
import { analyseer, advies, scenario } from '../js/weer.js';

const nu = new Date(2026, 9, 24, 12);
const taak = (soort, extra = {}) => ({ soort, prioriteit: 'moet', ...extra });
let fouten = 0;

function verwacht(naam, soort, effect, extra) {
  const a = analyseer(scenario(naam, nu).daily, nu);
  const r = advies(taak(soort, extra), a);
  const ok = (r ? r.effect : null) === effect;
  if (!ok) fouten += 1;
  console.log(`${ok ? 'ok  ' : 'FOUT'} ${naam.padEnd(7)} ${soort.padEnd(9)} → ${(r ? r.effect : 'geen').padEnd(10)} ${r ? `${r.icoon} ${r.tekst}` : ''}`);
}

verwacht('normaal', 'water', null);
verwacht('normaal', 'snoeien', null);
verwacht('normaal', 'vorst', null);
verwacht('nat', 'water', 'nietNodig');
verwacht('nat', 'snoeien', 'wachten');
verwacht('nat', 'maaien', 'wachten');
verwacht('nat', 'bemesten', null);
verwacht('droog', 'water', 'belangrijk');
verwacht('droog', 'bemesten', 'wachten');
verwacht('droog', 'zaaien', 'wachten');
verwacht('droog', 'snoeien', null);
verwacht('vorst', 'snoeien', 'wachten');
verwacht('vorst', 'vorst', 'belangrijk');
verwacht('vorst', 'vorst', null, { vorstGrens: -5 });
verwacht('vorst', 'maaien', null); // vorst pas overmorgen: maaien vandaag kan nog
verwacht('vorst', 'zaaien', 'wachten');
verwacht('storm', 'storm', 'belangrijk');
verwacht('storm', 'snoeien', null);

// Een 'liever niet'-taak krijgt nooit weeradvies
const a = analyseer(scenario('vorst', nu).daily, nu);
if (advies({ soort: 'snoeien', prioriteit: 'niet' }, a) !== null) { fouten += 1; console.log('FOUT niet-taak kreeg advies'); }

console.log(fouten ? `\n${fouten} fout(en)` : '\nAlle weerregels werken zoals verwacht.');
process.exit(fouten ? 1 : 0);
