import type { Tab } from './ui-store.ts'

/** Tour steps; the texts live in i18n.ts as tour.<index>.t / tour.<index>.x. */
export interface TourStep {
  /** CSS selector of the element to spotlight (the first one that is visible); none = centred card */
  target?: string
  /** Show this tab (and open the drawer on a phone) while the step is on screen */
  tab?: Tab
  sheet?: 'closed' | 'half'
}

export const TOUR: TourStep[] = [
  { sheet: 'closed' },
  { target: '[data-tour=views]', sheet: 'closed' },
  { target: '[data-tour=dock]', sheet: 'closed' },
  { target: '[data-tour=nav-mission]', tab: 'mission', sheet: 'half' },
  { target: '[data-tour=nav-earth]', tab: 'earth', sheet: 'half' },
  { target: '[data-tour=nav-more]', tab: 'more', sheet: 'half' },
  { target: '[data-tour=settings]', tab: 'mission', sheet: 'closed' },
]

export const clampStep = (i: number) => Math.min(TOUR.length - 1, Math.max(0, i))
