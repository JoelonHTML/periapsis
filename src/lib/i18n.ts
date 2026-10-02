// Interface language (Dutch / English / Greek). Covers the app shell: menus, dock, settings, updates, tour, saved missions.
// Long explanatory texts inside the calculation panels and the formula sheet are still Dutch only.
import { settings, useSettings, type Lang } from './settings.ts'

export type { Lang }
export const LANGS: { id: Lang; name: string; native: string }[] = [
  { id: 'nl', name: 'Dutch', native: 'Nederlands' },
  { id: 'en', name: 'English', native: 'English' },
  { id: 'el', name: 'Greek', native: 'Ελληνικά' },
]

const nl = {
  'views.solar': 'Zonnestelsel', 'views.earth': 'Alleen Aarde', 'views.earthmoon': 'Aarde–Maan', 'views.system': 'Planeet & manen', 'views.galaxy': 'Melkweg', 'views.flyby': 'Flyby-beeld',
  'tab.mission': 'Missie', 'tab.earth': 'Aardbaan', 'tab.system': 'Stelsel', 'tab.calc': 'Rekenen', 'tab.lagrange': 'Lagrange', 'tab.galaxy': 'Melkweg', 'tab.formulas': 'Formules', 'tab.view': 'Beeld', 'tab.more': 'Meer',
  'more.system': 'Planeten en hun manen', 'more.lagrange': 'Evenwichtspunten L1–L5', 'more.galaxy': 'De Melkweg op schaal', 'more.formulas': 'Alle vergelijkingen',
  'nav.main': 'Hoofdmenu', 'nav.settings': 'Instellingen', 'nav.hidePanel': 'Paneel verbergen', 'nav.panel': 'Paneel',
  'dock.start': 'Terug naar startdatum', 'dock.back': 'Terugspoelen', 'dock.play': 'Afspelen', 'dock.pause': 'Pauzeren', 'dock.fwd': 'Vooruitspoelen', 'dock.speed': 'Tempo', 'dock.date': 'Datum en tijd instellen',
  'speed.0': 'Realtijd', 'speed.1': '1 min/s', 'speed.2': '1 uur/s', 'speed.3': '1 dag/s', 'speed.4': '1 maand/s', 'speed.5': '1 jaar/s',
  'set.title': 'Instellingen', 'set.desc': 'Update, weergave en tempo van Periapsis', 'set.close': 'Sluiten',
  'set.labels': 'Labels tonen', 'set.labels.h': 'Namen bij planeten, manen en ruimtevaartuigen.',
  'set.scale': 'Planeetgrootte', 'set.scale.true': 'Ware schaal', 'set.scale.mag': 'Vergroot', 'set.scale.true.h': 'Op ware schaal: planeten zijn piepklein.', 'set.scale.mag.h': 'Vergroot, zodat ze goed te zien zijn.',
  'set.speed': 'Standaard tempo', 'set.speed.h': 'Waarmee de tijd start.',
  'set.motion': 'Minder animaties', 'set.motion.h': 'Geen schuif- en zweefeffecten in de menu\'s.',
  'set.haptics': 'Trillingen', 'set.haptics.h': 'Een lichte tik bij knoppen en als de lade vastklikt.',
  'set.awake': 'Scherm aan houden', 'set.awake.h': 'Het scherm gaat niet uit zolang de app open is.',
  'set.lang': 'Taal', 'set.lang.h': 'Taal van menu\'s en knoppen.',
  'set.tour': 'Rondleiding opnieuw starten', 'set.reset': 'Instellingen herstellen',
  'set.offline': 'Periapsis werkt volledig zonder internet. Alleen de update-controle heeft een verbinding nodig.',
  'set.by': 'Ontworpen & gebouwd door', 'set.rights': 'Niets uit deze app mag worden nagemaakt, gekopieerd of verspreid zonder uitdrukkelijke toestemming van de maker.',
  'upd.yours': 'Jouw versie', 'upd.newest': 'Nieuwste versie',
  'upd.idle': 'Tik om te controleren op een nieuwe versie.', 'upd.checking': 'Bezig met zoeken…', 'upd.latest': 'Je hebt de nieuwste versie', 'upd.available': 'Versie {v} beschikbaar',
  'upd.downloading': 'Update downloaden…', 'upd.restarting': 'Klaar: de app herstart…', 'upd.offline': 'Geen verbinding', 'upd.error': 'Kon de nieuwste versie niet ophalen. Probeer het later opnieuw.',
  'upd.fail.needsapk': 'Deze update past niet in de huidige app: download de APK.', 'upd.fail.bad': 'Downloaden mislukt. Probeer opnieuw of download de APK.', 'upd.fail.storage': 'Geen opslagruimte voor de update. Download de APK.',
  'upd.check': 'Controleer op updates', 'upd.recheck': 'Opnieuw controleren', 'upd.now': 'Nu bijwerken naar {v}', 'upd.apk': 'Download APK {v}',
  'upd.downloadingPct': 'Update downloaden… {p}%', 'upd.prompt': 'Bevestig de installatie in het venster van Android dat nu opent.', 'upd.perm': 'Sta eerst "Apps installeren" toe voor Periapsis in het scherm dat opende en tik daarna opnieuw op Bijwerken.',
  'upd.liveHint': 'De app haalt de update zelf op. Bij een grote update vraagt Android om de installatie te bevestigen.', 'upd.apkInstead': 'Liever de APK?', 'upd.apkHint': 'Open daarna de gedownloade APK om te installeren.',
  'ban.title': 'Versie {v} beschikbaar', 'ban.live': 'Tik op Bijwerken: de app haalt de update zelf op.', 'ban.apk': 'Download de nieuwe APK en tik erop om te installeren.', 'ban.update': 'Bijwerken', 'ban.later': 'Later',
  'tour.welcome': 'Welkom bij Periapsis', 'tour.welcome.t': 'Ontwerp missies door het zonnestelsel, plan banen om de Aarde en zie precies hoe de natuurkunde werkt. Wil je een korte rondleiding?',
  'tour.start': 'Start rondleiding', 'tour.skip': 'Overslaan', 'tour.step': 'Stap {n} van {m}', 'tour.stop': 'Rondleiding stoppen', 'tour.back': 'Terug', 'tour.next': 'Volgende', 'tour.done': 'Klaar', 'tour.lang': 'Taal',
  'tour.0.t': 'Het zonnestelsel', 'tour.0.x': 'Dit is een echt, draaiend zonnestelsel. Sleep om te draaien, knijp om te zoomen en tik op een planeet om erheen te vliegen.',
  'tour.1.t': 'Weergaven', 'tour.1.x': 'Wissel tussen het hele zonnestelsel, alleen de Aarde, Aarde–Maan, een planeet met manen en de Melkweg.',
  'tour.2.t': 'Tijd', 'tour.2.x': 'Speel de tijd af, spoel terug of versnel van seconden tot jaren. Tik op de datum om een startdatum te kiezen.',
  'tour.3.t': 'Missie ontwerpen', 'tour.3.x': 'Kies een bestemming en een datum. Periapsis zoekt de zuinigste route, ook langs andere planeten (gravity assists), en laat de Δv zien.',
  'tour.4.t': 'Aardbaan', 'tour.4.x': 'Plan een baan om de Aarde: kies een lanceerbasis en hoogte en zie direct de Δv, de inclinatie en hoe lang de satelliet blijft hangen.',
  'tour.5.t': 'Rekenen en meer', 'tour.5.x': 'Bij Rekenen vind je losse calculators. Onder Meer staan planeetstelsels, Lagrangepunten, de Melkweg en alle formules met bronnen.',
  'tour.6.t': 'Instellingen en updates', 'tour.6.x': 'Hier zet je labels, schaal, tempo en taal naar wens en haal je met één tik de nieuwste versie van de app.',
  'mode.design': 'Missies ontwerpen', 'mode.design.h': 'Routes, aardbanen, berekeningen', 'mode.sats': 'Satellieten', 'mode.sats.h': 'ISS en satellieten volgen, overkomsten', 'mode.sky': 'Vanavond', 'mode.sky.h': 'Wat je aan de hemel ziet, gebeurtenissen', 'mode.explore': 'Verkennen', 'mode.explore.h': 'Planeten, echte missies, de Melkweg',
  'home.title': 'Waar wil je heen?', 'home.back': 'Startscherm',
  'tab.sats': 'Volgen', 'tab.passes': 'Overkomsten', 'tab.tonight': 'Hemel', 'tab.events': 'Agenda', 'tab.bodies': 'Hemellichamen', 'tab.missions': 'Missies',
  'sm.title': 'Opgeslagen missies', 'sm.save': 'Opslaan', 'sm.share': 'Delen', 'sm.saved': 'Missie opgeslagen', 'sm.copied': 'Gekopieerd naar het klembord', 'sm.empty': 'Nog niets opgeslagen. Sla een set-up op om hem later met één tik terug te zetten.', 'sm.load': 'tik om te laden', 'sm.del': 'Verwijder {n}',
} as const

export type Key = keyof typeof nl
type Dict = Record<Key, string>

const en: Dict = {
  'views.solar': 'Solar system', 'views.earth': 'Earth only', 'views.earthmoon': 'Earth–Moon', 'views.system': 'Planet & moons', 'views.galaxy': 'Milky Way', 'views.flyby': 'Flyby view',
  'tab.mission': 'Mission', 'tab.earth': 'Earth orbit', 'tab.system': 'System', 'tab.calc': 'Calculate', 'tab.lagrange': 'Lagrange', 'tab.galaxy': 'Milky Way', 'tab.formulas': 'Formulas', 'tab.view': 'View', 'tab.more': 'More',
  'more.system': 'Planets and their moons', 'more.lagrange': 'Equilibrium points L1–L5', 'more.galaxy': 'The Milky Way to scale', 'more.formulas': 'All equations',
  'nav.main': 'Main menu', 'nav.settings': 'Settings', 'nav.hidePanel': 'Hide panel', 'nav.panel': 'Panel',
  'dock.start': 'Back to start date', 'dock.back': 'Rewind', 'dock.play': 'Play', 'dock.pause': 'Pause', 'dock.fwd': 'Fast-forward', 'dock.speed': 'Speed', 'dock.date': 'Set date and time',
  'speed.0': 'Real time', 'speed.1': '1 min/s', 'speed.2': '1 hr/s', 'speed.3': '1 day/s', 'speed.4': '1 month/s', 'speed.5': '1 year/s',
  'set.title': 'Settings', 'set.desc': 'Update, display and speed of Periapsis', 'set.close': 'Close',
  'set.labels': 'Show labels', 'set.labels.h': 'Names next to planets, moons and spacecraft.',
  'set.scale': 'Planet size', 'set.scale.true': 'True scale', 'set.scale.mag': 'Magnified', 'set.scale.true.h': 'True scale: planets are tiny.', 'set.scale.mag.h': 'Magnified so they are easy to see.',
  'set.speed': 'Default speed', 'set.speed.h': 'The speed time starts at.',
  'set.motion': 'Reduce animations', 'set.motion.h': 'No sliding or floating effects in menus.',
  'set.haptics': 'Vibration', 'set.haptics.h': 'A light tap on buttons and when the drawer snaps.',
  'set.awake': 'Keep screen on', 'set.awake.h': 'The screen stays on while the app is open.',
  'set.lang': 'Language', 'set.lang.h': 'Language of menus and buttons.',
  'set.tour': 'Restart the tour', 'set.reset': 'Reset settings',
  'set.offline': 'Periapsis works fully offline. Only the update check needs a connection.',
  'set.by': 'Designed & built by', 'set.rights': 'Nothing in this app may be copied, reproduced or distributed without the express permission of the author.',
  'upd.yours': 'Your version', 'upd.newest': 'Latest version',
  'upd.idle': 'Tap to check for a new version.', 'upd.checking': 'Checking…', 'upd.latest': 'You have the latest version', 'upd.available': 'Version {v} available',
  'upd.downloading': 'Downloading update…', 'upd.restarting': 'Done: the app is restarting…', 'upd.offline': 'No connection', 'upd.error': 'Could not fetch the latest version. Try again later.',
  'upd.fail.needsapk': 'This update does not fit the current app: download the APK.', 'upd.fail.bad': 'Download failed. Try again or download the APK.', 'upd.fail.storage': 'Not enough storage for the update. Download the APK.',
  'upd.check': 'Check for updates', 'upd.recheck': 'Check again', 'upd.now': 'Update now to {v}', 'upd.apk': 'Download APK {v}',
  'upd.downloadingPct': 'Downloading update… {p}%', 'upd.prompt': 'Confirm the installation in the Android window that just opened.', 'upd.perm': 'First allow "Install apps" for Periapsis in the screen that opened, then tap Update again.',
  'upd.liveHint': 'The app fetches the update itself. For a big update Android asks you to confirm the installation.', 'upd.apkInstead': 'Prefer the APK?', 'upd.apkHint': 'Then open the downloaded APK to install it.',
  'ban.title': 'Version {v} available', 'ban.live': 'Tap Update: the app fetches the update itself.', 'ban.apk': 'Download the new APK and tap it to install.', 'ban.update': 'Update', 'ban.later': 'Later',
  'tour.welcome': 'Welcome to Periapsis', 'tour.welcome.t': 'Design missions through the solar system, plan orbits around the Earth and see exactly how the physics works. Would you like a short tour?',
  'tour.start': 'Start tour', 'tour.skip': 'Skip', 'tour.step': 'Step {n} of {m}', 'tour.stop': 'Stop tour', 'tour.back': 'Back', 'tour.next': 'Next', 'tour.done': 'Done', 'tour.lang': 'Language',
  'tour.0.t': 'The solar system', 'tour.0.x': 'A real, moving solar system. Drag to rotate, pinch to zoom and tap a planet to fly to it.',
  'tour.1.t': 'Views', 'tour.1.x': 'Switch between the whole solar system, Earth only, Earth–Moon, a planet with its moons and the Milky Way.',
  'tour.2.t': 'Time', 'tour.2.x': 'Play time, rewind or speed up from seconds to years. Tap the date to pick a start date.',
  'tour.3.t': 'Design a mission', 'tour.3.x': 'Pick a destination and a date. Periapsis finds the most economical route, including gravity assists at other planets, and shows the Δv.',
  'tour.4.t': 'Earth orbit', 'tour.4.x': 'Plan an orbit around the Earth: pick a launch site and altitude and see the Δv, the inclination and how long the satellite stays up.',
  'tour.5.t': 'Calculate and more', 'tour.5.x': 'Calculate has stand-alone calculators. More holds planet systems, Lagrange points, the Milky Way and all formulas with sources.',
  'tour.6.t': 'Settings and updates', 'tour.6.x': 'Set labels, scale, speed and language here, and get the newest version of the app with one tap.',
  'mode.design': 'Design missions', 'mode.design.h': 'Routes, Earth orbits, calculators', 'mode.sats': 'Satellites', 'mode.sats.h': 'Track the ISS and satellites, passes', 'mode.sky': 'Tonight', 'mode.sky.h': 'What you can see in the sky, events', 'mode.explore': 'Explore', 'mode.explore.h': 'Planets, real missions, the Milky Way',
  'home.title': 'Where do you want to go?', 'home.back': 'Start screen',
  'tab.sats': 'Track', 'tab.passes': 'Passes', 'tab.tonight': 'Sky', 'tab.events': 'Calendar', 'tab.bodies': 'Bodies', 'tab.missions': 'Missions',
  'sm.title': 'Saved missions', 'sm.save': 'Save', 'sm.share': 'Share', 'sm.saved': 'Mission saved', 'sm.copied': 'Copied to the clipboard', 'sm.empty': 'Nothing saved yet. Save a set-up to restore it later with one tap.', 'sm.load': 'tap to load', 'sm.del': 'Delete {n}',
}

const el: Dict = {
  'views.solar': 'Ηλιακό σύστημα', 'views.earth': 'Μόνο Γη', 'views.earthmoon': 'Γη–Σελήνη', 'views.system': 'Πλανήτης & δορυφόροι', 'views.galaxy': 'Γαλαξίας', 'views.flyby': 'Προβολή πτήσης',
  'tab.mission': 'Αποστολή', 'tab.earth': 'Τροχιά Γης', 'tab.system': 'Σύστημα', 'tab.calc': 'Υπολογισμοί', 'tab.lagrange': 'Λαγκράνζ', 'tab.galaxy': 'Γαλαξίας', 'tab.formulas': 'Τύποι', 'tab.view': 'Προβολή', 'tab.more': 'Περισσότερα',
  'more.system': 'Πλανήτες και δορυφόροι τους', 'more.lagrange': 'Σημεία ισορροπίας L1–L5', 'more.galaxy': 'Ο Γαλαξίας σε κλίμακα', 'more.formulas': 'Όλες οι εξισώσεις',
  'nav.main': 'Κύριο μενού', 'nav.settings': 'Ρυθμίσεις', 'nav.hidePanel': 'Απόκρυψη πάνελ', 'nav.panel': 'Πάνελ',
  'dock.start': 'Επιστροφή στην ημερομηνία έναρξης', 'dock.back': 'Επαναφορά', 'dock.play': 'Αναπαραγωγή', 'dock.pause': 'Παύση', 'dock.fwd': 'Γρήγορη προώθηση', 'dock.speed': 'Ταχύτητα', 'dock.date': 'Ρύθμιση ημερομηνίας και ώρας',
  'speed.0': 'Πραγματικός χρόνος', 'speed.1': '1 λεπτό/δ', 'speed.2': '1 ώρα/δ', 'speed.3': '1 ημέρα/δ', 'speed.4': '1 μήνας/δ', 'speed.5': '1 έτος/δ',
  'set.title': 'Ρυθμίσεις', 'set.desc': 'Ενημέρωση, εμφάνιση και ταχύτητα του Periapsis', 'set.close': 'Κλείσιμο',
  'set.labels': 'Εμφάνιση ετικετών', 'set.labels.h': 'Ονόματα δίπλα σε πλανήτες, δορυφόρους και διαστημόπλοια.',
  'set.scale': 'Μέγεθος πλανητών', 'set.scale.true': 'Πραγματική κλίμακα', 'set.scale.mag': 'Μεγεθυμένο', 'set.scale.true.h': 'Πραγματική κλίμακα: οι πλανήτες είναι μικροσκοπικοί.', 'set.scale.mag.h': 'Μεγεθυμένοι ώστε να φαίνονται καλά.',
  'set.speed': 'Προεπιλεγμένη ταχύτητα', 'set.speed.h': 'Η ταχύτητα με την οποία ξεκινά ο χρόνος.',
  'set.motion': 'Λιγότερα εφέ κίνησης', 'set.motion.h': 'Χωρίς εφέ ολίσθησης στα μενού.',
  'set.haptics': 'Δόνηση', 'set.haptics.h': 'Ελαφρύ χτύπημα στα κουμπιά και όταν κουμπώνει το συρτάρι.',
  'set.awake': 'Οθόνη πάντα αναμμένη', 'set.awake.h': 'Η οθόνη μένει αναμμένη όσο η εφαρμογή είναι ανοιχτή.',
  'set.lang': 'Γλώσσα', 'set.lang.h': 'Γλώσσα μενού και κουμπιών.',
  'set.tour': 'Επανεκκίνηση ξενάγησης', 'set.reset': 'Επαναφορά ρυθμίσεων',
  'set.offline': 'Το Periapsis λειτουργεί πλήρως χωρίς διαδίκτυο. Μόνο ο έλεγχος ενημερώσεων χρειάζεται σύνδεση.',
  'set.by': 'Σχεδιασμός & ανάπτυξη', 'set.rights': 'Τίποτα σε αυτή την εφαρμογή δεν επιτρέπεται να αντιγραφεί ή να διανεμηθεί χωρίς ρητή άδεια του δημιουργού.',
  'upd.yours': 'Η έκδοσή σου', 'upd.newest': 'Τελευταία έκδοση',
  'upd.idle': 'Πάτησε για έλεγχο νέας έκδοσης.', 'upd.checking': 'Αναζήτηση…', 'upd.latest': 'Έχεις την τελευταία έκδοση', 'upd.available': 'Διαθέσιμη έκδοση {v}',
  'upd.downloading': 'Λήψη ενημέρωσης…', 'upd.restarting': 'Έτοιμο: η εφαρμογή κάνει επανεκκίνηση…', 'upd.offline': 'Χωρίς σύνδεση', 'upd.error': 'Αδυναμία λήψης της τελευταίας έκδοσης. Δοκίμασε αργότερα.',
  'upd.fail.needsapk': 'Αυτή η ενημέρωση δεν ταιριάζει στην τρέχουσα εφαρμογή: κατέβασε το APK.', 'upd.fail.bad': 'Η λήψη απέτυχε. Δοκίμασε ξανά ή κατέβασε το APK.', 'upd.fail.storage': 'Δεν υπάρχει αρκετός χώρος. Κατέβασε το APK.',
  'upd.check': 'Έλεγχος ενημερώσεων', 'upd.recheck': 'Νέος έλεγχος', 'upd.now': 'Ενημέρωση τώρα στο {v}', 'upd.apk': 'Λήψη APK {v}',
  'upd.downloadingPct': 'Λήψη ενημέρωσης… {p}%', 'upd.prompt': 'Επιβεβαίωσε την εγκατάσταση στο παράθυρο του Android που μόλις άνοιξε.', 'upd.perm': 'Πρώτα επίτρεψε «Εγκατάσταση εφαρμογών» για το Periapsis στην οθόνη που άνοιξε και μετά πάτησε ξανά Ενημέρωση.',
  'upd.liveHint': 'Η εφαρμογή κατεβάζει μόνη της την ενημέρωση. Σε μεγάλη ενημέρωση το Android ζητά επιβεβαίωση εγκατάστασης.', 'upd.apkInstead': 'Προτιμάς το APK;', 'upd.apkHint': 'Άνοιξε μετά το APK που κατέβηκε για εγκατάσταση.',
  'ban.title': 'Διαθέσιμη έκδοση {v}', 'ban.live': 'Πάτησε Ενημέρωση: η εφαρμογή κατεβάζει μόνη της την ενημέρωση.', 'ban.apk': 'Κατέβασε το νέο APK και πάτησέ το για εγκατάσταση.', 'ban.update': 'Ενημέρωση', 'ban.later': 'Αργότερα',
  'tour.welcome': 'Καλώς ήρθες στο Periapsis', 'tour.welcome.t': 'Σχεδίασε αποστολές στο ηλιακό σύστημα, σχεδίασε τροχιές γύρω από τη Γη και δες ακριβώς πώς λειτουργεί η φυσική. Θέλεις μια σύντομη ξενάγηση;',
  'tour.start': 'Έναρξη ξενάγησης', 'tour.skip': 'Παράλειψη', 'tour.step': 'Βήμα {n} από {m}', 'tour.stop': 'Διακοπή ξενάγησης', 'tour.back': 'Πίσω', 'tour.next': 'Επόμενο', 'tour.done': 'Τέλος', 'tour.lang': 'Γλώσσα',
  'tour.0.t': 'Το ηλιακό σύστημα', 'tour.0.x': 'Ένα πραγματικό ηλιακό σύστημα σε κίνηση. Σύρε για περιστροφή, τσίμπημα για ζουμ και πάτησε έναν πλανήτη για να πας σε αυτόν.',
  'tour.1.t': 'Προβολές', 'tour.1.x': 'Εναλλαγή μεταξύ όλου του ηλιακού συστήματος, μόνο της Γης, Γη–Σελήνη, ενός πλανήτη με τους δορυφόρους του και του Γαλαξία.',
  'tour.2.t': 'Χρόνος', 'tour.2.x': 'Παίξε τον χρόνο, γύρισέ τον πίσω ή επιτάχυνέ τον από δευτερόλεπτα σε χρόνια. Πάτησε την ημερομηνία για να διαλέξεις ημερομηνία έναρξης.',
  'tour.3.t': 'Σχεδιασμός αποστολής', 'tour.3.x': 'Διάλεξε προορισμό και ημερομηνία. Το Periapsis βρίσκει την πιο οικονομική διαδρομή, μαζί με βαρυτική υποβοήθηση από άλλους πλανήτες, και δείχνει το Δv.',
  'tour.4.t': 'Τροχιά Γης', 'tour.4.x': 'Σχεδίασε μια τροχιά γύρω από τη Γη: διάλεξε βάση εκτόξευσης και ύψος και δες το Δv, την κλίση και πόσο μένει ο δορυφόρος ψηλά.',
  'tour.5.t': 'Υπολογισμοί και άλλα', 'tour.5.x': 'Στους Υπολογισμούς υπάρχουν αυτόνομες αριθμομηχανές. Στα Περισσότερα βρίσκεις πλανητικά συστήματα, σημεία Λαγκράνζ, τον Γαλαξία και όλους τους τύπους με πηγές.',
  'tour.6.t': 'Ρυθμίσεις και ενημερώσεις', 'tour.6.x': 'Εδώ ρυθμίζεις ετικέτες, κλίμακα, ταχύτητα και γλώσσα, και παίρνεις τη νεότερη έκδοση με ένα πάτημα.',
  'mode.design': 'Σχεδιασμός αποστολών', 'mode.design.h': 'Διαδρομές, τροχιές Γης, υπολογισμοί', 'mode.sats': 'Δορυφόροι', 'mode.sats.h': 'Παρακολούθηση ISS και δορυφόρων, διελεύσεις', 'mode.sky': 'Απόψε', 'mode.sky.h': 'Τι φαίνεται στον ουρανό, γεγονότα', 'mode.explore': 'Εξερεύνηση', 'mode.explore.h': 'Πλανήτες, πραγματικές αποστολές, ο Γαλαξίας',
  'home.title': 'Πού θέλεις να πας;', 'home.back': 'Αρχική οθόνη',
  'tab.sats': 'Παρακολούθηση', 'tab.passes': 'Διελεύσεις', 'tab.tonight': 'Ουρανός', 'tab.events': 'Ημερολόγιο', 'tab.bodies': 'Ουράνια σώματα', 'tab.missions': 'Αποστολές',
  'sm.title': 'Αποθηκευμένες αποστολές', 'sm.save': 'Αποθήκευση', 'sm.share': 'Κοινοποίηση', 'sm.saved': 'Η αποστολή αποθηκεύτηκε', 'sm.copied': 'Αντιγράφηκε στο πρόχειρο', 'sm.empty': 'Δεν έχει αποθηκευτεί τίποτα ακόμα. Αποθήκευσε μια ρύθμιση για να την επαναφέρεις με ένα πάτημα.', 'sm.load': 'πάτησε για φόρτωση', 'sm.del': 'Διαγραφή {n}',
}

const DICTS: Record<Lang, Dict> = { nl, en, el }

/** Features add their own texts (src/features/<x>/i18n.ts) without touching this file. Keys should be prefixed with the feature name. */
const EXTRA: Record<Lang, Record<string, string>> = { nl: {}, en: {}, el: {} }
export function registerDict(d: Record<Lang, Record<string, string>>) {
  for (const l of ['nl', 'en', 'el'] as const) Object.assign(EXTRA[l], d[l])
}
/** Any registered key, including feature keys (loosely typed on purpose). */
export type AnyKey = Key | (string & {})

/** Translate one key (variables like {v} are replaced). Falls back to Dutch, then to the key itself. */
export function translate(lang: Lang, key: AnyKey, vars?: Record<string, string | number>): string {
  let s = (DICTS[lang] as Record<string, string>)[key] ?? EXTRA[lang][key] ?? (nl as Record<string, string>)[key] ?? EXTRA.nl[key] ?? key
  if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, String(vars[k]))
  return s
}
export const t = (key: AnyKey, vars?: Record<string, string | number>) => translate(settings.get().lang, key, vars)
/** React hook: returns a translate function and re-renders when the language changes. */
export function useT() {
  const lang = useSettings((s) => s.lang)
  return (key: AnyKey, vars?: Record<string, string | number>) => translate(lang, key, vars)
}
export const dictionaries = DICTS
