import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, Rocket, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createStore } from '@/lib/mini-store'
import { useSettings, type Lang } from '@/lib/settings'
import { activeCraft, store } from '@/lib/store'
import { cn } from '@/lib/utils'
import { KV, Tex } from './bits'
import { ORBIT_CALCS } from './calc/defs-orbit'
import { SYS_CALCS } from './calc/defs-sys'
import { AERO_CALCS } from './calc/defs-aero'
import { COURSE_CALCS } from './calc/defs-course'
import { CATS, type Calc, type Input as Spec, type V } from './calc/core'

// Interface texts of this tab (the card contents are Dutch unless a card has a `loc`).
const UI: Record<Lang, { search: string; allCats: string; count: (n: number, m: number) => string; none: (q: string) => string; withNumbers: string; src: string; craft: string }> = {
  nl: { search: 'Zoek formule…', allCats: 'Alle categorieën', count: (n, m) => `${n} van ${m} rekenmachines · alles rekent live, met de formule en je eigen getallen.`, none: (q) => `Geen rekenmachine gevonden voor “${q}”.`, withNumbers: 'Formules met jouw getallen', src: 'Bron', craft: 'Gebruik mijn ruimtevaartuig' },
  en: { search: 'Search formula…', allCats: 'All categories', count: (n, m) => `${n} of ${m} calculators · everything updates live, with the formula and your own numbers.`, none: (q) => `No calculator found for “${q}”.`, withNumbers: 'Formulas with your numbers', src: 'Source', craft: 'Use my spacecraft' },
  el: { search: 'Αναζήτηση τύπου…', allCats: 'Όλες οι κατηγορίες', count: (n, m) => `${n} από ${m} αριθμομηχανές · όλα υπολογίζονται ζωντανά, με τον τύπο και τους δικούς σου αριθμούς.`, none: (q) => `Δεν βρέθηκε αριθμομηχανή για «${q}».`, withNumbers: 'Τύποι με τους δικούς σου αριθμούς', src: 'Πηγή', craft: 'Χρήση του διαστημοπλοίου μου' },
}
const CAT_L: Record<string, [string, string]> = {
  'Baanmechanica': ['Orbital mechanics', 'Τροχιακή μηχανική'], 'Interplanetair': ['Interplanetary', 'Διαπλανητικά'], 'Aandrijving': ['Propulsion', 'Πρόωση'],
  'Stand & rotatie': ['Attitude & rotation', 'Προσανατολισμός & περιστροφή'], 'Aardomgeving': ['Earth environment', 'Περιβάλλον της Γης'], 'Overig': ['Other', 'Άλλα'],
}
const catName = (c: string, lang: Lang) => (lang === 'nl' ? c : CAT_L[c]?.[lang === 'en' ? 0 : 1] ?? c)
/** Card texts in the interface language; falls back to the Dutch originals. */
const tr = (c: Calc, lang: Lang) => (lang === 'nl' ? undefined : c.loc?.[lang])


// Order: as listed in the brief — the user's own requests first.
const ORDER = ['transfer', 'vinf', 'tsiolkovsky', 'slew', 'magfield', 'ballistic']
const ALL: Calc[] = [...ORBIT_CALCS, ...SYS_CALCS, ...AERO_CALCS, ...COURSE_CALCS].sort((a, b) => {
  const ia = ORDER.indexOf(a.id), ib = ORDER.indexOf(b.id)
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
})

// Input values survive tab switches (module-level, no provider).
const ui = createStore<{ vals: Record<string, V>; open: string | null }>({
  vals: {},
  open: new URLSearchParams(location.hash.slice(1)).get('calc'), // #calc=<id> opens a card (also used for screenshots)
})
const defaults = (c: Calc): V => Object.fromEntries(c.inputs.map((i) => [i.k, i.def]))

/** Editable number: keeps the typed text while editing, accepts 7.94e22 and decimal commas. */
function NumberInput({ value, onChange }: { value: number; onChange: (x: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (value !== 0 && (Math.abs(value) < 1e-3 || Math.abs(value) >= 1e7) ? value.toExponential().replace('e+', 'e') : String(+value.toPrecision(10)))
  return (
    <Input type="text" inputMode="decimal" value={shown} className="h-8 tabular-nums"
      onChange={(e) => { setDraft(e.target.value); const x = parseFloat(e.target.value.replace(',', '.')); if (Number.isFinite(x)) onChange(x) }}
      onBlur={() => setDraft(null)} />
  )
}

function Field({ spec, v, set, loc }: { spec: Spec; v: V; set: (k: string, x: number | string) => void; loc?: { labels?: Record<string, string>; options?: Record<string, string[]> } }) {
  const label = loc?.labels?.[spec.k] ?? spec.label, optLabels = loc?.options?.[spec.k]
  return (
    <div className={cn('grid gap-1', spec.wide && 'col-span-2')}>
      <Label className="block text-xs leading-tight text-muted-foreground">{label}{spec.unit && <span className="opacity-60"> ({spec.unit})</span>}</Label>
      {spec.options ? (
        <Select value={String(v[spec.k])} onValueChange={(x) => set(spec.k, +x)}>
          <SelectTrigger className="h-8 w-full text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{spec.options.map((o, oi) => <SelectItem key={o.value} value={String(o.value)}>{optLabels?.[oi] ?? o.label}</SelectItem>)}</SelectContent>
        </Select>
      ) : spec.text ? (
        <Input value={String(v[spec.k])} className="h-8" onChange={(e) => set(spec.k, e.target.value)} />
      ) : (
        <NumberInput value={v[spec.k]} onChange={(x) => set(spec.k, x)} />
      )}
    </div>
  )
}

function CalcBody({ c }: { c: Calc }) {
  const lang = useSettings((s) => s.lang), loc = tr(c, lang), tx = UI[lang]
  const saved = ui.useStore((s) => s.vals[c.id])
  const v: V = { ...defaults(c), ...saved }
  const put = (patch: V) => ui.set((s) => ({ vals: { ...s.vals, [c.id]: { ...defaults(c), ...s.vals[c.id], ...patch } } }))
  const set = (k: string, x: number | string) => {
    const next = { ...v, [k]: x }
    put({ [k]: x, ...(c.onChange?.(k, next) ?? {}) })
  }
  const res = c.compute(v)
  return (
    <div className="grid gap-3 border-t border-border/60 px-3 py-3">
      <div className="grid grid-cols-2 gap-2">
        {c.inputs.filter((i) => !i.show || i.show(v)).map((i) => <Field key={i.k} spec={i} v={v} set={set} loc={loc} />)}
      </div>
      {c.craft && (
        <Button variant="outline" size="sm" className="h-7 justify-self-start text-xs" onClick={() => put(c.craft!(activeCraft(store.get())))}>
          <Rocket className="size-3.5" /> {tx.craft}
        </Button>
      )}
      {res.err ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-300">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{res.err}
        </div>
      ) : (
        <>
          <div className="select-text rounded-md bg-muted/30 px-2.5 py-1.5">
            {res.rows?.map((r, i) => typeof r === 'string'
              ? <div key={i} className="mt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground first:mt-0">{r}</div>
              : <KV key={i} k={r[0]} v={r[1]} strong={r[2]} />)}
          </div>
          {res.tex && (
            <div className="grid select-text gap-0.5 [&_.katex-display]:!my-0.5">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{tx.withNumbers}</div>
              {res.tex.map((t, i) => <Tex key={i} tex={t} block />)}
            </div>
          )}
          {res.note && <p className="text-[11px] leading-snug text-muted-foreground">{res.note}</p>}
        </>
      )}
      <p className="text-[11px] leading-snug text-muted-foreground">{tx.src}: {loc?.src ?? c.src}</p>
    </div>
  )
}

function Card({ c }: { c: Calc }) {
  const lang = useSettings((s) => s.lang), loc = tr(c, lang)
  const open = ui.useStore((s) => s.open === c.id)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (open) ref.current?.scrollIntoView({ block: 'nearest' }) }, [open])
  return (
    <div ref={ref} className="rounded-lg border border-border/70 bg-card/40">
      <button type="button" aria-expanded={open} onClick={() => ui.set({ open: open ? null : c.id })}
        className="flex w-full items-start gap-2 px-3 py-2 text-left">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium leading-tight">{loc?.title ?? c.title}</div>
          <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground"><span className="text-sky-400/80">{catName(c.cat, lang)}</span> · {loc?.blurb ?? c.blurb}</div>
        </div>
        <ChevronDown className={cn('mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && <CalcBody c={c} />}
    </div>
  )
}

export function CalcPanel() {
  const lang = useSettings((s) => s.lang), tx = UI[lang]
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const needle = q.trim().toLowerCase()
  const list = ALL.filter((c) => (cat === 'all' || c.cat === cat) &&
    (!needle || `${c.title} ${c.blurb} ${c.cat} ${c.kw ?? ''} ${c.loc?.en.title ?? ''} ${c.loc?.en.blurb ?? ''} ${c.loc?.el.title ?? ''}`.toLowerCase().includes(needle)))
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx.search} className="h-8 pl-8 text-xs" />
        </div>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="h-8 w-[9.5rem] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tx.allCats}</SelectItem>
            {CATS.map((x) => <SelectItem key={x} value={x}>{catName(x, lang)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="text-[11px] text-muted-foreground">{tx.count(list.length, ALL.length)}</div>
      <div className="grid gap-2">
        {list.map((c) => <Card key={c.id} c={c} />)}
        {!list.length && <p className="py-6 text-center text-xs text-muted-foreground">{tx.none(q)}</p>}
      </div>
    </div>
  )
}
