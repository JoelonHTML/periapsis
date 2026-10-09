// Formula cards from the EPFL course (3.3 special orbits, 3.4 rendezvous, 4.2 interplanetary, 4.3 aerobraking & slingshot), in course notation.
// Every card has Dutch (title/text/src) plus English and Greek in `loc`. TeX is language-neutral (String.raw).
export interface Formula {
  title: string; tex: string; text: string; src: string
  loc?: { en: { title: string; text: string; src?: string; tex?: string }; el: { title: string; text: string; src?: string; tex?: string } }
}
const T = String.raw
const EPFL = 'EPFL, Space Mission Design and Operations'

export const COURSE_FORMULAS: Formula[] = [
  {
    title: 'Geosynchrone en geostationaire baan', tex: T`T=\frac{2\pi r}{V}=2\pi\sqrt{\frac{r^3}{\mu}}\;\Rightarrow\; r_{GEO}=42\,164{,}2\ \text{km},\ V=3{,}0747\ \text{km/s},\ T=23\text{h}56\text{m}4{,}09\text{s}`,
    text: 'Zoek r met T = één siderische dag. Geostationair = geosynchroon met e = 0 en i = 0 (de grondsporen is één punt). Vanaf GEO zie je de Aarde onder 2·asin(R/r) = 17,4°.',
    src: `${EPFL}, 3.3.1`,
    loc: {
      en: { title: 'Geosynchronous and geostationary orbit', text: 'Find r with T = one sidereal day. Geostationary = geosynchronous with e = 0 and i = 0 (the ground track is a single point). From GEO the Earth is seen under 2·asin(R/r) = 17.4°.' },
      el: { title: 'Γεωσύγχρονη και γεωστατική τροχιά', text: 'Βρες το r με T = μία αστρική ημέρα. Γεωστατική = γεωσύγχρονη με e = 0 και i = 0 (το ίχνος είναι ένα σημείο). Από τη GEO η Γη φαίνεται υπό γωνία 2·asin(R/r) = 17,4°.' },
    },
  },
  {
    title: 'GTO → GEO: gecombineerde manoeuvre in het apogeum', tex: T`\Delta v_2=V_{circ}-V_{apogee},\ \ \Delta v_3=2V_{apogee}\sin\frac{\Delta i}{2},\ \ \Delta v_{comb}=\sqrt{V_{apogee}^2+V_{circ}^2-2V_{apogee}V_{circ}\cos\Delta i}`,
    text: 'De GTO heeft de inclinatie van de lanceerbasis (Kourou 5°, Kennedy 28,5°). Cirkelmaken en vlakverandering samen in het apogeum kost minder dan apart: voorbeeld Kennedy, V_apogee = 1,606 km/s, V_circ = 3,0747 km/s: apart 1,469 + 0,791 = 2,260 km/s, gecombineerd 1,83 km/s.',
    src: `${EPFL}, 3.3.1; Curtis, hfst. 6`,
    loc: {
      en: { title: 'GTO → GEO: combined manoeuvre at the apogee', text: 'The GTO is inclined by the latitude of the launch site (Kourou 5°, Kennedy 28.5°). Circularising and changing plane in one burn at the apogee costs less than separately: Kennedy example, V_apogee = 1.606 km/s, V_circ = 3.0747 km/s: separate 1.469 + 0.791 = 2.260 km/s, combined 1.83 km/s.' },
      el: { title: 'GTO → GEO: συνδυασμένος ελιγμός στο απόγειο', text: 'Η GTO έχει κλίση ίση με το γεωγραφικό πλάτος της βάσης (Kourou 5°, Kennedy 28,5°). Κυκλοποίηση και αλλαγή επιπέδου μαζί στο απόγειο κοστίζουν λιγότερο: Kennedy, V_apogee = 1,606 km/s, V_circ = 3,0747 km/s: χωριστά 1,469 + 0,791 = 2,260 km/s, συνδυασμένα 1,83 km/s.' },
    },
  },
  {
    title: 'Knoopregressie door de aardafplatting', tex: T`\frac{d\Omega}{dt}=-2{,}06474\times10^{14}\,\frac{\cos i}{a^{3{,}5}\,(1-e^2)^2}\ \ [^\circ/\text{dag}],\ a\ \text{in km}\quad(=-\tfrac32 J_2\tfrac{R^2}{p^2}\,n\cos i)`,
    text: 'Afplatting 1:298 (6378,13 − 6356,75 = 21,38 km) geeft een koppel op de baan. Prograde (i < 90°): knopenlijn naar het westen (regressie); retrograde (i > 90°): naar het oosten (progressie); i = 90°: geen drift. Op 200 km hoogte en i = 0°: −8,9 °/dag; op 5000 km: −1,3 °/dag.',
    src: `${EPFL}, 3.3.2; Vallado; Curtis`,
    loc: {
      en: { title: 'Nodal regression due to the equatorial bulge', text: 'The flattening 1:298 (6378.13 − 6356.75 = 21.38 km) puts a torque on the orbit. Prograde (i < 90°): the line of nodes moves west (regression); retrograde (i > 90°): east (progression); i = 90°: no drift. At 200 km and i = 0°: −8.9 °/day; at 5000 km: −1.3 °/day.' },
      el: { title: 'Οπισθοδρόμηση κόμβων λόγω επιπλάτυνσης', text: 'Η επιπλάτυνση 1:298 (6378,13 − 6356,75 = 21,38 km) ασκεί ροπή στην τροχιά. Πρόγραδη (i < 90°): η γραμμή κόμβων κινείται δυτικά (οπισθοδρόμηση)· ανάδρομη (i > 90°): ανατολικά· i = 90°: καμία μετατόπιση. Στα 200 km και i = 0°: −8,9 °/ημέρα· στα 5000 km: −1,3 °/ημέρα.' },
    },
  },
  {
    title: 'Zonsynchrone baan', tex: T`\dot\Omega_{SSO}=\frac{360^\circ}{365{,}242\ \text{d}}=0{,}9856\ ^\circ/\text{dag}\;\Rightarrow\;\cos i=-\frac{0{,}9856}{2{,}06474\times10^{14}}\,a^{3{,}5}(1-e^2)^2`,
    text: 'De knopenlijn moet per jaar één keer rond: 0,9856°/dag naar het oosten, dus retrograde banen: i ≈ 97° (400 km), 98,6° (800 km), 99,5° (1000 km), 105° (≈ 2000 km). Boven a ≈ 12 350 km (h ≈ 5970 km) bestaat geen oplossing meer.',
    src: `${EPFL}, 3.3.2`,
    loc: {
      en: { title: 'Sun-synchronous orbit', text: 'The line of nodes must make one turn per year: 0.9856°/day eastward, hence retrograde orbits: i ≈ 97° (400 km), 98.6° (800 km), 99.5° (1000 km), 105° (≈ 2000 km). Above a ≈ 12 350 km (h ≈ 5970 km) there is no solution.' },
      el: { title: 'Ηλιοσύγχρονη τροχιά', text: 'Η γραμμή κόμβων πρέπει να κάνει μία στροφή τον χρόνο: 0,9856°/ημέρα προς τα ανατολικά, άρα ανάδρομες τροχιές: i ≈ 97° (400 km), 98,6° (800 km), 99,5° (1000 km), 105° (≈ 2000 km). Πάνω από a ≈ 12 350 km δεν υπάρχει λύση.' },
    },
  },
  {
    title: 'Rendezvous: inhaalsnelheid (catch-up rate)', tex: T`\Delta x=V_{circ}\,\Delta T=3\pi\,\Delta r\ \ (\Delta r\ll r),\qquad \Delta x\simeq3\pi\,(r-a)\ \ \text{(ellips}\ a<r)`,
    text: 'Uit T = 2π r^{3/2}/√μ volgt dT/dr = 3π/V_circ. Na één baan is het lagere object 3π ≈ 10 keer het hoogteverschil vooruitgekomen. Δx > 0 voor a < r, Δx < 0 voor a > r. Faserate = snelheid waarmee de fasehoek φ (gemeten vanuit het middelpunt) verandert.',
    src: `${EPFL}, 3.4.1`,
    loc: {
      en: { title: 'Rendezvous: catch-up rate', text: 'From T = 2π r^{3/2}/√μ follows dT/dr = 3π/V_circ. After one orbit the lower object has moved ahead by 3π ≈ 10 times the altitude difference. Δx > 0 for a < r, Δx < 0 for a > r. Phasing rate = rate at which the phase angle φ (measured from the centre) changes.' },
      el: { title: 'Rendezvous: ρυθμός προσέγγισης', text: 'Από T = 2π r^{3/2}/√μ προκύπτει dT/dr = 3π/V_circ. Μετά από μία τροχιά το χαμηλότερο αντικείμενο έχει προχωρήσει 3π ≈ 10 φορές τη διαφορά ύψους. Δx > 0 για a < r, Δx < 0 για a > r.' },
    },
  },
  {
    title: 'Rendezvous: fasebaan en burns in het vlak', tex: T`T_p=T\left(1-\frac{\varphi}{360^\circ n}\right),\quad \Delta h_{\text{overkant}}\approx\frac{4\,\Delta v}{n_{\text{beweging}}},\quad n_{\text{beweging}}=\sqrt{\frac{\mu}{r^3}}`,
    text: 'Doel φ graden vooruit: kies een fasebaan met periode T_p zodat de jager in n omlopen inhaalt. Prograde burn → 180° verder hogere hoogte (tragere, langere baan); retrograde → lagere hoogte; radiale burn verandert a, E en T niet en verschuift alleen het periapsis; een vlakverandering moet in het knooppunt. Voorbeeld Shuttle: Δv = 1 ft/s ≈ 0,5 n.mi hoogte.',
    src: `${EPFL}, 3.4.2–3.4.6; Curtis, hfst. 6`,
    loc: {
      en: { title: 'Rendezvous: phasing orbit and in-plane burns', tex: T`T_p=T\left(1-\frac{\varphi}{360^\circ n}\right),\quad \Delta h_{\text{opposite}}\approx\frac{4\,\Delta v}{n_{\text{motion}}},\quad n_{\text{motion}}=\sqrt{\frac{\mu}{r^3}}`,
        text: 'Target φ degrees ahead: choose a phasing orbit with period T_p so the chaser catches up in n revolutions. Posigrade burn → higher altitude 180° later (slower, longer orbit); retrograde → lower altitude; a radial burn leaves a, energy and period unchanged and only shifts the periapsis; a plane change must be made at the nodal crossing. Shuttle example: Δv = 1 ft/s ≈ 0.5 n.mi altitude.' },
      el: { title: 'Rendezvous: τροχιά φάσης και καύσεις στο επίπεδο', tex: T`T_p=T\left(1-\frac{\varphi}{360^\circ n}\right),\quad \Delta h\approx\frac{4\,\Delta v}{n},\quad n=\sqrt{\frac{\mu}{r^3}}`,
        text: 'Στόχος φ μοίρες μπροστά: διάλεξε τροχιά φάσης με περίοδο T_p ώστε ο κυνηγός να προλάβει σε n περιστροφές. Πρόγραδη καύση → υψηλότερο ύψος 180° μετά· ανάδρομη → χαμηλότερο· ακτινική καύση δεν αλλάζει a, ενέργεια και περίοδο· η αλλαγή επιπέδου γίνεται στον κόμβο. Shuttle: Δv = 1 ft/s ≈ 0,5 n.mi ύψος.' },
    },
  },
  {
    title: 'Invloedssfeer (Laplace) en Hill-straal', tex: T`R_S=R\left(\frac{\mu_{planeet}}{\mu_{Zon}}\right)^{2/5},\qquad r_H=a(1-e)\left(\frac{m}{3M}\right)^{1/3}`,
    text: 'Binnen R_S is de beweging twee-lichamen (planeetgecentreerd), erbuiten heliocentrisch. R = gemiddelde afstand Zon–planeet. Collegetabel (10⁶ km): Venus 0,616, Aarde 0,924, Mars 0,577, Jupiter 48,2, Maan (t.o.v. Aarde) 0,0662. Voor het Aarde–Maan-systeem zelf is het concept niet bruikbaar.',
    src: `${EPFL}, 4.2.1; Curtis, hfst. 8; Laplace; Hill (1878)`,
    loc: {
      en: { title: 'Sphere of influence (Laplace) and Hill radius', text: 'Inside R_S the motion is two-body (planet-centred), outside it is heliocentric. R = mean Sun–planet distance. Course table (10⁶ km): Venus 0.616, Earth 0.924, Mars 0.577, Jupiter 48.2, Moon (w.r.t. Earth) 0.0662. For the Earth–Moon system itself the concept cannot really be used.' },
      el: { title: 'Σφαίρα επιρροής (Laplace) και ακτίνα Hill', text: 'Μέσα στο R_S η κίνηση είναι δύο σωμάτων (πλανητοκεντρική), έξω ηλιοκεντρική. R = μέση απόσταση Ήλιου–πλανήτη. Πίνακας (10⁶ km): Αφροδίτη 0,616, Γη 0,924, Άρης 0,577, Δίας 48,2, Σελήνη (ως προς τη Γη) 0,0662.' },
    },
  },
  {
    title: 'Patched conics: heliocentrisch ↔ planetocentrisch', tex: T`\text{verlaten: }\vec V_S=\vec v_S+\vec V_P,\ \vec R_S=\vec r_S+\vec R_P;\qquad \text{aankomen: }\vec v_a^{\infty}=\vec V_S-\vec V_P,\ \vec r_S=\vec R_S-\vec R_P`,
    text: 'Hoofdletters = heliocentrisch (S ruimtevaartuig, P planeet), kleine letters = planetocentrisch. Vier-lichamenprobleem in drie fasen: vertrek (planetocentrisch 1), cruise (heliocentrisch), aankomst (planetocentrisch 2).',
    src: `${EPFL}, 4.2.1–4.2.2; Curtis, hfst. 8`,
    loc: {
      en: { title: 'Patched conics: heliocentric ↔ planetocentric', tex: T`\text{leaving: }\vec V_S=\vec v_S+\vec V_P,\ \vec R_S=\vec r_S+\vec R_P;\qquad \text{arriving: }\vec v_a^{\infty}=\vec V_S-\vec V_P,\ \vec r_S=\vec R_S-\vec R_P`,
        text: 'Capitals = heliocentric (S spacecraft, P planet), lower case = planetocentric. A four-body problem in three phases: departure (planetocentric 1), cruise (heliocentric), arrival (planetocentric 2).' },
      el: { title: 'Patched conics: ηλιοκεντρικό ↔ πλανητοκεντρικό', tex: T`\text{αναχώρηση: }\vec V_S=\vec v_S+\vec V_P;\qquad \text{άφιξη: }\vec v_a^{\infty}=\vec V_S-\vec V_P`,
        text: 'Κεφαλαία = ηλιοκεντρικά (S διαστημόπλοιο, P πλανήτης), μικρά = πλανητοκεντρικά. Πρόβλημα τεσσάρων σωμάτων σε τρεις φάσεις: αναχώρηση, πλεύση, άφιξη.' },
    },
  },
  {
    title: 'Vertrek uit een parkeerbaan: energie en hyperbool', tex: T`v_d^2=(v_d^\infty)^2+v_{E,r_d}^2,\quad v=\sqrt{\frac{2\mu}{r}+\frac{\mu}{a}},\quad a=\frac{\mu}{(v_d^\infty)^2},\quad e=\frac{a+r_p}{a}=\frac ca>1,\quad \theta_{\infty}=\arccos\left(-\frac1e\right)`,
    text: 'Snelheid v_d in het perigeum van de parkeerbaan (r_p = r_d), v_E ontsnappingssnelheid op r_d (11,2 km/s aan het oppervlak). Ellips: |v_d| < |v_E|, parabool: =, hyperbool: >. Hyperbool: c = ae, c² = a² + b², x²/a² − y²/b² = 1. Vis-viva: hyperbool v² = 2μ/r + μ/a, ellips v² = 2μ/r − μ/a.',
    src: `${EPFL}, 4.2.2–4.2.3; Curtis, §3.5 en hfst. 8`,
    loc: {
      en: { title: 'Departure from a parking orbit: energy and hyperbola', text: 'v_d is the speed at the parking-orbit perigee (r_p = r_d), v_E the escape speed at r_d (11.2 km/s at the surface). Ellipse: |v_d| < |v_E|, parabola: =, hyperbola: >. Hyperbola: c = ae, c² = a² + b², x²/a² − y²/b² = 1. Vis-viva: hyperbola v² = 2μ/r + μ/a, ellipse v² = 2μ/r − μ/a.' },
      el: { title: 'Αναχώρηση από τροχιά στάθμευσης: ενέργεια και υπερβολή', text: 'v_d η ταχύτητα στο περίγειο (r_p = r_d), v_E η ταχύτητα διαφυγής στο r_d (11,2 km/s στην επιφάνεια). Έλλειψη: |v_d| < |v_E|, παραβολή: =, υπερβολή: >. Υπερβολή: c = ae, c² = a² + b². Vis-viva: υπερβολή v² = 2μ/r + μ/a, έλλειψη v² = 2μ/r − μ/a.' },
    },
  },
  {
    title: 'Aankomst: inslagparameter d∞, r_p en β', tex: T`a=\frac{\mu}{(v_a^\infty)^2},\quad r_p=-\frac{\mu}{(v_a^\infty)^2}+\sqrt{\frac{\mu^2}{(v_a^\infty)^4}+d_\infty^2},\quad \cos\beta=\frac{a}{a+r_p}=\frac ac=\frac1e,\quad \delta=180^\circ-2\beta`,
    text: 'v_a^∞ = V_S − V_P aan de invloedssfeer. De vluchtleiding kiest d∞ (inslagparameter in het B-vlak) en de hoek θ in dat vlak om een flyby of landing te bereiken. De sheet noemt “deviatie = 90° − β”: dat is de halve afbuiging, de volledige is δ = 180° − 2β.',
    src: `${EPFL}, 4.2.4; Curtis, hfst. 8`,
    loc: {
      en: { title: 'Arrival: impact parameter d∞, r_p and β', text: 'v_a^∞ = V_S − V_P at the sphere of influence. Flight control picks d∞ (impact parameter in the B-plane) and the angle θ in that plane to achieve a flyby or landing. The slide’s “deviation = 90° − β” is the half deflection; the full one is δ = 180° − 2β.' },
      el: { title: 'Άφιξη: παράμετρος πρόσκρουσης d∞, r_p και β', text: 'v_a^∞ = V_S − V_P στη σφαίρα επιρροής. Ο έλεγχος πτήσης επιλέγει d∞ (παράμετρος πρόσκρουσης στο επίπεδο B) και τη γωνία θ για flyby ή προσεδάφιση. Η «απόκλιση = 90° − β» είναι η μισή εκτροπή· η πλήρης είναι δ = 180° − 2β.' },
    },
  },
  {
    title: 'Baaninsertie rond de bestemmingsplaneet', tex: T`\Delta v_p^i=v_p-v_p^i=\sqrt{(v_a^\infty)^2+\frac{2\mu}{r_p}}-\sqrt{\frac{2\mu}{r_p}-\frac{\mu}{a_i}}`,
    text: 'Remmen in het periapsis (i = insertie, p = periapsis) van de aankomsthyperbool naar een ellips met halve lange as a_i. Cirkelbaan: a_i = r_p. Hoe groter a_i, hoe goedkoper.',
    src: `${EPFL}, 4.2.5; Curtis, hfst. 8`,
    loc: {
      en: { title: 'Orbit insertion at the destination planet', text: 'Brake at the periapsis (i = insertion, p = periapsis) of the arrival hyperbola into an ellipse with semi-major axis a_i. Circular orbit: a_i = r_p. The larger a_i, the cheaper.' },
      el: { title: 'Εισαγωγή σε τροχιά στον πλανήτη προορισμού', text: 'Πέδηση στο περίαστρο της υπερβολής άφιξης προς έλλειψη με ημιάξονα a_i. Κυκλική: a_i = r_p. Όσο μεγαλύτερο το a_i, τόσο φθηνότερο.' },
    },
  },
  {
    title: 'Slingshot (gravity assist): vectordiagram', tex: T`|\vec v_3|=|\vec v_4|,\quad |\vec V_P+\vec v_4|>|\vec V_P+\vec v_3|,\quad \cos\frac\delta2=\cos\beta=\frac{a}{a+r_p},\quad \vec V_S^{\,d}=\vec V_P+\vec v_d^{\infty}`,
    text: 'V₂ = zonsnelheid bij binnenkomst, V₅ bij vertrek uit de invloedssfeer, v₃ = V₂ − V_P en v₄ planetocentrisch (zelfde grootte, andere richting: draaiing over δ). Zonder motor blijft |v∞| gelijk; de zonsnelheid wint of verliest door de draaiing, afhankelijk van achter of voor de planeet langs vliegen (New Horizons: Jupiter 28 feb 2007, Pluto 14 juli 2015).',
    src: `${EPFL}, 4.3.2; Curtis, hfst. 8`,
    loc: {
      en: { title: 'Slingshot (gravity assist): vector diagram', text: 'V₂ = heliocentric speed on entering, V₅ on leaving the sphere of influence, v₃ = V₂ − V_P and v₄ planetocentric (same size, different direction: rotated by δ). Without an engine |v∞| is unchanged; the Sun-frame speed gains or loses through the rotation, depending on passing behind or in front of the planet (New Horizons: Jupiter 28 Feb 2007, Pluto 14 Jul 2015).' },
      el: { title: 'Slingshot (βαρυτική υποβοήθηση): διάγραμμα διανυσμάτων', text: 'V₂ = ηλιοκεντρική ταχύτητα κατά την είσοδο, V₅ κατά την έξοδο, v₃ = V₂ − V_P και v₄ πλανητοκεντρικά (ίδιο μέγεθος, στροφή κατά δ). Χωρίς κινητήρα το |v∞| μένει ίδιο· η ταχύτητα ως προς τον Ήλιο κερδίζει ή χάνει ανάλογα με το αν περνάς πίσω ή μπροστά από τον πλανήτη.' },
    },
  },
  {
    title: 'Aerodynamische remming: aerocapture, aerobraking, aeroentry', tex: T`\Delta v_{pas}=\tfrac12\,\frac{C_dA}{m}\,\rho_p\,v_p\sqrt{2\pi r_pH},\qquad a_{max}=\frac{v_e^2\sin\gamma_e}{2eH}`,
    text: 'Aerocapture: hyperbolische aanvliegroute → ellips in één passage (nog nooit toegepast). Aerobraking: een ellips verlagen via vele periapsispassages met kleine Δv (Mars, Venus). Aeroentry: naar het oppervlak (Apollo, Soyuz, ~11 km/s). Hitteschild nodig. Eerste formule: Δv per passage voor exponentiële dichtheid (H = schaalhoogte); tweede: Allen–Eggers piekvertraging.',
    src: `${EPFL}, 4.3.1; Allen & Eggers (1958)`,
    loc: {
      en: { title: 'Aerodynamic braking: aerocapture, aerobraking, aeroentry', text: 'Aerocapture: hyperbolic approach → ellipse in one pass (never used so far). Aerobraking: lower an ellipse via many periapsis passes with small Δv (Mars, Venus). Aeroentry: to the surface (Apollo, Soyuz, ~11 km/s). A heat shield is needed. First formula: Δv per pass for an exponential density (H = scale height); second: Allen–Eggers peak deceleration.' },
      el: { title: 'Αεροδυναμική πέδηση: aerocapture, aerobraking, aeroentry', text: 'Aerocapture: υπερβολική προσέγγιση → έλλειψη σε μία διέλευση. Aerobraking: μείωση έλλειψης με πολλές διελεύσεις περιάστρου (Άρης, Αφροδίτη). Aeroentry: προς την επιφάνεια (Apollo, Soyuz, ~11 km/s). Απαιτείται θερμική ασπίδα. Πρώτος τύπος: Δv ανά διέλευση· δεύτερος: μέγιστη επιβράδυνση Allen–Eggers.' },
    },
  },
]
