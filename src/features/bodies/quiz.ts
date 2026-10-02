// Quiz generation from the encyclopedia data. Pure: the caller passes the random generator, so tests are deterministic.
import { BODY_LIST, BODY_MAP, type Body } from './data.ts'

export type Metric = 'rot' | 'gravity' | 'radius' | 'rho' | 'T' | 'a' | 'period' | 'vesc' | 'moons' | 'mass'
export type PoolId = 'planets' | 'planetsDwarfs' | 'moons'
export interface Spec { id: string; metric: Metric; pool: PoolId; dir: 'max' | 'min' }

const POOL: Record<PoolId, (b: Body) => boolean> = {
  planets: (b) => b.kind === 'planet',
  planetsDwarfs: (b) => b.kind === 'planet' || b.kind === 'dwarf',
  moons: (b) => b.kind === 'moon',
}

/** Superlative questions; the text of each is the i18n key `bod.q.<id>`. */
export const SPECS: Spec[] = [
  { id: 'dayMin', metric: 'rot', pool: 'planets', dir: 'min' },
  { id: 'dayMax', metric: 'rot', pool: 'planets', dir: 'max' },
  { id: 'gMax', metric: 'gravity', pool: 'planets', dir: 'max' },
  { id: 'gMin', metric: 'gravity', pool: 'planets', dir: 'min' },
  { id: 'rMin', metric: 'radius', pool: 'planets', dir: 'min' },
  { id: 'rMax', metric: 'radius', pool: 'planets', dir: 'max' },
  { id: 'rhoMax', metric: 'rho', pool: 'planets', dir: 'max' },
  { id: 'rhoMin', metric: 'rho', pool: 'planets', dir: 'min' },
  { id: 'tMax', metric: 'T', pool: 'planets', dir: 'max' },
  { id: 'aMax', metric: 'a', pool: 'planets', dir: 'max' },
  { id: 'aMin', metric: 'a', pool: 'planets', dir: 'min' },
  { id: 'yearMin', metric: 'period', pool: 'planets', dir: 'min' },
  { id: 'yearMax', metric: 'period', pool: 'planets', dir: 'max' },
  { id: 'vescMax', metric: 'vesc', pool: 'planets', dir: 'max' },
  { id: 'moonsMax', metric: 'moons', pool: 'planets', dir: 'max' },
  { id: 'massMax', metric: 'mass', pool: 'planets', dir: 'max' },
  { id: 'dwarfSmall', metric: 'radius', pool: 'planetsDwarfs', dir: 'min' },
  { id: 'moonBig', metric: 'radius', pool: 'moons', dir: 'max' },
  { id: 'moonSmall', metric: 'radius', pool: 'moons', dir: 'min' },
  { id: 'moonG', metric: 'gravity', pool: 'moons', dir: 'max' },
  { id: 'moonRho', metric: 'rho', pool: 'moons', dir: 'max' },
  { id: 'moonRhoMin', metric: 'rho', pool: 'moons', dir: 'min' },
  { id: 'moonFast', metric: 'period', pool: 'moons', dir: 'min' },
  { id: 'moonVesc', metric: 'vesc', pool: 'moons', dir: 'min' },
]

/** The number the question compares (undefined when the body has no value). */
export function metricValue(m: Metric, b: Body): number | undefined {
  switch (m) {
    case 'rot': return b.rotH === undefined ? undefined : Math.abs(b.rotH)
    case 'gravity': return b.g
    case 'radius': return b.R
    case 'rho': return b.rho
    case 'T': return b.T
    case 'a': return b.a
    case 'period': return b.P
    case 'vesc': return b.vesc
    case 'moons': return b.moons
    case 'mass': return b.M
  }
}

export interface Question {
  kind: 'superlative' | 'parent'
  spec?: Spec // superlative
  bodyId?: string // parent question: the moon
  options: string[] // body ids
  correct: number // index into options
}
export type Rng = () => number

export function mulberry32(seed: number): Rng {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function shuffle<T>(a: T[], rnd: Rng): T[] {
  const r = a.slice()
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]] }
  return r
}

function distinctValues(ids: string[], metric: Metric) {
  const v = ids.map((id) => metricValue(metric, BODY_MAP[id]))
  return v.every((x) => x !== undefined) && new Set(v).size === v.length
}

function superlative(spec: Spec, rnd: Rng): Question | null {
  const pool = BODY_LIST.filter(POOL[spec.pool]).filter((b) => metricValue(spec.metric, b) !== undefined)
  // The answer must be unique in the whole pool, so the question stays true whatever options are drawn.
  const vals = pool.map((b) => metricValue(spec.metric, b)!)
  const best = spec.dir === 'max' ? Math.max(...vals) : Math.min(...vals)
  const winners = pool.filter((b) => metricValue(spec.metric, b) === best)
  if (winners.length !== 1) return null
  const correctId = winners[0].id
  const others = pool.filter((b) => b.id !== correctId).map((b) => b.id)
  for (let tries = 0; tries < 20; tries++) {
    const ids = [correctId, ...shuffle(others, rnd).slice(0, 3)]
    if (!distinctValues(ids, spec.metric)) continue
    const options = shuffle(ids, rnd)
    return { kind: 'superlative', spec, options, correct: options.indexOf(correctId) }
  }
  return null
}

function parentQuestion(rnd: Rng): Question {
  const moons = BODY_LIST.filter((b) => b.kind === 'moon' && b.id !== 'moon')
  const moon = moons[Math.floor(rnd() * moons.length)]
  const planets = BODY_LIST.filter((b) => b.kind === 'planet' || b.id === 'pluto').map((b) => b.id).filter((id) => id !== moon.parent)
  const options = shuffle([moon.parent!, ...shuffle(planets, rnd).slice(0, 3)], rnd)
  return { kind: 'parent', bodyId: moon.id, options, correct: options.indexOf(moon.parent!) }
}

/** `count` different questions (default 10): one "which planet does this moon orbit" plus superlatives. */
export function generateQuiz(rnd: Rng, count = 10): Question[] {
  const qs: Question[] = [parentQuestion(rnd)]
  for (const s of shuffle(SPECS, rnd)) {
    if (qs.length >= count) break
    const q = superlative(s, rnd)
    if (q) qs.push(q)
  }
  return shuffle(qs, rnd)
}
