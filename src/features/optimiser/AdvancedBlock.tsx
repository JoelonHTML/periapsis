import { useState } from 'react'
import { ChevronDown, TriangleAlert } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { DSM_TOP } from '@/lib/mga'
import './i18n'

export interface AdvancedOpts { maxRevs: number; allowResonant: boolean; dsm: boolean }
export const ADVANCED_OFF: AdvancedOpts = { maxRevs: 0, allowResonant: false, dsm: false }
export const advancedOn = (o: AdvancedOpts) => o.maxRevs > 0 || o.allowResonant || o.dsm

/** Collapsible "Geavanceerd" block of the mission settings: multi-rev legs, resonant same-body legs, deep-space manoeuvres. */
export function AdvancedBlock({ value, onChange }: { value: AdvancedOpts; onChange: (p: Partial<AdvancedOpts>) => void }) {
  const t = useT()
  const [open, setOpen] = useState(advancedOn(value))
  const on = advancedOn(value)
  return (
    <div className="rounded-lg border bg-muted/20" data-testid="adv-block">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left text-xs font-medium">
        <span>{t('opt.title')}{on && <span className="ml-2 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">{[value.maxRevs > 0 && `${value.maxRevs}×`, value.allowResonant && 'res', value.dsm && 'DSM'].filter(Boolean).join(' · ')}</span>}</span>
        <ChevronDown className={`size-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="grid gap-3 border-t px-3 py-3">
          <p className="text-[10.5px] leading-snug text-muted-foreground">{t('opt.intro')}</p>
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">{t('opt.revs')}</Label>
            <Select value={String(value.maxRevs)} onValueChange={(v) => onChange({ maxRevs: +v })}>
              <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{[0, 1, 2].map((n) => <SelectItem key={n} value={String(n)}>{t(`opt.revs.${n}`)}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-[10.5px] leading-snug text-muted-foreground">{t('opt.revs.h')}</p>
          </div>
          <div className="grid gap-1">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-xs">{t('opt.resonant')}</Label>
              <Switch checked={value.allowResonant} onCheckedChange={(c) => onChange({ allowResonant: c })} />
            </div>
            <p className="text-[10.5px] leading-snug text-muted-foreground">{t('opt.resonant.h')}</p>
          </div>
          <div className="grid gap-1">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-xs">{t('opt.dsm')}</Label>
              <Switch checked={value.dsm} onCheckedChange={(c) => onChange({ dsm: c })} />
            </div>
            <p className="text-[10.5px] leading-snug text-muted-foreground">{t('opt.dsm.h')}</p>
          </div>
          {on && (
            <p className="flex items-start gap-1.5 text-[11px] leading-snug text-amber-400">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />{t('opt.warn', { n: DSM_TOP })}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
