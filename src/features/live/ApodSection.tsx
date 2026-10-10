import { useState } from 'react'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Clamp, ExtLink, FeedCard, useFeed } from './widgets'
import { APOD_MIRROR, APOD_PAGE, parseApod } from './apod.ts'

const KEY = 'periapsis.nasaKey'
const readKey = () => { try { return (localStorage.getItem(KEY) ?? '').trim() } catch { return '' } }
const validKey = (k: string) => /^[A-Za-z0-9_-]{8,64}$/.test(k)

export function ApodSection() {
  const t = useT()
  const [key, setKey] = useState(readKey)
  const [draft, setDraft] = useState(readKey)
  const apod = useFeed({ key: 'live.apod.v2', /* v2: drops entries the old, too lenient page reader cached */ url: `https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(key || 'DEMO_KEY')}&thumbs=true`, fallbackUrl: [APOD_PAGE, APOD_MIRROR], maxAgeMs: 12 * 3600_000, minRetryMs: 30 * 60_000, parse: parseApod })
  const save = (k: string) => {
    try { if (k) localStorage.setItem(KEY, k); else localStorage.removeItem(KEY) } catch { /* private mode */ }
    setKey(k); setDraft(k)
    // A new key should fetch right away: url changes, and the old cache entry is ignored by forcing a refresh next tick.
    setTimeout(apod.refresh, 0)
  }
  const a = apod.data
  const img = a && (a.video ? a.thumb : a.url)
  return (
    <FeedCard title={t('live.apod.title')} credit={t('live.apod.credit')} feeds={[apod]} onRefresh={apod.refresh} empty={!a}>
      {a && (
        <div className="grid gap-2">
          {img && <img src={img} alt={a.title} loading="lazy" className="max-h-80 w-full rounded-lg bg-muted object-contain" />}
          <div>
            <div className="text-sm font-medium leading-snug">{a.title}</div>
            <div className="text-[11px] text-muted-foreground">{a.date}{a.copyright && ` · ${t('live.apod.copyright', { c: a.copyright })}`}</div>
          </div>
          {a.video && <p className="text-xs text-muted-foreground">{t('live.apod.video')}</p>}
          <div className="flex flex-wrap gap-x-3">
            {a.video && <ExtLink url={a.url}>{t('live.apod.watch')}</ExtLink>}
            {!a.video && a.hdurl && <ExtLink url={a.hdurl}>{t('live.apod.hd')}</ExtLink>}
          </div>
          <Clamp text={a.explanation} lines={3} />
        </div>
      )}
      <details className="rounded-lg bg-muted/40 px-2 text-xs">
        <summary className="flex min-h-11 cursor-pointer items-center text-muted-foreground">{t('live.apod.key')} · {key ? t('live.apod.keyOwn') : t('live.apod.keyDemo')}</summary>
        <div className="grid gap-2 pb-2">
          <p className="text-muted-foreground">{t('live.apod.keyHint')}</p>
          <Input value={draft} onChange={(e) => setDraft(e.target.value.trim())} placeholder={t('live.apod.keyPlaceholder')} autoCapitalize="off" autoCorrect="off" spellCheck={false} className="h-11" />
          <div className="flex flex-wrap items-center gap-2">
            <Button className="h-11 px-4" disabled={!validKey(draft) || draft === key} onClick={() => save(draft)}>{t('live.apod.keySave')}</Button>
            {key && <Button variant="outline" className="h-11 px-4" onClick={() => save('')}>{t('live.apod.keyClear')}</Button>}
            <ExtLink url="https://api.nasa.gov/">{t('live.apod.keyGet')}</ExtLink>
          </div>
        </div>
      </details>
    </FeedCard>
  )
}
