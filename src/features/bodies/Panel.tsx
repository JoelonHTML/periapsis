import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { KV, Section } from '@/components/bits'
import { useT } from '@/lib/i18n'
import { createStore } from '@/lib/mini-store'
import { useSettings } from '@/lib/settings'
import './i18n.ts'
import { BODY_LIST, BODY_MAP, MOONS_ASOF, SOURCE, bodyName, type Body, type Kind } from './data.ts'
import { fmtDistance, fmtGas, fmtGravity, fmtMass, fmtNum, fmtOrbitPeriod, fmtRadius, fmtRho, fmtRotation, fmtTemp, fmtVesc } from './format.ts'
import { BodyDisc } from './BodyDisc'
import { QuizPanel } from './QuizView'
import { ScalePanel } from './Scale'
import { view3D } from './go3d'

type Sub = 'enc' | 'scale' | 'quiz'
const st = createStore<{ sub: Sub; sel: string | null }>({ sub: 'enc', sel: null })
const open = (id: string) => st.set({ sub: 'enc', sel: id })

export function BodiesPanel() {
  const t = useT()
  const { sub, sel } = st.useStore((s) => s)
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-3 gap-1.5" role="tablist">
        {(['enc', 'scale', 'quiz'] as const).map((k) => (
          <Button key={k} role="tab" aria-selected={sub === k} variant={sub === k ? 'secondary' : 'outline'} className="h-11 px-1 text-xs" onClick={() => st.set({ sub: k })}>{t(`bod.tab.${k}`)}</Button>
        ))}
      </div>
      {sub === 'enc' && (sel && BODY_MAP[sel] ? <Detail b={BODY_MAP[sel]} /> : <Encyclopedia />)}
      {sub === 'scale' && <ScalePanel onOpen={open} />}
      {sub === 'quiz' && <QuizPanel />}
    </div>
  )
}

const GROUPS: Kind[] = ['star', 'planet', 'dwarf', 'moon']

function Encyclopedia() {
  const t = useT(), lang = useSettings((s) => s.lang)
  return (
    <div className="grid gap-4">
      {GROUPS.map((k) => (
        <Section key={k} title={t(`bod.g.${k}`)}>
          <div className="grid grid-cols-3 gap-2">
            {BODY_LIST.filter((b) => b.kind === k).map((b) => (
              <button key={b.id} type="button" onClick={() => open(b.id)} className="flex min-h-[96px] flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-card/40 p-2 text-center hover:bg-muted/40">
                <BodyDisc id={b.id} size={44} />
                <span className="text-xs font-medium leading-tight">{bodyName(b.id, lang)}</span>
                <span className="text-[10px] text-muted-foreground">{b.parent ? bodyName(b.parent, lang) : fmtRadius(b.R, lang)}</span>
              </button>
            ))}
          </div>
        </Section>
      ))}
      <p className="text-[11px] text-muted-foreground">{t('bod.source', { s: SOURCE })}</p>
    </div>
  )
}

function Detail({ b }: { b: Body }) {
  const t = useT(), lang = useSettings((s) => s.lang)
  const pn = b.parent ? bodyName(b.parent, lang) : ''
  const rot = b.rotH === undefined ? null : [fmtRotation(b, lang), b.rotH < 0 ? t('bod.retro') : '', b.sync ? t('bod.sync') : ''].filter(Boolean).join(', ')
  const atm = b.atm.length ? b.atm.map((g) => fmtGas(g, lang)).join(', ') + (b.atmNote === 'trace' ? ` (${t('bod.atm.trace').toLowerCase()})` : '') : t(b.atmNote === 'trace' ? 'bod.atm.trace' : 'bod.atm.none')
  const mission = (m: string) => (m.endsWith('|planned') ? `${m.slice(0, -8)} (${t('bod.planned')})` : m)
  return (
    <div className="grid gap-4">
      <Button variant="ghost" className="h-11 justify-start gap-2 px-1 text-xs text-muted-foreground" onClick={() => st.set({ sel: null })}><ArrowLeft className="size-4" />{t('bod.back')}</Button>
      <div className="flex items-center gap-4">
        <BodyDisc id={b.id} size={84} />
        <div className="min-w-0">
          <h2 className="text-xl font-semibold leading-tight">{bodyName(b.id, lang)}</h2>
          <div className="text-xs text-muted-foreground">{t(`bod.k.${b.kind}`, { p: pn })}</div>
        </div>
      </div>
      <div className="grid gap-2">
        <Button className="h-11" onClick={() => view3D(b.id)}>{t('bod.view3d')}</Button>
        {b.kind === 'planet' || b.kind === 'dwarf' ? <Button variant="outline" className="h-11" onClick={() => view3D(b.id, true)}>{t('bod.viewSolar')}</Button> : null}
      </div>
      <Section title={t('bod.desc')}><p className="text-sm leading-relaxed">{b.desc[lang]}</p></Section>
      <Section title={t('bod.facts')}>
        <div className="grid divide-y divide-border/40">
          <KV k={t('bod.f.radius')} v={fmtRadius(b.R, lang)} />
          <KV k={t('bod.f.mass')} v={fmtMass(b.M, lang)} />
          <KV k={t('bod.f.gravity')} v={fmtGravity(b.g, lang)} />
          <KV k={t('bod.f.vesc')} v={fmtVesc(b.vesc, lang)} />
          <KV k={t('bod.f.rho')} v={fmtRho(b.rho, lang)} />
          {rot && <KV k={t('bod.f.rot')} v={rot} />}
          {b.P !== undefined && <KV k={b.parent ? t('bod.f.orbitMoon', { p: pn }) : t('bod.f.orbit')} v={fmtOrbitPeriod(b, lang)} />}
          {b.a !== undefined && <KV k={b.parent ? t('bod.f.aMoon', { p: pn }) : t('bod.f.a')} v={fmtDistance(b.a, lang, !!b.parent)} />}
          {b.T !== undefined && <KV k={t('bod.f.T')} v={fmtTemp(b.T, lang)} />}
          {b.moons !== undefined && <KV k={t('bod.f.moons', { y: MOONS_ASOF })} v={fmtNum(b.moons, lang)} />}
          <KV k={t('bod.f.atm')} v={<span className="block max-w-[60%] text-right">{atm}</span>} />
        </div>
      </Section>
      <Section title={t('bod.missions')}>
        <div className="flex flex-wrap gap-1.5">
          {b.missions.map((m) => <span key={m} className="rounded-full border border-border px-2.5 py-1 text-xs">{mission(m)}</span>)}
        </div>
      </Section>
      <p className="text-[11px] text-muted-foreground">{t('bod.source', { s: SOURCE })}</p>
    </div>
  )
}
