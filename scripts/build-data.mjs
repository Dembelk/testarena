/* Сборка данных: города (GeoNames через all-the-cities), страны (world-countries,
   русские названия), границы (world-atlas 110m) → компактные файлы в data/. */
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import * as topojson from 'topojson-client';

const require = createRequire(import.meta.url);
const dataDir = new URL('../data/', import.meta.url);
if (!existsSync(dataDir)) mkdirSync(dataDir);

/* ---------- 1. Города → бинарный формат (отсортированы по населению УБЫВ.) ----------
   layout: [u32 N][f32 lat×N][f32 lon×N][f32 pop×N][u32 nameOff×N][utf-8 имена] */
const cities = require('all-the-cities');
const valid = cities.filter(c => c.population > 0 && c.loc?.coordinates?.length === 2);
valid.sort((a, b) => b.population - a.population);
const N = valid.length;

const lat = new Float32Array(N), lon = new Float32Array(N), pop = new Float32Array(N);
valid.forEach((c, i) => {
  lat[i] = c.loc.coordinates[1];
  lon[i] = c.loc.coordinates[0];
  pop[i] = c.population;
});

const encoder = new TextEncoder();
const nameBytes = [];
const nameOff = new Uint32Array(N);
let blobLen = 0;
valid.forEach((c, i) => {
  nameOff[i] = blobLen;
  const b = encoder.encode(c.name);
  nameBytes.push(b);
  blobLen += b.length;
});
const namesBuf = new Uint8Array(blobLen);
let o = 0;
for (const b of nameBytes) { namesBuf.set(b, o); o += b.length; }

const total = 4 + N * 16 + N * 4 + blobLen;
const out = new ArrayBuffer(total);
new DataView(out).setUint32(0, N, true);
new Float32Array(out, 4, N).set(lat);
new Float32Array(out, 4 + N * 4, N).set(lon);
new Float32Array(out, 4 + N * 8, N).set(pop);
new Uint32Array(out, 4 + N * 12, N).set(nameOff);
new Uint8Array(out, 4 + N * 16, blobLen).set(namesBuf);
writeFileSync(new URL('../data/cities.bin', import.meta.url), Buffer.from(out));
console.log(`cities.bin: ${N} городов, ${(total / 1048576).toFixed(2)} МБ`);

/* ---------- 2. Страны → countries.json (русские названия, флаг, площадь, центр) ---------- */
const flag = cc => String.fromCodePoint(...[...cc].map(ch => 0x1f1a5 + ch.charCodeAt(0)));
const world = require('world-countries');
const countries = world
  .filter(c => c.latlng && c.latlng.length === 2 && c.area > 100)
  .map(c => ({
    cc: c.cca2,
    ru: c.translations?.rus?.common || c.name.common,
    en: c.name.common,
    flag: flag(c.cca2),
    area: c.area,
    lat: c.latlng[0],
    lon: c.latlng[1],
  }))
  .sort((a, b) => b.area - a.area);
writeFileSync(new URL('../data/countries.json', import.meta.url), JSON.stringify(countries));
console.log(`countries.json: ${countries.length} стран`);

/* ---------- 2b. Коды стран городов: таблица + байтовый индекс ---------- */
const ccSet = [...new Set(valid.map(c => c.country))].sort();
if (ccSet.length > 255) throw new Error('слишком много кодов стран: ' + ccSet.length);
const ccTable = ccSet.map(cc => {
  const c = world.find(w => w.cca2 === cc);
  return { cc, ru: c?.translations?.rus?.common || c?.name?.common || cc, flag: c ? flag(cc) : '🏳' };
});
writeFileSync(new URL('../data/cc-table.json', import.meta.url), JSON.stringify(ccTable));
const ccIdx = new Uint8Array(N);
const ccPos = new Map(ccSet.map((cc, i) => [cc, i]));
valid.forEach((c, i) => { ccIdx[i] = ccPos.get(c.country) ?? 255; });
writeFileSync(new URL('../data/city-cc.bin', import.meta.url), Buffer.from(ccIdx));
console.log(`cc-table.json: ${ccSet.length} стран, city-cc.bin: ${(N / 1024).toFixed(0)} КБ`);

/* ---------- 3. Границы → borders.json (полилинии [lon,lat]) ---------- */
const topo = require('../node_modules/world-atlas/countries-110m.json');
const mesh = topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b);
const lines = [];
for (const coords of mesh.coordinates) {
  if (coords.length > 1) lines.push(coords.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]));
}
writeFileSync(new URL('../data/borders.json', import.meta.url), JSON.stringify(lines));
let segs = 0; lines.forEach(l => segs += l.length - 1);
console.log(`borders.json: ${lines.length} полилиний, ${segs} сегментов, ${(JSON.stringify(lines).length / 1048576).toFixed(2)} МБ`);
