// Real interplanetary missions and their documented key events (UTC). Only well-documented dates are listed
// (NASA/JPL, ESA and mission-team chronologies); anything we are not sure about is left out.
// Events of kind launch / flyby / arrival are NODES of the reconstruction: consecutive nodes are joined by a heliocentric
// Lambert arc between the ephemeris positions of the bodies. Other events (minor, end) are only shown in the timeline.
import type { BodyId } from '../../lib/astro.ts'

export type L3 = { nl: string; en: string; el: string }
export type EventKind = 'launch' | 'flyby' | 'arrival' | 'minor' | 'end'
export type MissionStatus = 'ended' | 'active' | 'enroute'

export interface MissionEvent {
  kind: EventKind
  /** UTC instant, ISO 8601 */
  date: string
  /** launch / flyby / arrival: the body whose ephemeris position is the node. minor / end: set when the craft is at that body (e.g. in orbit). */
  body?: BodyId
  /** arrival only: 'orbit' = orbit insertion, otherwise the last encounter is a (fast) flyby */
  orbit?: boolean
  /** free text for minor / end events (asteroid names, end of mission, ...) */
  text?: L3
  /** the time of day is rounded (only the day is documented with certainty here) */
  approx?: boolean
  /** Leg arriving at this node: number of full revolutions of the Lambert arc and which root (default 0). */
  revs?: number
  branch?: 'lo' | 'hi'
}

export interface Mission {
  id: string
  name: string
  agency: string
  status: MissionStatus
  /** extra targets that are not an ephemeris body (shown in the list) */
  extraTargets?: string[]
  desc: L3
  source: string
  events: MissionEvent[]
}

const ev = (kind: EventKind, date: string, rest: Partial<MissionEvent> = {}): MissionEvent => ({ kind, date, ...rest })

export const MISSIONS: Mission[] = [
  {
    id: 'voyager2', name: 'Voyager 2', agency: 'NASA', status: 'active',
    desc: {
      nl: 'De enige sonde die alle vier reuzenplaneten bezocht: Jupiter, Saturnus, Uranus en Neptunus, dankzij een zeldzame planeetuitlijning (Grand Tour). Verliet in 2018 de heliosfeer.',
      en: 'The only spacecraft to visit all four giant planets: Jupiter, Saturn, Uranus and Neptune, thanks to a rare planetary alignment (the Grand Tour). Left the heliosphere in 2018.',
      el: 'Το μοναδικό διαστημόπλοιο που επισκέφθηκε και τους τέσσερις γιγάντιους πλανήτες: Δία, Κρόνο, Ουρανό και Ποσειδώνα, χάρη σε μια σπάνια ευθυγράμμιση των πλανητών (Grand Tour). Βγήκε από την ηλιόσφαιρα το 2018.',
    },
    source: 'NASA/JPL Voyager mission pages & encounter chronology',
    events: [
      ev('launch', '1977-08-20T14:29:00Z', { body: 'earth' }),
      ev('flyby', '1979-07-09T22:29:00Z', { body: 'jupiter' }),
      ev('flyby', '1981-08-26T03:24:00Z', { body: 'saturn' }),
      ev('flyby', '1986-01-24T17:59:00Z', { body: 'uranus' }),
      ev('arrival', '1989-08-25T03:56:00Z', { body: 'neptune' }),
    ],
  },
  {
    id: 'voyager1', name: 'Voyager 1', agency: 'NASA', status: 'active',
    desc: {
      nl: 'Twee planeten, daarna de ruimte tussen de sterren. Een scherpe Titan-passage bij Saturnus boog de baan uit het vlak van de planeten; sinds 2012 in de interstellaire ruimte.',
      en: 'Two planets, then the space between the stars. A close Titan pass at Saturn bent the path out of the planetary plane; in interstellar space since 2012.',
      el: 'Δύο πλανήτες και μετά ο χώρος ανάμεσα στα άστρα. Μια κοντινή διέλευση από τον Τιτάνα στον Κρόνο έστριψε την τροχιά εκτός του επιπέδου των πλανητών. Στο διαστρικό διάστημα από το 2012.',
    },
    source: 'NASA/JPL Voyager mission pages & encounter chronology',
    events: [
      ev('launch', '1977-09-05T12:56:00Z', { body: 'earth' }),
      ev('flyby', '1979-03-05T12:05:00Z', { body: 'jupiter' }),
      ev('arrival', '1980-11-12T23:46:00Z', { body: 'saturn' }),
    ],
  },
  {
    id: 'pioneer10', name: 'Pioneer 10', agency: 'NASA', status: 'ended',
    desc: {
      nl: 'Eerste ruimtesonde door de planetoïdengordel en eerste langs Jupiter. Het laatste signaal kwam in 2003.',
      en: 'First spacecraft through the asteroid belt and the first past Jupiter. The last signal arrived in 2003.',
      el: 'Το πρώτο διαστημόπλοιο που διέσχισε τη ζώνη των αστεροειδών και το πρώτο που πέρασε από τον Δία. Το τελευταίο σήμα ελήφθη το 2003.',
    },
    source: 'NASA Ames Pioneer 10 & 11 mission chronology',
    events: [
      ev('launch', '1972-03-03T01:49:00Z', { body: 'earth' }),
      ev('arrival', '1973-12-04T02:26:00Z', { body: 'jupiter' }),
      ev('end', '2003-01-23T12:00:00Z', { approx: true, text: { nl: 'Laatste ontvangen signaal', en: 'Last signal received', el: 'Τελευταίο σήμα που λήφθηκε' } }),
    ],
  },
  {
    id: 'pioneer11', name: 'Pioneer 11', agency: 'NASA', status: 'ended',
    desc: {
      nl: 'Langs Jupiter en daarna door een zwaartekrachtsslinger naar Saturnus: de eerste sonde bij Saturnus.',
      en: 'Past Jupiter and then, using its gravity assist, on to Saturn: the first spacecraft at Saturn.',
      el: 'Πέρασε από τον Δία και μετά, με βαρυτική υποβοήθηση, έφτασε στον Κρόνο: το πρώτο διαστημόπλοιο στον Κρόνο.',
    },
    source: 'NASA Ames Pioneer 10 & 11 mission chronology',
    events: [
      ev('launch', '1973-04-06T02:11:00Z', { body: 'earth' }),
      ev('flyby', '1974-12-03T05:22:00Z', { body: 'jupiter' }),
      ev('arrival', '1979-09-01T16:30:00Z', { body: 'saturn' }),
      ev('end', '1995-09-30T12:00:00Z', { approx: true, text: { nl: 'Reguliere operaties beëindigd', en: 'Routine operations ended', el: 'Τέλος των τακτικών επιχειρήσεων' } }),
    ],
  },
  {
    id: 'mariner10', name: 'Mariner 10', agency: 'NASA', status: 'ended',
    desc: {
      nl: 'De eerste sonde met een zwaartekrachtsslinger: Venus boog de baan naar Mercurius, die drie keer werd gepasseerd.',
      en: 'The first mission to use a gravity assist: Venus bent its path towards Mercury, which was passed three times.',
      el: 'Η πρώτη αποστολή με βαρυτική υποβοήθηση: η Αφροδίτη έστρεψε την τροχιά προς τον Ερμή, τον οποίο πέρασε τρεις φορές.',
    },
    source: 'NASA/JPL Mariner 10 mission page',
    events: [
      ev('launch', '1973-11-03T05:45:00Z', { body: 'earth' }),
      ev('flyby', '1974-02-05T17:01:00Z', { body: 'venus' }),
      ev('flyby', '1974-03-29T20:47:00Z', { body: 'mercury' }),
      ev('flyby', '1974-09-21T20:59:00Z', { revs: 1, branch: 'lo', body: 'mercury' }),
      ev('arrival', '1975-03-16T22:39:00Z', { revs: 1, branch: 'lo', body: 'mercury' }),
      ev('end', '1975-03-24T12:00:00Z', { approx: true, text: { nl: 'Stuurgas op, sonde uitgeschakeld', en: 'Attitude gas exhausted, spacecraft shut down', el: 'Εξαντλήθηκε το αέριο προσανατολισμού, τερματισμός' } }),
    ],
  },
  {
    id: 'galileo', name: 'Galileo', agency: 'NASA', status: 'ended',
    desc: {
      nl: 'Eerste baan om Jupiter. De VEEGA-route (Venus, tweemaal Aarde) gaf een raket die te zwak was toch genoeg energie. Onderweg de eerste asteroïdenbezoeken (Gaspra, Ida); de sonde ging op 7 december 1995 Jupiters atmosfeer in.',
      en: 'First orbiter of Jupiter. The VEEGA route (Venus, Earth twice) gave a launcher that was too weak enough energy. On the way the first asteroid encounters (Gaspra, Ida); its probe entered Jupiter\'s atmosphere on 7 December 1995.',
      el: 'Ο πρώτος δορυφόρος του Δία. Η διαδρομή VEEGA (Αφροδίτη, δύο φορές Γη) έδωσε αρκετή ενέργεια παρά τον αδύναμο φορέα. Στη διαδρομή οι πρώτες συναντήσεις με αστεροειδείς (Γκάσπρα, Ίντα). Ο ανιχνευτής μπήκε στην ατμόσφαιρα του Δία στις 7 Δεκεμβρίου 1995.',
    },
    source: 'NASA/JPL Galileo mission page & chronology',
    events: [
      ev('launch', '1989-10-18T16:53:00Z', { body: 'earth' }),
      ev('flyby', '1990-02-10T05:58:00Z', { body: 'venus' }),
      ev('flyby', '1990-12-08T20:35:00Z', { body: 'earth' }),
      ev('minor', '1991-10-29T22:37:00Z', { text: { nl: 'Asteroïde 951 Gaspra', en: 'Asteroid 951 Gaspra', el: 'Αστεροειδής 951 Γκάσπρα' } }),
      ev('flyby', '1992-12-08T15:09:00Z', { revs: 1, branch: 'lo', body: 'earth' }),
      ev('minor', '1993-08-28T16:52:00Z', { text: { nl: 'Asteroïde 243 Ida', en: 'Asteroid 243 Ida', el: 'Αστεροειδής 243 Ίντα' } }),
      ev('arrival', '1995-12-07T22:04:00Z', { body: 'jupiter', orbit: true }),
      ev('end', '2003-09-21T18:57:00Z', { body: 'jupiter', text: { nl: 'Gecontroleerde val in Jupiter', en: 'Deliberate plunge into Jupiter', el: 'Σκόπιμη πτώση στον Δία' } }),
    ],
  },
  {
    id: 'cassini', name: 'Cassini–Huygens', agency: 'NASA/ESA/ASI', status: 'ended',
    desc: {
      nl: 'Dertien jaar bij Saturnus. De VVEJGA-route: twee keer Venus, Aarde en Jupiter. De Huygens-lander daalde in 2005 op Titan.',
      en: 'Thirteen years at Saturn. The VVEJGA route: Venus twice, Earth and Jupiter. The Huygens lander descended to Titan in 2005.',
      el: 'Δεκατρία χρόνια στον Κρόνο. Η διαδρομή VVEJGA: δύο φορές Αφροδίτη, Γη και Δίας. Ο ανιχνευτής Huygens προσεδαφίστηκε στον Τιτάνα το 2005.',
    },
    source: 'NASA/JPL Cassini mission timeline',
    events: [
      ev('launch', '1997-10-15T08:43:00Z', { body: 'earth' }),
      ev('flyby', '1998-04-26T13:48:00Z', { body: 'venus' }),
      ev('flyby', '1999-06-24T20:20:00Z', { body: 'venus' }),
      ev('flyby', '1999-08-18T03:28:00Z', { body: 'earth' }),
      ev('flyby', '2000-12-30T10:05:00Z', { body: 'jupiter' }),
      ev('arrival', '2004-07-01T02:00:00Z', { body: 'saturn', orbit: true, approx: true }),
      ev('minor', '2005-01-14T12:43:00Z', { body: 'saturn', text: { nl: 'Huygens landt op Titan', en: 'Huygens lands on Titan', el: 'Ο Huygens προσεδαφίζεται στον Τιτάνα' } }),
      ev('end', '2017-09-15T11:55:00Z', { body: 'saturn', text: { nl: 'Grand Finale: duik in Saturnus', en: 'Grand Finale: plunge into Saturn', el: 'Grand Finale: βουτιά στον Κρόνο' } }),
    ],
  },
  {
    id: 'newhorizons', name: 'New Horizons', agency: 'NASA', status: 'active',
    extraTargets: ['Arrokoth'],
    desc: {
      nl: 'De snelste lancering ooit: Jupiter gaf een extra zet, negen jaar later vloog de sonde langs Pluto en in 2019 langs Arrokoth.',
      en: 'The fastest launch ever: Jupiter gave an extra boost, nine years later it flew past Pluto and in 2019 past Arrokoth.',
      el: 'Η ταχύτερη εκτόξευση όλων των εποχών: ο Δίας έδωσε επιπλέον ώθηση, εννέα χρόνια αργότερα πέρασε από τον Πλούτωνα και το 2019 από το Arrokoth.',
    },
    source: 'NASA/JHUAPL New Horizons mission timeline',
    events: [
      ev('launch', '2006-01-19T19:00:00Z', { body: 'earth' }),
      ev('flyby', '2007-02-28T05:43:00Z', { body: 'jupiter' }),
      ev('arrival', '2015-07-14T11:49:00Z', { body: 'pluto' }),
      ev('minor', '2019-01-01T05:33:00Z', { text: { nl: 'Kuipergordel-object Arrokoth', en: 'Kuiper-belt object Arrokoth', el: 'Αντικείμενο της ζώνης Κάιπερ Arrokoth' } }),
    ],
  },
  {
    id: 'messenger', name: 'MESSENGER', agency: 'NASA', status: 'ended',
    desc: {
      nl: 'Om in een baan om Mercurius te komen moet je veel energie kwijt: zes planeetpassages (Aarde, 2× Venus, 3× Mercurius) remden de sonde af. Vier jaar in een baan om Mercurius.',
      en: 'Entering orbit around Mercury means shedding a lot of energy: six planetary flybys (Earth, Venus twice, Mercury three times) slowed the probe down. Four years in orbit around Mercury.',
      el: 'Για να μπεις σε τροχιά γύρω από τον Ερμή πρέπει να χάσεις πολλή ενέργεια: έξι πλανητικές διελεύσεις (Γη, δύο φορές Αφροδίτη, τρεις φορές Ερμής) επιβράδυναν το σκάφος. Τέσσερα χρόνια σε τροχιά γύρω από τον Ερμή.',
    },
    source: 'NASA/JHUAPL MESSENGER mission timeline',
    events: [
      ev('launch', '2004-08-03T06:16:00Z', { body: 'earth' }),
      ev('flyby', '2005-08-02T19:13:00Z', { body: 'earth' }),
      ev('flyby', '2006-10-24T08:34:00Z', { revs: 1, branch: 'hi', body: 'venus' }),
      ev('flyby', '2007-06-05T23:08:00Z', { body: 'venus' }),
      ev('flyby', '2008-01-14T19:04:00Z', { revs: 1, branch: 'hi', body: 'mercury' }),
      ev('flyby', '2008-10-06T08:40:00Z', { revs: 2, branch: 'lo', body: 'mercury' }),
      ev('flyby', '2009-09-29T21:55:00Z', { revs: 3, branch: 'lo', body: 'mercury' }),
      ev('arrival', '2011-03-18T00:45:00Z', { revs: 5, branch: 'lo', body: 'mercury', orbit: true, approx: true }),
      ev('end', '2015-04-30T19:26:00Z', { body: 'mercury', text: { nl: 'Inslag op Mercurius', en: 'Impact on Mercury', el: 'Πρόσκρουση στον Ερμή' } }),
    ],
  },
  {
    id: 'juno', name: 'Juno', agency: 'NASA', status: 'active',
    desc: {
      nl: 'Zonne-energie tot Jupiter. Na een Aarde-flyby voor extra snelheid volgde in 2016 de baaninjectie in een poolbaan om Jupiter.',
      en: 'Solar powered all the way to Jupiter. An Earth flyby for extra speed was followed in 2016 by insertion into a polar orbit around Jupiter.',
      el: 'Με ηλιακή ενέργεια μέχρι τον Δία. Μετά από μια διέλευση από τη Γη για επιπλέον ταχύτητα, το 2016 ακολούθησε η είσοδος σε πολική τροχιά γύρω από τον Δία.',
    },
    source: 'NASA/JPL Juno mission timeline',
    events: [
      ev('launch', '2011-08-05T16:25:00Z', { body: 'earth' }),
      ev('flyby', '2013-10-09T19:21:00Z', { revs: 1, branch: 'lo', body: 'earth' }),
      ev('arrival', '2016-07-05T02:53:00Z', { body: 'jupiter', orbit: true }),
    ],
  },
  {
    id: 'rosetta', name: 'Rosetta', agency: 'ESA', status: 'ended',
    extraTargets: ['67P/Churyumov–Gerasimenko'],
    desc: {
      nl: 'Tien jaar onderweg naar komeet 67P met drie Aarde-passages en één Marspassage; onderweg langs de asteroïden Steins en Lutetia. De reconstructie eindigt bij de laatste Aardepassage; komeet 67P zelf is niet gemodelleerd.',
      en: 'Ten years en route to comet 67P with three Earth flybys and one Mars flyby, passing asteroids Steins and Lutetia on the way. The reconstruction ends at the last Earth flyby; comet 67P itself is not modelled.',
      el: 'Δέκα χρόνια ταξίδι προς τον κομήτη 67P με τρεις διελεύσεις από τη Γη και μία από τον Άρη, περνώντας από τους αστεροειδείς Στάινς και Λουτέτια. Η ανακατασκευή τελειώνει στην τελευταία διέλευση από τη Γη. Ο ίδιος ο κομήτης 67P δεν μοντελοποιείται.',
    },
    source: 'ESA Rosetta mission timeline',
    events: [
      ev('launch', '2004-03-02T07:17:00Z', { body: 'earth' }),
      ev('flyby', '2005-03-04T22:09:00Z', { revs: 1, branch: 'lo', body: 'earth' }),
      ev('flyby', '2007-02-25T01:57:00Z', { revs: 1, branch: 'lo', body: 'mars' }),
      ev('flyby', '2007-11-13T20:57:00Z', { body: 'earth' }),
      ev('minor', '2008-09-05T18:38:00Z', { text: { nl: 'Asteroïde 2867 Šteins', en: 'Asteroid 2867 Šteins', el: 'Αστεροειδής 2867 Στάινς' } }),
      ev('arrival', '2009-11-13T07:45:00Z', { body: 'earth' }),
      ev('minor', '2010-07-10T15:45:00Z', { text: { nl: 'Asteroïde 21 Lutetia', en: 'Asteroid 21 Lutetia', el: 'Αστεροειδής 21 Λουτέτια' } }),
      ev('minor', '2014-08-06T12:00:00Z', { approx: true, text: { nl: 'Aankomst bij komeet 67P (niet gemodelleerd)', en: 'Arrival at comet 67P (not modelled)', el: 'Άφιξη στον κομήτη 67P (δεν μοντελοποιείται)' } }),
      ev('end', '2016-09-30T10:39:00Z', { text: { nl: 'Landing op de komeet, einde missie', en: 'Landing on the comet, end of mission', el: 'Προσεδάφιση στον κομήτη, τέλος αποστολής' } }),
    ],
  },
  {
    id: 'bepicolombo', name: 'BepiColombo', agency: 'ESA/JAXA', status: 'enroute',
    desc: {
      nl: 'Europees-Japanse missie naar Mercurius, onderweg met negen planeetpassages. Zes daarvan zijn Mercurius zelf (2021-2025). Het inschieten in een baan om Mercurius staat gepland voor november 2026 en is hier niet getekend.',
      en: 'European-Japanese mission to Mercury with nine planetary flybys on the way, six of them at Mercury itself (2021-2025). Insertion into orbit around Mercury is planned for November 2026 and is not drawn here.',
      el: 'Ευρωπαϊκή-ιαπωνική αποστολή προς τον Ερμή με εννέα πλανητικές διελεύσεις στη διαδρομή, έξι από αυτές στον ίδιο τον Ερμή (2021-2025). Η είσοδος σε τροχιά γύρω από τον Ερμή προγραμματίζεται για τον Νοέμβριο του 2026 και δεν σχεδιάζεται εδώ.',
    },
    source: 'ESA BepiColombo mission timeline',
    events: [
      ev('launch', '2018-10-20T01:45:00Z', { body: 'earth' }),
      ev('flyby', '2020-04-10T04:25:00Z', { revs: 1, branch: 'lo', body: 'earth' }),
      ev('flyby', '2020-10-15T03:58:00Z', { body: 'venus' }),
      ev('flyby', '2021-08-10T13:51:00Z', { revs: 1, branch: 'hi', body: 'venus' }),
      ev('flyby', '2021-10-01T23:34:00Z', { body: 'mercury' }),
      ev('flyby', '2022-06-23T09:44:00Z', { revs: 2, branch: 'lo', body: 'mercury' }),
      ev('flyby', '2023-06-19T19:34:00Z', { revs: 4, branch: 'lo', body: 'mercury' }),
      ev('flyby', '2024-09-04T12:00:00Z', { revs: 5, branch: 'lo', body: 'mercury', approx: true }),
      ev('flyby', '2024-12-02T12:00:00Z', { revs: 1, branch: 'lo', body: 'mercury', approx: true }),
      ev('arrival', '2025-01-08T12:00:00Z', { body: 'mercury', approx: true }),
    ],
  },
]

export const missionById = (id: string) => MISSIONS.find((m) => m.id === id)
export const evMs = (e: MissionEvent) => Date.parse(e.date)
export const isNode = (e: MissionEvent) => e.kind === 'launch' || e.kind === 'flyby' || e.kind === 'arrival'
