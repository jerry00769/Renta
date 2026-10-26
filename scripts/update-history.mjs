
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE =
  'https://www.loterie-tikety.cz/rubriky/sazeni/loterie-extra-renta-od-sazky_7897.html';

const MONTHS = {
  ledna: 1, unora: 2, brezna: 3, dubna: 4,
  kvetna: 5, cervna: 6, cervence: 7, srpna: 8,
  zari: 9, rijna: 10, listopadu: 11, prosince: 12
};

const norm = s => String(s).normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase();

function clean(s) {
  return String(s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;|&#x[a-f0-9]+;/gi, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

function valid(ns) {
  return ns.length === 7 &&
    new Set(ns).size === 7 &&
    ns.every(n => Number.isInteger(n) && n >= 1 && n <= 33);
}

function iso(value) {
  const s = norm(clean(value));

  let m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return checkDate(+m[1], +m[2], +m[3]);

  m = s.match(/\b(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\b/);
  if (m) return checkDate(+m[3], +m[2], +m[1]);

  m = s.match(/\b(\d{1,2})\.\s*([a-z]+)\s+(\d{4})\b/);
  if (m && MONTHS[m[2]])
    return checkDate(+m[3], MONTHS[m[2]], +m[1]);

  return null;
}

function checkDate(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y ||
      date.getUTCMonth() !== m - 1 ||
      date.getUTCDate() !== d) return null;

  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function cz(d) {
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
}

function same(a, b) {
  return [...a].sort((x,y) => x-y).join(',') ===
         [...b].sort((x,y) => x-y).join(',');
}

const header = 'Datum;sloupec 1;sloupec 2;sloupec 3;sloupec 4;sloupec 5;sloupec 6;sloupec 7';

const original = readFileSync('renta.csv', 'utf8')
  .replace(/^\uFEFF/, '');

const lines = original.split(/\r?\n/).filter(x => x.trim());
const draws = new Map();

for (const line of lines.slice(1)) {
  const a = line.split(';');
  const d = iso(a[0]);
  const ns = a.slice(1).map(x => Number(x.trim()));

  if (!d || !valid(ns)) {
    throw Error('Neplatný historický záznam: ' + line);
  }

  if (draws.has(d) && !same(draws.get(d), ns)) {
    throw Error('Konflikt v původním CSV: ' + d);
  }

  draws.set(d, ns);
}

console.log('Původní historie:', draws.size, 'losování');

const response = await fetch(SOURCE, {
  headers: {
    'User-Agent': 'Mozilla/5.0',
    'Accept': 'text/html'
  },
  signal: AbortSignal.timeout(30000)
});

if (!response.ok)
  throw Error('Zdroj vrátil HTTP ' + response.status);

const html = await response.text();

const tables = [...html.matchAll(
  /<table\b[^>]*>[\s\S]*?<\/table>/gi
)].map(x => x[0]);

const table = tables.find(t =>
  norm(clean(t)).includes('datum slosovani') &&
  norm(clean(t)).includes('tazena cisla')
);

if (!table)
  throw Error('Tabulka archivu nebyla nalezena. CSV zachováno.');

let parsed = 0;
let added = 0;

for (const match of table.matchAll(
  /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
)) {
  const cells = [...match[1].matchAll(
    /<td\b[^>]*>([\s\S]*?)<\/td>/gi
  )].map(x => clean(x[1]));

  if (cells.length < 2) continue;

  const date = iso(cells[0]);
  if (!date) continue;

  const numbers = (cells.slice(1).join(' ')
    .match(/\d+/g) || []).map(Number);

  // Sedm hlavních čísel a případné osmé dodatkové.
  if (numbers.length !== 7 && numbers.length !== 8)
    continue;

  const main = numbers.slice(0, 7);

  if (!valid(main)) continue;

  if (numbers.length === 8 &&
      (!Number.isInteger(numbers[7]) ||
       numbers[7] < 1 || numbers[7] > 33 ||
       main.includes(numbers[7]))) continue;

  parsed++;

  if (draws.has(date)) {
    if (!same(draws.get(date), main))
      throw Error('Konflikt výsledků pro ' + date +
        '. CSV nebylo změněno.');
  } else {
    draws.set(date, main);
    added++;
    console.log('Nové losování:', date, main.join(', '));
  }
}

if (parsed === 0)
  throw Error('Nenalezeny platné výsledky. CSV zachováno.');

if (added === 0) {
  console.log('Historie je aktuální. Žádná změna.');
} else {
  const output = [
    header,
    ...[...draws.entries()]
      .sort((a,b) => b[0].localeCompare(a[0]))
      .map(([date, nums]) => [cz(date), ...nums].join(';'))
  ].join('\r\n') + '\r\n';

  writeFileSync('renta.csv', output, 'utf8');
}

console.log(
  `HOTOVO: ${parsed} ověřených, ` +
  `${added} nových, ${draws.size} celkem.`
);
