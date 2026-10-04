import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import { createStore } from '@/lib/mini-store'
import { BODY_MAP, bodyName } from './data.ts'
import { fmtMetric } from './format.ts'
import { generateQuiz, mulberry32, type Question } from './quiz.ts'

const QN = 10
// Quiz state lives outside the component so it survives switching tabs.
const quiz = createStore<{ phase: 'intro' | 'run' | 'done'; qs: Question[]; i: number; picks: number[]; picked: number | null }>({ phase: 'intro', qs: [], i: 0, picks: [], picked: null })
const start = () => quiz.set({ phase: 'run', qs: generateQuiz(mulberry32((Math.random() * 2 ** 31) | 0), QN), i: 0, picks: [], picked: null })

export function QuizPanel() {
  const t = useT(), lang = useSettings((s) => s.lang)
  const s = quiz.useStore((x) => x)
  if (s.phase === 'intro') {
    return (
      <div className="grid gap-3">
        <p className="text-sm text-muted-foreground">{t('bod.qz.intro')}</p>
        <Button className="h-12" onClick={start}>{t('bod.qz.start')}</Button>
      </div>
    )
  }
  if (s.phase === 'done') {
    const score = s.qs.filter((q, i) => s.picks[i] === q.correct).length
    const msg = score >= 9 ? 3 : score >= 7 ? 2 : score >= 4 ? 1 : 0
    return (
      <div className="grid gap-4" aria-live="polite">
        <div className="rounded-lg border border-border p-4 text-center">
          <div className="text-3xl font-semibold tabular-nums text-emerald-400">{score} / {QN}</div>
          <div className="mt-1 text-sm">{t('bod.qz.score', { s: score, m: QN })}</div>
          <p className="mt-2 text-xs text-muted-foreground">{t(`bod.qz.m${msg}`)}</p>
        </div>
        <Button className="h-12" onClick={start}>{t('bod.qz.again')}</Button>
      </div>
    )
  }
  const q = s.qs[s.i], answered = s.picked !== null
  const text = q.kind === 'parent' ? t('bod.q.parent', { b: bodyName(q.bodyId!, lang) }) : t(`bod.q.${q.spec!.id}`)
  const pick = (k: number) => { if (!answered) quiz.set((x) => ({ picked: k, picks: [...x.picks, k] })) }
  const next = () => quiz.set((x) => (x.i + 1 >= x.qs.length ? { phase: 'done' as const } : { i: x.i + 1, picked: null }))
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{t('bod.qz.q', { n: s.i + 1, m: QN })}</span>
        <span className="tabular-nums">{s.picks.filter((p, i) => p === s.qs[i].correct).length} ✓</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${(s.i / QN) * 100}%` }} /></div>
      <h3 className="text-base font-medium leading-snug">{text}</h3>
      <div className="grid gap-2">
        {q.options.map((id, k) => {
          const ok = k === q.correct, mine = k === s.picked
          const cls = !answered ? 'border-border hover:bg-muted/40' : ok ? 'border-emerald-500 bg-emerald-500/15' : mine ? 'border-red-500 bg-red-500/15' : 'border-border opacity-60'
          return (
            <button key={id} type="button" disabled={answered} onClick={() => pick(k)} className={`flex min-h-[48px] items-center justify-between gap-3 rounded-lg border px-3 text-left text-sm ${cls}`}>
              <span>{bodyName(id, lang)}</span>
              {answered && (
                <span className="flex items-center gap-2">
                  {q.kind === 'superlative' && <span className="text-xs tabular-nums text-muted-foreground">{fmtMetric(q.spec!.metric, BODY_MAP[id], lang)}</span>}
                  <span aria-hidden className="w-3 text-center">{ok ? '✓' : mine ? '✗' : ''}</span>
                </span>
              )}
            </button>
          )
        })}
      </div>
      {answered && (
        <div className="grid gap-2" aria-live="polite">
          <p className={`text-sm ${s.picked === q.correct ? 'text-emerald-400' : 'text-red-400'}`}>
            {s.picked === q.correct ? t('bod.qz.right') : t('bod.qz.wrong', { a: bodyName(q.options[q.correct], lang) })}
          </p>
          <Button className="h-12" onClick={next}>{t(s.i + 1 >= QN ? 'bod.qz.finish' : 'bod.qz.next')}</Button>
        </div>
      )}
    </div>
  )
}
