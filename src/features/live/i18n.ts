// Texts of the Live tab (keys prefixed 'live.').
import { registerDict } from '@/lib/i18n'

const nl: Record<string, string> = {
  'live.refresh': 'Vernieuwen', 'live.updated': 'bijgewerkt {age} geleden', 'live.never': 'nog niet opgehaald', 'live.loading': 'Laden…',
  'live.ageMin': '{n} min', 'live.ageH': '{n} u', 'live.ageD': '{n} d', 'live.dayUnit': 'd',
  'live.fail': 'Kon niet laden', 'live.failOffline': 'Kon niet laden: geen verbinding.', 'live.failHttp': 'Kon niet laden: de dienst antwoordt niet (te druk of een limiet bereikt).', 'live.failParse': 'Kon niet laden: onverwacht antwoord van de dienst.',
  'live.showingOld': 'Toont oudere gegevens.', 'live.fresh': 'Al recent opgehaald, even wachten.', 'live.open': 'Openen', 'live.none': '—',
  'live.expand': 'Uitklappen', 'live.collapse': 'Inklappen', 'live.more': 'Meer', 'live.less': 'Minder',
  // space weather
  'live.sw.title': 'Ruimteweer', 'live.sw.credit': 'Bron: NOAA SWPC (publiek domein)',
  'live.sw.kpNow': 'Kp-index nu', 'live.sw.g': 'Geomagnetische storm G{n}', 'live.sw.calm': 'Rustig', 'live.sw.active': 'Onrustig', 'live.sw.storm': 'Storm',
  'live.sw.forecast': 'Kp-verwachting (hoogste per dag)', 'live.sw.today': 'Vandaag',
  'live.sw.aurora': 'Kans op noorderlicht bij jou', 'live.sw.auroraAt': '{p}% (OVATION, dichtstbijzijnde cel)', 'live.sw.auroraNote': 'Zichtbaar kan het vooral zijn bij een heldere, donkere noordelijke horizon.',
  'live.sw.oval': 'Ovaal reikt vanavond tot', 'live.sw.ovalVal': '{lat}° {ns} op jouw lengtegraad ({km} km van jou)', 'live.sw.ovalNone': 'Niet op jouw lengtegraad (kans onder 10%)', 'live.sw.north': 'N', 'live.sw.south': 'Z',
  'live.sw.speed': 'Zonnewind', 'live.sw.bz': 'Bz (magnetisch veld)', 'live.sw.bzHint': 'negatief = gunstig voor noorderlicht', 'live.sw.flare': 'Laatste zonnevlam', 'live.sw.noFlare': 'Geen recente vlam geregistreerd', 'live.sw.place': 'Plaats: {name}',
  // apod
  'live.apod.title': 'Foto van de dag', 'live.apod.credit': 'Bron: NASA APOD', 'live.apod.copyright': '© {c}', 'live.apod.video': 'Dit is een video: bekijk hem in de browser.', 'live.apod.watch': 'Video bekijken', 'live.apod.hd': 'Volledige resolutie',
  'live.apod.explanation': 'Uitleg (Engels)', 'live.apod.key': 'Eigen NASA-sleutel', 'live.apod.keyHint': 'DEMO_KEY is snel op. Vraag gratis je eigen sleutel aan op api.nasa.gov en vul hem hier in.', 'live.apod.keyPlaceholder': 'api.nasa.gov-sleutel', 'live.apod.keySave': 'Opslaan', 'live.apod.keyClear': 'Wissen', 'live.apod.keyGet': 'Sleutel aanvragen', 'live.apod.keyOwn': 'Eigen sleutel in gebruik', 'live.apod.keyDemo': 'DEMO_KEY in gebruik (zwaar begrensd)',
  // launches
  'live.ln.title': 'Lanceringen', 'live.ln.credit': 'Bron: Launch Library 2, The Space Devs', 'live.ln.net': 'NET {time}', 'live.ln.tbd': 'Tijd nog onbekend', 'live.ln.mission': 'Missie', 'live.ln.webcast': 'Livestream', 'live.ln.info': 'Meer info', 'live.ln.live': 'Live', 'live.ln.empty': 'Geen aankomende lanceringen gevonden.',
  // asteroids
  'live.ast.title': 'Planetoïden dichtbij', 'live.ast.credit': 'Bron: NASA/JPL SBDB Close-Approach Data', 'live.ast.intro': 'Naderingen binnen 0,05 AU (± 19 maanafstanden), komende 60 dagen.', 'live.ast.empty': 'Geen naderingen binnen 0,05 AU in de komende 60 dagen.',
  'live.ast.dist': 'Afstand', 'live.ast.distVal': '{ld} maanafstanden ({km} km)', 'live.ast.vel': 'Snelheid', 'live.ast.size': 'Geschatte grootte', 'live.ast.sizeUnknown': 'onbekend (geen H)', 'live.ast.sizeNote': 'Schatting uit H: D ≈ 1329 km / √albedo · 10^(−H/5), albedo 0,05 tot 0,25.', 'live.ast.when': 'Datum (UTC → lokaal)',
}
const en: Record<string, string> = {
  'live.refresh': 'Refresh', 'live.updated': 'updated {age} ago', 'live.never': 'not fetched yet', 'live.loading': 'Loading…',
  'live.ageMin': '{n} min', 'live.ageH': '{n} h', 'live.ageD': '{n} d', 'live.dayUnit': 'd',
  'live.fail': 'Could not load', 'live.failOffline': 'Could not load: no connection.', 'live.failHttp': 'Could not load: the service is not answering (busy or limit reached).', 'live.failParse': 'Could not load: unexpected answer from the service.',
  'live.showingOld': 'Showing older data.', 'live.fresh': 'Fetched recently already, please wait.', 'live.open': 'Open', 'live.none': '—',
  'live.expand': 'Expand', 'live.collapse': 'Collapse', 'live.more': 'More', 'live.less': 'Less',
  'live.sw.title': 'Space weather', 'live.sw.credit': 'Source: NOAA SWPC (public domain)',
  'live.sw.kpNow': 'Kp index now', 'live.sw.g': 'Geomagnetic storm G{n}', 'live.sw.calm': 'Quiet', 'live.sw.active': 'Unsettled', 'live.sw.storm': 'Storm',
  'live.sw.forecast': 'Kp forecast (highest per day)', 'live.sw.today': 'Today',
  'live.sw.aurora': 'Aurora chance at your place', 'live.sw.auroraAt': '{p}% (OVATION, nearest cell)', 'live.sw.auroraNote': 'Mostly visible with a clear, dark northern horizon.',
  'live.sw.oval': 'Oval reaches tonight down to', 'live.sw.ovalVal': '{lat}° {ns} at your longitude ({km} km from you)', 'live.sw.ovalNone': 'Not at your longitude (chance below 10%)', 'live.sw.north': 'N', 'live.sw.south': 'S',
  'live.sw.speed': 'Solar wind', 'live.sw.bz': 'Bz (magnetic field)', 'live.sw.bzHint': 'negative = favourable for aurora', 'live.sw.flare': 'Latest solar flare', 'live.sw.noFlare': 'No recent flare recorded', 'live.sw.place': 'Place: {name}',
  'live.apod.title': 'Picture of the day', 'live.apod.credit': 'Source: NASA APOD', 'live.apod.copyright': '© {c}', 'live.apod.video': 'This is a video: watch it in the browser.', 'live.apod.watch': 'Watch video', 'live.apod.hd': 'Full resolution',
  'live.apod.explanation': 'Explanation', 'live.apod.key': 'Own NASA key', 'live.apod.keyHint': 'DEMO_KEY runs out quickly. Get a free key of your own at api.nasa.gov and enter it here.', 'live.apod.keyPlaceholder': 'api.nasa.gov key', 'live.apod.keySave': 'Save', 'live.apod.keyClear': 'Clear', 'live.apod.keyGet': 'Get a key', 'live.apod.keyOwn': 'Using your own key', 'live.apod.keyDemo': 'Using DEMO_KEY (heavily limited)',
  'live.ln.title': 'Launches', 'live.ln.credit': 'Source: Launch Library 2, The Space Devs', 'live.ln.net': 'NET {time}', 'live.ln.tbd': 'Time not known yet', 'live.ln.mission': 'Mission', 'live.ln.webcast': 'Webcast', 'live.ln.info': 'More info', 'live.ln.live': 'Live', 'live.ln.empty': 'No upcoming launches found.',
  'live.ast.title': 'Near-Earth asteroids', 'live.ast.credit': 'Source: NASA/JPL SBDB Close-Approach Data', 'live.ast.intro': 'Approaches within 0.05 AU (about 19 lunar distances), next 60 days.', 'live.ast.empty': 'No approaches within 0.05 AU in the next 60 days.',
  'live.ast.dist': 'Distance', 'live.ast.distVal': '{ld} lunar distances ({km} km)', 'live.ast.vel': 'Speed', 'live.ast.size': 'Estimated size', 'live.ast.sizeUnknown': 'unknown (no H)', 'live.ast.sizeNote': 'Estimate from H: D ≈ 1329 km / √albedo · 10^(−H/5), albedo 0.05 to 0.25.', 'live.ast.when': 'Date (UTC → local)',
}
const el: Record<string, string> = {
  'live.refresh': 'Ανανέωση', 'live.updated': 'ενημερώθηκε πριν από {age}', 'live.never': 'δεν έχει φορτωθεί ακόμα', 'live.loading': 'Φόρτωση…',
  'live.ageMin': '{n} λεπτά', 'live.ageH': '{n} ώρες', 'live.ageD': '{n} ημέρες', 'live.dayUnit': 'ημ',
  'live.fail': 'Δεν φορτώθηκε', 'live.failOffline': 'Δεν φορτώθηκε: δεν υπάρχει σύνδεση.', 'live.failHttp': 'Δεν φορτώθηκε: η υπηρεσία δεν απαντά (φόρτος ή όριο αιτημάτων).', 'live.failParse': 'Δεν φορτώθηκε: μη αναμενόμενη απάντηση από την υπηρεσία.',
  'live.showingOld': 'Εμφανίζονται παλαιότερα δεδομένα.', 'live.fresh': 'Φορτώθηκε πρόσφατα, περίμενε λίγο.', 'live.open': 'Άνοιγμα', 'live.none': '—',
  'live.expand': 'Ανάπτυξη', 'live.collapse': 'Σύμπτυξη', 'live.more': 'Περισσότερα', 'live.less': 'Λιγότερα',
  'live.sw.title': 'Διαστημικός καιρός', 'live.sw.credit': 'Πηγή: NOAA SWPC (κοινό κτήμα)',
  'live.sw.kpNow': 'Δείκτης Kp τώρα', 'live.sw.g': 'Γεωμαγνητική καταιγίδα G{n}', 'live.sw.calm': 'Ήρεμο', 'live.sw.active': 'Ταραγμένο', 'live.sw.storm': 'Καταιγίδα',
  'live.sw.forecast': 'Πρόγνωση Kp (μέγιστο ανά ημέρα)', 'live.sw.today': 'Σήμερα',
  'live.sw.aurora': 'Πιθανότητα σέλαος στη θέση σου', 'live.sw.auroraAt': '{p}% (OVATION, πλησιέστερο κελί)', 'live.sw.auroraNote': 'Ορατό κυρίως με καθαρό, σκοτεινό βόρειο ορίζοντα.',
  'live.sw.oval': 'Το οβάλ φτάνει απόψε έως', 'live.sw.ovalVal': '{lat}° {ns} στο γεωγραφικό σου μήκος ({km} km από σένα)', 'live.sw.ovalNone': 'Όχι στο γεωγραφικό σου μήκος (πιθανότητα κάτω από 10%)', 'live.sw.north': 'Β', 'live.sw.south': 'Ν',
  'live.sw.speed': 'Ηλιακός άνεμος', 'live.sw.bz': 'Bz (μαγνητικό πεδίο)', 'live.sw.bzHint': 'αρνητικό = ευνοϊκό για σέλας', 'live.sw.flare': 'Τελευταία ηλιακή έκλαμψη', 'live.sw.noFlare': 'Καμία πρόσφατη έκλαμψη', 'live.sw.place': 'Τοποθεσία: {name}',
  'live.apod.title': 'Φωτογραφία της ημέρας', 'live.apod.credit': 'Πηγή: NASA APOD', 'live.apod.copyright': '© {c}', 'live.apod.video': 'Αυτό είναι βίντεο: δες το στον περιηγητή.', 'live.apod.watch': 'Προβολή βίντεο', 'live.apod.hd': 'Πλήρης ανάλυση',
  'live.apod.explanation': 'Επεξήγηση (αγγλικά)', 'live.apod.key': 'Δικό σου κλειδί NASA', 'live.apod.keyHint': 'Το DEMO_KEY εξαντλείται γρήγορα. Πάρε δωρεάν δικό σου κλειδί στο api.nasa.gov και γράψ’ το εδώ.', 'live.apod.keyPlaceholder': 'κλειδί api.nasa.gov', 'live.apod.keySave': 'Αποθήκευση', 'live.apod.keyClear': 'Διαγραφή', 'live.apod.keyGet': 'Απόκτηση κλειδιού', 'live.apod.keyOwn': 'Χρησιμοποιείται το δικό σου κλειδί', 'live.apod.keyDemo': 'Χρησιμοποιείται το DEMO_KEY (πολύ περιορισμένο)',
  'live.ln.title': 'Εκτοξεύσεις', 'live.ln.credit': 'Πηγή: Launch Library 2, The Space Devs', 'live.ln.net': 'NET {time}', 'live.ln.tbd': 'Η ώρα δεν είναι γνωστή ακόμα', 'live.ln.mission': 'Αποστολή', 'live.ln.webcast': 'Ζωντανή μετάδοση', 'live.ln.info': 'Περισσότερα', 'live.ln.live': 'Ζωντανά', 'live.ln.empty': 'Δεν βρέθηκαν επερχόμενες εκτοξεύσεις.',
  'live.ast.title': 'Κοντινοί αστεροειδείς', 'live.ast.credit': 'Πηγή: NASA/JPL SBDB Close-Approach Data', 'live.ast.intro': 'Προσεγγίσεις εντός 0,05 AU (περίπου 19 σεληνιακές αποστάσεις), επόμενες 60 ημέρες.', 'live.ast.empty': 'Καμία προσέγγιση εντός 0,05 AU τις επόμενες 60 ημέρες.',
  'live.ast.dist': 'Απόσταση', 'live.ast.distVal': '{ld} σεληνιακές αποστάσεις ({km} km)', 'live.ast.vel': 'Ταχύτητα', 'live.ast.size': 'Εκτιμώμενο μέγεθος', 'live.ast.sizeUnknown': 'άγνωστο (χωρίς H)', 'live.ast.sizeNote': 'Εκτίμηση από το H: D ≈ 1329 km / √λευκαύγεια · 10^(−H/5), λευκαύγεια 0,05 έως 0,25.', 'live.ast.when': 'Ημερομηνία (UTC → τοπική)',
}
registerDict({ nl, en, el })
