// Streaming detail layer on top of the bundled Earth: a quadtree of Web Mercator imagery tiles, loaded as you zoom in (like a map app).
// Tiles are patches of the sphere drawn with the same ground shader as the bundled globe (so night side, lights, relief, glint and
// cloud shadows all still apply), a hair above it. The bundled globe underneath is the level-0 fallback, the placeholder while tiles
// load and the filler for cracks between neighbouring tiles of different levels, so no skirts are needed.
// Selection/caching logic lives in the pure tiles.ts / tileStore.ts; this file only talks to three.js.
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { TileStore } from './tileStore'
import { parentOf, selectTiles, tileGrid, tileKey, TILE_SOURCES, type TileId, type TileSource } from './tiles'

const MIN_Z = 5 // the bundled 4096 px map is about level 4; deeper levels only
const MAX_WANTED = 100
const TEXEL_PX = 1.5 // magnification tolerated before a deeper level is fetched
const LIFT = 4e-5, LIFT_Z = 8e-6 // radius above the bundled sphere; deeper levels sit higher so a parent standing in never z-fights a child

/** Sources: the real ones, or (dev builds only) a local test server given as ?tiles=http://localhost:5195/{z}/{x}/{y}.jpg&maxz=9 */
function sources(): TileSource[] {
  if (import.meta.env.DEV) {
    const q = new URLSearchParams(location.search), tpl = q.get('tiles')
    if (tpl) return [{ id: 'dev', name: 'dev', maxZ: Number(q.get('maxz') ?? 12), attribution: 'dev tiles', licence: '-', url: (z, x, y) => tpl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)) }]
  }
  return TILE_SOURCES
}

type Drawn = { mesh: THREE.Mesh; tex: THREE.Texture; last: number }

export function EarthTiles({ radius, tileCache, makeMat }: { radius: number; tileCache: number; makeMat: (tex: THREE.Texture) => THREE.ShaderMaterial }) {
  const gl = useThree((s) => s.gl)
  const group = useRef<THREE.Group>(null)
  const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy())
  const store = useMemo(() => new TileStore<THREE.Texture>(sources(), (url) => new Promise((res, rej) => {
    const im = new Image(); im.crossOrigin = 'anonymous'
    im.onload = () => {
      const t = new THREE.Texture(im)
      t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
      t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = aniso; t.needsUpdate = true
      res(t)
    }
    im.onerror = () => rej(new Error('tile'))
    im.src = url
  }), (t) => t.dispose(), { max: tileCache }), [tileCache, aniso])
  const st = useMemo(() => ({ drawn: new Map<string, Drawn>(), acc: 1, ver: -1, cam: new THREE.Vector3(), v: new THREE.Vector3(), mat: new THREE.Matrix4(), inv: new THREE.Matrix4(), fr: new THREE.Frustum(), sph: new THREE.Sphere(), el: null as HTMLDivElement | null, text: '' }), [])

  const drop = (k: string) => {
    const d = st.drawn.get(k); if (!d) return
    d.mesh.removeFromParent(); d.mesh.geometry.dispose(); (d.mesh.material as THREE.Material).dispose(); st.drawn.delete(k)
  }
  useEffect(() => () => {
    for (const k of [...st.drawn.keys()]) drop(k)
    store.clear()
    st.el?.remove(); st.el = null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store])
  // new material builder (settings changed): rebuild what is drawn
  useEffect(() => { for (const k of [...st.drawn.keys()]) drop(k); st.ver = -1 // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [makeMat])

  useFrame(({ camera, clock }, dt) => {
    const g = group.current, src = store.active
    if (!g) return
    if (import.meta.env.DEV) Object.assign(window, { __earth: { camera, group: g, store } }) // dev only: scripted camera for screenshots
    st.acc += dt
    if (st.acc < 0.1 && st.ver === store.version) return
    st.acc = 0; st.ver = store.version
    const pc = camera as THREE.PerspectiveCamera
    if (!pc.isPerspectiveCamera) return
    g.updateWorldMatrix(true, false)
    st.inv.copy(g.matrixWorld).invert()
    st.cam.copy(camera.position).applyMatrix4(st.inv)
    st.fr.setFromProjectionMatrix(st.mat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(g.matrixWorld))
    const wanted = src
      ? selectTiles({
        cam: [st.cam.x, st.cam.y, st.cam.z], pixelRad: (2 * Math.tan((pc.fov * Math.PI) / 360)) / gl.domElement.height, minZ: MIN_Z, maxZ: src.maxZ, maxTexelPx: TEXEL_PX,
        inFrustum: (c, r) => st.fr.intersectsSphere(st.sph.set(st.v.set(c[0], c[1], c[2]), r)),
      }).slice(0, MAX_WANTED)
      : []

    // per wanted tile: what to draw now (itself or the nearest loaded ancestor) and what to fetch (itself; coarser levels first when nothing stands in yet)
    const draw = new Map<string, TileId>(), keep = new Set<string>(), req: TileId[] = [], seen = new Set<string>()
    const ask = (t: TileId) => { const k = tileKey(t.z, t.x, t.y); if (!seen.has(k)) { seen.add(k); req.push(t) } }
    for (const t of wanted) {
      const chain: TileId[] = []
      for (let a: TileId | null = t; a && a.z >= MIN_Z; a = parentOf(a)) { chain.push(a); keep.add(tileKey(a.z, a.x, a.y)) }
      const have = chain.find((a) => store.get(a.z, a.x, a.y))
      if (have) draw.set(tileKey(have.z, have.x, have.y), have)
      if (!have || have !== t) { // coarser placeholders first, at most three levels up
        if (!have || chain.indexOf(have) > 1) for (const a of chain.slice(1, 4).reverse()) ask(a)
        ask(t)
      }
    }
    store.request(req, keep)
    if (import.meta.env.DEV) Object.assign((window as unknown as { __earth: object }).__earth, { wantedZ: Math.max(0, ...wanted.map((t) => t.z)), nWanted: wanted.length, nReq: req.length })

    const now = clock.elapsedTime
    for (const [k, t] of draw) {
      const tex = store.get(t.z, t.x, t.y)!
      let d = st.drawn.get(k)
      if (d && d.tex !== tex) { drop(k); d = undefined }
      if (!d) {
        const gr = tileGrid(t, t.z < 8 ? 8 : t.z < 11 ? 4 : 2), geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(gr.pos, 3)).setAttribute('normal', new THREE.BufferAttribute(gr.pos, 3)).setAttribute('uv', new THREE.BufferAttribute(gr.uv, 2)).setAttribute('tuv', new THREE.BufferAttribute(gr.tuv, 2))
        geo.setIndex(new THREE.BufferAttribute(gr.index, 1))
        const mesh = new THREE.Mesh(geo, makeMat(tex))
        mesh.scale.setScalar(1 + LIFT + LIFT_Z * t.z)
        g.add(mesh)
        st.drawn.set(k, (d = { mesh, tex, last: now }))
      }
      d.mesh.visible = true; d.last = now
    }
    for (const [k, d] of st.drawn) {
      if (draw.has(k)) continue
      d.mesh.visible = false
      if (now - d.last > 3) drop(k)
    }
    // attribution is shown while detail imagery is on screen
    const text = draw.size && src ? `${src.attribution} · ${src.licence}` : ''
    if (text !== st.text) {
      st.text = text
      if (text && !st.el) {
        const el = document.createElement('div')
        el.style.cssText = 'position:fixed;left:6px;bottom:2px;z-index:5;max-width:70vw;font:9px/1.2 system-ui,sans-serif;color:rgba(255,255,255,.55);pointer-events:none;text-shadow:0 0 3px #000'
        document.body.appendChild(el); st.el = el
      }
      if (st.el) st.el.textContent = text
    }
  })

  return <group ref={group} scale={radius} />
}

/**
 * Zooming scales the altitude instead of the distance to the Earth's centre (like a map app), so the last kilometres are reachable;
 * turning slows down with altitude; the camera stops ~200 m above the ground. Runs after the orbit controls' own update.
 */
export function useSurfaceZoom(R: number) {
  const controls = useThree((s) => s.controls) as (THREE.EventDispatcher & { minDistance: number; rotateSpeed: number }) | null
  const prev = useRef(0)
  const MIN_ALT = R * 3e-5
  useEffect(() => {
    if (!controls) return
    const { minDistance, rotateSpeed } = controls
    controls.minDistance = R + MIN_ALT
    return () => { controls.minDistance = minDistance; controls.rotateSpeed = rotateSpeed }
  }, [controls, R, MIN_ALT])
  useFrame(({ camera }) => {
    if (!controls) return
    let d = camera.position.length()
    const p = prev.current
    if (p > 0 && p < 3 * R && d < 3 * R && p > R && Math.abs(d / p - 1) > 1e-6) {
      d = R + Math.max(MIN_ALT, (p - R) * (d / p))
      camera.position.setLength(d)
    }
    prev.current = d
    controls.rotateSpeed = Math.min(1, Math.max(0.03, ((d - R) / R) * 1.2))
  })
}
