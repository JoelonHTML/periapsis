// The detailed Earth: ground (day/night/relief/glint), cloud shell and atmosphere. Radius in scene units (mesh scale), centred on the parent group.
// The caller says where the Sun is (world space) and rotates the parent group; nothing here allocates per frame.
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { clock } from '@/lib/store'
import { configFor } from './caps'
import { EarthTiles } from './EarthTiles'
import { earthSettings } from './settings'
import { detailEnabled } from './tiles'
import { ATMO_FRAG, ATMO_VERT, CLOUD_FRAG, EARTH_VERT, GROUND_FRAG } from './shaders'
import { effectiveLayers, type Layers, type TierConfig } from './tier'
import { acquireEarthMaps, type EarthMaps } from './textures'

const CLOUD_R = 1.006 // cloud shell radius / planet radius (exaggerated: ~40 km)
const ATMO_R = 1.06
const CLOUD_DRIFT = (1.2 * Math.PI) / 180 / 3600 // rad of eastward drift against the surface per simulated second (~1.2°/h)
const RELIEF = 0.0068 // relief height as a fraction of the radius for height 1 (Everest is 0.0014; ~5x, subtle)

/** Tier configuration + the layer switches that apply right now (tier defaults overridden by the user's choices). */
export function useEarthConfig(): { cfg: TierConfig; layers: Layers } {
  const quality = earthSettings.useStore((s) => s.quality)
  const custom = earthSettings.useStore((s) => s.custom)
  const cfg = useMemo(() => configFor(quality), [quality])
  const layers = useMemo(() => effectiveLayers(cfg, custom), [cfg, custom])
  return { cfg, layers }
}

export function EarthBody({ radius = 1, sunDir }: { radius?: number; sunDir: (out: THREE.Vector3) => THREE.Vector3 }) {
  const { cfg, layers } = useEarthConfig()
  const gl = useThree((s) => s.gl)
  const [maps, setMaps] = useState<EarthMaps | null>(null)
  useEffect(() => {
    const h = acquireEarthMaps({ day: cfg.dayTex, night: cfg.nightTex, data: cfg.dataTex }, Math.min(16, gl.capabilities.getMaxAnisotropy()))
    let alive = true
    h.promise.then((m) => { if (alive) setMaps(m) }, () => {})
    return () => { alive = false; h.release() }
  }, [cfg.dayTex, cfg.nightTex, cfg.dataTex, gl])

  const sun = useMemo(() => ({ value: new THREE.Vector3(1, 0, 0) }), [])
  const north = useMemo(() => ({ value: new THREE.Vector3(0, 1, 0) }), [])
  const cloudU = useMemo(() => ({ value: 0 }), [])
  const clouds = useMemo(() => ({ value: 1 }), [])
  const lights = useMemo(() => ({ value: 1 }), [])
  useEffect(() => { lights.value = layers.nightLights ? 1 : 0 }, [lights, layers.nightLights])

  const detailMode = earthSettings.useStore((s) => s.detail)
  const detail = detailEnabled(detailMode, cfg.tier === 'low', !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData)
  const fade = useMemo(() => ({ value: 1 }), [])
  const cloudsOn = useRef(true)
  cloudsOn.current = layers.clouds

  const ground = useMemo(() => {
    if (!maps) return null
    return new THREE.ShaderMaterial({
      uniforms: {
        uSun: sun, uNorth: north, uCloudU: cloudU, uClouds: clouds, uLights: lights,
        uDay: { value: maps.day }, uNight: { value: maps.night }, uData: { value: maps.data },
        uReliefK: { value: RELIEF * radius }, uShadowH: { value: cfg.cloudShadow ? CLOUD_R - 1 : 0 },
      },
      defines: cfg.relief ? { RELIEF: '' } : {},
      vertexShader: EARTH_VERT, fragmentShader: GROUND_FRAG,
    })
  }, [maps, cfg.relief, cfg.cloudShadow, radius, sun, north, cloudU, clouds, lights])
  const cloudMat = useMemo(() => {
    if (!maps) return null
    return new THREE.ShaderMaterial({
      uniforms: { uSun: sun, uData: { value: maps.data }, uFade: fade },
      vertexShader: EARTH_VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false,
    })
  }, [maps, sun, fade])
  // detail tiles: the same ground shader with the tile's own texture (shares every uniform with the bundled globe)
  const makeTileMat = useMemo(() => {
    if (!ground) return null
    return (tex: THREE.Texture) => new THREE.ShaderMaterial({
      uniforms: { ...ground.uniforms, uTile: { value: tex } }, defines: { ...ground.defines, TILE: '' },
      vertexShader: EARTH_VERT, fragmentShader: GROUND_FRAG,
    })
  }, [ground])
  const atmoMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uSun: sun, uShell: { value: ATMO_R } },
    vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
  }), [sun])
  useEffect(() => () => { ground?.dispose() }, [ground])
  useEffect(() => () => { cloudMat?.dispose() }, [cloudMat])
  useEffect(() => () => { atmoMat.dispose() }, [atmoMat])

  const groundRef = useRef<THREE.Mesh>(null), cloudRef = useRef<THREE.Mesh>(null)
  // priority 0: runs after the callers' EARLY (-1) frame callbacks that set the globe's rotation
  const wp = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera }) => {
    sunDir(sun.value).normalize()
    const m = groundRef.current
    if (m) {
      m.updateWorldMatrix(true, false)
      const e = m.matrixWorld.elements
      north.value.set(e[4], e[5], e[6]).normalize()
    }
    const a = (clock.t * CLOUD_DRIFT) % (2 * Math.PI)
    if (cloudRef.current) cloudRef.current.rotation.y = a
    cloudU.value = a / (2 * Math.PI)
    // clouds fade out when the camera drops below ~300 km so they do not hide the detail imagery
    if (m) fade.value = Math.min(1, Math.max(0, (camera.position.distanceTo(m.getWorldPosition(wp)) / radius - 1.012) / 0.05))
    clouds.value = cloudsOn.current ? fade.value : 0
    if (cloudRef.current) cloudRef.current.visible = fade.value > 0.001
  })

  return (
    <>
      <mesh ref={groundRef} scale={radius}>
        <sphereGeometry args={[1, cfg.segments[0], cfg.segments[1]]} />
        {ground ? <primitive object={ground} attach="material" /> : <meshStandardMaterial color="#2b5fb3" roughness={1} />}
      </mesh>
      {detail && makeTileMat && <EarthTiles radius={radius} tileCache={cfg.tileCache} makeMat={makeTileMat} />}
      {layers.clouds && cloudMat && (
        <mesh ref={cloudRef} scale={radius * CLOUD_R} renderOrder={1}>
          <sphereGeometry args={[1, cfg.segments[0], cfg.segments[1]]} />
          <primitive object={cloudMat} attach="material" />
        </mesh>
      )}
      {layers.atmosphere && (
        <mesh scale={radius * ATMO_R} renderOrder={2}>
          <sphereGeometry args={[1, 64, 32]} />
          <primitive object={atmoMat} attach="material" />
        </mesh>
      )}
    </>
  )
}
