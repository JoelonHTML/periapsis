// Ring system: a flat annulus in the planet's equatorial plane, shaded by a small shader that
//  - casts the planet's shadow onto the rings (Sun direction in planet-frame coordinates),
//  - dims the rings when the camera and the Sun are on opposite sides of the ring plane (only transmitted light),
//  - uses a radial colour/alpha strip (C/B/A rings, Cassini division, Encke gap for Saturn).
// The log-depth chunks keep depth testing consistent with the other (standard) materials of the scene.
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { clock } from '@/lib/store'
import { fromEcl, sunDir, type Frame, type RingDef, type SysId } from '@/lib/system'
import { EARLY } from '../kit'
import { ringTexture } from './textures'

const S = 1e-3
const vert = /* glsl */ `
varying vec2 vUv; varying vec3 vLocal;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vUv = uv; vLocal = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`
const frag = /* glsl */ `
uniform sampler2D map; uniform vec3 sunDir; uniform vec3 camLocal; uniform float R; uniform float opacity;
varying vec2 vUv; varying vec3 vLocal;
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec4 c = texture2D(map, vec2(vUv.x, 0.5));
  float tca = dot(vLocal, sunDir);
  float shade = 1.0;
  if (tca < 0.0) shade = smoothstep(R * R * 0.97, R * R * 1.03, dot(vLocal, vLocal) - tca * tca);
  float lit = (camLocal.z * sunDir.z >= 0.0) ? 1.0 : 0.4;
  gl_FragColor = vec4(c.rgb * 0.85 * lit * (0.05 + 0.95 * shade), c.a * opacity * (lit < 1.0 ? 0.85 : 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

function ringGeometry(rIn: number, rOut: number, seg = 256) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = []
  for (let k = 0; k <= seg; k++) {
    const a = (k / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a)
    pos.push(rIn * c, rIn * s, 0, rOut * c, rOut * s, 0)
    uv.push(0, 0.5, 1, 0.5)
    if (k < seg) { const i = k * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2) }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

/** Must be placed inside the planet-frame group (equatorial plane = local xy). */
export function Rings({ id, def, frame, R }: { id: SysId; def: RingDef; frame: Frame; R: number }) {
  const mesh = useRef<THREE.Mesh>(null)
  const geo = useMemo(() => ringGeometry(def.rIn * S, def.rOut * S), [def])
  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      map: { value: ringTexture(def.kind, def.rIn, def.rOut) }, sunDir: { value: new THREE.Vector3(1, 0, 0) },
      camLocal: { value: new THREE.Vector3(0, 0, 1) }, R: { value: R * S }, opacity: { value: def.opacity },
    },
    vertexShader: vert, fragmentShader: frag, transparent: true, side: THREE.DoubleSide, depthWrite: false,
  }), [def, R])
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera }) => {
    const sd = fromEcl(frame, sunDir(id, clock.t))
    mat.uniforms.sunDir.value.set(sd[0], sd[1], sd[2])
    if (mesh.current) mat.uniforms.camLocal.value.copy(mesh.current.worldToLocal(tmp.copy(camera.position)))
  }, EARLY)
  return <mesh ref={mesh} geometry={geo} material={mat} renderOrder={1} frustumCulled={false} />
}
