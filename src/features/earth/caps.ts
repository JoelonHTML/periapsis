// Device capability probe for the quality tiers (browser only; the pure selection logic is in tier.ts).
import { fitTexSize, resolveTier, tierConfig, type Caps, type Quality, type TierConfig } from './tier.ts'

let caps: Caps | null = null

export function getCaps(): Caps {
  if (caps) return caps
  let max = 4096
  try {
    const c = document.createElement('canvas')
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null
    if (gl) {
      max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  } catch { /* keep the default */ }
  const n = navigator as Navigator & { deviceMemory?: number }
  return (caps = {
    maxTextureSize: max,
    cores: n.hardwareConcurrency,
    dpr: window.devicePixelRatio || 1,
    touch: (n.maxTouchPoints ?? 0) > 0,
    memoryGb: n.deviceMemory,
  })
}

export function configFor(q: Quality): TierConfig {
  const c = getCaps()
  return tierConfig(resolveTier(q, c), c.maxTextureSize)
}

export { fitTexSize }
