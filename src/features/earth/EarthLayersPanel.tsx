// Small panel with the Earth layer switches (clouds, city lights, atmosphere, coastlines, borders, cities), the quality tier and the data credits.
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useT } from '@/lib/i18n'
import { configFor } from './caps'
import { EARTH_CREDITS } from './credits'
import './i18n'
import { earthSettings, setLayer, setQuality } from './settings'
import { effectiveLayers, type Layers, type Quality } from './tier'

const ROWS: [keyof Layers, string][] = [
  ['clouds', 'earth.clouds'], ['nightLights', 'earth.lights'], ['atmosphere', 'earth.atmo'],
  ['coast', 'earth.coast'], ['borders', 'earth.borders'], ['cities', 'earth.cities'],
]

export function EarthLayersPanel() {
  const t = useT()
  const quality = earthSettings.useStore((s) => s.quality)
  const custom = earthSettings.useStore((s) => s.custom)
  const cfg = configFor(quality)
  const layers = effectiveLayers(cfg, custom)
  return (
    <div className="grid gap-2">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('earth.title')}</div>
      {ROWS.map(([k, key]) => (
        <div key={k} className="flex items-center justify-between gap-2 text-sm">
          <span>{t(key)}</span>
          <Switch checked={layers[k]} onCheckedChange={(v) => setLayer(k, v)} />
        </div>
      ))}
      <div className="flex items-center justify-between gap-2 text-sm">
        <span>{t('earth.quality')}</span>
        <Select value={quality} onValueChange={(v) => setQuality(v as Quality)}>
          <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{(['auto', 'low', 'mid', 'high'] as const).map((q) => <SelectItem key={q} value={q}>{t(`earth.q.${q}`)}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <p className="text-[10.5px] text-muted-foreground">{t('earth.q.now', { tier: t(`earth.q.${cfg.tier}`), tex: cfg.dayTex })}</p>
      <details className="text-[10.5px] text-muted-foreground">
        <summary className="cursor-pointer">{t('earth.credits')}</summary>
        <ul className="mt-1 grid gap-1">
          {EARTH_CREDITS.map((c) => <li key={c.what}><b>{t(c.what)}</b>: {c.who} — {c.licence}</li>)}
        </ul>
        <p className="mt-1">{t('earth.credits.note')}</p>
      </details>
    </div>
  )
}
