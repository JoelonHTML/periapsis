import { RefreshCw, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { KV, Section } from '@/components/bits'
import { useT } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import { Scatter, methodColor } from './Scatter'
import { NO_FILTERS, VOYAGER_KMS, distLy, filterExo, inHabitableZone, methodCounts, sortExo, travelYears, travelYearsFracC, HZ, type Exo, type Filters, type SortKey } from './exo.ts'
import { fmtAge, fmtYears, nf, sig } from './fmt'
import { cat, loadExo } from './store'

const LIST_MAX = 40
const R_JUP = 11.209 // Earth radii per Jupiter radius (equatorial, 1 bar)
const DISTS = [null, 20, 50, 100, 500] as const
const SORTS: SortKey[] = ['dist', 'name', 'radius', 'period', 'year']

function Detail({ p, onClose }: { p: Exo; onClose: () => void }) {
  const t = useT(), lang = useSettings((s) => s.lang)
  const ly = distLy(p)
  const hz = p.insol !== null && p.radius !== null ? inHabitableZone(p) : null
  const unk = t('cat.unk')
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-card/60 p-3" data-testid="cat-detail">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold">{p.name}</div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="inline-block size-2 rounded-full" style={{ background: methodColor(p.method) }} />{p.method}{p.year ? ` · ${p.year}` : ''}</div>
        </div>
        <Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label={t('cat.pl.close')} onClick={onClose}><X className="size-4" /></Button>
      </div>
      <div>
        <KV k={t('cat.pl.host')} v={p.host || unk} />
        <KV k={t('cat.pl.dist')} v={ly === null ? unk : `${sig(lang, ly)} ${t('cat.ly')} (${sig(lang, p.distPc!)} ${t('cat.pc')})`} />
        <KV k={t('cat.pl.radius')} v={p.radius === null ? unk : t('cat.pl.earths', { v: sig(lang, p.radius), j: sig(lang, p.radius / R_JUP) })} />
        <KV k={t('cat.pl.mass')} v={p.mass === null ? unk : `${sig(lang, p.mass)} M⊕`} />
        <KV k={t('cat.pl.period')} v={p.periodD === null ? unk : t('cat.d', { v: sig(lang, p.periodD) })} />
        <KV k={t('cat.pl.sma')} v={p.smaAu === null ? unk : `${sig(lang, p.smaAu)} AU`} />
        <KV k={t('cat.pl.eqt')} v={p.eqT === null ? unk : `${nf(lang, p.eqT, 0)} K`} />
        <KV k={t('cat.pl.insol')} v={p.insol === null ? unk : `${sig(lang, p.insol)} × ${t('cat.earth')}`} />
        <KV k={t('cat.pl.teff')} v={p.teff === null ? unk : `${nf(lang, p.teff, 0)} K`} />
        <KV k={t('cat.pl.disc')} v={`${p.year ?? unk} · ${p.method}`} />
      </div>
      <div className={`text-xs ${hz ? 'text-emerald-400' : 'text-muted-foreground'}`}>{hz === null ? t('cat.pl.hz.unk') : hz ? t('cat.pl.hz.yes') : t('cat.pl.hz.no')}</div>
      <Section title={t('cat.trip')}>
        {ly === null ? <p className="text-xs text-muted-foreground">{t('cat.trip.nodist')}</p> : (
          <div>
            <KV k={t('cat.trip.voy')} v={fmtYears(t, lang, travelYears(ly, VOYAGER_KMS))} strong />
            <KV k={t('cat.trip.c10')} v={fmtYears(t, lang, travelYearsFracC(ly, 0.1))} strong />
            <p className="pt-1 text-[11px] leading-snug text-muted-foreground">{t('cat.trip.h')}</p>
          </div>
        )}
      </Section>
    </div>
  )
}

const selectCls = 'h-11 w-full rounded-md border border-input bg-background px-2 text-sm'

export function ExoView() {
  const t = useT(), lang = useSettings((s) => s.lang)
  const { exo, exoState, exoError, exoAt, exoMemoryOnly } = cat.useStore((s) => s)
  const [f, setF] = useState<Filters>(NO_FILTERS)
  const [sort, setSort] = useState<SortKey>('dist')
  const [sel, setSel] = useState<Exo | null>(null)
  useEffect(() => { if (cat.get().exoState === 'idle') void loadExo() }, [])
  const methods = useMemo(() => (exo ? methodCounts(exo) : []), [exo])
  const list = useMemo(() => (exo ? sortExo(filterExo(exo, f), sort) : []), [exo, f, sort])
  const set = (p: Partial<Filters>) => setF((x) => ({ ...x, ...p }))
  const age = exoAt ? fmtAge(t, lang, Date.now() - exoAt) : ''

  if (!exo) {
    return (
      <div className="grid gap-3">
        <p className="text-sm text-muted-foreground" role="status">
          {exoState === 'loading' || exoState === 'idle' ? t('cat.exo.loading') : exoError === 'http' ? t('cat.exo.http') : exoError === 'parse' ? t('cat.exo.parse') : exoError === 'offline' ? t('cat.exo.offline') : t('cat.exo.empty')}
        </p>
        {exoState === 'error' && <Button variant="outline" className="h-11" onClick={() => void loadExo(true)}><RefreshCw className="mr-2 size-4" />{t('cat.retry')}</Button>}
        <p className="text-[11px] text-muted-foreground">{t('cat.src.exo')}</p>
      </div>
    )
  }
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold tabular-nums">{t('cat.exo.count', { n: nf(lang, exo.length, 0) })}</div>
          <div className="text-[11px] text-muted-foreground">{exoError ? t('cat.exo.stale', { age }) : t('cat.exo.age', { age })}</div>
        </div>
        <Button variant="outline" size="icon" className="size-11 shrink-0" aria-label={t('cat.refresh')} disabled={exoState === 'loading'} onClick={() => void loadExo(true)}><RefreshCw className={`size-4 ${exoState === 'loading' ? 'animate-spin' : ''}`} /></Button>
      </div>
      {exoMemoryOnly && <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-300">{t('cat.exo.mem')}</p>}

      <div className="grid gap-2">
        <Input type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder={t('cat.search')} aria-label={t('cat.search')} className="h-11" />
        <div className="grid grid-cols-2 gap-2">
          <select className={selectCls} value={f.method} aria-label={t('cat.method')} onChange={(e) => set({ method: e.target.value })}>
            <option value="">{t('cat.method.all')}</option>
            {methods.map(([m, n]) => <option key={m} value={m}>{m} ({n})</option>)}
          </select>
          <select className={selectCls} value={sort} aria-label={t('cat.sort')} onChange={(e) => setSort(e.target.value as SortKey)}>
            {SORTS.map((k) => <option key={k} value={k}>{t(`cat.sort.${k}`)}</option>)}
          </select>
        </div>
        <div>
          <div className="mb-1 text-[11px] text-muted-foreground">{t('cat.dist')}</div>
          <div className="grid grid-cols-5 gap-1">
            {DISTS.map((d) => (
              <Button key={String(d)} variant={f.maxLy === d ? 'secondary' : 'outline'} aria-pressed={f.maxLy === d} className="h-11 px-1 text-xs" onClick={() => set({ maxLy: d })}>
                {d === null ? t('cat.dist.all') : t('cat.dist.ly', { n: d })}
              </Button>
            ))}
          </div>
        </div>
        <label className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border px-3 py-1.5">
          <span className="text-sm">{t('cat.hz')}</span>
          <Switch checked={f.hz} onCheckedChange={(v) => set({ hz: v })} aria-label={t('cat.hz')} />
        </label>
        <p className="text-[11px] leading-snug text-muted-foreground">{t('cat.hz.def')} ({HZ.insolMin}–{HZ.insolMax} × S⊕, R &lt; {HZ.radiusMax} R⊕)</p>
      </div>

      <Section title={t('cat.plot')}>
        <Scatter list={list} selected={sel} onPick={setSel} />
        <p className="text-[11px] leading-snug text-muted-foreground">{t('cat.plot.h')}</p>
      </Section>

      {sel && <Detail p={sel} onClose={() => setSel(null)} />}

      <Section title={t('cat.exo.of', { n: nf(lang, list.length, 0), m: nf(lang, exo.length, 0) })}>
        {!list.length && <p className="text-sm text-muted-foreground">{t('cat.list.none')}</p>}
        <div className="grid gap-1">
          {list.slice(0, LIST_MAX).map((p) => {
            const ly = distLy(p)
            return (
              <button key={p.name} type="button" onClick={() => setSel(p)} aria-pressed={sel?.name === p.name}
                className={`flex min-h-11 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left ${sel?.name === p.name ? 'border-primary bg-primary/10' : 'border-border bg-card/40'}`}>
                <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: methodColor(p.method) }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{p.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{p.host}{p.radius !== null ? ` · ${sig(lang, p.radius)} R⊕` : ''}</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{ly === null ? '—' : `${sig(lang, ly)} ${t('cat.ly')}`}</span>
              </button>
            )
          })}
        </div>
        {list.length > LIST_MAX && <p className="text-[11px] text-muted-foreground">{t('cat.list.more', { n: nf(lang, list.length - LIST_MAX, 0) })}</p>}
      </Section>
      <p className="text-[11px] text-muted-foreground">{t('cat.src.exo')}</p>
    </div>
  )
}
