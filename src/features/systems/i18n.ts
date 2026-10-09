import { registerDict } from '@/lib/i18n'

// Card texts live next to their formulas in cards.ts as [nl, en, el] triples; only the section chrome is registered here.
registerDict({
  nl: { 'sys.lang': 'nl', 'sys.title': 'Ruimtevaartuig-systemen', 'sys.intro': 'Standregeling, elektrisch vermogen en betrouwbaarheid. Notatie van de cursus (EPFL, Nicollier); wat de slides niet geven komt uit Wertz & Larson (SMAD). Elke kaart heeft een kleine rekenmachine.', 'sys.src': 'Bron', 'sys.calc': 'Rekenen', 'sys.result': 'Uitkomst' },
  en: { 'sys.lang': 'en', 'sys.title': 'Spacecraft systems', 'sys.intro': 'Attitude control, electrical power and reliability. Course notation (EPFL, Nicollier); what the slides do not give comes from Wertz & Larson (SMAD). Each card has a small calculator.', 'sys.src': 'Source', 'sys.calc': 'Calculate', 'sys.result': 'Result' },
  el: { 'sys.lang': 'el', 'sys.title': 'Συστήματα διαστημικού σκάφους', 'sys.intro': 'Έλεγχος στάσης, ηλεκτρική ισχύς και αξιοπιστία. Συμβολισμός του μαθήματος (EPFL, Nicollier)· ό,τι δεν δίνουν οι διαφάνειες προέρχεται από Wertz & Larson (SMAD). Κάθε κάρτα έχει μικρό υπολογιστή.', 'sys.src': 'Πηγή', 'sys.calc': 'Υπολογισμός', 'sys.result': 'Αποτέλεσμα' },
})
