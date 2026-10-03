import { ArrowLeft, Eye, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { KV, Section } from '@/components/bits'
import { useT } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import { store, useApp } from '@/lib/store'
import { SMALL_LIST, isComet, jdOfT, msOfJd, nextPerihelionJd, type Listed, type Small } from './sbdb.ts'
import { fmtAge, fmtDate, fmtPeriod, fmtYears, nf, sig } from './fmt'
import { cat, loadSmall, smallEntry, toggleShown } from './store'

function Detail({ item, onBack }: { item: Listed; onBack: () => void }) {
  const t = useT(), lang = useSettings((s) => s.lang)
  const e = cat.useStore((s) => smallEntry(s, item.id))
  const shown = cat.useStore((s) => s.shown.includes(item.id))
  const view = useApp((s) => s.view)
  const s: Small | null = e.data
  const unk = t('cat.unk')
  const next = s ? nextPerihelionJd(s, jdOfT(Date.now() / 1000 - 946728000)) : null // Date.now() in s since J2000 (UTC≈TT here)
  return (
    <div className="grid gap-3">
      <Button variant="ghost" className="h-11 justify-start px-2" onClick={onBack}><ArrowLeft className="mr-2 size-4" />{t('cat.small.back')}</Button>
      <div>
        <div className="flex items-center gap-2 text-lg font-semibold"><span className="inline-block size-3 rounded-full" style={{ background: item.color }} />{item.label}</div>
        <div className="text-xs text-muted-foreground">{item.comet ? t('cat.small.comet') : t('cat.small.asteroid')}</div>
      </div>
      {e.state === 'loading' && <p className="text-sm text-muted-foreground" role="status">{t('cat.small.loading')}</p>}
      {e.state === 'error' && (
        <div className="grid gap-2">
          <p className="text-sm text-muted-foreground" role="status">{t('cat.small.err')}</p>
          <Button variant="outline" className="h-11" onClick={() => loadSmall(item.id)}><RefreshCw className="mr-2 size-4" />{t('cat.retry')}</Button>
        </div>
      )}
      {s && (
        <>
          <label className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border px-3 py-1.5">
            <span className="min-w-0"><span className="block text-sm">{t('cat.small.show')}</span><span className="block text-[11px] text-muted-foreground">{t('cat.small.show.h')}</span></span>
            <Switch checked={shown} onCheckedChange={() => toggleShown(item.id)} aria-label={t('cat.small.show')} />
          </label>
          {shown && view !== 'solar' && (
            <div className="grid gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-300">
              {t('cat.small.view')}
              <Button variant="outline" className="h-11" onClick={() => store.set({ view: 'solar' })}>{t('cat.small.view.go')}</Button>
            </div>
          )}
          <div>
            <KV k={t('cat.s.type')} v={[isComet(s) ? t('cat.small.comet') : t('cat.small.asteroid'), s.cls].filter(Boolean).join(' · ')} />
            <KV k={t('cat.s.a')} v={`${nf(lang, s.a, 3)} AU`} />
            <KV k={t('cat.s.e')} v={nf(lang, s.e, 4)} />
            <KV k={t('cat.s.i')} v={`${nf(lang, s.i, 2)}°`} />
            <KV k={t('cat.s.per')} v={fmtPeriod(t, lang, s.per)} />
            <KV k={t('cat.s.q')} v={`${nf(lang, s.q, 3)} AU`} />
            <KV k={t('cat.s.Q')} v={`${nf(lang, s.ad, 3)} AU`} />
            {next !== null && <KV k={t('cat.s.next')} v={fmtDate(lang, msOfJd(next))} strong />}
            {next !== null && <KV k="" v={t('cat.s.in', { v: fmtYears(t, lang, (next - jdOfT(Date.now() / 1000 - 946728000)) / 365.25) })} />}
          </div>
          <Section title={t('cat.s.phys')}>
            {s.diameter === null && s.albedo === null && s.H === null && s.rotPer === null ? <p className="text-xs text-muted-foreground">{t('cat.s.none')}</p> : (
              <div>
                <KV k={t('cat.s.diam')} v={s.diameter === null ? unk : `${sig(lang, s.diameter)} km`} />
                <KV k={t('cat.s.alb')} v={s.albedo === null ? unk : nf(lang, s.albedo, 3)} />
                <KV k={t('cat.s.H')} v={s.H === null ? unk : nf(lang, s.H, 2)} />
                <KV k={t('cat.s.rot')} v={s.rotPer === null ? unk : t('cat.h', { v: nf(lang, s.rotPer, 2) })} />
              </div>
            )}
          </Section>
          <p className="text-[11px] leading-snug text-muted-foreground">{t('cat.s.epoch', { e: s.epochJd === null ? '?' : nf(lang, s.epochJd, 1) })}{e.fetchedAt ? ` ${t('cat.s.age', { age: fmtAge(t, lang, Date.now() - e.fetchedAt) })}.` : ''}</p>
        </>
      )}
      <p className="text-[11px] text-muted-foreground">{t('cat.src.sbdb')}</p>
    </div>
  )
}

export function SmallView() {
  const t = useT()
  const [sel, setSel] = useState<string | null>(null)
  const shown = cat.useStore((s) => s.shown)
  const small = cat.useStore((s) => s.small)
  const item = sel ? SMALL_LIST.find((x) => x.id === sel) : null
  if (item) return <Detail item={item} onBack={() => setSel(null)} />
  return (
    <div className="grid gap-3">
      <p className="text-xs leading-snug text-muted-foreground">{t('cat.small.intro')}</p>
      <div className="grid gap-1">
        {SMALL_LIST.map((x) => {
          const st = smallEntry({ small }, x.id)
          const on = shown.includes(x.id)
          return (
            <button key={x.id} type="button" className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-card/40 px-2.5 py-1.5 text-left"
              onClick={() => { setSel(x.id); loadSmall(x.id) }}>
              <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: x.color }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{x.label}</span>
                <span className="block text-[11px] text-muted-foreground">{x.comet ? t('cat.small.comet') : t('cat.small.asteroid')}{st.state === 'loading' ? ` · ${t('cat.small.loading')}` : ''}</span>
              </span>
              {on && <Eye className="size-4 shrink-0 text-emerald-400" aria-label={t('cat.small.shown')} />}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">{t('cat.src.sbdb')}</p>
    </div>
  )
}
