// Texts for the home-screen widgets: `LABELS` go to the native side inside the snapshot, `UI` are the settings-sheet strings (keys 'wid.*').
export type L = 'nl' | 'en' | 'el'

export const LABELS: Record<L, Record<string, string>> = {
  nl: {
    tonight: 'Vanavond', planets: 'Planeten', none: 'Geen planeten zichtbaar', moon: 'Maan', sunrise: 'Zonsopkomst', sunset: 'Zonsondergang', dusk: 'Donker vanaf', dawn: 'Schemering vanaf',
    next_event: 'Eerstvolgende', iss: 'ISS-overkomst', launch: 'Lancering', kp: 'Kp-index', no_data: 'Open Periapsis om te verversen', updated: 'Bijgewerkt', visible_from: 'Zichtbaar vanaf', until: 'tot',
    eye: 'Blote oog', binoculars: 'Verrekijker', telescope: 'Telescoop',
    phase0: 'Nieuwe maan', phase1: 'Wassende sikkel', phase2: 'Eerste kwartier', phase3: 'Wassende maan', phase4: 'Volle maan', phase5: 'Afnemende maan', phase6: 'Laatste kwartier', phase7: 'Afnemende sikkel',
  },
  en: {
    tonight: 'Tonight', planets: 'Planets', none: 'No planets visible', moon: 'Moon', sunrise: 'Sunrise', sunset: 'Sunset', dusk: 'Dark from', dawn: 'Twilight from',
    next_event: 'Next up', iss: 'ISS pass', launch: 'Launch', kp: 'Kp index', no_data: 'Open Periapsis to refresh', updated: 'Updated', visible_from: 'Visible from', until: 'until',
    eye: 'Naked eye', binoculars: 'Binoculars', telescope: 'Telescope',
    phase0: 'New Moon', phase1: 'Waxing crescent', phase2: 'First quarter', phase3: 'Waxing gibbous', phase4: 'Full Moon', phase5: 'Waning gibbous', phase6: 'Last quarter', phase7: 'Waning crescent',
  },
  el: {
    tonight: 'Απόψε', planets: 'Πλανήτες', none: 'Κανένας πλανήτης ορατός', moon: 'Σελήνη', sunrise: 'Ανατολή', sunset: 'Δύση', dusk: 'Σκοτάδι από', dawn: 'Λυκαυγές από',
    next_event: 'Επόμενο', iss: 'Διάβαση ISS', launch: 'Εκτόξευση', kp: 'Δείκτης Kp', no_data: 'Ανοίξτε το Periapsis για ανανέωση', updated: 'Ενημερώθηκε', visible_from: 'Ορατός από', until: 'έως',
    eye: 'Με γυμνό μάτι', binoculars: 'Κιάλια', telescope: 'Τηλεσκόπιο',
    phase0: 'Νέα Σελήνη', phase1: 'Αύξουσα Σελήνη', phase2: 'Πρώτο τέταρτο', phase3: 'Αύξουσα Σελήνη', phase4: 'Πανσέληνος', phase5: 'Φθίνουσα Σελήνη', phase6: 'Τελευταίο τέταρτο', phase7: 'Φθίνουσα Σελήνη',
  },
}

/** Kp wording (also in the snapshot's kp.label). */
export const KP: Record<L, { calm: string; active: string; storm: string }> = {
  nl: { calm: 'Rustig', active: 'Onrustig', storm: 'Storm G{n}' },
  en: { calm: 'Calm', active: 'Unsettled', storm: 'Storm G{n}' },
  el: { calm: 'Ήρεμο', active: 'Ταραγμένο', storm: 'Καταιγίδα G{n}' },
}

export const UI: Record<L, Record<string, string>> = {
  nl: {
    'wid.title': 'Widgets', 'wid.opacity': 'Achtergrond-doorzichtigheid', 'wid.refresh': 'Nu verversen', 'wid.refreshed': 'Widgets bijgewerkt.', 'wid.add': 'Toevoegen aan startscherm',
    'wid.hint': 'Houd het startscherm ingedrukt, kies Widgets en zoek Periapsis.', 'wid.web': 'Widgets zijn er alleen in de Android-app.',
    'wid.k.planets': 'Planeten', 'wid.k.moon': 'Maan', 'wid.k.sun': 'Zon', 'wid.k.tonight': 'Vanavond (alles in één)', 'wid.k.events': 'Hemelgebeurtenissen', 'wid.k.iss': 'ISS-overkomsten', 'wid.k.launch': 'Volgende lancering', 'wid.k.kp': 'Kp / noorderlicht',
  },
  en: {
    'wid.title': 'Widgets', 'wid.opacity': 'Background opacity', 'wid.refresh': 'Refresh now', 'wid.refreshed': 'Widgets updated.', 'wid.add': 'Add to home screen',
    'wid.hint': 'Long-press the home screen, choose Widgets and find Periapsis.', 'wid.web': 'Widgets are only available in the Android app.',
    'wid.k.planets': 'Planets', 'wid.k.moon': 'Moon', 'wid.k.sun': 'Sun', 'wid.k.tonight': 'Tonight (all in one)', 'wid.k.events': 'Sky events', 'wid.k.iss': 'ISS passes', 'wid.k.launch': 'Next launch', 'wid.k.kp': 'Kp / aurora',
  },
  el: {
    'wid.title': 'Γραφικά στοιχεία', 'wid.opacity': 'Διαφάνεια φόντου', 'wid.refresh': 'Ανανέωση τώρα', 'wid.refreshed': 'Τα γραφικά στοιχεία ενημερώθηκαν.', 'wid.add': 'Προσθήκη στην αρχική οθόνη',
    'wid.hint': 'Πατήστε παρατεταμένα την αρχική οθόνη, επιλέξτε Γραφικά στοιχεία και βρείτε το Periapsis.', 'wid.web': 'Τα γραφικά στοιχεία υπάρχουν μόνο στην εφαρμογή Android.',
    'wid.k.planets': 'Πλανήτες', 'wid.k.moon': 'Σελήνη', 'wid.k.sun': 'Ήλιος', 'wid.k.tonight': 'Απόψε (όλα μαζί)', 'wid.k.events': 'Ουράνια γεγονότα', 'wid.k.iss': 'Διελεύσεις ISS', 'wid.k.launch': 'Επόμενη εκτόξευση', 'wid.k.kp': 'Kp / σέλας',
  },
}
