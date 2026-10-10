// Plain-language title of an agenda event in NL/EN/EL (shared by the widget snapshot and the notification planner). Pure.
import * as tonight from './texts.ts'
import type { SkyEvent } from './events.ts'

type L = 'nl' | 'en' | 'el'
const DICT: Record<L, Record<string, string>> = { nl: tonight.nl, en: tonight.en, el: tonight.el }

export const tr = (lang: L, key: string, vars?: Record<string, string | number>) => {
  let s = DICT[lang][key] ?? tonight.nl[key] ?? key
  if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, String(vars[k]))
  return s
}

export function eventTitle(lang: L, e: SkyEvent): string {
  const name = (id?: string) => tr(lang, `sky.p.${id}`)
  switch (e.kind) {
    case 'moon': return tr(lang, `sky.ev.moon.${e.phase}`)
    case 'season': return tr(lang, `sky.ev.${e.season}`)
    case 'conj': return tr(lang, 'sky.ev.conj', { a: name(e.a), b: name(e.b) })
    case 'opp': return tr(lang, 'sky.ev.opp', { p: name(e.a) })
    case 'elong': return tr(lang, e.evening ? 'sky.ev.elongE' : 'sky.ev.elongW', { p: name(e.a) })
    case 'meteor': return tr(lang, `sky.sh.${e.shower}`)
    default: return tr(lang, `sky.ev.${e.kind}.${e.eclipse?.kind}`) // solar | lunar
  }
}
