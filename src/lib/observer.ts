// The observer's place on Earth, shared by the Satellites (passes) and Tonight (sky) worlds. Persisted; GPS is optional.
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import { createStore } from './mini-store.ts'

const KEY = 'periapsis.observer.v1'
export interface Observer { lat: number; lon: number; altM: number; name: string; fromGps: boolean }
const DEFAULT: Observer = { lat: 52.09, lon: 5.12, altM: 0, name: 'Utrecht', fromGps: false } // until the user picks a place

function load(): Observer {
  try {
    const o = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null')
    if (o && Number.isFinite(o.lat) && Number.isFinite(o.lon) && Math.abs(o.lat) <= 90 && Math.abs(o.lon) <= 180)
      return { lat: o.lat, lon: o.lon, altM: Number.isFinite(o.altM) ? o.altM : 0, name: typeof o.name === 'string' ? o.name : '', fromGps: !!o.fromGps }
  } catch { /* ignore */ }
  return DEFAULT
}
export const observer = createStore<Observer>(load())
export const useObserver = observer.useStore
export function setObserver(o: Partial<Observer>) {
  observer.set(o)
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(observer.get())) } catch { /* ignore */ }
}

/** Ask the phone for its position (permission prompt on first use). Resolves false when refused or unavailable. */
export async function locate(): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      const perm = await Geolocation.requestPermissions({ permissions: ['coarseLocation'] })
      if (perm.coarseLocation !== 'granted' && perm.location !== 'granted') return false
      const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 15000 })
      setObserver({ lat: p.coords.latitude, lon: p.coords.longitude, altM: p.coords.altitude ?? 0, name: '', fromGps: true })
      return true
    }
    const p = await new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 15000 }))
    setObserver({ lat: p.coords.latitude, lon: p.coords.longitude, altM: p.coords.altitude ?? 0, name: '', fromGps: true })
    return true
  } catch {
    return false
  }
}
