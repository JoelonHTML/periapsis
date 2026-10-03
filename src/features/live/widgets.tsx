import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Capacitor } from '@capacitor/core'
import { ChevronDown, ExternalLink, RefreshCw } from 'lucide-react'
import { getCached, type Fetched } from '@/lib/net'
import { useT } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import { ageParts, safeUrl } from './util.ts'
import './i18n'

export type L = 'nl' | 'en' | 'el'
export const LOC: Record<L, string> = { nl: 'nl-NL', en: 'en-GB', el: 'el-GR' }
export const useLang = (): L => useSettings((s) => s.lang)

/** Opens an http(s) link in the system browser: on Android, setting location makes Capacitor hand it over (same as downloadApk); in a browser a new tab. */
export function openExternal(url: string) {
  const u = safeUrl(url)
  if (!u) return
  if (Capacitor.isNativePlatform()) window.location.href = u
  else window.open(u, '_blank', 'noopener,noreferrer')
}
export function ExtLink({ url, children }: { url: string; children: ReactNode }) {
  return (
    <button type="button" onClick={() => openExternal(url)} className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-xs text-sky-300 underline-offset-2 hover:underline">
      {children}<ExternalLink className="size-3.5" />
    </button>
  )
}

/** Re-renders every `ms` and returns Date.now(). */
export function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id) }, [ms])
  return now
}

export interface FeedSpec<T> { key: string; url: string; fallbackUrl?: string; maxAgeMs: number; minRetryMs: number; parse: (b: unknown) => T; headers?: Record<string, string> }
export interface Feed<T> { data: T | null; fetchedAt: number | null; error: Fetched<T>['error']; loading: boolean; note: boolean; refresh: () => void }

/** One cached request: loads on mount (and when the url changes), `refresh` forces a reload (still obeying the retry throttle). */
export function useFeed<T>(spec: FeedSpec<T>): Feed<T> {
  const [st, setSt] = useState<{ data: T | null; fetchedAt: number | null; error: Fetched<T>['error']; loading: boolean; note: boolean }>({ data: null, fetchedAt: null, error: null, loading: true, note: false })
  const specRef = useRef(spec); specRef.current = spec
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const run = useCallback(async (force: boolean) => {
    const s = specRef.current
    setSt((p) => ({ ...p, loading: true, note: false }))
    const opts = { maxAgeMs: s.maxAgeMs, minRetryMs: s.minRetryMs, parse: s.parse, headers: s.headers, force }
    let r: Fetched<T>
    try {
      r = await getCached(s.key, s.url, opts)
      if (!r.data && r.error && r.error !== 'offline' && s.fallbackUrl) r = await getCached(s.key, s.fallbackUrl, opts)
    } catch { r = { data: null, fetchedAt: null, fromCache: false, error: 'offline' } }
    if (!alive.current) return
    setSt((p) => ({ data: r.data, fetchedAt: r.fetchedAt, error: r.error, loading: false, note: force && r.fromCache && !r.error && r.fetchedAt === p.fetchedAt }))
  }, [])
  useEffect(() => { void run(false) }, [run, spec.url, spec.key])
  const refresh = useCallback(() => { void run(true) }, [run])
  return { ...st, refresh }
}

/** Collapsible card: header (toggle + refresh), content, then source credit and data age. */
export function FeedCard({ title, credit, feeds, onRefresh, children, defaultOpen = true, empty }: {
  title: string; credit: string; feeds: Feed<unknown>[]; onRefresh: () => void; children: ReactNode; defaultOpen?: boolean; empty?: boolean
}) {
  const t = useT()
  const [open, setOpen] = useState(defaultOpen)
  const now = useNow(30_000)
  const loading = feeds.some((f) => f.loading)
  const stamps = feeds.map((f) => f.fetchedAt).filter((x): x is number => x !== null)
  const oldest = stamps.length ? Math.min(...stamps) : null
  const anyData = feeds.some((f) => f.data !== null)
  const err = feeds.find((f) => f.error)?.error ?? null
  const note = feeds.some((f) => f.note) && !err
  const age = oldest === null ? null : ageParts(now - oldest)
  const ageText = age ? t('live.updated', { age: t(age.unit === 'min' ? 'live.ageMin' : age.unit === 'h' ? 'live.ageH' : 'live.ageD', { n: age.n }) }) : t('live.never')
  return (
    <section className="rounded-xl border border-border bg-card/60">
      <div className="flex items-center">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} title={open ? t('live.collapse') : t('live.expand')}
          className="flex min-h-11 flex-1 items-center gap-2 rounded-xl px-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <ChevronDown className={`size-4 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
          <span className="min-w-0 flex-1 truncate">{title}</span>
        </button>
        <button type="button" onClick={onRefresh} disabled={loading} aria-label={`${t('live.refresh')}: ${title}`} title={t('live.refresh')}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground disabled:opacity-60">
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="grid gap-2 px-3 pb-3">
          {!anyData && loading ? <p className="text-xs text-muted-foreground">{t('live.loading')}</p>
            : !anyData && err ? <p role="alert" className="rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-300">{t(err === 'offline' ? 'live.failOffline' : err === 'http' ? 'live.failHttp' : 'live.failParse')}</p>
            : empty ? null : children}
          {anyData && err && <p className="text-[11px] text-amber-300">{t('live.fail')}. {t('live.showingOld')}</p>}
          {note && <p className="text-[11px] text-muted-foreground">{t('live.fresh')}</p>}
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-t border-border/60 pt-1.5 text-[10px] text-muted-foreground">
            <span>{credit}</span><span className="tabular-nums">{ageText}</span>
          </div>
        </div>
      )}
    </section>
  )
}

/** Text clamped to a few lines with a toggle. */
export function Clamp({ text, lines = 3 }: { text: string; lines?: number }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  if (!text) return null
  return (
    <div className="grid gap-0.5">
      <p className="text-xs leading-relaxed text-muted-foreground" style={open ? undefined : { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{text}</p>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="min-h-11 w-fit rounded-md px-1 text-xs text-sky-300">{open ? t('live.less') : t('live.more')}</button>
    </div>
  )
}
