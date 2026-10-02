import type { Tab } from './ui-store.ts'

export interface TourStep {
  title: string
  text: string
  /** CSS selector of the element to spotlight (the first one that is visible); none = centred card */
  target?: string
  /** Show this tab (and open the drawer on a phone) while the step is on screen */
  tab?: Tab
  sheet?: 'closed' | 'half'
}

export const TOUR: TourStep[] = [
  { title: 'Het zonnestelsel', text: 'Dit is een echt, draaiend zonnestelsel. Sleep om te draaien, knijp om te zoomen en tik op een planeet om erheen te vliegen.', sheet: 'closed' },
  { title: 'Weergaven', text: 'Wissel tussen het hele zonnestelsel, alleen de Aarde, Aarde–Maan, een planeet met manen en de Melkweg.', target: '[data-tour=views]', sheet: 'closed' },
  { title: 'Tijd', text: 'Speel de tijd af, spoel terug of versnel van seconden tot jaren. Tik op de datum om een startdatum te kiezen.', target: '[data-tour=dock]', sheet: 'closed' },
  { title: 'Missie ontwerpen', text: 'Kies een bestemming en een datum. Periapsis zoekt de zuinigste route, ook langs andere planeten (gravity assists), en laat de Δv zien.', target: '[data-tour=nav-mission]', tab: 'mission', sheet: 'half' },
  { title: 'Aardbaan', text: 'Plan een baan om de Aarde: kies een lanceerbasis en hoogte en zie direct de Δv, de inclinatie en hoe lang de satelliet blijft hangen.', target: '[data-tour=nav-earth]', tab: 'earth', sheet: 'half' },
  { title: 'Rekenen en meer', text: 'Bij Rekenen vind je losse calculators. Onder Meer staan planeetstelsels, Lagrangepunten, de Melkweg en alle formules met bronnen.', target: '[data-tour=nav-more]', tab: 'more', sheet: 'half' },
  { title: 'Instellingen en updates', text: 'Hier zet je labels, schaal en tempo naar wens en haal je met één tik de nieuwste versie van de app.', target: '[data-tour=settings]', tab: 'mission', sheet: 'closed' },
]

export const clampStep = (i: number) => Math.min(TOUR.length - 1, Math.max(0, i))
