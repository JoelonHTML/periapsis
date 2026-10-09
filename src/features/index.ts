// Feature registry: every tab that is not part of the original shell lives in its own folder under src/features/<name>/
// and is wired in here (panel per tab, optional 3D layer per view). Keep each feature self-contained.
import type { ComponentType } from 'react'
import type { View } from '@/lib/store'
import type { Tab } from '@/lib/ui-store'
import { SatsPanel, PassesPanel } from './satellites/Panel'
import { SatsSceneLayer } from './satellites/SceneLayer'
import { TonightPanel, EventsPanel } from './tonight/Panel'
import { BodiesPanel } from './bodies/Panel'
import { MissionsPanel } from './missions/Panel'
import { MissionsSceneLayer } from './missions/SceneLayer'
import { BurnsPanel } from './burns/Panel'
import { LivePanel } from './live/Panel'
import { CatalogPanel } from './catalog/Panel'
import { CatalogSceneLayer } from './catalog/SceneLayer'
import { SkyviewPanel } from './skyview/Panel'

export const FEATURE_PANELS: Partial<Record<Tab, ComponentType>> = {
  sats: SatsPanel, passes: PassesPanel, tonight: TonightPanel, events: EventsPanel, bodies: BodiesPanel, missions: MissionsPanel, burns: BurnsPanel, live: LivePanel, catalog: CatalogPanel, skyview: SkyviewPanel,
}
/** Extra three.js content per view, rendered inside the r3f Canvas (Scene.tsx). */
export const FEATURE_SCENE_LAYERS: ComponentType<{ view: View }>[] = [SatsSceneLayer, MissionsSceneLayer, CatalogSceneLayer]
