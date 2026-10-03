import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

const OPEN_EVENT = 'periapsis:open-fold'
const KEY = (id: string) => `periapsis.fold.${id}`

/** Collapsible block of a long panel. Remembers open/closed per session; content is only mounted while open
 *  (so heavy parts such as the porkchop grid cost nothing until asked for). */
export function Fold({ id, title, summary, defaultOpen = false, children }: { id: string; title: string; summary?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(() => { try { const v = sessionStorage.getItem(KEY(id)); return v === null ? defaultOpen : v === '1' } catch { return defaultOpen } })
  const set = (v: boolean) => { setOpen(v); try { sessionStorage.setItem(KEY(id), v ? '1' : '0') } catch { /* ignore */ } }
  useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent<string>).detail === id) set(true) }
    addEventListener(OPEN_EVENT, h)
    return () => removeEventListener(OPEN_EVENT, h)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section id={`sec-${id}`} className="scroll-mt-14 rounded-2xl border bg-card/40">
      <button type="button" aria-expanded={open} onClick={() => set(!open)} className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          {summary && !open && <span className="block truncate text-xs text-muted-foreground">{summary}</span>}
        </span>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="grid gap-3 border-t p-3">{children}</div>}
    </section>
  )
}

/** Sticky row of chips at the top of a long panel: tap = open that block and scroll to it. */
export function JumpBar({ items }: { items: { id: string; label: string }[] }) {
  const go = (id: string) => {
    dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }))
    requestAnimationFrame(() => document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  return (
    <nav aria-label="Ga naar" className="sticky -top-3 z-10 -mx-4 flex gap-1.5 overflow-x-auto bg-card/95 px-4 py-2 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((it) => (
        <button key={it.id} type="button" onClick={() => go(it.id)} className="h-9 shrink-0 rounded-full border px-3 text-xs font-medium text-muted-foreground active:bg-muted">{it.label}</button>
      ))}
    </nav>
  )
}
