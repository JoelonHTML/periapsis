import { runMga, type MgaInput } from './mga.ts'

const post = (m: unknown) => (self as unknown as { postMessage: (m: unknown) => void }).postMessage(m)

self.onmessage = (e: MessageEvent<MgaInput>) => {
  const res = runMga(e.data, (p, label) => post({ type: 'progress', p, label }))
  post({ type: 'result', ...res })
}
