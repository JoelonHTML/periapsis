// Builds the offline data of the Sky view (src/features/skyview/data/*.json) from
//  - d3-celestial (BSD-3-Clause, (c) 2015 Olaf Frohn): stars.8 (Hipparcos/Tycho, to mag 8), constellations(.lines/.bounds), dsos.14 (Messier/NGC/IC/Collinder), starnames, dsonames, mw
//  - writes sky.json plus the deflate-raw binaries stars.bin and dsos.bin
//  - all-the-cities 3.1.0 (MIT) = GeoNames (CC BY 4.0)
// Usage: node scripts/build-skydata.mjs <dir with the d3-celestial data files> <dir with node_modules/all-the-cities> [debug.png]
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { deflateRawSync, deflateSync } from 'node:zlib'

const [src, cityPkg, dbg] = process.argv.slice(2)
const out = new URL('../src/features/skyview/data/', import.meta.url).pathname
const J = (f) => JSON.parse(readFileSync(`${src}/${f}`, 'utf8'))
const w = (f, d) => { const s = JSON.stringify(d); writeFileSync(out + f, s); console.log(f, s.length) }
const r = (x, n) => +x.toFixed(n)
const ra360 = (x) => ((x % 360) + 360) % 360

// ---------- stars (binary, see src/features/skyview/skydata.ts decodeStars) ----------
const names = J('starnames.json')
const raw8 = J('stars.8.json').features.map((f) => {
  const [lon, lat] = f.geometry.coordinates
  const bv = parseFloat(f.properties.bv)
  return { hip: f.id, ra: ra360(lon), dec: lat, mag: f.properties.mag, bv: Number.isFinite(bv) ? bv : null }
}).sort((a, b) => a.hip - b.hip)
// distances (light-years, rounded) of the best-known stars, by proper name
const LY = { Sirius: 8.6, Canopus: 310, Arcturus: 37, 'Rigil Kentaurus': 4.4, Vega: 25, Capella: 43, Rigel: 860, Procyon: 11.5, Betelgeuse: 550, Achernar: 140, Hadar: 390, Altair: 17, Acrux: 320, Aldebaran: 65, Antares: 550, Spica: 250, Pollux: 34, Fomalhaut: 25, Deneb: 2600, Mimosa: 280, Regulus: 79, Adhara: 430, Castor: 51, Gacrux: 88, Shaula: 570, Bellatrix: 250, Elnath: 130, Miaplacidus: 110, Alnilam: 2000, Alnitak: 1260, Mintaka: 1200, Alioth: 83, Dubhe: 123, Merak: 79, Mirfak: 510, Polaris: 430, Algol: 90, Mizar: 83, Alkaid: 104, Hamal: 66, Denebola: 36, Saiph: 650, Sadr: 1800, Alphard: 177, Peacock: 180, Alnair: 100, Wezen: 1800, Sargas: 270, 'Kaus Australis': 140, Avior: 630, Menkalinan: 82, Atria: 415, Alhena: 105, Mirzam: 500, Diphda: 96, Nunki: 225, Algieba: 130, Alphecca: 75, Thuban: 300, Arneb: 1300, Schedar: 228, Navi: 610, Caph: 55, Albireo: 430, Rasalhague: 49, Eltanin: 150, Alpheratz: 97, Markab: 133, Enif: 690, Scheat: 196, Kochab: 130, Almach: 350, Mira: 300, Algenib: 390, Sabik: 88, Zubeneschamali: 185, Zubenelgenubi: 77, Vindemiatrix: 110, Rasalgethi: 360, Alcor: 82, Sheratan: 60, Mesarthim: 164, Segin: 440, Ruchbah: 99, Alderamin: 49, Pleione: 440, Atlas: 430, Electra: 440, Maia: 440, Merope: 440, Taygeta: 440, Alcyone: 440 }
const hipSet = new Set(raw8.map((s) => s.hip))
const keep = {} // hip -> [name, bayer, con, el, ly, flamsteed, HD, variable-designation]
for (const [k, n] of Object.entries(names)) {
  const hip = +String(n.hip || '').replace(/\D/g, '') || +k
  if (!hipSet.has(hip) || keep[hip]) continue
  const nm = n.name || '', ba = n.bayer || '', fl = n.flam || '', vr = n.var || ''
  if (nm || ba || fl || vr) keep[hip] = [nm, ba, n.c || '', n.el || '', LY[nm] ?? 0, fl, (n.hd || '').replace(/\D/g, '') || '', vr]
}
{
  const N = raw8.length
  const buf = Buffer.alloc(4 + N * (3 + 3 + 1 + 1 + 2))
  buf.writeUInt32LE(N, 0)
  const oRa = 4, oDec = oRa + 3 * N, oMag = oDec + 3 * N, oBv = oMag + N, oHip = oBv + N
  const w24 = (o, v) => { buf[o] = v & 255; buf[o + 1] = (v >> 8) & 255; buf[o + 2] = (v >> 16) & 255 }
  let prev = 0
  raw8.forEach((s, i) => {
    w24(oRa + 3 * i, Math.min(0xffffff, Math.round((s.ra / 360) * 0x1000000)))
    w24(oDec + 3 * i, Math.min(0xffffff, Math.round(((s.dec + 90) / 180) * 0x1000000)))
    buf[oMag + i] = Math.max(0, Math.min(255, Math.round((s.mag + 2) * 20)))
    buf[oBv + i] = s.bv == null ? 255 : Math.max(0, Math.min(254, Math.round((s.bv + 0.5) * 100)))
    const d = s.hip - prev; prev = s.hip
    if (d > 65535) throw new Error('hip gap')
    buf.writeUInt16LE(d, oHip + 2 * i)
  })
  const z = deflateRawSync(buf, { level: 9 })
  writeFileSync(out + 'stars.bin', z); console.log('stars.bin', N, 'stars', buf.length, '->', z.length)
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
// IAU boundaries (J2000 RA/Dec polygons; lon is RA in degrees, possibly negative or past 360)
const bounds = {}
for (const f of J('constellations.bounds.json').features) bounds[f.id] = (bounds[f.id] ?? []).concat(f.geometry.coordinates.map((ring) => ring.map(([lon, lat]) => [r(lon, 2), r(lat, 2)])))
for (const c of cons) if (!bounds[c[0]]) throw new Error('no bounds ' + c[0])

// ---------- deep sky (binary): Messier, NGC, IC, Collinder, LMC, SMC from d3-celestial dsos.14 ----------
const dn = J('dsonames.json')
const nameOf = (key) => dn[key] ?? null
const TYPES = ['g', 'oc', 'gc', 'pn', 'bn', 'en', 'rn', 'sfr', 'snr', 'dn', 'gg', 's', 's0', 'e', 'i', 'sd']
const CATS = ['M', 'NGC', 'IC', 'Cr', 'LMC', 'SMC']
const dim = (s) => { const m = String(s).match(/^([\d.]+)(?:x([\d.]+))?/); return m ? [+m[1], +(m[2] ?? m[1])] : [0, 0] }
const KEEP_NAMES = new Set(['Large Magellanic Cloud', 'Small Magellanic Cloud', 'η Car Nebula', 'Pleiades', 'α Persei Cluster', 'Coma Star Cluster', 'Southern Pleiades', 'Praesepe', 'Andromeda Galaxy', "Elephant's Trunk Nebula", 'Coathanger', 'h Persei', 'χ Persei', 'Orion Nebula', 'North America Nebula', 'Blue Horsehead Nebula', 'Merope Nebula', 'Maia Nebula', '47 Tuc', 'Jewel Box', 'Butterfly Cluster', "Ptolemy's Cluster", 'Eagle Nebula', 'Lagoon Nebula', 'Rosette Nebula', 'Trifid Nebula', 'Omega Nebula', 'Great Star Cluster in Hercules', 'Wild Duck Cluster', 'Dumbbell Nebula', 'Ring Nebula', 'Crab Nebula', 'Owl Nebula', 'Triangulum Galaxy', 'Whirlpool Galaxy', 'Pinwheel Galaxy', 'Sombrero Galaxy', 'Cigar Galaxy', "Bode's Galaxy", 'Sunflower Galaxy', 'Black Eye Galaxy', 'Sculptor Galaxy', 'Centaurus A', 'ω Cen Cluster', 'Southern Pinwheel Galaxy', "Cat's Eye Nebula", 'Helix Nebula', 'Saturn Nebula', 'Blue Snowball', 'Eskimo Nebula', 'Ghost of Jupiter Nebula', 'Blinking Planetary Nebula', 'Little Dumbbell Nebula', 'Southern Ring Nebula', 'East Veil Nebula', 'Crescent Nebula', 'Bubble Nebula', 'Heart Nebula', 'Cocoon Nebula', 'Iris Nebula', 'Flaming Star Nebula', 'Tarantula Nebula', "Hubble's Variable Nebula", "Hind's Variable Nebula", 'Leo Triplet', 'Antennae', "Markarian's Chain", "Stephan's Quintet", 'Mice Galaxies', 'Spindle Galaxy', 'Whale Galaxy', "Seyfert's Sextet", 'Orion Belt Cluster', 'Summer Beehive Cluster', 'Starfish Cluster', 'Pinwheel Cluster', 'Small Sagittarius Star Cloud', 'Pearl Cluster', 'Wishing Well Cluster'])
const recs = []
const dsoNames = {}
for (const f of J('dsos.14.json').features) {
  const p = f.properties, m = /^(M|NGC|IC|Cr) (\d+)$/.exec(p.desig) ?? (p.desig === 'LMC' || p.desig === 'SMC' ? [p.desig, p.desig, '0'] : null)
  if (!m || !TYPES.includes(p.type)) continue
  const mag = +p.mag, [a, b] = dim(p.dim)
  if (mag > 14.2 || (mag > 900 && Math.max(a, b) < 10)) continue
  const [lon, lat] = f.geometry.coordinates
  const ngc = /^NGC (\d+)$/.exec(f.id)
  recs.push({ type: TYPES.indexOf(p.type), cat: CATS.indexOf(m[1]), num: +m[2], ngc: m[1] === 'M' && ngc ? +ngc[1] : 0, ra: ra360(lon), dec: lat, mag: mag > 900 ? 99 : mag, maj: a, min: b, key: f.id, des: p.desig })
}
// Collinder clusters that sit on top of an NGC/IC/M object are the same thing: drop them
const real = recs.filter((x) => x.cat !== 3)
const dsoList = recs.filter((x) => x.cat !== 3 || !real.some((y) => Math.abs(y.dec - x.dec) < 0.3 && Math.abs(((y.ra - x.ra + 540) % 360) - 180) * Math.cos(x.dec * Math.PI / 180) < 0.3))
dsoList.sort((a, b) => a.mag - b.mag)
dsoList.forEach((x, i) => {
  const nm = nameOf(x.des.replace(' ', '')) ?? nameOf(x.key.replace(/^NGC /, '')) ?? nameOf(x.key.replace(' ', '')) ?? nameOf(x.key) ?? nameOf(x.des)
  if (nm?.name && KEEP_NAMES.has(nm.name)) dsoNames[i] = [nm.name, nm.el || ''] // (d3-celestial also carries many modern nicknames: only the classic names are kept)
})
{
  const N = dsoList.length, RS = 3 + 3 + 1 + 1 + 1 + 2 + 2 + 2 + 2
  const buf = Buffer.alloc(4 + N * RS)
  buf.writeUInt32LE(N, 0)
  let o = 4
  const w24 = (v) => { buf[o] = v & 255; buf[o + 1] = (v >> 8) & 255; buf[o + 2] = (v >> 16) & 255; o += 3 }
  for (const x of dsoList) {
    w24(Math.min(0xffffff, Math.round((x.ra / 360) * 0x1000000))); w24(Math.min(0xffffff, Math.round(((x.dec + 90) / 180) * 0x1000000)))
    buf[o++] = x.type; buf[o++] = x.cat; buf[o++] = x.mag >= 99 ? 255 : Math.max(0, Math.min(254, Math.round((x.mag + 3) * 10)))
    buf.writeUInt16LE(x.num, o); o += 2; buf.writeUInt16LE(x.ngc, o); o += 2
    buf.writeUInt16LE(Math.min(65535, Math.round(x.maj * 10)), o); o += 2; buf.writeUInt16LE(Math.min(65535, Math.round(x.min * 10)), o); o += 2
  }
  const z = deflateRawSync(buf, { level: 9 })
  writeFileSync(out + 'dsos.bin', z); console.log('dsos.bin', N, 'objects', buf.length, '->', z.length, 'named', Object.keys(dsoNames).length)
}

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
if (!cityPkg) { console.log('no all-the-cities dir given: places.json left as is'); w('sky.json', { names: keep, cons, lines, bounds, dsoNames, mw: { w: W, h: H, rle } }); process.exit(0) }
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

w('sky.json', { names: keep, cons, lines, bounds, dsoNames, mw: { w: W, h: H, rle } })
w('places.json', places)
console.log('named', Object.keys(keep).length, 'cons', cons.length, 'places', places.length)
