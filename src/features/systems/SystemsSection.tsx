// "Spacecraft systems" section of the formulas view: a formula card per topic with a small calculator behind a <details>.
import { useState } from 'react'
import { KV, NumField, Tex } from '@/components/bits'
import { useT } from '@/lib/i18n'
import { CARDS, GROUPS, type Card, type Tri } from './cards'
import './i18n'

const IDX = { nl: 0, en: 1, el: 2 } as const

function CardView({ card, pick }: { card: Card; pick: (x: Tri | string) => string }) {
  const t = useT()
  const [vals, setVals] = useState<Record<string, number>>(() => Object.fromEntries(card.inputs.map((i) => [i.k, i.def])))
  const out = card.inputs.length ? card.compute(vals) : null
  return (
    <div className="min-w-0 rounded-lg border bg-muted/30 p-2.5">
      <div className="text-xs font-semibold">{pick(card.title)}</div>
      {card.tex && <Tex block tex={card.tex} />}
      <p className="text-[11px] leading-snug text-muted-foreground">{pick(card.text)}</p>
      <p className="mt-1 text-[10px] italic text-muted-foreground/80">{t('sys.src')}: {card.src}</p>
      {out && (
        <details className="mt-1.5">
          <summary className="flex min-h-11 cursor-pointer items-center text-xs font-medium text-emerald-400">{t('sys.calc')}</summary>
          <div className="grid grid-cols-2 gap-2 pb-2">
            {card.inputs.map((i) => (
              <NumField key={i.k} label={pick(i.label)} unit={i.unit} value={vals[i.k]} onChange={(v) => setVals({ ...vals, [i.k]: v })} />
            ))}
          </div>
          <div className="rounded-md border bg-background/40 px-2 py-1" aria-live="polite">
            {'err' in out ? <p className="text-xs text-amber-400">{pick(out.err)}</p> : out.rows.map(([k, v], n) => <KV key={n} k={pick(k)} v={v} strong={n === out.rows.length - 1} />)}
          </div>
        </details>
      )}
    </div>
  )
}

export function SystemsSection() {
  const t = useT()
  const lang = IDX[t('sys.lang') as keyof typeof IDX] ?? 0
  const pick = (x: Tri | string) => (typeof x === 'string' ? x : x[lang])
  return (
    <section className="grid min-w-0 gap-3" id="systems-formulas">
      <div>
        <h2 className="text-sm font-semibold">{t('sys.title')}</h2>
        <p className="text-xs text-muted-foreground">{t('sys.intro')}</p>
      </div>
      {GROUPS.map((gr) => (
        <div key={gr.id} className="grid min-w-0 gap-2">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{pick(gr.title)}</div>
          {CARDS.filter((c) => c.group === gr.id).map((c) => <CardView key={c.id} card={c} pick={pick} />)}
        </div>
      ))}
    </section>
  )
}
