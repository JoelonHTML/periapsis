import katex from 'katex'
import 'katex/dist/katex.min.css'
import { useMemo, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** KaTeX formula. Only ever fed app-generated strings (numbers + TeX), never user text. */
export function Tex({ tex, block }: { tex: string; block?: boolean }) {
  const html = useMemo(() => katex.renderToString(tex, { displayMode: !!block, throwOnError: false }), [tex, block])
  return <span className={block ? 'block overflow-x-auto py-1 text-[13px] [contain:inline-size]' : ''} dangerouslySetInnerHTML={{ __html: html }} />
}

export function NumField({ label, value, onChange, step = 1, unit, min }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; unit?: string; min?: number
}) {
  return (
    <div className="grid gap-1">
      <Label className="text-xs text-muted-foreground">{label}{unit && <span className="opacity-60"> ({unit})</span>}</Label>
      <Input type="number" value={Number.isFinite(value) ? value : ''} step={step} min={min} className="h-8"
        onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(v) }} />
    </div>
  )
}

export function KV({ k, v, strong }: { k: ReactNode; v: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-xs">
      <span className="min-w-0 text-muted-foreground">{k}</span>
      <span className={strong ? 'text-right font-semibold text-emerald-400 tabular-nums' : 'text-right tabular-nums'}>{v}</span>
    </div>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{title}</div>
      {children}
    </div>
  )
}

export const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—')
