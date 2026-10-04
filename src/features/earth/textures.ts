// Loads the Earth maps (inlined by the single-file build), downscaling on a canvas when the tier or the GPU wants less than 4096 px.
import * as THREE from 'three'
import DAY from './assets/earth-day-4096.jpg'
import NIGHT from './assets/earth-night-4096.jpg'
import DATA from './assets/earth-bump-spec-clouds-4096.jpg'

export type EarthMaps = { day: THREE.Texture; night: THREE.Texture; data: THREE.Texture }
const SRC = { day: DAY, night: NIGHT, data: DATA }
const SOURCE_W = 4096

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = () => rej(new Error('earth texture failed to load'))
    im.src = url
  })
}

async function make(kind: keyof typeof SRC, width: number, aniso: number): Promise<THREE.Texture> {
  const im = await loadImage(SRC[kind])
  let tex: THREE.Texture
  if (width >= SOURCE_W) tex = new THREE.Texture(im)
  else {
    const c = document.createElement('canvas')
    c.width = width; c.height = width / 2
    const g = c.getContext('2d')!
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'
    g.drawImage(im, 0, 0, c.width, c.height)
    tex = new THREE.CanvasTexture(c)
  }
  // only the day and night maps are colour; the data map holds linear values
  tex.colorSpace = kind === 'data' ? THREE.NoColorSpace : THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping // clouds drift across the date line
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.anisotropy = aniso
  tex.needsUpdate = true
  return tex
}

const cache = new Map<string, { p: Promise<EarthMaps>; refs: number; timer: number }>()

/** Reference-counted: the textures are disposed 20 s after the last user went away (switching views stays instant). */
export function acquireEarthMaps(sizes: { day: number; night: number; data: number }, aniso: number) {
  const key = `${sizes.day}/${sizes.night}/${sizes.data}`
  let e = cache.get(key)
  if (!e) {
    e = { refs: 0, timer: 0, p: Promise.all([make('day', sizes.day, aniso), make('night', sizes.night, aniso), make('data', sizes.data, aniso)]).then(([day, night, data]) => ({ day, night, data })) }
    cache.set(key, e)
  }
  clearTimeout(e.timer)
  e.refs++
  const entry = e
  return {
    promise: entry.p,
    release() {
      if (--entry.refs > 0) return
      entry.timer = window.setTimeout(() => {
        if (entry.refs > 0) return
        cache.delete(key)
        entry.p.then((m) => { m.day.dispose(); m.night.dispose(); m.data.dispose() }, () => {})
      }, 20000)
    },
  }
}
