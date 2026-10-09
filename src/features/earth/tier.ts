// Quality tiers for the Earth rendering: pure logic (no three.js) so it can be unit-tested.
export type Tier = 'low' | 'mid' | 'high'
export type Quality = 'auto' | Tier

export type Caps = {
  maxTextureSize: number
  /** navigator.hardwareConcurrency (0/undefined when unknown). */
  cores?: number
  dpr?: number
  touch?: boolean
  /** navigator.deviceMemory in GB (Chromium only). */
  memoryGb?: number
}

/** low: old/small GPUs and weak phones; mid: typical phones/tablets; high: desktops and strong devices. */
export function selectTier(c: Caps): Tier {
  const cores = c.cores || 8
  if (c.maxTextureSize < 4096 || cores <= 4 || (c.memoryGb !== undefined && c.memoryGb <= 3)) return 'low'
  if (c.touch && ((c.dpr ?? 1) >= 2.5 || cores <= 6 || (c.memoryGb !== undefined && c.memoryGb <= 4))) return 'mid'
  return 'high'
}

export const resolveTier = (q: Quality, c: Caps): Tier => (q === 'auto' ? selectTier(c) : q)

export type Layers = {
  clouds: boolean
  nightLights: boolean
  atmosphere: boolean
  coast: boolean
  borders: boolean
  cities: boolean
}

export type TierConfig = {
  tier: Tier
  /** Texture widths (px) actually uploaded; the 4096 sources are downscaled on a canvas when smaller. */
  dayTex: number
  nightTex: number
  /** Packed bump (R) / ocean-gloss (G) / cloud cover (B) map. */
  dataTex: number
  relief: boolean
  cloudShadow: boolean
  segments: [number, number]
  /** Streamed detail tiles kept in memory (256² px each, ~0.35 MB on the GPU with mipmaps). */
  tileCache: number
  /** Default overlay switches (the user's own choices win). */
  layers: Layers
}

/** Largest of 4096/2048/1024/512 that is <= both the wanted size and the GPU limit. */
export function fitTexSize(want: number, maxTextureSize: number): number {
  const lim = Math.min(want, maxTextureSize)
  return [4096, 2048, 1024, 512].find((s) => s <= lim) ?? 512
}

export function tierConfig(tier: Tier, maxTextureSize = 4096): TierConfig {
  const t = (w: number) => fitTexSize(w, maxTextureSize)
  switch (tier) {
    case 'low':
      return {
        tier, dayTex: t(2048), nightTex: t(1024), dataTex: t(1024), relief: false, cloudShadow: false, segments: [64, 32], tileCache: 48,
        layers: { clouds: true, nightLights: true, atmosphere: true, coast: false, borders: false, cities: false },
      }
    case 'mid':
      return {
        tier, dayTex: t(4096), nightTex: t(2048), dataTex: t(2048), relief: true, cloudShadow: false, segments: [96, 48], tileCache: 160,
        layers: { clouds: true, nightLights: true, atmosphere: true, coast: false, borders: true, cities: false },
      }
    default:
      return {
        tier, dayTex: t(4096), nightTex: t(4096), dataTex: t(4096), relief: true, cloudShadow: true, segments: [128, 64], tileCache: 360,
        layers: { clouds: true, nightLights: true, atmosphere: true, coast: false, borders: true, cities: true },
      }
  }
}

/** Effective overlay switches: tier defaults overridden by what the user toggled. */
export const effectiveLayers = (cfg: TierConfig, custom: Partial<Layers>): Layers => ({ ...cfg.layers, ...custom })
