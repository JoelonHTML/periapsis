# Periapsis

Missie-ontwerp in de browser (GMAT/EMTG-stijl): zonnestelsel, Lambert/gravity-assist-optimalisatie, aardbanen, Lagrangepunten,
planeetstelsels met manen, Melkweg, rekenmachines. React + three.js + shadcn/ui.

**Alleen gebruiken of delen:** open `Periapsis.html` (dubbelklikken, werkt offline).

## Ontwikkelen

```bash
npm install
npm run dev           # http://localhost:5173
npm run build         # maakt dist/index.html: één bestand met alles erin
node --test src/lib/*.test.ts   # natuurkunde-tests
```

Handig tijdens ontwikkelen: `scripts/shot.sh <naam> "view=galaxy"` maakt een headless screenshot (Edge) van de draaiende dev-server;
deep links `#view=… &tab=… &speed=… &t=…`, en alleen in dev `#js=__orbitlab.demo()`.
