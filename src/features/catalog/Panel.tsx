// "Catalogus" tab (world Verkennen): NASA exoplanets and famous small bodies of the solar system.
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import { ExoView } from './ExoView'
import { SmallView } from './SmallView'
import './i18n.ts'

export function CatalogPanel() {
  const t = useT()
  const [sub, setSub] = useState<'exo' | 'small'>('exo')
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-1.5" role="tablist">
        {(['exo', 'small'] as const).map((k) => (
          <Button key={k} role="tab" aria-selected={sub === k} variant={sub === k ? 'secondary' : 'outline'} className="h-11 px-1 text-xs" onClick={() => setSub(k)}>{t(`cat.sub.${k}`)}</Button>
        ))}
      </div>
      {sub === 'exo' ? <ExoView /> : <SmallView />}
    </div>
  )
}
