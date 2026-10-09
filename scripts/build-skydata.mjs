// Builds the offline data of the Sky view (src/features/skyview/data/*.json) from
//  - d3-celestial (BSD-3-Clause, (c) 2015 Olaf Frohn): stars.6, constellations(.lines), dsos.14 (Messier only) + dsos.bright, starnames, dsonames, mw
//  - all-the-cities 3.1.0 (MIT) = GeoNames (CC BY 4.0)
// Usage: node scripts/build-skydata.mjs <dir with the d3-celestial data files> <dir with node_modules/all-the-cities> [debug.png]
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { deflateSync } from 'node:zlib'

const [src, cityPkg, dbg] = process.argv.slice(2)
const out = new URL('../src/features/skyview/data/', import.meta.url).pathname
const J = (f) => JSON.parse(readFileSync(`${src}/${f}`, 'utf8'))
const w = (f, d) => { const s = JSON.stringify(d); writeFileSync(out + f, s); console.log(f, s.length) }
const r = (x, n) => +x.toFixed(n)
const ra360 = (x) => ((x % 360) + 360) % 360

// ---------- stars ----------
const names = J('starnames.json')
const stars = J('stars.6.json').features.map((f) => {
  const [lon, lat] = f.geometry.coordinates
  const bv = parseFloat(f.properties.bv)
  return [f.id, r(ra360(lon), 2), r(lat, 2), r(f.properties.mag, 2), Number.isFinite(bv) ? r(bv, 2) : 0.6]
}).sort((a, b) => a[3] - b[3])
// distances (light-years, rounded, Hipparcos/Gaia magnitudes of order) of the best-known stars, by proper name
const LY = { Sirius: 8.6, Canopus: 310, Arcturus: 37, 'Rigil Kentaurus': 4.4, Vega: 25, Capella: 43, Rigel: 860, Procyon: 11.5, Betelgeuse: 550, Achernar: 140, Hadar: 390, Altair: 17, Acrux: 320, Aldebaran: 65, Antares: 550, Spica: 250, Pollux: 34, Fomalhaut: 25, Deneb: 2600, Mimosa: 280, Regulus: 79, Adhara: 430, Castor: 51, Gacrux: 88, Shaula: 570, Bellatrix: 250, Elnath: 130, Miaplacidus: 110, Alnilam: 2000, Alnitak: 1260, Mintaka: 1200, Alioth: 83, Dubhe: 123, Merak: 79, Mirfak: 510, Polaris: 430, Algol: 90, Mizar: 83, Alkaid: 104, Hamal: 66, Denebola: 36, Saiph: 650, Sadr: 1800, Alphard: 177, Peacock: 180, Alnair: 100, Wezen: 1800, Sargas: 270, 'Kaus Australis': 140, Avior: 630, Menkalinan: 82, Atria: 415, Alhena: 105, Mirzam: 500, Diphda: 96, Nunki: 225, Algieba: 130, Alphecca: 75, Thuban: 300, Arneb: 1300, Schedar: 228, Navi: 610, Caph: 55, Albireo: 430, Rasalhague: 49, Eltanin: 150, Alpheratz: 97, Markab: 133, Enif: 690, Scheat: 196, Kochab: 130, Almach: 350 }
const keep = {}
for (const s of stars) {
  const n = names[s[0]]
  if (!n) continue
  const nm = n.name || '', ba = n.bayer || ''
  if (nm || (ba && s[3] < 3.2)) keep[s[0]] = [nm, ba, n.c || '', n.el || '', LY[nm] ?? 0]
}

// ---------- constellations ----------
const NL = { And: 'Andromeda', Ant: 'Luchtpomp', Aps: 'Paradijsvogel', Aqr: 'Waterman', Aql: 'Arend', Ara: 'Altaar', Ari: 'Ram', Aur: 'Voerman', Boo: 'Ossenhoeder', Cae: 'Burijn', Cam: 'Giraffe', Cnc: 'Kreeft', CVn: 'Jachthonden', CMa: 'Grote Hond', CMi: 'Kleine Hond', Cap: 'Steenbok', Car: 'Kiel', Cas: 'Cassiopeia', Cen: 'Centaur', Cep: 'Cepheus', Cet: 'Walvis', Cha: 'Kameleon', Cir: 'Passer', Col: 'Duif', Com: 'Hoofdhaar van Berenice', CrA: 'Zuiderkroon', CrB: 'Noorderkroon', Crv: 'Raaf', Crt: 'Beker', Cru: 'Zuiderkruis', Cyg: 'Zwaan', Del: 'Dolfijn', Dor: 'Goudvis', Dra: 'Draak', Equ: 'Veulen', Eri: 'Eridanus', For: 'Oven', Gem: 'Tweelingen', Gru: 'Kraan', Her: 'Hercules', Hor: 'Slingeruurwerk', Hya: 'Waterslang', Hyi: 'Kleine Waterslang', Ind: 'Indiaan', Lac: 'Hagedis', Leo: 'Leeuw', LMi: 'Kleine Leeuw', Lep: 'Haas', Lib: 'Weegschaal', Lup: 'Wolf', Lyn: 'Lynx', Lyr: 'Lier', Men: 'Tafelberg', Mic: 'Microscoop', Mon: 'Eenhoorn', Mus: 'Vlieg', Nor: 'Winkelhaak', Oct: 'Octant', Oph: 'Slangendrager', Ori: 'Orion', Pav: 'Pauw', Peg: 'Pegasus', Per: 'Perseus', Phe: 'Feniks', Pic: 'Schilder', Psc: 'Vissen', PsA: 'Zuidervis', Pup: 'Achtersteven', Pyx: 'Kompas', Ret: 'Net', Sge: 'Pijl', Sgr: 'Boogschutter', Sco: 'Schorpioen', Scl: 'Beeldhouwer', Sct: 'Schild', Ser: 'Slang', Sex: 'Sextant', Tau: 'Stier', Tel: 'Telescoop', Tri: 'Driehoek', TrA: 'Zuiderdriehoek', Tuc: 'Toekan', UMa: 'Grote Beer', UMi: 'Kleine Beer', Vel: 'Zeilen', Vir: 'Maagd', Vol: 'Vliegende Vis', Vul: 'Vosje' }
const cons = []
for (const f of J('constellations.json').features) {
  const p = f.properties
  if (cons.some((c) => c[0] === f.id)) continue // Serpens appears twice (Caput/Cauda)
  if (!NL[f.id]) throw new Error('no NL name ' + f.id)
  cons.push([f.id, p.la, p.en, NL[f.id], p.el || p.en, r(ra360(f.geometry.coordinates[0]), 1), r(f.geometry.coordinates[1], 1)])
}
const lines = {}
for (const f of J('constellations.lines.json').features)
  lines[f.id] = (lines[f.id] ?? []).concat(f.geometry.coordinates.map((l) => l.map(([lon, lat]) => [r(ra360(lon), 2), r(lat, 2)])))

// ---------- deep-sky: Messier + the brightest others ----------
const dn = J('dsonames.json')
const dsoName = (id) => dn[id.replace(/^NGC /, '')]?.name ?? dn[id.replace(' ', '')]?.name ?? dn[id]?.name ?? ''
const dsoEl = (id) => dn[id.replace(/^NGC /, '')]?.el ?? dn[id.replace(' ', '')]?.el ?? ''
const dsos = []
for (const f of J('dsos.14.json').features) {
  if (!/^M \d+$/.test(f.properties.desig)) continue
  const [lon, lat] = f.geometry.coordinates
  dsos.push([f.properties.desig.replace(' ', ''), f.properties.type, r(ra360(lon), 3), r(lat, 3), r(+f.properties.mag, 1), dsoName(f.id), dsoEl(f.id)])
}
for (const f of J('dsos.bright.json').features) {
  const p = f.properties, [lon, lat] = f.geometry.coordinates
  if (dsos.some((d) => Math.abs(d[2] - ra360(lon)) < 0.3 && Math.abs(d[3] - lat) < 0.3)) continue
  if (p.type === 'pos' || p.type === 's') continue
  dsos.push([p.desig, p.type, r(ra360(lon), 3), r(lat, 3), r(+p.mag, 1), dsoName(f.id), dsoEl(f.id)])
}
// famous objects the lists lack as such
dsos.push(['LMC', 'g', 80.894, -69.756, 0.9, 'Large Magellanic Cloud', 'Μεγάλο Νέφος του Μαγγελάνου'], ['SMC', 'g', 13.187, -72.829, 2.7, 'Small Magellanic Cloud', 'Μικρό Νέφος του Μαγγελάνου'])

// ---------- Milky Way: nested outlines -> density grid (1 degree cells, RA x Dec), run-length coded ----------
// The outer outlines are belts between two curves that each run once round the whole sky in RA, so the fill is an
// even-odd scan per RA column in the dec direction (a point is inside when an odd number of edges lies north of it).
const W = 360, H = 180
const grid = new Uint8Array(W * H)
for (const f of J('mw.json').features) {
  for (const poly of f.geometry.coordinates) {
    const edges = []
    for (const ring of poly) {
      const pts = [ring[0].slice()]
      for (let i = 1; i < ring.length; i++) { // unwrap RA so consecutive points differ by < 180
        const p = ring[i].slice(), q = pts[i - 1]
        while (p[0] - q[0] > 180) p[0] -= 360
        while (p[0] - q[0] < -180) p[0] += 360
        pts.push(p)
      }
      for (let i = 0; i + 1 < pts.length; i++) edges.push([pts[i], pts[i + 1]])
    }
    for (let x = 0; x < W; x++) {
      const decs = []
      for (const [a, b] of edges)
        for (let k = -2; k <= 2; k++) {
          const ra = x + 0.5 + 360 * k
          if ((a[0] <= ra) !== (b[0] <= ra)) decs.push(a[1] + ((ra - a[0]) / (b[0] - a[0])) * (b[1] - a[1]))
        }
      decs.sort((p, q) => q - p)
      for (let k = 0; k + 1 < decs.length; k += 2)
        for (let y = 0; y < H; y++) { const dec = 90 - (y + 0.5); if (dec <= decs[k] && dec > decs[k + 1]) grid[y * W + x]++ }
    }
  }
}
console.log('mw max level', Math.max(...grid))
const rle = []
for (let i = 0; i < grid.length;) { let j = i; while (j < grid.length && grid[j] === grid[i]) j++; rle.push(grid[i], j - i); i = j }
if (dbg) { // greyscale PNG for eyeballing
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + d.length)), 8 + d.length); return b }
  const raw = Buffer.alloc((W + 1) * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) raw[y * (W + 1) + 1 + x] = grid[y * W + x] * 50
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8
  writeFileSync(dbg, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
}

// ---------- places ----------
if (!cityPkg) { console.log('no all-the-cities dir given: places.json left as is'); w('sky.json', { stars, names: keep, cons, lines, dsos, mw: { w: W, h: H, rle } }); process.exit(0) }
const cities = createRequire(cityPkg + '/')('all-the-cities')
const EXTRA_CC = new Set(['NL', 'BE', 'GR', 'LU'])
const places = cities
  .filter((c) => c.population >= 150000 || c.featureCode === 'PPLC' || (EXTRA_CC.has(c.country) && c.population >= 15000) || (c.featureCode === 'PPLA' && c.population >= 60000))
  .sort((a, b) => b.population - a.population)
  .map((c) => [c.name, c.country, r(c.loc.coordinates[1], 2), r(c.loc.coordinates[0], 2), Math.round(c.population / 1000)])
// dark-sky / observatory places (own coordinates, rounded; altitude in m as 6th value)
const SITES = [
  ['Mauna Kea', 'US', 19.82, -155.47, 0, 4200], ['Paranal (ESO VLT)', 'CL', -24.63, -70.4, 0, 2635], ['La Silla (ESO)', 'CL', -29.26, -70.73, 0, 2400],
  ['Roque de los Muchachos (La Palma)', 'ES', 28.76, -17.89, 0, 2396], ['Teide Observatory (Tenerife)', 'ES', 28.3, -16.51, 0, 2390], ['Atacama (ALMA)', 'CL', -23.02, -67.75, 0, 5000],
  ['Kitt Peak', 'US', 31.96, -111.6, 0, 2096], ['Siding Spring', 'AU', -31.27, 149.07, 0, 1165], ['SAAO Sutherland', 'ZA', -32.38, 20.81, 0, 1760],
  ['Tromsø (aurora)', 'NO', 69.65, 18.96, 0, 0], ['Greenwich Observatory', 'GB', 51.48, 0, 0, 50], ['Cerro Tololo', 'CL', -30.17, -70.8, 0, 2200], ['Dwingeloo (Radio Observatory)', 'NL', 52.81, 6.4, 0, 20],
  ['McDonald Observatory', 'US', 30.67, -104.02, 0, 2070], ['Jungfraujoch', 'CH', 46.55, 7.98, 0, 3466],
]
for (const s of SITES) places.push(s)

w('sky.json', { stars, names: keep, cons, lines, dsos, mw: { w: W, h: H, rle } })
w('places.json', places)
console.log('stars', stars.length, 'named', Object.keys(keep).length, 'cons', cons.length, 'dsos', dsos.length, 'places', places.length)
