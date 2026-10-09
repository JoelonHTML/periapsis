// AR camera passthrough: the rear camera as a <video> behind the sky canvas, plus the field-of-view model that makes the overlay line up.
// The web has no FOV API, so the FOV is ESTIMATED: a typical main phone camera (~26 mm full-frame equivalent, 4:3 sensor) sees about
// 67 deg along the long side of the picture; a 16:9 stream is a crop of the short side. A user-tuned factor ("Calibrate FOV") scales it.
export type CamStatus = 'off' | 'on' | 'denied' | 'none'

export const FOV_CAL_KEY = 'periapsis.skyview.fovcal.v1'
export const FOV_CAL_MIN = 0.6, FOV_CAL_MAX = 1.5
/** tan(half the long-side FOV) of a 26 mm-equivalent camera: half the 43.27 mm full-frame diagonal is 21.63 mm, times the long-side share (0.8 for 4:3). */
export const BASE_TAN_HALF_LONG = (21.634 / 26) * 0.8

export function loadFovCal(): number {
  try { const v = Number(globalThis.localStorage?.getItem(FOV_CAL_KEY)); return v >= FOV_CAL_MIN && v <= FOV_CAL_MAX ? v : 1 } catch { return 1 }
}
export function saveFovCal(v: number) { try { globalThis.localStorage?.setItem(FOV_CAL_KEY, String(v)) } catch { /* ignore */ } }

/** Pinhole model of the on-screen picture. (vw, vh) = video frame size, (W, H) = the element it covers (object-fit: cover: scaled until it
 *  fills, the overflow is cropped evenly), cal = calibration factor on tan(FOV/2). k = focal length in screen px (the principal point is the
 *  centre of the element), fovH / fovV = what the SCREEN shows, in degrees. */
export function cameraModel(vw: number, vh: number, W: number, H: number, cal = 1) {
  const s = Math.max(W / vw, H / vh), T = BASE_TAN_HALF_LONG * cal
  const k = (Math.max(vw, vh) * s) / (2 * T)
  const deg = (px: number) => (2 * Math.atan(px / 2 / k) * 180) / Math.PI
  return { k, fovH: deg(W), fovV: deg(H), fovLong: deg(Math.max(vw, vh) * s) }
}

let stream: MediaStream | null = null, token = 0

/** Open the rear camera into `video`. Resolves 'on', 'denied' (permission / policy) or 'none' (no camera, no API). Never throws. */
export async function startCamera(video: HTMLVideoElement): Promise<CamStatus> {
  const my = ++token
  stopCamera(video, false)
  const md = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices
  if (!md?.getUserMedia) return 'none'
  try {
    const s = await md.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
    if (my !== token) { s.getTracks().forEach((x) => x.stop()); return 'off' } // stopped while the permission prompt was open
    stream = s
    video.srcObject = s
    await video.play().catch(() => {})
    return 'on'
  } catch (e) {
    const n = (e as DOMException)?.name
    return n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError' ? 'denied' : 'none'
  }
}

/** Release the camera (the green dot goes out). */
export function stopCamera(video?: HTMLVideoElement | null, bump = true) {
  if (bump) token++
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  if (video) video.srcObject = null
}
