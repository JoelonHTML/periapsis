import { createStore } from '../../lib/mini-store.ts'

/** Selected mission (id from data.ts) or null for the list. Shared by the panel and the 3D layer. */
export const missionsUi = createStore<{ selected: string | null }>({ selected: null })
