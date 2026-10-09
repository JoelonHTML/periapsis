// GLSL for the Earth: ground (day map + night lights + relief + ocean glint + terminator), cloud shell, atmosphere shell.
// All shading is in world space with one sun-direction uniform (the real Sun, same direction the scene's SunLight uses).
// The shaders include three's logarithmic-depth chunks because the scene renders with logarithmicDepthBuffer.

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
varying vec3 vN;
varying vec3 vP;
#ifdef TILE
attribute vec2 tuv;   // the tile's own texture coordinates (Web Mercator); uv stays the global equirect one for the shared maps
varying vec2 vTuv;
#endif
void main() {
  vUv = uv;
  #ifdef TILE
    vTuv = tuv;
  #endif
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`

const FRAG_HEAD = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec2 vUv;
varying vec3 vN;
varying vec3 vP;
uniform vec3 uSun;
`

const FRAG_TAIL = /* glsl */ `
  #if defined( TONE_MAPPING )
    gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
  #endif
  gl_FragColor = linearToOutputTexel( gl_FragColor );
}
`

/** R = elevation, G = land/ice (roughness: 0 over open water), B = cloud cover. */
export const GROUND_FRAG = FRAG_HEAD + /* glsl */ `
uniform sampler2D uDay;
#ifdef TILE
uniform sampler2D uTile;
varying vec2 vTuv;
#endif
uniform sampler2D uNight;
uniform sampler2D uData;
uniform vec3 uNorth;
uniform float uReliefK;   // metres-of-relief to world units (already exaggerated)
uniform float uCloudU;    // longitude offset of the cloud shell, in texture u
uniform float uClouds;    // 1 when the cloud layer is shown (also gates the glint)
uniform float uLights;    // 1 when city lights are shown
uniform float uShadowH;   // cloud height / radius for shadows (0 = no shadows)

float cloudAt(vec2 uv) { return smoothstep(0.18, 0.95, texture2D(uData, uv).b); }

void main() {
  #include <logdepthbuf_fragment>
  vec3 Ng = normalize(vN);
  vec3 V = normalize(cameraPosition - vP);
  vec3 L = normalize(uSun);
  vec4 data = texture2D(uData, vUv);
  #ifdef TILE
    vec3 day = texture2D(uTile, vTuv).rgb;
  #else
    vec3 day = texture2D(uDay, vUv).rgb;
  #endif

  vec3 N = Ng;
  #ifdef RELIEF
    vec3 sS = dFdx(vP), sT = dFdy(vP);
    vec3 R1 = cross(sT, Ng), R2 = cross(Ng, sS);
    float det = dot(sS, R1);
    // blurred height (mip bias) and land only: the JPEG noise of the 8-bit height map must not become speckle on water
    vec2 hg = texture2D(uData, vUv, 2.5).rg;
    float hb = hg.r * smoothstep(0.05, 0.25, hg.g);
    vec3 gr = sign(det) * (dFdx(hb) * R1 + dFdy(hb) * R2);
    vec3 pert = uReliefK * gr;
    pert *= min(1.0, 0.45 * abs(det) / max(length(pert), 1e-12));
    N = normalize(abs(det) * Ng - pert);
  #endif

  float ndlG = dot(Ng, L);
  float ndl = dot(N, L);
  // soft terminator: finite solar disc and atmospheric scattering, so the light fades over several degrees
  float dif = clamp((ndl + 0.06) / 1.06, 0.0, 1.0);
  dif = dif * (1.6 - 0.6 * dif);
  dif *= smoothstep(-0.10, 0.12, ndlG);

  float cl = uClouds * cloudAt(vUv - vec2(uCloudU, 0.0));
  float shade = 0.0;
  if (uShadowH > 0.0 && uClouds > 0.5) {
    float sinLat = dot(Ng, uNorth);
    vec3 east = normalize(cross(uNorth, Ng) + vec3(1e-6));
    vec3 north = cross(Ng, east);
    vec3 Lt = L - Ng * ndlG;
    float k = uShadowH / max(ndlG, 0.12);
    vec2 d = vec2(dot(-Lt, east) / max(sqrt(1.0 - sinLat * sinLat), 0.15), dot(-Lt, north)) * k / vec2(6.2831853, 3.1415927);
    shade = cloudAt(vUv + d - vec2(uCloudU, 0.0)) * 0.42;
  }

  vec3 col = day * (0.035 + 0.98 * dif) * (1.0 - shade);

  // ocean sun glint (open water only, hidden under clouds)
  float water = 1.0 - smoothstep(0.04, 0.22, data.g);
  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.0);
  float glint = (pow(nh, 420.0) * 0.55 + pow(nh, 60.0) * 0.02) * water * (1.0 - cl) * smoothstep(0.0, 0.2, ndlG);
  col += vec3(1.0, 0.93, 0.8) * glint;

  // thin warm twilight band + bluish limb haze on the lit side
  float tw = exp(-pow(ndlG / 0.085, 2.0));
  col += vec3(1.0, 0.42, 0.14) * tw * (0.06 + 0.5 * dot(day, vec3(0.33))) * 0.55;
  float fr = pow(1.0 - max(dot(Ng, V), 0.0), 3.2);
  col += vec3(0.22, 0.48, 1.0) * fr * 0.42 * smoothstep(-0.25, 0.5, ndlG);

  // city lights: only where it is night, dimmed under clouds
  float nightF = 1.0 - smoothstep(-0.14, 0.05, ndlG);
  vec3 lights = max(texture2D(uNight, vUv).rgb - 0.03, 0.0) * 1.9;
  col += lights * nightF * uLights * (1.0 - 0.8 * cl);

  gl_FragColor = vec4(col, 1.0);
` + FRAG_TAIL

export const CLOUD_FRAG = FRAG_HEAD + /* glsl */ `
uniform sampler2D uData;
uniform float uFade; // 0 when the camera is close above the surface (clouds would hide the detail tiles)
void main() {
  #include <logdepthbuf_fragment>
  vec3 Ng = normalize(vN);
  vec3 L = normalize(uSun);
  float c = uFade * smoothstep(0.18, 0.95, texture2D(uData, vUv).b);
  float ndl = dot(Ng, L);
  float dif = clamp((ndl + 0.08) / 1.08, 0.0, 1.0);
  dif = dif * (1.5 - 0.5 * dif);
  vec3 warm = mix(vec3(1.0, 0.55, 0.32), vec3(1.0), smoothstep(0.0, 0.3, ndl));
  float a = c * 0.94 * smoothstep(-0.12, 0.10, ndl);
  gl_FragColor = vec4(vec3(0.97, 0.98, 1.0) * warm * (0.03 + 1.0 * dif), a);
` + FRAG_TAIL

/** Back-face shell: glow peaks at the planet's limb and fades to the shell's edge; brighter on the sun side, warm at the terminator. */
export const ATMO_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vN;
varying vec3 vP;
varying vec3 vC;
void main() {
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  vC = modelMatrix[3].xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`
export const ATMO_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vN;
varying vec3 vP;
varying vec3 vC;
uniform vec3 uSun;
uniform float uShell; // shell radius / planet radius
void main() {
  #include <logdepthbuf_fragment>
  vec3 V = normalize(cameraPosition - vP);
  vec3 N = normalize(vN);
  float a = clamp(-dot(N, V), 0.0, 1.0);
  float aMax = sqrt(1.0 - 1.0 / (uShell * uShell));
  float g = pow(clamp(a / aMax, 0.0, 1.0), 2.2);
  float sd = dot(normalize(vP - vC), normalize(uSun));
  float sunF = smoothstep(-0.30, 0.45, sd);
  float tw = exp(-pow(sd / 0.22, 2.0));
  vec3 col = mix(vec3(0.20, 0.45, 1.0), vec3(0.45, 0.72, 1.0), smoothstep(0.0, 0.8, sd));
  col = mix(col, vec3(1.0, 0.45, 0.18), tw * 0.55);
  float I = g * (0.03 + 0.97 * sunF) * 0.62;
  gl_FragColor = vec4(col * I, I);
  #if defined( TONE_MAPPING )
    gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
  #endif
  gl_FragColor = linearToOutputTexel( gl_FragColor );
}
`

export const EARTH_VERT = VERT
