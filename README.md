# Periapsis

Missie-ontwerp in de browser (GMAT/EMTG-stijl): zonnestelsel, Lambert/gravity-assist-optimalisatie, aardbanen, Lagrangepunten,
planeetstelsels met manen, Melkweg, rekenmachines. React + three.js + shadcn/ui.

## Downloaden

- **Android-app (APK):** https://github.com/JoelonHTML/periapsis/releases/latest/download/Periapsis.apk
- **Webversie (één HTML-bestand, werkt offline):** https://github.com/JoelonHTML/periapsis/releases/latest/download/Periapsis.html
- Alle versies: https://github.com/JoelonHTML/periapsis/releases

Android vraagt bij de eerste installatie om toestemming voor "apps uit onbekende bronnen". De app kijkt bij het opstarten
zelf of er een nieuwere release is en biedt dan aan om die te downloaden.

## Een nieuwe versie uitbrengen

```bash
git tag v0.2.0 && git push origin v0.2.0
```

De workflow `.github/workflows/release.yml` test, bouwt en hangt `Periapsis.apk` + `Periapsis.html` aan een GitHub Release.
Met de secrets `KEYSTORE_B64` en `KEYSTORE_PASSWORD` wordt de APK met een vaste sleutel ondertekend (nodig om over een
vorige versie heen te installeren); zonder die secrets is het een debug-build.

## Ontwikkelen

```bash
npm install
npm run dev           # http://localhost:5173
npm run build         # maakt dist/index.html: één bestand met alles erin
node --test src/lib/*.test.ts   # natuurkunde-tests
```

Handig tijdens ontwikkelen: `scripts/shot.sh <naam> "view=galaxy"` maakt een headless screenshot (Edge) van de draaiende dev-server;
deep links `#view=… &tab=… &speed=… &t=…`, en alleen in dev `#js=__orbitlab.demo()`.

## Licentie

© 2026 Joël Nieuwkoop. Alle rechten voorbehouden; zie [LICENSE](LICENSE). Niets uit dit project mag zonder schriftelijke toestemming worden nagemaakt of verspreid.
