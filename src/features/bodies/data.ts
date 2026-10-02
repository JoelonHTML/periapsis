// Encyclopedia data: Sun, planets, dwarf planets Ceres and Pluto, major moons.
// Values: NASA Planetary Fact Sheets / NASA-JPL SSD (mean radius, mass, surface gravity, escape velocity, density, periods).
// Fields we are not sure about are left out (optional). Pure data, relative imports only (node --test).
import type { Lang } from '../../lib/settings.ts'

export type Kind = 'star' | 'planet' | 'dwarf' | 'moon'
export type Loc = Record<Lang, string>

export interface Body {
  id: string
  kind: Kind
  parent?: string // moons: id of the planet
  color: string
  R: number // mean radius, km
  M: number // mass, kg
  g: number // surface gravity, m/s²
  vesc: number // escape velocity, km/s
  rho: number // mean density, kg/m³
  rotH?: number // sidereal rotation period, hours (negative = retrograde)
  sync?: boolean // rotation locked to the orbit (moons)
  P?: number // orbital period, days (around the Sun, or around the parent)
  a?: number // semi-major axis, km (around the Sun, or around the parent)
  T?: number // mean temperature, K (surface; gas giants: 1 bar level)
  moons?: number // number of known moons per MOONS_ASOF
  atm: string[] // main gases (formulas); empty = no noticeable atmosphere
  atmNote?: 'none' | 'trace' // shown when `atm` is empty or to say the atmosphere is very thin
  missions: string[]
  desc: Loc
}

export const MOONS_ASOF = '2025'
export const SOURCE = 'NASA Planetary Fact Sheet · NASA/JPL SSD'
export const G_CONST = 6.6743e-11
export const AU_KM = 149597870.7

export const NAMES: Record<string, Loc> = {
  sun: { nl: 'Zon', en: 'Sun', el: 'Ήλιος' },
  mercury: { nl: 'Mercurius', en: 'Mercury', el: 'Ερμής' },
  venus: { nl: 'Venus', en: 'Venus', el: 'Αφροδίτη' },
  earth: { nl: 'Aarde', en: 'Earth', el: 'Γη' },
  mars: { nl: 'Mars', en: 'Mars', el: 'Άρης' },
  ceres: { nl: 'Ceres', en: 'Ceres', el: 'Δήμητρα' },
  jupiter: { nl: 'Jupiter', en: 'Jupiter', el: 'Δίας' },
  saturn: { nl: 'Saturnus', en: 'Saturn', el: 'Κρόνος' },
  uranus: { nl: 'Uranus', en: 'Uranus', el: 'Ουρανός' },
  neptune: { nl: 'Neptunus', en: 'Neptune', el: 'Ποσειδώνας' },
  pluto: { nl: 'Pluto', en: 'Pluto', el: 'Πλούτωνας' },
  moon: { nl: 'Maan', en: 'Moon', el: 'Σελήνη' },
  phobos: { nl: 'Phobos', en: 'Phobos', el: 'Φόβος' },
  deimos: { nl: 'Deimos', en: 'Deimos', el: 'Δείμος' },
  io: { nl: 'Io', en: 'Io', el: 'Ιώ' },
  europa: { nl: 'Europa', en: 'Europa', el: 'Ευρώπη' },
  ganymede: { nl: 'Ganymedes', en: 'Ganymede', el: 'Γανυμήδης' },
  callisto: { nl: 'Callisto', en: 'Callisto', el: 'Καλλιστώ' },
  titan: { nl: 'Titan', en: 'Titan', el: 'Τιτάν' },
  enceladus: { nl: 'Enceladus', en: 'Enceladus', el: 'Εγκέλαδος' },
  triton: { nl: 'Triton', en: 'Triton', el: 'Τρίτωνας' },
  charon: { nl: 'Charon', en: 'Charon', el: 'Χάρων' },
}

export const BODY_LIST: Body[] = [
  {
    id: 'sun', kind: 'star', color: '#fbbf24', R: 695700, M: 1.9885e30, g: 274.0, vesc: 617.7, rho: 1408, rotH: 609.12, T: 5772,
    atm: ['H', 'He'], missions: ['SOHO', 'Parker Solar Probe', 'Solar Orbiter', 'SDO', 'Ulysses', 'Helios'],
    desc: {
      nl: 'De Zon is een gewone ster van het type G2 en bevat 99,86 % van alle massa in het zonnestelsel. In de kern fuseert waterstof tot helium, bij ongeveer 15 miljoen kelvin. Het licht doet er ruim acht minuten over om de Aarde te bereiken. De Zon draait niet als een vast lichaam: de evenaar draait sneller dan de polen.',
      en: 'The Sun is an ordinary G2-type star and holds 99.86 % of all the mass in the Solar System. In its core, hydrogen fuses into helium at about 15 million kelvin. Its light needs a little over eight minutes to reach Earth. The Sun does not spin like a solid body: the equator rotates faster than the poles.',
      el: 'Ο Ήλιος είναι ένα συνηθισμένο αστέρι τύπου G2 και περιέχει το 99,86 % της μάζας του Ηλιακού Συστήματος. Στον πυρήνα του το υδρογόνο συντήκεται σε ήλιο σε περίπου 15 εκατομμύρια κέλβιν. Το φως του χρειάζεται λίγο περισσότερο από οκτώ λεπτά για να φτάσει στη Γη. Ο Ήλιος δεν περιστρέφεται σαν στερεό σώμα: ο ισημερινός του γυρίζει ταχύτερα από τους πόλους.',
    },
  },
  {
    id: 'mercury', kind: 'planet', color: '#a8a29e', R: 2439.7, M: 3.3010e23, g: 3.70, vesc: 4.25, rho: 5429, rotH: 1407.6,
    P: 87.969, a: 57.909e6, T: 440, moons: 0, atm: [], atmNote: 'trace', missions: ['Mariner 10', 'MESSENGER', 'BepiColombo'],
    desc: {
      nl: 'Mercurius is de kleinste planeet en staat het dichtst bij de Zon. Er is bijna geen atmosfeer, dus de temperatuur schommelt tussen ongeveer 100 K in de nacht en 700 K overdag. Een Mercuriusjaar duurt 88 aardse dagen, maar een zonnedag (van zonsopgang tot zonsopgang) duurt er 176. De kern is ongewoon groot voor zo\'n kleine planeet.',
      en: 'Mercury is the smallest planet and the closest to the Sun. It has almost no atmosphere, so temperatures swing from about 100 K at night to 700 K by day. A Mercury year lasts 88 Earth days, but one solar day (sunrise to sunrise) lasts 176. Its core is unusually large for such a small planet.',
      el: 'Ο Ερμής είναι ο μικρότερος πλανήτης και ο πιο κοντινός στον Ήλιο. Δεν έχει σχεδόν καθόλου ατμόσφαιρα, γι\' αυτό η θερμοκρασία κυμαίνεται από περίπου 100 K τη νύχτα έως 700 K την ημέρα. Ένα έτος του Ερμή διαρκεί 88 γήινες ημέρες, ενώ μία ηλιακή ημέρα (από ανατολή σε ανατολή) διαρκεί 176. Ο πυρήνας του είναι ασυνήθιστα μεγάλος για έναν τόσο μικρό πλανήτη.',
    },
  },
  {
    id: 'venus', kind: 'planet', color: '#e7c98f', R: 6051.8, M: 4.8673e24, g: 8.87, vesc: 10.36, rho: 5243, rotH: -5832.5,
    P: 224.701, a: 108.209e6, T: 737, moons: 0, atm: ['CO₂ 96.5 %', 'N₂ 3.5 %'], missions: ['Mariner 2', 'Venera', 'Magellan', 'Venus Express', 'Akatsuki'],
    desc: {
      nl: 'Venus is bijna even groot als de Aarde, maar een broeikaseffect op hol geslagen heeft haar het heetste oppervlak van het zonnestelsel gegeven. De atmosfeer is ongeveer 92 keer zo dicht als die van de Aarde en bestaat vooral uit koolstofdioxide. Venus draait retrograde en zeer langzaam: een dag duurt er langer dan een jaar.',
      en: 'Venus is almost as big as Earth, but a runaway greenhouse effect has given it the hottest surface in the Solar System. Its atmosphere is about 92 times as dense as Earth\'s and consists mainly of carbon dioxide. Venus spins backwards and very slowly: one day there lasts longer than its year.',
      el: 'Η Αφροδίτη έχει σχεδόν το μέγεθος της Γης, αλλά ένα ανεξέλεγκτο φαινόμενο του θερμοκηπίου της έχει δώσει την πιο θερμή επιφάνεια του Ηλιακού Συστήματος. Η ατμόσφαιρά της είναι περίπου 92 φορές πυκνότερη από της Γης και αποτελείται κυρίως από διοξείδιο του άνθρακα. Περιστρέφεται ανάποδα και πολύ αργά: η ημέρα της διαρκεί περισσότερο από το έτος της.',
    },
  },
  {
    id: 'earth', kind: 'planet', color: '#3b82f6', R: 6371.0, M: 5.9722e24, g: 9.80, vesc: 11.19, rho: 5514, rotH: 23.9345,
    P: 365.256, a: 149.598e6, T: 288, moons: 1, atm: ['N₂ 78 %', 'O₂ 21 %', 'Ar 0.9 %'], missions: ['Sputnik 1', 'Explorer 1', 'Landsat', 'ISS', 'Terra'],
    desc: {
      nl: 'De Aarde is de enige plek waarvan we zeker weten dat er leven is. Ze heeft vloeibaar water aan het oppervlak, een beschermend magnetisch veld en een stikstof-zuurstofatmosfeer. Het is de dichtste van alle planeten. De Maan stabiliseert de stand van de aardas en veroorzaakt de getijden.',
      en: 'Earth is the only place we know for certain that hosts life. It has liquid water at the surface, a protective magnetic field and a nitrogen-oxygen atmosphere. It is the densest of all the planets. The Moon stabilises the tilt of Earth\'s axis and raises the tides.',
      el: 'Η Γη είναι το μοναδικό μέρος όπου γνωρίζουμε με βεβαιότητα ότι υπάρχει ζωή. Έχει υγρό νερό στην επιφάνεια, προστατευτικό μαγνητικό πεδίο και ατμόσφαιρα από άζωτο και οξυγόνο. Είναι ο πιο πυκνός από όλους τους πλανήτες. Η Σελήνη σταθεροποιεί την κλίση του άξονα της Γης και προκαλεί τις παλίρροιες.',
    },
  },
  {
    id: 'mars', kind: 'planet', color: '#dc6b3f', R: 3389.5, M: 6.4169e23, g: 3.73, vesc: 5.03, rho: 3933, rotH: 24.6229,
    P: 686.980, a: 227.956e6, T: 208, moons: 2, atm: ['CO₂ 95 %', 'N₂ 2.8 %', 'Ar 2 %'], missions: ['Viking 1 & 2', 'Pathfinder', 'MRO', 'Curiosity', 'Perseverance', 'Tianwen-1'],
    desc: {
      nl: 'Mars is een koude woestijnplaneet met een ijle koolstofdioxide-atmosfeer. Ze heeft de hoogste vulkaan (Olympus Mons, ongeveer 22 km) en de grootste kloof (Valles Marineris) van het zonnestelsel. Er zijn duidelijke sporen van water uit het verre verleden. Een marsdag is met 24 uur en 37 minuten bijna even lang als een aardse dag.',
      en: 'Mars is a cold desert planet with a thin carbon-dioxide atmosphere. It has the tallest volcano (Olympus Mons, about 22 km) and the largest canyon (Valles Marineris) in the Solar System. There are clear signs of water in the distant past. A Martian day is 24 hours and 37 minutes, almost the same as an Earth day.',
      el: 'Ο Άρης είναι ένας ψυχρός πλανήτης-έρημος με αραιή ατμόσφαιρα διοξειδίου του άνθρακα. Έχει το ψηλότερο ηφαίστειο (Όλυμπος, περίπου 22 km) και το μεγαλύτερο φαράγγι (Valles Marineris) του Ηλιακού Συστήματος. Υπάρχουν καθαρά ίχνη νερού από το μακρινό παρελθόν. Η μέρα του Άρη διαρκεί 24 ώρες και 37 λεπτά, σχεδόν όσο μια γήινη.',
    },
  },
  {
    id: 'ceres', kind: 'dwarf', color: '#c7c2b8', R: 469.7, M: 9.3835e20, g: 0.284, vesc: 0.516, rho: 2162, rotH: 9.074,
    P: 1681.6, a: 413.7e6, T: 168, moons: 0, atm: [], atmNote: 'none', missions: ['Dawn'],
    desc: {
      nl: 'Ceres is het grootste object in de planetoïdengordel tussen Mars en Jupiter en de enige dwergplaneet in het binnenste zonnestelsel. Ongeveer een derde van haar massa bestaat waarschijnlijk uit water en ijs. De sonde Dawn vond er heldere zoutvlekken in de krater Occator. Ceres werd in 1801 ontdekt door Giuseppe Piazzi.',
      en: 'Ceres is the largest object in the asteroid belt between Mars and Jupiter and the only dwarf planet in the inner Solar System. Roughly a third of its mass is probably water and ice. The Dawn spacecraft found bright salt deposits in Occator crater. Ceres was discovered in 1801 by Giuseppe Piazzi.',
      el: 'Η Δήμητρα είναι το μεγαλύτερο σώμα της ζώνης των αστεροειδών ανάμεσα στον Άρη και τον Δία και ο μοναδικός νάνος πλανήτης του εσωτερικού Ηλιακού Συστήματος. Περίπου το ένα τρίτο της μάζας της είναι πιθανότατα νερό και πάγος. Το διαστημόπλοιο Dawn βρήκε φωτεινά αποθέματα αλάτων στον κρατήρα Occator. Η Δήμητρα ανακαλύφθηκε το 1801 από τον Τζουζέπε Πιάτσι.',
    },
  },
  {
    id: 'jupiter', kind: 'planet', color: '#d9b38c', R: 69911, M: 1.89813e27, g: 25.9, vesc: 60.2, rho: 1326, rotH: 9.925,
    P: 4332.59, a: 778.479e6, T: 165, moons: 97, atm: ['H₂ 90 %', 'He 10 %'], missions: ['Pioneer 10 & 11', 'Voyager 1 & 2', 'Galileo', 'Juno', 'JUICE', 'Europa Clipper'],
    desc: {
      nl: 'Jupiter is de grootste planeet: meer dan tweeënhalf keer zo zwaar als alle andere planeten samen. Hij bestaat vooral uit waterstof en helium en heeft geen vast oppervlak. De Grote Rode Vlek is een storm die al minstens enkele eeuwen woedt. Jupiter draait in minder dan 10 uur om zijn as, de snelste van alle planeten.',
      en: 'Jupiter is the largest planet: more than two and a half times as massive as all the other planets combined. It consists mostly of hydrogen and helium and has no solid surface. The Great Red Spot is a storm that has raged for at least a few centuries. Jupiter spins in under 10 hours, the fastest of all planets.',
      el: 'Ο Δίας είναι ο μεγαλύτερος πλανήτης: έχει περισσότερο από δυόμισι φορές τη μάζα όλων των άλλων πλανητών μαζί. Αποτελείται κυρίως από υδρογόνο και ήλιο και δεν έχει στερεή επιφάνεια. Η Μεγάλη Ερυθρά Κηλίδα είναι μια καταιγίδα που μαίνεται εδώ και τουλάχιστον μερικούς αιώνες. Ο Δίας περιστρέφεται σε λιγότερο από 10 ώρες, ο ταχύτερος από όλους τους πλανήτες.',
    },
  },
  {
    id: 'saturn', kind: 'planet', color: '#e8d3a0', R: 58232, M: 5.6834e26, g: 11.2, vesc: 36.1, rho: 687, rotH: 10.656,
    P: 10759.22, a: 1432.041e6, T: 134, moons: 274, atm: ['H₂ 96 %', 'He 3 %'], missions: ['Pioneer 11', 'Voyager 1 & 2', 'Cassini–Huygens'],
    desc: {
      nl: 'Saturnus is beroemd om zijn ringen van ijsdeeltjes, die over 270 000 km breed zijn maar meestal maar tientallen meters dik. Zijn gemiddelde dichtheid is lager dan die van water: in een grote genoeg badkuip zou hij drijven. In 2025 stond de teller op 274 erkende manen, het hoogste aantal van alle planeten. De sonde Cassini onderzocht het systeem van 2004 tot 2017.',
      en: 'Saturn is famous for its rings of ice particles, which span over 270,000 km but are usually only tens of metres thick. Its mean density is lower than that of water: in a big enough bathtub it would float. In 2025 the count stood at 274 recognised moons, the most of any planet. The Cassini probe studied the system from 2004 to 2017.',
      el: 'Ο Κρόνος φημίζεται για τους δακτυλίους του από σωματίδια πάγου, που εκτείνονται σε πάνω από 270.000 km αλλά έχουν συνήθως πάχος μόλις δεκάδες μέτρα. Η μέση πυκνότητά του είναι μικρότερη από του νερού: σε αρκετά μεγάλη μπανιέρα θα επέπλεε. Το 2025 οι αναγνωρισμένοι δορυφόροι του έφταναν τους 274, οι περισσότεροι από κάθε πλανήτη. Το διαστημόπλοιο Cassini μελέτησε το σύστημα από το 2004 έως το 2017.',
    },
  },
  {
    id: 'uranus', kind: 'planet', color: '#9ee7e7', R: 25362, M: 8.6810e25, g: 9.0, vesc: 21.4, rho: 1271, rotH: -17.24,
    P: 30688.5, a: 2870.972e6, T: 76, moons: 29, atm: ['H₂ 83 %', 'He 15 %', 'CH₄ 2.3 %'], missions: ['Voyager 2'],
    desc: {
      nl: 'Uranus is een ijsreus die als het ware op zijn zij ligt: zijn as staat 98° gekanteld, waardoor elke pool tijdens een omloop van 84 jaar zo\'n 42 jaar zonlicht en 42 jaar duisternis krijgt. De blauwgroene kleur komt van methaan in de atmosfeer. Het is de koudste planeet qua minimumtemperatuur. Alleen Voyager 2 heeft hem bezocht, in 1986.',
      en: 'Uranus is an ice giant that rolls around on its side: its axis is tilted 98°, so over its 84-year orbit each pole gets about 42 years of sunlight and 42 years of darkness. The blue-green colour comes from methane in its atmosphere. Its minimum temperature is the coldest of any planet. Only Voyager 2 has visited it, in 1986.',
      el: 'Ο Ουρανός είναι ένας πάγινος γίγαντας που γυρίζει σχεδόν «ξαπλωμένος»: ο άξονάς του έχει κλίση 98°, οπότε στη διάρκεια της τροχιάς των 84 ετών κάθε πόλος παίρνει περίπου 42 χρόνια φως και 42 χρόνια σκοτάδι. Το γαλαζοπράσινο χρώμα οφείλεται στο μεθάνιο της ατμόσφαιρας. Έχει τη χαμηλότερη ελάχιστη θερμοκρασία από όλους τους πλανήτες. Τον έχει επισκεφθεί μόνο το Voyager 2, το 1986.',
    },
  },
  {
    id: 'neptune', kind: 'planet', color: '#5b7cf0', R: 24622, M: 1.02409e26, g: 11.3, vesc: 23.6, rho: 1638, rotH: 16.11,
    P: 60182, a: 4498.252e6, T: 72, moons: 16, atm: ['H₂ 80 %', 'He 19 %', 'CH₄ 1.5 %'], missions: ['Voyager 2'],
    desc: {
      nl: 'Neptunus is de buitenste planeet en een tweede ijsreus. Hij heeft de krachtigste winden van het zonnestelsel, met snelheden tot ruim 2000 km/u. Zijn bestaan werd in 1846 uit berekeningen voorspeld, op grond van afwijkingen in de baan van Uranus. Voyager 2 vloog in 1989 langs.',
      en: 'Neptune is the outermost planet and a second ice giant. It has the strongest winds in the Solar System, with speeds of over 2,000 km/h. Its existence was predicted from calculations in 1846, based on irregularities in the orbit of Uranus. Voyager 2 flew past in 1989.',
      el: 'Ο Ποσειδώνας είναι ο εξωτερικός πλανήτης και δεύτερος πάγινος γίγαντας. Έχει τους ισχυρότερους ανέμους του Ηλιακού Συστήματος, με ταχύτητες πάνω από 2.000 km/h. Η ύπαρξή του προβλέφθηκε με υπολογισμούς το 1846, με βάση ανωμαλίες στην τροχιά του Ουρανού. Το Voyager 2 τον προσπέρασε το 1989.',
    },
  },
  {
    id: 'pluto', kind: 'dwarf', color: '#c9b79c', R: 1188.3, M: 1.3025e22, g: 0.62, vesc: 1.21, rho: 1854, rotH: -153.2928,
    P: 90560, a: 5906.4e6, T: 44, moons: 5, atm: ['N₂', 'CH₄', 'CO'], atmNote: 'trace', missions: ['New Horizons'],
    desc: {
      nl: 'Pluto werd in 1930 ontdekt en gold tot 2006 als negende planeet, sindsdien als dwergplaneet. Haar baan is zeer langgerekt en gekanteld, en Pluto en Charon draaien om een punt buiten Pluto zelf. New Horizons vond in 2015 een verrassend actieve wereld met een groot stikstofijsvlak, het Tombaugh Regio. Een Plutojaar duurt ongeveer 248 aardse jaren.',
      en: 'Pluto was discovered in 1930 and counted as the ninth planet until 2006, and as a dwarf planet since. Its orbit is highly elongated and tilted, and Pluto and Charon orbit a point outside Pluto itself. New Horizons found a surprisingly active world in 2015, with a vast nitrogen-ice plain, Tombaugh Regio. A Pluto year lasts about 248 Earth years.',
      el: 'Ο Πλούτωνας ανακαλύφθηκε το 1930 και μέχρι το 2006 θεωρούνταν ο ένατος πλανήτης, από τότε είναι νάνος πλανήτης. Η τροχιά του είναι πολύ επιμήκης και κεκλιμένη, και ο Πλούτωνας με τον Χάρωνα περιφέρονται γύρω από ένα σημείο έξω από τον ίδιο τον Πλούτωνα. Το New Horizons βρήκε το 2015 έναν εκπληκτικά ενεργό κόσμο με μια τεράστια πεδιάδα πάγου αζώτου, την Tombaugh Regio. Ένα έτος του Πλούτωνα διαρκεί περίπου 248 γήινα έτη.',
    },
  },
  // ---------------- moons ----------------
  {
    id: 'moon', kind: 'moon', parent: 'earth', color: '#d1d5db', R: 1737.4, M: 7.346e22, g: 1.62, vesc: 2.38, rho: 3344, sync: true, rotH: 655.72,
    P: 27.3217, a: 384400, atm: [], atmNote: 'trace', missions: ['Luna 2 & 9', 'Apollo 11–17', 'Chang\'e 4 & 5', 'Chandrayaan-3', 'LRO', 'Artemis'],
    desc: {
      nl: 'De Maan is het enige hemellichaam buiten de Aarde waar mensen hebben gelopen: twaalf astronauten tussen 1969 en 1972. Ze draait gebonden rond de Aarde, dus we zien altijd dezelfde kant. Waarschijnlijk is ze ontstaan toen een planeet ter grootte van Mars de jonge Aarde raakte. Elk jaar verwijdert ze zich ongeveer 3,8 cm van ons.',
      en: 'The Moon is the only world beyond Earth where humans have walked: twelve astronauts between 1969 and 1972. It is tidally locked to Earth, so we always see the same side. It most likely formed when a Mars-sized planet struck the young Earth. Every year it drifts about 3.8 cm farther away.',
      el: 'Η Σελήνη είναι το μοναδικό ουράνιο σώμα πέρα από τη Γη όπου έχουν περπατήσει άνθρωποι: δώδεκα αστροναύτες μεταξύ 1969 και 1972. Έχει δεσμευμένη περιστροφή ως προς τη Γη, γι\' αυτό βλέπουμε πάντα την ίδια πλευρά. Πιθανότατα σχηματίστηκε όταν ένας πλανήτης στο μέγεθος του Άρη χτύπησε τη νεαρή Γη. Κάθε χρόνο απομακρύνεται περίπου 3,8 cm από εμάς.',
    },
  },
  {
    id: 'phobos', kind: 'moon', parent: 'mars', color: '#9a8f84', R: 11.1, M: 1.0659e16, g: 0.0057, vesc: 0.0113, rho: 1876, sync: true, rotH: 7.654,
    P: 0.31891, a: 9376, atm: [], atmNote: 'none', missions: ['Viking', 'Mars Express', 'MRO', 'MMX|planned'],
    desc: {
      nl: 'Phobos is de grotere van de twee kleine, onregelmatige manen van Mars. Hij draait zo dicht rond de planeet dat hij drie keer per marsdag opkomt en in ongeveer 50 miljoen jaar zal botsen of uiteenvallen. Opvallend is de grote krater Stickney. Het is waarschijnlijk een ingevangen planetoïde of restmateriaal van een oude inslag.',
      en: 'Phobos is the larger of the two small, irregular moons of Mars. It orbits so close to the planet that it rises three times per Martian day, and in roughly 50 million years it will crash into Mars or break apart. Its big Stickney crater stands out. It is probably a captured asteroid or debris from an ancient impact.',
      el: 'Ο Φόβος είναι ο μεγαλύτερος από τους δύο μικρούς, ακανόνιστους δορυφόρους του Άρη. Κινείται τόσο κοντά στον πλανήτη που ανατέλλει τρεις φορές σε κάθε μέρα του Άρη και σε περίπου 50 εκατομμύρια χρόνια θα πέσει πάνω του ή θα διαλυθεί. Ξεχωρίζει ο μεγάλος κρατήρας Stickney. Πιθανότατα είναι αστεροειδής που αιχμαλωτίστηκε ή υπόλοιπο μιας αρχαίας σύγκρουσης.',
    },
  },
  {
    id: 'deimos', kind: 'moon', parent: 'mars', color: '#b7a99a', R: 6.2, M: 1.4762e15, g: 0.0026, vesc: 0.0056, rho: 1471, sync: true, rotH: 30.312,
    P: 1.26244, a: 23458, atm: [], atmNote: 'none', missions: ['Viking', 'Mars Express', 'MRO'],
    desc: {
      nl: 'Deimos is de kleinere en verder gelegen maan van Mars. Hij is maar ongeveer 12 km groot en heeft een gladder oppervlak dan Phobos omdat stof de kraters deels heeft opgevuld. Vanaf Mars lijkt hij slechts een heldere ster. Zijn zwaartekracht is zo zwak dat een goede sprong je in een baan zou kunnen brengen.',
      en: 'Deimos is the smaller and more distant moon of Mars. It is only about 12 km across and has a smoother surface than Phobos because dust has partly filled its craters. From Mars it looks like just a bright star. Its gravity is so weak that a good jump could nearly put you into orbit.',
      el: 'Ο Δείμος είναι ο μικρότερος και πιο απομακρυσμένος δορυφόρος του Άρη. Έχει διάμετρο μόλις περίπου 12 km και πιο λεία επιφάνεια από τον Φόβο, επειδή η σκόνη έχει γεμίσει εν μέρει τους κρατήρες του. Από τον Άρη μοιάζει απλώς με ένα φωτεινό αστέρι. Η βαρύτητά του είναι τόσο ασθενής που ένα καλό άλμα θα μπορούσε σχεδόν να σε βάλει σε τροχιά.',
    },
  },
  {
    id: 'io', kind: 'moon', parent: 'jupiter', color: '#e8d36a', R: 1821.6, M: 8.9319e22, g: 1.80, vesc: 2.56, rho: 3528, sync: true, rotH: 42.46,
    P: 1.769138, a: 421800, atm: ['SO₂'], atmNote: 'trace', missions: ['Voyager 1', 'Galileo', 'Juno'],
    desc: {
      nl: 'Io is het meest vulkanische hemellichaam van het zonnestelsel, met honderden actieve vulkanen. De hitte komt van getijdenkrachten van Jupiter en de buurmanen die de maan voortdurend kneden. Het oppervlak is geel, oranje en zwart door zwavelverbindingen. Een dunne zwavelrijke atmosfeer wordt steeds door uitbarstingen aangevuld.',
      en: 'Io is the most volcanic body in the Solar System, with hundreds of active volcanoes. The heat comes from tidal forces of Jupiter and the neighbouring moons, which constantly knead the moon. Its surface is yellow, orange and black from sulphur compounds. A thin sulphur-rich atmosphere is continually replenished by eruptions.',
      el: 'Η Ιώ είναι το πιο ηφαιστειακό σώμα του Ηλιακού Συστήματος, με εκατοντάδες ενεργά ηφαίστεια. Η θερμότητα προέρχεται από τις παλιρροϊκές δυνάμεις του Δία και των γειτονικών δορυφόρων, που τη «ζυμώνουν» διαρκώς. Η επιφάνειά της είναι κίτρινη, πορτοκαλί και μαύρη από ενώσεις του θείου. Μια λεπτή ατμόσφαιρα πλούσια σε θείο ανανεώνεται συνεχώς από τις εκρήξεις.',
    },
  },
  {
    id: 'europa', kind: 'moon', parent: 'jupiter', color: '#e6dccd', R: 1560.8, M: 4.7998e22, g: 1.315, vesc: 2.03, rho: 3013, sync: true, rotH: 85.23,
    P: 3.551181, a: 671100, T: 102, atm: ['O₂'], atmNote: 'trace', missions: ['Pioneer 10', 'Voyager 1 & 2', 'Galileo', 'Juno', 'Europa Clipper', 'JUICE'],
    desc: {
      nl: 'Europa heeft een ijskorst waaronder zich waarschijnlijk een wereldwijde oceaan van vloeibaar water bevindt, met meer water dan alle oceanen van de Aarde samen. Daarom is het een van de beste kandidaten voor leven buiten de Aarde. Het oppervlak is jong en doorkruist door bruine breuklijnen. Europa Clipper is onderweg om haar nader te onderzoeken.',
      en: 'Europa has an ice crust that most likely hides a global ocean of liquid water, holding more water than all of Earth\'s oceans together. That makes it one of the best candidates for life beyond Earth. Its surface is young and criss-crossed by brown fracture lines. Europa Clipper is on its way to study it in detail.',
      el: 'Η Ευρώπη έχει φλοιό πάγου κάτω από τον οποίο πιθανότατα κρύβεται ένας παγκόσμιος ωκεανός υγρού νερού, με περισσότερο νερό από όλους τους ωκεανούς της Γης μαζί. Γι\' αυτό είναι ένας από τους καλύτερους υποψήφιους για ζωή πέρα από τη Γη. Η επιφάνειά της είναι νέα και διασχίζεται από καφέ ρωγμές. Το Europa Clipper βρίσκεται καθ\' οδόν για να τη μελετήσει από κοντά.',
    },
  },
  {
    id: 'ganymede', kind: 'moon', parent: 'jupiter', color: '#a8a29a', R: 2634.1, M: 1.4819e23, g: 1.428, vesc: 2.74, rho: 1936, sync: true, rotH: 171.71,
    P: 7.154553, a: 1070400, T: 110, atm: ['O₂'], atmNote: 'trace', missions: ['Pioneer 10 & 11', 'Voyager 1 & 2', 'Galileo', 'Juno', 'JUICE'],
    desc: {
      nl: 'Ganymedes is de grootste maan van het zonnestelsel, groter dan Mercurius, maar met veel minder massa. Het is de enige maan met een eigen magnetisch veld. Onder het ijs ligt waarschijnlijk een zoute oceaan. De ESA-sonde JUICE moet er rond 2034 in een baan komen.',
      en: 'Ganymede is the largest moon in the Solar System, bigger than Mercury but with far less mass. It is the only moon with its own magnetic field. A salty ocean probably lies beneath the ice. ESA\'s JUICE probe is due to enter orbit around it around 2034.',
      el: 'Ο Γανυμήδης είναι ο μεγαλύτερος δορυφόρος του Ηλιακού Συστήματος, μεγαλύτερος από τον Ερμή αλλά με πολύ μικρότερη μάζα. Είναι ο μοναδικός δορυφόρος με δικό του μαγνητικό πεδίο. Κάτω από τον πάγο υπάρχει πιθανότατα ένας αλμυρός ωκεανός. Το διαστημόπλοιο JUICE της ESA αναμένεται να μπει σε τροχιά γύρω του περίπου το 2034.',
    },
  },
  {
    id: 'callisto', kind: 'moon', parent: 'jupiter', color: '#6b6259', R: 2410.3, M: 1.0759e23, g: 1.235, vesc: 2.44, rho: 1834, sync: true, rotH: 400.54,
    P: 16.689017, a: 1882700, T: 134, atm: ['CO₂'], atmNote: 'trace', missions: ['Pioneer 10 & 11', 'Voyager 1 & 2', 'Galileo', 'JUICE'],
    desc: {
      nl: 'Callisto heeft het meest verkraterde oppervlak van het zonnestelsel en is dus ook een van de oudste. Ze ligt ver genoeg van Jupiter om weinig straling te krijgen, wat haar interessant maakt voor een toekomstige basis. Mogelijk ligt onder het ijs een oceaan. Binnenin is ze nauwelijks gedifferentieerd: steen en ijs zijn grotendeels gemengd gebleven.',
      en: 'Callisto has the most heavily cratered surface in the Solar System, which also makes it one of the oldest. It lies far enough from Jupiter to receive little radiation, which makes it interesting for a future base. An ocean may exist beneath the ice. Inside it is barely differentiated: rock and ice have largely stayed mixed.',
      el: 'Η Καλλιστώ έχει την πιο κρατηρωμένη επιφάνεια του Ηλιακού Συστήματος και άρα είναι και από τις αρχαιότερες. Βρίσκεται αρκετά μακριά από τον Δία ώστε να δέχεται λίγη ακτινοβολία, κάτι που την κάνει ενδιαφέρουσα για μια μελλοντική βάση. Ίσως υπάρχει ωκεανός κάτω από τον πάγο. Στο εσωτερικό της έχει διαφοροποιηθεί ελάχιστα: βράχος και πάγος έχουν μείνει κατά το μεγαλύτερο μέρος αναμεμειγμένα.',
    },
  },
  {
    id: 'titan', kind: 'moon', parent: 'saturn', color: '#d99a3a', R: 2574.7, M: 1.3452e23, g: 1.352, vesc: 2.64, rho: 1881, sync: true, rotH: 382.69,
    P: 15.945421, a: 1221870, T: 94, atm: ['N₂ 95 %', 'CH₄ 5 %'], missions: ['Pioneer 11', 'Voyager 1', 'Cassini–Huygens', 'Dragonfly|planned'],
    desc: {
      nl: 'Titan is de enige maan met een dichte atmosfeer, anderhalf keer zo dicht aan het oppervlak als die van de Aarde. Op het oppervlak liggen meren en rivieren van vloeibaar methaan en ethaan. In 2005 landde de sonde Huygens er als enige ooit in het buitenste zonnestelsel. NASA\'s Dragonfly, een rotorvaartuig, is gepland om er te vliegen.',
      en: 'Titan is the only moon with a dense atmosphere, one and a half times as dense at the surface as Earth\'s. Its surface holds lakes and rivers of liquid methane and ethane. In 2005 the Huygens probe landed there, the only landing ever in the outer Solar System. NASA\'s Dragonfly rotorcraft is planned to fly there.',
      el: 'Ο Τιτάν είναι ο μοναδικός δορυφόρος με πυκνή ατμόσφαιρα, μιάμιση φορά πυκνότερη στην επιφάνεια από της Γης. Στην επιφάνειά του υπάρχουν λίμνες και ποτάμια από υγρό μεθάνιο και αιθάνιο. Το 2005 το Huygens προσεδαφίστηκε εκεί, η μοναδική προσεδάφιση που έγινε ποτέ στο εξωτερικό Ηλιακό Σύστημα. Το Dragonfly της NASA, ένα περιστροφικό διαστημόπλοιο, προγραμματίζεται να πετάξει εκεί.',
    },
  },
  {
    id: 'enceladus', kind: 'moon', parent: 'saturn', color: '#f4f6f8', R: 252.1, M: 1.0802e20, g: 0.113, vesc: 0.239, rho: 1609, sync: true, rotH: 32.89,
    P: 1.370218, a: 238040, T: 75, atm: ['H₂O'], atmNote: 'trace', missions: ['Voyager 1 & 2', 'Cassini'],
    desc: {
      nl: 'Enceladus is een kleine, spiegelende ijsmaan. Uit scheuren bij de zuidpool spuiten geisers van waterdamp en ijs die de E-ring van Saturnus voeden. Cassini vloog door die pluimen en vond zouten, organische moleculen en waterstof, tekenen van een bewoonbare oceaan eronder. Daarmee is hij een topdoel voor het zoeken naar leven.',
      en: 'Enceladus is a small, mirror-bright ice moon. Geysers of water vapour and ice erupt from cracks near its south pole and feed Saturn\'s E ring. Cassini flew through those plumes and found salts, organic molecules and hydrogen, signs of a habitable ocean below. That makes it a prime target in the search for life.',
      el: 'Ο Εγκέλαδος είναι ένας μικρός, λαμπερός σαν καθρέφτης δορυφόρος από πάγο. Από ρωγμές κοντά στον νότιο πόλο αναβλύζουν θερμοπίδακες υδρατμών και πάγου που τροφοδοτούν τον δακτύλιο Ε του Κρόνου. Το Cassini πέταξε μέσα από αυτά τα νέφη και βρήκε άλατα, οργανικά μόρια και υδρογόνο, ενδείξεις ενός κατοικήσιμου ωκεανού από κάτω. Έτσι είναι κορυφαίος στόχος στην αναζήτηση ζωής.',
    },
  },
  {
    id: 'triton', kind: 'moon', parent: 'neptune', color: '#e8cfc4', R: 1353.4, M: 2.1390e22, g: 0.779, vesc: 1.455, rho: 2061, sync: true, rotH: -141.04,
    P: 5.876854, a: 354759, T: 38, atm: ['N₂'], atmNote: 'trace', missions: ['Voyager 2'],
    desc: {
      nl: 'Triton draait tegen de omloopsrichting van Neptunus in (retrograde), wat erop wijst dat hij een ingevangen object uit de Kuipergordel is, verwant aan Pluto. Het is een van de koudste plekken die we kennen. Voyager 2 zag er stikstofgeisers die donkere pluimen uitstoten. Door getijdenwerking nadert hij Neptunus langzaam en zal hij over miljarden jaren uiteenvallen.',
      en: 'Triton orbits against the direction of Neptune\'s rotation (retrograde), which suggests it is a captured Kuiper Belt object, related to Pluto. It is one of the coldest places we know. Voyager 2 saw nitrogen geysers throwing up dark plumes. Because of tidal drag it is slowly spiralling in toward Neptune and will break up in billions of years.',
      el: 'Ο Τρίτωνας κινείται αντίθετα προς τη φορά περιστροφής του Ποσειδώνα (ανάδρομη κίνηση), κάτι που δείχνει ότι είναι αιχμαλωτισμένο σώμα της ζώνης Κάιπερ, συγγενικό με τον Πλούτωνα. Είναι ένα από τα ψυχρότερα μέρη που γνωρίζουμε. Το Voyager 2 είδε θερμοπίδακες αζώτου να εκτοξεύουν σκοτεινά νέφη. Λόγω των παλιρροϊκών δυνάμεων πλησιάζει αργά τον Ποσειδώνα και σε δισεκατομμύρια χρόνια θα διαλυθεί.',
    },
  },
  {
    id: 'charon', kind: 'moon', parent: 'pluto', color: '#9b948c', R: 606, M: 1.586e21, g: 0.288, vesc: 0.59, rho: 1702, sync: true, rotH: 153.29,
    P: 6.3872, a: 19591, atm: [], atmNote: 'none', missions: ['New Horizons'],
    desc: {
      nl: 'Charon is met een middellijn van ruim de helft van Pluto zo groot dat de twee een dubbelsysteem vormen. Ze draaien om een punt in de ruimte tussen hen in en tonen elkaar altijd dezelfde kant. Charons noordpool heeft een rood-bruine kap, gevormd uit gassen die van Pluto ontsnappen. New Horizons bracht het in 2015 in beeld.',
      en: 'With a diameter of more than half that of Pluto, Charon is so large that the two form a double system. They orbit a point in space between them and always show each other the same face. Charon\'s north pole wears a reddish-brown cap, formed from gases escaping from Pluto. New Horizons imaged it in 2015.',
      el: 'Με διάμετρο πάνω από το μισό του Πλούτωνα, ο Χάρων είναι τόσο μεγάλος που οι δύο σχηματίζουν διπλό σύστημα. Περιφέρονται γύρω από ένα σημείο στο διάστημα ανάμεσά τους και δείχνουν πάντα την ίδια όψη ο ένας στον άλλον. Ο βόρειος πόλος του Χάρωνα έχει ένα κοκκινοκαφέ «καπέλο», που σχηματίστηκε από αέρια που διαφεύγουν από τον Πλούτωνα. Το New Horizons τον απεικόνισε το 2015.',
    },
  },
]

export const BODY_MAP: Record<string, Body> = Object.fromEntries(BODY_LIST.map((b) => [b.id, b]))
export const bodyName = (id: string, lang: Lang) => NAMES[id]?.[lang] ?? id
export const PLANET_IDS = BODY_LIST.filter((b) => b.kind === 'planet').map((b) => b.id)
export const MOON_IDS = BODY_LIST.filter((b) => b.kind === 'moon').map((b) => b.id)
