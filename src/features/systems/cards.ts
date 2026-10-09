// Card definitions of the "Spacecraft systems" formula section. Texts are [nl, en, el] triples; i18n.ts turns them into dictionary keys.
// `src` says where a formula comes from: "Cursus" = the EPFL course slides (Nicollier 5.2/5.3/5.4), otherwise a textbook.
import * as C from './calc.ts'

export type Tri = readonly [string, string, string]
export interface In { k: string; label: Tri | string; unit?: string; def: number }
export type Out = { err: Tri } | { rows: [Tri | string, string][] }
export interface Card {
  id: string; group: 'att' | 'pwr' | 'rel'
  title: Tri; text: Tri; tex: string; src: string
  inputs: In[]
  compute: (v: Record<string, number>) => Out
}

/** 4 significant digits, exponent for very large/small values. */
export const g = (x: number, sig = 4) => {
  if (!Number.isFinite(x)) return '—'
  if (x === 0) return '0'
  const a = Math.abs(x)
  return a >= 1e5 || a < 1e-3 ? x.toExponential(sig - 1).replace('e+', '×10^').replace('e-', '×10^-') : String(+x.toPrecision(sig))
}
const bad: Out = { err: ['Vul overal een positief getal in.', 'Enter a positive number in every field.', 'Δώστε θετικό αριθμό σε κάθε πεδίο.'] }
const pos = (v: Record<string, number>, ...ks: string[]) => ks.every((k) => v[k] > 0)
const nonneg = (v: Record<string, number>, ...ks: string[]) => ks.every((k) => v[k] >= 0)
const R_ = (h: number) => C.RE_M + h * 1000
const W = (nl: string, en: string, el: string): Tri => [nl, en, el]
const L = {
  h: W('Hoogte', 'Altitude', 'Ύψος') as Tri, theta: W('Hoek θ', 'Angle θ', 'Γωνία θ') as Tri, t: W('Tijd', 'Time', 'Χρόνος') as Tri,
}

export const GROUPS: { id: Card['group']; title: Tri }[] = [
  { id: 'att', title: W('Standregeling (attitude control)', 'Attitude control', 'Έλεγχος στάσης') },
  { id: 'pwr', title: W('Elektrisch vermogen', 'Electrical power', 'Ηλεκτρική ισχύς') },
  { id: 'rel', title: W('Betrouwbaarheid', 'Reliability', 'Αξιοπιστία') },
]

export const CARDS: Card[] = [
  // ============================================================ Attitude
  {
    id: 'gg', group: 'att', title: W('Zwaartekrachtgradiënt-koppel', 'Gravity-gradient torque', 'Ροπή βαροβαθμίδας'),
    text: W('Een langgerekt voorwerp richt zijn lange as naar de lokale verticaal (cursus). Het maximale storende koppel bij een afwijking θ van de verticaal.', 'An elongated body aligns its long axis with the local vertical (course). Disturbance torque for an angle θ from the vertical.', 'Ένα επιμήκες σώμα ευθυγραμμίζεται με την τοπική κατακόρυφο (μάθημα). Ροπή διαταραχής για γωνία θ από την κατακόρυφο.'),
    tex: 'T_g = \\frac{3\\mu}{2R^3}\\,|I_z - I_y|\\,\\sin 2\\theta',
    src: 'Wertz & Larson, SMAD §11.2 (disturbance torques); cursus 5.2 (gravity gradient)',
    inputs: [{ k: 'h', label: L.h, unit: 'km', def: 500 }, { k: 'Iz', label: 'I_z', unit: 'kg·m²', def: 800 }, { k: 'Iy', label: 'I_y', unit: 'kg·m²', def: 300 }, { k: 'th', label: L.theta, unit: '°', def: 45 }],
    compute: (v) => {
      if (!(v.h >= 0) || !nonneg(v, 'Iz', 'Iy')) return bad
      const T = C.gravityGradientTorque(C.MU_EARTH_SI, R_(v.h), v.Iz, v.Iy, v.th)
      return { rows: [['T_g', `${g(T)} N·m`]] }
    },
  },
  {
    id: 'srp', group: 'att', title: W('Zonnedruk-koppel (SRP)', 'Solar-radiation-pressure torque', 'Ροπή πίεσης ηλιακής ακτινοβολίας'),
    text: W('Het drukcentrum ligt zelden op de lijn massamiddelpunt–Zon; de afstand ertussen geeft een koppel. q = reflectiefactor (0 = zwart, 1 = spiegel).', 'The centre of pressure is rarely on the line centre of mass–Sun; the offset gives a torque. q = reflectance (0 = black, 1 = mirror).', 'Το κέντρο πίεσης σπάνια βρίσκεται στην ευθεία κέντρο μάζας–Ήλιος· η απόσταση δίνει ροπή. q = ανακλαστικότητα (0 = μαύρο, 1 = καθρέφτης).'),
    tex: 'T_{sp} = \\frac{F_s}{c}\\,A_s\\,(1+q)\\cos i\\,(c_{ps} - c_g)',
    src: 'Wertz & Larson, SMAD §11.2; F_s = 1361 W/m²',
    inputs: [{ k: 'Fs', label: 'F_s', unit: 'W/m²', def: C.S_SUN }, { k: 'As', label: 'A_s', unit: 'm²', def: 6 }, { k: 'q', label: 'q (0–1)', def: 0.6 }, { k: 'i', label: W('Invalshoek i', 'Incidence i', 'Γωνία πρόσπτωσης i') as Tri, unit: '°', def: 0 }, { k: 'arm', label: 'c_ps − c_g', unit: 'm', def: 0.2 }],
    compute: (v) => {
      if (!nonneg(v, 'Fs', 'As', 'arm') || v.q < 0 || v.q > 1) return bad
      return { rows: [['Fs / c', `${g(v.Fs / C.C_LIGHT)} N/m²`], ['T_sp', `${g(C.srpTorque(v.Fs, v.As, v.q, v.i, v.arm))} N·m`]] }
    },
  },
  {
    id: 'mag', group: 'att', title: W('Magnetisch storend koppel', 'Magnetic disturbance torque', 'Μαγνητική ροπή διαταραχής'),
    text: W('Rest-dipool D van het ruimtevaartuig in het aardveld. Veld in het ergste geval (pool) 2M/R³, aan de evenaar M/R³ (aan de oppervlakte 3,1·10⁻⁵ T, zoals in de cursus) met M = 7,96·10¹⁵ T·m³.', 'Residual dipole D of the spacecraft in the Earth field. Worst-case (polar) field 2M/R³, at the equator M/R³ (3.1×10⁻⁵ T at the surface, as in the course) with M = 7.96×10¹⁵ T·m³.', 'Υπολειμματικό δίπολο D του σκάφους στο γήινο πεδίο. Χειρότερη περίπτωση (πόλος) 2M/R³, στον ισημερινό M/R³ (3,1×10⁻⁵ T στην επιφάνεια, όπως στο μάθημα) με M = 7,96×10¹⁵ T·m³.'),
    tex: 'T_m = D\\,B,\\qquad B_{max} = \\frac{2M}{R^3}',
    src: 'Wertz & Larson, SMAD §11.2 (M = 7,96·10¹⁵ T·m³; IGRF-2020 geeft ≈ 7,6·10¹⁵)',
    inputs: [{ k: 'D', label: W('Rest-dipool D', 'Residual dipole D', 'Υπολειμματικό δίπολο D') as Tri, unit: 'A·m²', def: 1 }, { k: 'h', label: L.h, unit: 'km', def: 500 }],
    compute: (v) => {
      if (!nonneg(v, 'D', 'h')) return bad
      const B = C.dipoleBmax(R_(v.h))
      return { rows: [['B_max (pool)', `${g(B * 1e6)} µT`], ['B (evenaar)', `${g(B * 5e5)} µT`], ['T_m', `${g(C.magneticDisturbance(v.D, B))} N·m`]] }
    },
  },
  {
    id: 'aero', group: 'att', title: W('Aerodynamisch koppel', 'Aerodynamic torque', 'Αεροδυναμική ροπή'),
    text: W('Overheerst onder ca. 400 km. Dichtheid ρ invullen (zie rekenmachine "Ballistische coëfficiënt"); V = cirkelsnelheid op de gekozen hoogte.', 'Dominant below about 400 km. Enter density ρ (see the "Ballistic coefficient" calculator); V = circular speed at the altitude.', 'Κυριαρχεί κάτω από ~400 km. Δώστε πυκνότητα ρ· V = κυκλική ταχύτητα στο ύψος.'),
    tex: 'T_a = \\tfrac12\\,\\rho V^2\\,A\\,C_d\\,(c_p - c_g)',
    src: 'Wertz & Larson, SMAD §11.2',
    inputs: [{ k: 'rho', label: 'ρ', unit: 'kg/m³', def: 1e-12 }, { k: 'h', label: L.h, unit: 'km', def: 400 }, { k: 'A', label: 'A', unit: 'm²', def: 4 }, { k: 'Cd', label: 'C_d', def: 2.2 }, { k: 'arm', label: 'c_p − c_g', unit: 'm', def: 0.1 }],
    compute: (v) => {
      if (!nonneg(v, 'rho', 'h', 'A', 'Cd', 'arm')) return bad
      const V = Math.sqrt(C.MU_EARTH_SI / R_(v.h))
      return { rows: [['V', `${g(V)} m/s`], ['T_a', `${g(C.aeroTorque(v.rho, V, v.A, v.Cd, v.arm))} N·m`]] }
    },
  },
  {
    id: 'mtq', group: 'att', title: W('Magnetische torquer', 'Magnetic torquer', 'Μαγνητικός ροπέας'),
    text: W('Spoel met N windingen, oppervlak A en stroom I probeert zich naar het aardveld te richten. Alleen bruikbaar rond een planeet met magnetisch veld; geschikt voor grove stand en om wielen te ontladen (cursus).', 'A coil of N turns, area A and current I tries to align with the geomagnetic field. Only usable around a planet with a magnetic field; good for coarse pointing and desaturating wheels (course).', 'Πηνίο N σπειρών, εμβαδού A και ρεύματος I τείνει να ευθυγραμμιστεί με το γεωμαγνητικό πεδίο. Χρήσιμο μόνο γύρω από πλανήτη με μαγνητικό πεδίο· για χονδρικό στόχευση και αποκορεσμό τροχών (μάθημα).'),
    tex: 'T = N\\,B\\,A\\,I\\,\\sin\\theta',
    src: 'Cursus 5.2 (magnetic torquers)',
    inputs: [{ k: 'N', label: 'N', def: 1000 }, { k: 'B', label: 'B', unit: 'T', def: 3.1e-5 }, { k: 'A', label: 'A', unit: 'm²', def: 0.01 }, { k: 'I', label: 'I', unit: 'A', def: 0.1 }, { k: 'th', label: 'θ', unit: '°', def: 90 }],
    compute: (v) => {
      if (!nonneg(v, 'N', 'B', 'A', 'I')) return bad
      return { rows: [['T', `${g(C.magnetorquer(v.N, v.B, v.A, v.I, v.th))} N·m`], ['magn. moment N·A·I', `${g(v.N * v.A * v.I)} A·m²`]] }
    },
  },
  {
    id: 'thr', group: 'att', title: W('Draaiing om één as met thrusters', 'One-axis manoeuvre with thrusters', 'Στροφή γύρω από έναν άξονα με προωθητήρες'),
    text: W('Versnellen gedurende t_b, uitrollen gedurende t_c, remmen gedurende t_b. n = aantal thrusters, L = arm tot het massamiddelpunt.', 'Accelerate for t_b, coast for t_c, brake for t_b. n = number of thrusters, L = lever arm from the centre of mass.', 'Επιτάχυνση για t_b, ολίσθηση για t_c, πέδηση για t_b. n = αριθμός προωθητήρων, L = μοχλοβραχίονας από το κέντρο μάζας.'),
    tex: '\\alpha = \\frac{nFL}{I_v},\\ \\omega_{max} = \\alpha t_b,\\ \\theta_m = \\frac{nFL}{I_v}t_b^2 + \\frac{nFL}{I_v}t_b t_c,\\ m_p = \\frac{2nF\\,t_b}{g\\,I_{sp}}',
    src: 'Cursus 5.2.4 (naar Brown, Elements of Spacecraft Design)',
    inputs: [{ k: 'n', label: 'n', def: 2 }, { k: 'F', label: 'F', unit: 'N', def: 10 }, { k: 'L', label: 'L', unit: 'm', def: 1 }, { k: 'Iv', label: 'I_v', unit: 'kg·m²', def: 1000 }, { k: 'tb', label: 't_b', unit: 's', def: 5 }, { k: 'tc', label: 't_c', unit: 's', def: 0 }, { k: 'Isp', label: 'I_sp', unit: 's', def: 220 }],
    compute: (v) => {
      if (!pos(v, 'n', 'F', 'L', 'Iv', 'tb', 'Isp') || !(v.tc >= 0)) return bad
      const r = C.thrusterManeuver({ n: v.n, F: v.F, L: v.L, Iv: v.Iv, tb: v.tb, tc: v.tc, Isp: v.Isp })
      return { rows: [['T = nFL', `${g(r.T)} N·m`], ['α', `${g(r.alpha)} rad/s²`], ['ω_max', `${g(r.wmax)} rad/s = ${g((r.wmax * 180) / Math.PI)} °/s`], ['θ_m', `${g(r.thetaM)} rad = ${g((r.thetaM * 180) / Math.PI)} °`], ['t_tot = 2t_b + t_c', `${g(r.tTotal)} s`], ['m_p', `${g(r.prop)} kg`]] }
    },
  },
  {
    id: 'rw', group: 'att', title: W('Reactiewiel', 'Reaction wheel', 'Τροχός αντίδρασης'),
    text: W('Versnelt het wiel, dan draait het voertuig de andere kant op. Wiel gedurende de halve tijd versneld en de andere helft vertraagd; t_m = totale manoeuvretijd.', 'Speeding up the wheel turns the vehicle the other way. Wheel accelerated for half the time and decelerated the other half; t_m = total manoeuvre time.', 'Η επιτάχυνση του τροχού στρέφει το όχημα αντίθετα. Ο τροχός επιταχύνεται το μισό χρόνο και επιβραδύνεται το άλλο μισό· t_m = συνολικός χρόνος.'),
    tex: '\\Delta\\theta_v = \\frac{\\alpha_w I_w t_m^2}{4 I_v}',
    src: 'Cursus 5.2.5 (reaction wheel)',
    inputs: [{ k: 'aw', label: 'α_w', unit: 'rad/s²', def: 10 }, { k: 'Iw', label: 'I_w', unit: 'kg·m²', def: 0.02 }, { k: 'tm', label: 't_m', unit: 's', def: 60 }, { k: 'Iv', label: 'I_v', unit: 'kg·m²', def: 100 }],
    compute: (v) => {
      if (!pos(v, 'aw', 'Iw', 'tm', 'Iv')) return bad
      const d = C.reactionWheelAngle(v.aw, v.Iw, v.tm, v.Iv)
      return { rows: [['Δθ_v', `${g(d)} rad = ${g((d * 180) / Math.PI)} °`], ['ω_w,max = α_w t_m/2', `${g((v.aw * v.tm) / 2)} rad/s = ${g((v.aw * v.tm * 30) / (2 * Math.PI))} rpm`]] }
    },
  },
  {
    id: 'dump', group: 'att', title: W('Momentum ontladen met thrusters', 'Momentum dumping with thrusters', 'Αποκορεσμός ορμής με προωθητήρες'),
    text: W('Als de wielen verzadigd raken, haalt een thrusterpaar met arm L het opgeslagen impulsmoment H eruit. Volgt uit τ = F·L en m_p = F·Δt/(g·I_sp).', 'When wheels saturate, a thruster pair with arm L removes the stored angular momentum H. Follows from τ = F·L and m_p = F·Δt/(g·I_sp).', 'Όταν οι τροχοί κορεστούν, ζεύγος προωθητήρων με βραχίονα L αφαιρεί τη στροφορμή H. Προκύπτει από τ = F·L και m_p = F·Δt/(g·I_sp).'),
    tex: 'F\\,\\Delta t = \\frac{H}{L},\\qquad m_p = \\frac{H}{L\\,g\\,I_{sp}}',
    src: 'Afgeleid uit cursus 5.2 (thruster-formules); Fortescue, Spacecraft Systems Engineering',
    inputs: [{ k: 'H', label: 'H', unit: 'N·m·s', def: 20 }, { k: 'L', label: 'L', unit: 'm', def: 1 }, { k: 'Isp', label: 'I_sp', unit: 's', def: 220 }],
    compute: (v) => (pos(v, 'H', 'L', 'Isp') ? { rows: [['m_p', `${g(C.dumpPropellant(v.H, v.L, v.Isp))} kg`], ['F·Δt', `${g(v.H / v.L)} N·s`]] } : bad),
  },
  {
    id: 'spin', group: 'att', title: W('Spinstabilisatie en nutatie', 'Spin stabilisation and nutation', 'Σταθεροποίηση με περιστροφή και νουτάρηση'),
    text: W('Een draaiend voertuig behoudt zijn impulsmoment H = I·ω: een storend koppel T laat de spin-as met T/H rad/s wegdriften. Stabiel is alleen draaiing om de as met het grootste traagheidsmoment (energiedissipatie). Voor een rotatiesymmetrisch lichaam draait de nutatie in het lichaam met (I_s − I_t)/I_t · ω_s. Cursus: nauwkeurigheid slechts 0,3–1°.', 'A spinning vehicle keeps its angular momentum H = I·ω: a disturbance torque T makes the spin axis drift at T/H rad/s. Only spin about the axis of largest moment of inertia is stable (energy dissipation). For an axisymmetric body the nutation rate in the body frame is (I_s − I_t)/I_t · ω_s. Course: pointing accuracy only 0.3–1°.', 'Ένα περιστρεφόμενο όχημα διατηρεί τη στροφορμή H = I·ω: μια ροπή διαταραχής T παρασύρει τον άξονα με T/H rad/s. Σταθερή είναι μόνο η περιστροφή γύρω από τον άξονα μέγιστης ροπής αδράνειας. Για σώμα με συμμετρία εκ περιστροφής η νουτάρηση στο σώμα έχει ρυθμό (I_s − I_t)/I_t · ω_s. Μάθημα: ακρίβεια μόνο 0,3–1°.'),
    tex: 'H = I_s\\omega_s,\\quad \\dot\\theta_{drift} = \\frac{T}{H},\\quad \\omega_{n,body} = \\frac{I_s - I_t}{I_t}\\,\\omega_s',
    src: 'Wertz & Larson, SMAD §11.1/§11.2 (spin stabilisation); Sidi, Spacecraft Dynamics and Control; cursus 5.2.2 (stabilization by rotation)',
    inputs: [{ k: 'Is', label: 'I_s', unit: 'kg·m²', def: 400 }, { k: 'It', label: 'I_t', unit: 'kg·m²', def: 300 }, { k: 'rpm', label: W('Spinsnelheid', 'Spin rate', 'Ταχύτητα περιστροφής') as Tri, unit: 'rpm', def: 30 }, { k: 'T', label: W('Storend koppel T', 'Disturbance torque T', 'Ροπή διαταραχής T') as Tri, unit: 'N·m', def: 1e-4 }],
    compute: (v) => {
      if (!pos(v, 'Is', 'It', 'rpm') || !(v.T >= 0)) return bad
      const w = (v.rpm * 2 * Math.PI) / 60, H = C.spinMomentum(v.Is, w), n = C.nutationRates(v.Is, v.It, w), d = C.spinPrecessionRate(v.T, H)
      return { rows: [['ω_s', `${g(w)} rad/s`], ['H = I_s ω_s', `${g(H)} N·m·s`], ['dθ/dt', `${g(((d * 180) / Math.PI) * 3600)} °/h`], ['ω_n (body)', `${g(n.body)} rad/s`], ['ω_n (inertial)', `${g(n.inertial)} rad/s`], [W('Stabiel (as van max. I)', 'Stable (axis of max I)', 'Σταθερό (άξονας μέγ. I)'), v.Is >= v.It ? 'ja / yes' : 'nee / no']] }
    },
  },
  {
    id: 'slew', group: 'att', title: W('Slew en wielmomentum', 'Slew and wheel momentum', 'Στροφή (slew) και ορμή τροχού'),
    text: W('Rust-naar-rust draaiing over θ in tijd t: de helft versnellen, de helft remmen (bang-bang). Het wiel moet daarbij H = I_v·ω_max opslaan. Verder: opslag voor een cyclische storing (SMAD) H = T_d·(P/4)·0,707, en de tijd tot verzadiging bij een seculiere storing, waarna ontladen (momentum dumping).', 'Rest-to-rest slew over θ in time t: accelerate half, brake half (bang-bang). The wheel must store H = I_v·ω_max. Also: storage for a cyclic disturbance (SMAD) H = T_d·(P/4)·0.707, and the time to saturation under a secular disturbance, after which the wheels are dumped.', 'Στροφή από ηρεμία σε ηρεμία κατά θ σε χρόνο t: μισή επιτάχυνση, μισή πέδηση. Ο τροχός αποθηκεύει H = I_v·ω_max. Επίσης: αποθήκευση για κυκλική διαταραχή (SMAD) H = T_d·(P/4)·0,707 και χρόνος κορεσμού για μόνιμη διαταραχή.'),
    tex: 'T = \\frac{4\\theta I_v}{t^2},\\ \\ \\omega_{max} = \\frac{2\\theta}{t},\\ \\ H_w = I_v\\omega_{max},\\ \\ H_{cyc} = 0.707\\,T_d\\frac{P}{4},\\ \\ t_{sat} = \\frac{H}{T_{sec}}',
    src: 'Wertz & Larson, SMAD §11.4 (reaction-wheel sizing, slew torque); cursus 5.2.5',
    inputs: [{ k: 'th', label: L.theta, unit: '°', def: 90 }, { k: 't', label: L.t, unit: 's', def: 300 }, { k: 'Iv', label: 'I_v', unit: 'kg·m²', def: 500 }, { k: 'Td', label: 'T_d', unit: 'N·m', def: 1e-4 }, { k: 'P', label: W('Baanperiode P', 'Orbit period P', 'Περίοδος P'), unit: 'min', def: 94.6 }, { k: 'Hmax', label: W('Wielcapaciteit', 'Wheel capacity', 'Χωρητικότητα τροχού'), unit: 'N·m·s', def: 4 }],
    compute: (v) => {
      if (!pos(v, 'th', 't', 'Iv', 'P', 'Hmax') || !(v.Td >= 0)) return bad
      const th = (v.th * Math.PI) / 180, T = C.slewTorque(th, v.Iv, v.t), w = C.slewPeakRate(th, v.t)
      return { rows: [['T', `${g(T)} N·m`], ['ω_max', `${g(w)} rad/s = ${g((w * 180) / Math.PI)} °/s`], ['H_w = I_v ω_max', `${g(v.Iv * w)} N·m·s`], ['H_cyc', `${g(C.wheelCyclicMomentum(v.Td, v.P * 60))} N·m·s`], ['t_sat', v.Td > 0 ? `${g(C.saturationTime(v.Hmax, v.Td) / 3600)} h` : '∞']] }
    },
  },
  // ============================================================ Power
  {
    id: 'ecl', group: 'pwr', title: W('Eclipsduur en -fractie', 'Eclipse duration and fraction', 'Διάρκεια και κλάσμα έκλειψης'),
    text: W('Cirkelbaan om de Aarde met cilindrische schaduw; β = hoek tussen baanvlak en Zon. De opslag moet gedimensioneerd worden op de eclipsduur.', 'Circular Earth orbit with a cylindrical shadow; β = angle between orbit plane and Sun. The storage is sized on the eclipse duration.', 'Κυκλική τροχιά γύρω από τη Γη με κυλινδρική σκιά· β = γωνία επιπέδου τροχιάς–Ήλιου. Η αποθήκευση μετριέται με τη διάρκεια έκλειψης.'),
    tex: 'f_e = \\frac{1}{\\pi}\\arccos\\frac{\\sqrt{h^2 + 2R_Eh}}{(R_E + h)\\cos\\beta},\\quad T_e = f_e\\,P',
    src: 'Wertz & Larson, SMAD §10 / §11 (eclipse geometry)',
    inputs: [{ k: 'h', label: L.h, unit: 'km', def: 500 }, { k: 'b', label: 'β', unit: '°', def: 0 }],
    compute: (v) => {
      if (!(v.h > 0) || Math.abs(v.b) >= 90) return bad
      const f = C.eclipseFraction(v.h * 1000, C.RE_M, v.b), P = C.orbitPeriod(C.MU_EARTH_SI, R_(v.h))
      return { rows: [['P', `${g(P / 60)} min`], ['f_e', `${g(f * 100)} %`], ['T_e', `${g((f * P) / 60)} min`], ['T_d', `${g(((1 - f) * P) / 60)} min`]] }
    },
  },
  {
    id: 'psa', group: 'pwr', title: W('Benodigd arrayvermogen', 'Required array power', 'Απαιτούμενη ισχύς συστοιχίας'),
    text: W('De array levert overdag de last én laadt de batterij voor de eclips. X_d, X_e = rendement van array → last (direct) resp. array → batterij → last.', 'The array supplies the load in daylight and recharges the battery for eclipse. X_d, X_e = efficiency array → load (direct) and array → battery → load.', 'Η συστοιχία τροφοδοτεί το φορτίο την ημέρα και φορτίζει τη μπαταρία για την έκλειψη. X_d, X_e = απόδοση συστοιχία → φορτίο (άμεσα) και συστοιχία → μπαταρία → φορτίο.'),
    tex: 'P_{sa} = \\frac{\\dfrac{P_e T_e}{X_e} + \\dfrac{P_d T_d}{X_d}}{T_d}',
    src: 'Wertz & Larson, SMAD §11.4 (power system sizing)',
    inputs: [{ k: 'Pe', label: 'P_e', unit: 'W', def: 688 }, { k: 'Te', label: 'T_e', unit: 'min', def: 35.8 }, { k: 'Xe', label: 'X_e', def: 0.6 }, { k: 'Pd', label: 'P_d', unit: 'W', def: 810 }, { k: 'Td', label: 'T_d', unit: 'min', def: 58.8 }, { k: 'Xd', label: 'X_d', def: 0.8 }],
    compute: (v) => {
      if (!pos(v, 'Pe', 'Te', 'Xe', 'Pd', 'Td', 'Xd') || v.Xe > 1 || v.Xd > 1) return bad
      return { rows: [['P_sa', `${g(C.arrayPower(v.Pe, v.Te, v.Xe, v.Pd, v.Td, v.Xd))} W`]] }
    },
  },
  {
    id: 'area', group: 'pwr', title: W('Arrayoppervlak met degradatie', 'Array area with degradation', 'Εμβαδόν συστοιχίας με υποβάθμιση'),
    text: W('Uitgang per m² aan begin van leven: S·η·I_d·cos θ; aan het einde nog (1 − d)^jaren daarvan (straling, UV, thermische cycli). Dimensioneer op end-of-life.', 'Output per m² at beginning of life: S·η·I_d·cos θ; at end of life only (1 − d)^years of it (radiation, UV, thermal cycling). Size for end of life.', 'Απόδοση ανά m² στην αρχή ζωής: S·η·I_d·cos θ· στο τέλος μόνο (1 − d)^έτη (ακτινοβολία, UV, θερμικοί κύκλοι). Διαστασιολόγηση για το τέλος ζωής.'),
    tex: 'P_{BOL} = S\\,\\eta\\,I_d\\cos\\theta,\\ \\ L_d = (1-d)^{N},\\ \\ P_{EOL} = P_{BOL}L_d,\\ \\ A = \\frac{P_{sa}}{P_{EOL}}',
    src: 'Wertz & Larson, SMAD §11.4; celrendementen (GaAs ~30 %, mono-Si 15–22 %) uit cursus 5.3.1',
    inputs: [{ k: 'Psa', label: 'P_sa', unit: 'W', def: 1220 }, { k: 'S', label: 'S', unit: 'W/m²', def: C.S_SUN }, { k: 'eta', label: 'η', def: 0.3 }, { k: 'Id', label: 'I_d', def: 0.77 }, { k: 'th', label: L.theta, unit: '°', def: 23.5 }, { k: 'd', label: 'd', unit: '/jr', def: 0.0275 }, { k: 'N', label: 'N', unit: 'jr', def: 7 }],
    compute: (v) => {
      if (!pos(v, 'Psa', 'S', 'eta', 'Id', 'N') || v.d < 0 || v.d >= 1 || Math.abs(v.th) >= 90 || v.eta > 1 || v.Id > 1) return bad
      const r = C.arrayArea({ Psa: v.Psa, S: v.S, eta: v.eta, Id: v.Id, thetaDeg: v.th, degPerYear: v.d, years: v.N })
      return { rows: [['P_BOL', `${g(r.Pbol)} W/m²`], ['L_d', g(r.Ld)], ['P_EOL', `${g(r.Peol)} W/m²`], ['A', `${g(r.area)} m²`]] }
    },
  },
  {
    id: 'bat', group: 'pwr', title: W('Batterijcapaciteit', 'Battery capacity', 'Χωρητικότητα μπαταρίας'),
    text: W('Alleen een deel (DoD) van de capaciteit mag per eclips worden ontladen; N batterijen, n = rendement batterij → last. Li-ion ≈ 150 Wh/kg (cursus).', 'Only a fraction (DoD) of the capacity may be discharged each eclipse; N batteries, n = battery → load efficiency. Li-ion ≈ 150 Wh/kg (course).', 'Μόνο ένα κλάσμα (DoD) της χωρητικότητας εκφορτίζεται σε κάθε έκλειψη· N μπαταρίες, n = απόδοση μπαταρία → φορτίο. Li-ion ≈ 150 Wh/kg (μάθημα).'),
    tex: 'C_r = \\frac{P_e\\,T_e}{DoD\\cdot N\\cdot n}',
    src: 'Wertz & Larson, SMAD §11.4; Li-ion 150 Wh/kg: cursus 5.3.1',
    inputs: [{ k: 'Pe', label: 'P_e', unit: 'W', def: 688 }, { k: 'Te', label: 'T_e', unit: 'min', def: 35.8 }, { k: 'dod', label: 'DoD', def: 0.4 }, { k: 'N', label: 'N', def: 2 }, { k: 'n', label: 'n', def: 0.9 }, { k: 'sp', label: W('Specifieke energie', 'Specific energy', 'Ειδική ενέργεια') as Tri, unit: 'Wh/kg', def: 150 }],
    compute: (v) => {
      if (!pos(v, 'Pe', 'Te', 'dod', 'N', 'n', 'sp') || v.dod > 1 || v.n > 1) return bad
      const c = C.batteryCapacity(v.Pe, v.Te / 60, v.dod, v.N, v.n)
      return { rows: [['C_r', `${g(c)} Wh`], ['N·C_r', `${g(c * v.N)} Wh ≈ ${g((c * v.N) / v.sp)} kg`]] }
    },
  },
  {
    id: 'rtg', group: 'pwr', title: W('RTG: vermogen na verval', 'RTG: power after decay', 'RTG: ισχύς μετά τη διάσπαση'),
    text: W('Pu-238 (halfwaardetijd 87,7 jaar) geeft warmte die thermokoppels omzetten in stroom (rendement < 10 %, cursus). Dit is alleen het isotoopverval; thermokoppel-degradatie komt erbovenop.', 'Pu-238 (half-life 87.7 years) gives heat that thermocouples convert to electricity (efficiency < 10 %, course). This is isotope decay only; thermocouple degradation comes on top.', 'Το Pu-238 (ημιζωή 87,7 έτη) δίνει θερμότητα που τα θερμοζεύγη μετατρέπουν σε ρεύμα (απόδοση < 10 %, μάθημα). Μόνο η διάσπαση ισοτόπου· η υποβάθμιση θερμοζευγών προστίθεται.'),
    tex: 'P(t) = P_0\\,e^{-t\\ln 2/t_{1/2}} = P_0\\,2^{-t/t_{1/2}}',
    src: 'Cursus 5.3.1 (RTG); halfwaardetijd Pu-238: 87,7 jaar',
    inputs: [{ k: 'P0', label: 'P_0', unit: 'W', def: 470 }, { k: 't', label: 't', unit: 'jr', def: 14 }, { k: 'hl', label: 't_½', unit: 'jr', def: C.PU238_HALF_LIFE_YR }],
    compute: (v) => (pos(v, 'P0', 'hl') && v.t >= 0 ? { rows: [['P(t)', `${g(C.rtgPower(v.P0, v.t, v.hl))} W`], ['P(t)/P₀', `${g((C.rtgPower(v.P0, v.t, v.hl) / v.P0) * 100)} %`]] } : bad),
  },
  {
    id: 'fc', group: 'pwr', title: W('Brandstofcel (H₂/O₂)', 'Fuel cell (H₂/O₂)', 'Κυψέλη καυσίμου (H₂/O₂)'),
    text: W('Reactanten worden continu aangevoerd; bijproducten zijn water en warmte (cursus; Shuttle: 3 cellen van ± 7 kW). Waterstofverbruik uit de wet van Faraday: 2 elektronen per H₂.', 'Reactants are fed continuously; by-products are water and heat (course; Shuttle: 3 cells of about 7 kW). Hydrogen use from Faraday\'s law: 2 electrons per H₂.', 'Τα αντιδρώντα τροφοδοτούνται συνεχώς· υποπροϊόντα νερό και θερμότητα (μάθημα· Shuttle: 3 κυψέλες ~7 kW). Η κατανάλωση υδρογόνου από τον νόμο Faraday: 2 ηλεκτρόνια ανά H₂.'),
    tex: '\\dot m_{H_2} = \\frac{P\\,M_{H_2}}{2F\\,V_c},\\qquad \\dot m_{H_2O} = 8.937\\,\\dot m_{H_2}',
    src: 'Faraday-wet (2H₂ + O₂ → 2H₂O); cursus 5.3.1; celspanning V_c is een aanname (~0,8 V)',
    inputs: [{ k: 'P', label: 'P', unit: 'W', def: 7000 }, { k: 'Vc', label: 'V_c', unit: 'V', def: 0.8 }, { k: 'T', label: 't', unit: 'h', def: 24 }],
    compute: (v) => {
      if (!pos(v, 'P', 'T') || !(v.Vc > 0 && v.Vc < 1.23)) return bad
      const m = C.fuelCellH2(v.P, v.Vc)
      return { rows: [['ṁ(H₂)', `${g(m * 3600)} kg/h`], ['ṁ(H₂O)', `${g(m * 3600 * (C.M_H2O / C.M_H2))} kg/h`], ['H₂', `${g(m * 3600 * v.T)} kg / ${g(v.T)} h`], ['O₂ (8×)', `${g(m * 3600 * v.T * 7.937)} kg`]] }
    },
  },
  {
    id: 'alt', group: 'pwr', title: W('Welke bron wanneer? (cursus)', 'Which source when? (course)', 'Ποια πηγή πότε; (μάθημα)'),
    text: W('Uit de figuur van Brown: primaire batterijen voor korte duur (uren tot dagen, tot ± 1 kW); brandstofcellen voor dagen tot weken (kW tot honderden kW, Shuttle 3 × 7 kW); zonnepanelen vanaf weken tot jaren (W tot tientallen kW; ISS 84 kW, Hubble 2,4 kW); RTG voor jaren op W tot kW (Voyager, Curiosity; rendement < 10 %); kernreactoren boven ± 10 kW voor lange duur. Cellen: amorf Si 5–10 %, poly-Si 10–13 %, mono-Si 15–22 %, GaAs ≈ 30 %. Accu\'s: NiCd, NiH₂ (> 2·10⁴ cycli, HST/ISS), Li-ion ≈ 150 Wh/kg.', 'From Brown\'s figure: primary batteries for short duration (hours to days, up to about 1 kW); fuel cells for days to weeks (kW to hundreds of kW, Shuttle 3 × 7 kW); solar arrays from weeks to years (W to tens of kW; ISS 84 kW, Hubble 2.4 kW); RTGs for years at W to kW (Voyager, Curiosity; efficiency < 10 %); nuclear reactors above about 10 kW for long duration. Cells: amorphous Si 5–10 %, poly-Si 10–13 %, mono-Si 15–22 %, GaAs ≈ 30 %. Batteries: NiCd, NiH₂ (> 2·10⁴ cycles, HST/ISS), Li-ion ≈ 150 Wh/kg.', 'Από το σχήμα του Brown: πρωτογενείς μπαταρίες για μικρή διάρκεια (ώρες–ημέρες, έως ~1 kW)· κυψέλες καυσίμου για ημέρες–εβδομάδες (Shuttle 3 × 7 kW)· ηλιακά πάνελ από εβδομάδες έως έτη (ISS 84 kW, Hubble 2,4 kW)· RTG για έτη (απόδοση < 10 %)· πυρηνικοί αντιδραστήρες πάνω από ~10 kW. Κύτταρα: άμορφο Si 5–10 %, πολυκρυσταλλικό 10–13 %, μονοκρυσταλλικό 15–22 %, GaAs ≈ 30 %.'),
    tex: '',
    src: 'Cursus 5.3.1 (naar Brown, Elements of Spacecraft Design, operating regimes); grenzen afgelezen uit de figuur, dus bij benadering',
    inputs: [], compute: () => ({ rows: [] }),
  },
  {
    id: 'tether', group: 'pwr', title: W('Elektrodynamische kabel (tether)', 'Electrodynamic tether', 'Ηλεκτροδυναμικό συρματόσχοινο'),
    text: W('Beweging door het aardveld induceert een spanning (generator); een stroom geeft een Lorentzkracht (motor). Loodrechte situatie. Daarnaast het zwaartekrachtgradiënt-effect F_gg ≈ 3LMn² met n = √(μ/r³).', 'Motion through the Earth field induces a voltage (generator); a current gives a Lorentz force (motor). Perpendicular case. Plus the gravity-gradient effect F_gg ≈ 3LMn² with n = √(μ/r³).', 'Η κίνηση στο γήινο πεδίο επάγει τάση (γεννήτρια)· ρεύμα δίνει δύναμη Lorentz (κινητήρας). Κάθετη περίπτωση. Επιπλέον F_gg ≈ 3LMn² με n = √(μ/r³).'),
    tex: 'U_i = (\\vec V\\times\\vec B)\\cdot\\vec L,\\quad \\vec F = I\\!\\int d\\vec L\\times\\vec B,\\quad F_{gg}\\approx 3LMn^2',
    src: 'Cursus 5.3.2 en 5.3.3 (NASA/MSFC, Tethers in Space Handbook)',
    inputs: [{ k: 'h', label: L.h, unit: 'km', def: 300 }, { k: 'B', label: 'B', unit: 'µT', def: 30 }, { k: 'L', label: 'L', unit: 'km', def: 20 }, { k: 'I', label: 'I', unit: 'A', def: 1 }, { k: 'M', label: 'M', unit: 'kg', def: 500 }],
    compute: (v) => {
      if (!nonneg(v, 'h', 'B', 'L', 'I', 'M')) return bad
      const r = R_(v.h), V = Math.sqrt(C.MU_EARTH_SI / r), Lm = v.L * 1000
      return { rows: [['V', `${g(V)} m/s`], ['U_i', `${g(C.tetherEmf(V, v.B * 1e-6, Lm))} V`], ['F = I·L·B', `${g(C.tetherForce(v.I, Lm, v.B * 1e-6))} N`], ['F_gg', `${g(C.tetherGravityGradient(Lm, v.M, C.MU_EARTH_SI, r))} N`]] }
    },
  },
  // ============================================================ Reliability
  {
    id: 'rt', group: 'rel', title: W('Betrouwbaarheid R(t)', 'Reliability R(t)', 'Αξιοπιστία R(t)'),
    text: W('Bij constante uitvalsnelheid λ = 1/MTBF (in uren⁻¹ of maanden⁻¹). Voor λt < 0,1 geldt R ≈ 1 − λt. Voorbeeld uit de cursus: MTBF = 30 maanden, 24 maanden → R = 0,45.', 'For a constant failure rate λ = 1/MTBF (in hours⁻¹ or months⁻¹). For λt < 0.1, R ≈ 1 − λt. Course example: MTBF = 30 months, 24 months → R = 0.45.', 'Για σταθερό ρυθμό αστοχίας λ = 1/MTBF (σε ώρες⁻¹ ή μήνες⁻¹). Για λt < 0,1, R ≈ 1 − λt. Παράδειγμα μαθήματος: MTBF = 30 μήνες, 24 μήνες → R = 0,45.'),
    tex: 'R(t+dt) = R(t)[1-\\lambda dt]\\ \\Rightarrow\\ R(t) = e^{-\\lambda t},\\quad \\lambda = \\frac{1}{MTBF}',
    src: 'Cursus 5.4.1',
    inputs: [{ k: 'mtbf', label: 'MTBF', def: 30 }, { k: 't', label: W('Missieduur t (zelfde eenheid)', 'Mission time t (same unit)', 'Διάρκεια t (ίδια μονάδα)') as Tri, def: 24 }],
    compute: (v) => {
      if (!pos(v, 'mtbf') || !(v.t >= 0)) return bad
      const lt = v.t / v.mtbf
      return { rows: [['λ', g(1 / v.mtbf)], ['λt', g(lt)], ['R(t)', g(Math.exp(-lt))], ['1 − λt', `${g(1 - lt)}${lt < 0.1 ? '' : ' (λt ≥ 0.1)'}`]] }
    },
  },
  {
    id: 'red', group: 'rel', title: W('Serie, parallel en k-uit-n', 'Series, parallel and k-out-of-n', 'Σειρά, παράλληλα και k-από-n'),
    text: W('n identieke, onafhankelijke eenheden met betrouwbaarheid R. Serie: alles moet werken; parallel: één volstaat (redundantie); k-uit-n: minstens k werken (bv. 2-uit-3 stemming). Shuttle: twee-fouten-tolerantie.', 'n identical independent units of reliability R. Series: all must work; parallel: one suffices (redundancy); k-out-of-n: at least k work (e.g. 2-out-of-3 voting). Shuttle: two-failure tolerance.', 'n ίδιες ανεξάρτητες μονάδες αξιοπιστίας R. Σειρά: όλες πρέπει να λειτουργούν· παράλληλα: αρκεί μία (πλεονασμός)· k-από-n: τουλάχιστον k λειτουργούν. Shuttle: ανοχή δύο βλαβών.'),
    tex: 'R_s = R^n,\\ \\ R_p = 1-(1-R)^n,\\ \\ R_{k/n} = \\sum_{i=k}^{n}\\binom{n}{i}R^i(1-R)^{n-i}',
    src: 'Standaard betrouwbaarheidstheorie (bv. Fortescue, Spacecraft Systems Engineering); cursus 5.4.1 (redundantie)',
    inputs: [{ k: 'r', label: 'R (0–1)', def: 0.9 }, { k: 'n', label: 'n', def: 3 }, { k: 'k', label: 'k', def: 2 }],
    compute: (v) => {
      if (!(v.r >= 0 && v.r <= 1) || !Number.isInteger(v.n) || !Number.isInteger(v.k) || v.n < 1 || v.n > 60 || v.k < 1 || v.k > v.n) return { err: ['R tussen 0 en 1; n en k hele getallen met 1 ≤ k ≤ n ≤ 60.', 'R between 0 and 1; n and k integers with 1 ≤ k ≤ n ≤ 60.', 'R από 0 έως 1· n, k ακέραιοι με 1 ≤ k ≤ n ≤ 60.'] }
      const rs = Array(v.n).fill(v.r)
      return { rows: [['R_s', g(C.seriesR(rs))], ['R_p', g(C.parallelR(rs))], [`R_${v.k}/${v.n}`, g(C.kOfN(v.k, v.n, v.r))]] }
    },
  },
  {
    id: 'two', group: 'rel', title: W('Twee eenheden: serie of parallel met λ', 'Two units: series or parallel with λ', 'Δύο μονάδες: σειρά ή παράλληλα με λ'),
    text: W('Twee gelijke eenheden met constante λ. Serie (beide nodig): λ_s = 2λ, MTTF = 1/(2λ). Actief parallel (één volstaat): R = 2e^(−λt) − e^(−2λt), MTTF = 3/(2λ), dus maar 1,5 × de MTTF van één eenheid. MTTF = tijd tot de eerste uitval, MTBF = tijd tussen twee uitvallen (cursus).', 'Two identical units with constant λ. Series (both needed): λ_s = 2λ, MTTF = 1/(2λ). Active parallel (one suffices): R = 2e^(−λt) − e^(−2λt), MTTF = 3/(2λ), only 1.5 × the MTTF of one unit. MTTF = time to first failure, MTBF = time between two failures (course).', 'Δύο ίδιες μονάδες με σταθερό λ. Σειρά: λ_s = 2λ, MTTF = 1/(2λ). Ενεργά παράλληλα: R = 2e^(−λt) − e^(−2λt), MTTF = 3/(2λ). MTTF = χρόνος έως την πρώτη βλάβη, MTBF = χρόνος μεταξύ δύο βλαβών (μάθημα).'),
    tex: 'R_s = e^{-2\\lambda t},\\quad R_p = 2e^{-\\lambda t} - e^{-2\\lambda t},\\quad MTTF_s = \\frac{1}{2\\lambda},\\ MTTF_p = \\frac{3}{2\\lambda}',
    src: 'Standaard betrouwbaarheidstheorie (bv. Fortescue, Spacecraft Systems Engineering; Wertz & Larson, SMAD §19); cursus 5.4.1',
    inputs: [{ k: 'mtbf', label: W('MTBF van één eenheid', 'MTBF of one unit', 'MTBF μίας μονάδας'), def: 30 }, { k: 't', label: W('Missieduur t (zelfde eenheid)', 'Mission time t (same unit)', 'Διάρκεια t (ίδια μονάδα)'), def: 24 }],
    compute: (v) => {
      if (!pos(v, 'mtbf') || !(v.t >= 0)) return bad
      const r = C.twoUnits(1 / v.mtbf, v.t)
      return { rows: [['R (1)', g(Math.exp(-v.t / v.mtbf))], ['R_s', g(r.series)], ['R_p', g(r.parallel)], ['MTTF_s', g(r.mttfSeries)], ['MTTF_p', g(r.mttfParallel)]] }
    },
  },
  {
    id: 'bath', group: 'rel', title: W('Badkuipkromme', 'Bathtub curve', 'Καμπύλη μπανιέρας'),
    text: W('De uitvalsnelheid λ(t) heeft drie fasen: kinderziektes (λ daalt), nuttige levensduur (λ constant, hier geldt R = e^(−λt)) en slijtage (λ stijgt). De cursus rekent het vereenvoudigde geval met λ constant: "Reality is more complex!"', 'The failure rate λ(t) has three phases: infant mortality (λ falls), useful life (λ constant, where R = e^(−λt) holds) and wear-out (λ rises). The course works the simplified constant-λ case: "Reality is more complex!"', 'Ο ρυθμός αστοχίας λ(t) έχει τρεις φάσεις: παιδικές ασθένειες (το λ πέφτει), ωφέλιμη ζωή (λ σταθερό, ισχύει R = e^(−λt)) και φθορά (το λ αυξάνεται). Το μάθημα λύνει την απλοποιημένη περίπτωση σταθερού λ.'),
    tex: 'R(t) = \\exp\\!\\left(-\\int_0^t \\lambda(\\tau)\\,d\\tau\\right),\\quad R = e^{-(t/\\eta)^\\beta},\\ \\ \\lambda(t) = \\frac{\\beta}{\\eta}\\left(\\frac{t}{\\eta}\\right)^{\\beta-1}',
    src: 'Cursus 5.4.1 (λ(t)dt); Weibull-model uit standaard betrouwbaarheidstheorie (β < 1 kinderziektes, β = 1 nuttige levensduur, β > 1 slijtage)',
    inputs: [{ k: 'beta', label: 'β', def: 0.5 }, { k: 'eta', label: 'η', def: 30 }, { k: 't', label: 't', def: 6 }],
    compute: (v) => {
      if (!pos(v, 'beta', 'eta') || !(v.t > 0)) return bad
      const w = C.weibull(v.beta, v.eta, v.t)
      return { rows: [['R(t)', g(w.R)], ['λ(t)', g(w.lambda)], [W('Fase', 'Phase', 'Φάση'), v.beta < 1 ? 'infant mortality' : v.beta === 1 ? 'useful life' : 'wear-out']] }
    },
  },
]
