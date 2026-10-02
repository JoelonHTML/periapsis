// Registers the "Vanavond" texts (keys prefixed 'sky.') with the app's translator. Imported by Panel.tsx.
import { registerDict } from '@/lib/i18n'
import { nl, en, el } from './texts.ts'

registerDict({ nl, en, el })
