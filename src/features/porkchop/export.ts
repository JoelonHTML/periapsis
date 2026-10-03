// Export of a route as CSV (heliocentric ecliptic J2000) and CCSDS OEM 2.0 (heliocentric, EME2000). Pure text, no DOM.
import { BODIES, DAY, ecl2eq, fmtDateTime, toMs, type Vec } from '../../lib/astro.ts'
import { legState, type Solution } from '../../lib/mga.ts'

export interface Sample { t: number; r: Vec; v: Vec; leg: number }

/** Sample every Lambert leg (including both end points) with the two-body propagator. Legs are kept apart because the
 *  velocity jumps at a flyby/manoeuvre while the position does not. */
export function sampleRoute(sol: Solution, stepDays = 2): Sample[][] {
  return sol.legs.map((l, k) => {
    const tof = l.t2 - l.t1
    const n = Math.max(40, Math.min(800, Math.ceil(tof / (stepDays * DAY))))
    const out: Sample[] = []
    for (let i = 0; i <= n; i++) {
      if (i === 0) out.push({ t: l.t1, r: l.r1, v: l.v1, leg: k })
      else if (i === n) out.push({ t: l.t2, r: l.r2, v: l.v2, leg: k })
      else { const dt = (tof * i) / n, s = legState(l, l.t1 + dt); out.push({ t: l.t1 + dt, r: s.r, v: s.v, leg: k }) }
    }
    return out
  })
}

const iso = (t: number) => new Date(toMs(t)).toISOString().slice(0, 23)
const num = (x: number) => x.toFixed(6)
export const routeName = (sol: Solution) => sol.seq.map((b) => BODIES[b].name).join(' - ')

export function toCsv(sol: Solution, stepDays = 2): string {
  const lines = [
    '# Periapsis route export. Central body: Sun. Frame: heliocentric ecliptic J2000 (mean ecliptic and equinox of J2000).',
    `# Route: ${routeName(sol)}; departure ${fmtDateTime(sol.tDep)}; arrival ${fmtDateTime(sol.tArr)}; dv ${sol.dv.toFixed(3)} km/s`,
    '# Legs are two-body Lambert arcs; at a flyby the position repeats with a different velocity (new leg).',
    'time_utc,t_s_since_J2000,x_km,y_km,z_km,vx_km_s,vy_km_s,vz_km_s,leg',
  ]
  for (const leg of sampleRoute(sol, stepDays)) for (const s of leg) {
    lines.push([iso(s.t) + 'Z', s.t.toFixed(3), ...s.r.map(num), ...s.v.map(num), s.leg + 1].join(','))
  }
  return lines.join('\n') + '\n'
}

/** CCSDS Orbit Ephemeris Message 2.0 (KVN). One segment per leg (epochs must increase inside a segment). Vectors are rotated
 *  from ecliptic J2000 into EME2000 (the standard OEM frame), centre SUN. */
export function toOem(sol: Solution, creation: Date = new Date(), stepDays = 2): string {
  const L: string[] = [
    'CCSDS_OEM_VERS = 2.0',
    'COMMENT Periapsis route export (heliocentric, two-body Lambert legs).',
    'COMMENT Source frame was heliocentric ecliptic J2000; rotated about +x by the obliquity into EME2000.',
    'COMMENT Time tag: the app clock (seconds since J2000, no UTC/TDB offset applied; difference of about 69 s is neglected).',
    `CREATION_DATE = ${creation.toISOString().slice(0, 19)}`,
    'ORIGINATOR = PERIAPSIS',
    '',
  ]
  const name = `PERIAPSIS ${routeName(sol).toUpperCase()}`
  sampleRoute(sol, stepDays).forEach((leg, k) => {
    const a = leg[0].t, b = leg[leg.length - 1].t
    L.push(
      'META_START',
      `COMMENT Leg ${k + 1}: ${BODIES[sol.legs[k].from].name} to ${BODIES[sol.legs[k].to].name}`,
      `OBJECT_NAME = ${name}`,
      'OBJECT_ID = PERIAPSIS-ROUTE',
      'CENTER_NAME = SUN',
      'REF_FRAME = EME2000',
      'TIME_SYSTEM = TDB',
      `START_TIME = ${iso(a)}`,
      `USEABLE_START_TIME = ${iso(a)}`,
      `USEABLE_STOP_TIME = ${iso(b)}`,
      `STOP_TIME = ${iso(b)}`,
      'META_STOP',
      '',
    )
    for (const s of leg) L.push([iso(s.t), ...ecl2eq(s.r).map(num), ...ecl2eq(s.v).map(num)].join(' '))
    L.push('')
  })
  return L.join('\n')
}
