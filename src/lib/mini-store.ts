import { useSyncExternalStore } from 'react'

/** Tiny external store with a React hook; use it for feature-local state (no provider needed). */
export function createStore<T extends object>(initial: T) {
  let state = initial
  const listeners = new Set<() => void>()
  const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
  return {
    get: () => state,
    set(patch: Partial<T> | ((s: T) => Partial<T>)) {
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
      listeners.forEach((l) => l())
    },
    subscribe,
    /** React hook: re-renders when the selected slice changes (compare by Object.is, so select primitives or stable refs). */
    useStore: <S,>(sel: (s: T) => S): S => useSyncExternalStore(subscribe, () => sel(state)),
  }
}
