import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MAX_SHIPS, addShip, removeShip, renameShip, selectShip, useApp } from '@/lib/store'

/** Fleet bar: one chip per spacecraft (click = select, double-click = rename, × = delete) and a "+" to add another. */
export function FleetBar() {
  const ships = useApp((s) => s.ships)
  const active = useApp((s) => s.active)
  const [editing, setEditing] = useState<number | null>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing !== null) { input.current?.focus(); input.current?.select() } }, [editing])
  const commit = (i: number, v: string) => { const n = v.trim(); if (n) renameShip(i, n.slice(0, 28)); setEditing(null) }
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Ruimtevaartuigen">
      {ships.map((sh, i) => (
        <div key={sh.id} role="tab" aria-selected={i === active} title="Klik = kiezen · dubbelklik = hernoemen"
          className={cn('group flex h-7 items-center gap-1.5 rounded-full border pr-1 pl-2 text-xs transition-colors', i === active ? 'border-foreground/40 bg-muted font-medium' : 'border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground')}
          onClick={() => selectShip(i)} onDoubleClick={() => setEditing(i)}>
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: sh.color }} />
          {editing === i ? (
            <input ref={input} defaultValue={sh.name} maxLength={28} className="w-28 bg-transparent outline-none"
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => commit(i, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commit(i, e.currentTarget.value); else if (e.key === 'Escape') setEditing(null) }} />
          ) : <span className="max-w-[130px] truncate">{sh.name}</span>}
          <button type="button" aria-label={`Verwijder ${sh.name}`} disabled={ships.length < 2}
            className="grid size-4 place-items-center rounded-full text-muted-foreground hover:bg-destructive/20 hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
            onClick={(e) => { e.stopPropagation(); removeShip(i) }}>
            <X className="size-3" />
          </button>
        </div>
      ))}
      <button type="button" aria-label="Ruimtevaartuig toevoegen" title={ships.length >= MAX_SHIPS ? 'Maximaal 8 ruimtevaartuigen' : 'Ruimtevaartuig toevoegen'} disabled={ships.length >= MAX_SHIPS}
        className="grid size-7 place-items-center rounded-full border border-dashed text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        onClick={addShip}>
        <Plus className="size-3.5" />
      </button>
    </div>
  )
}
