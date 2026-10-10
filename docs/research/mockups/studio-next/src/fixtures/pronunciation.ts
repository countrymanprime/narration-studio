/**
 * Sample data behind the mock pronunciation provider: the sources it reports and what each would say for a word.
 * A real provider (a speech engine, a dictionary service) replaces the mock without any screen changing.
 */
import type { PronSource } from '@/domain/schemas'
import { DICTIONARY } from './alice'

export const PRON_SOURCES: PronSource[] = [
  { id: 'auto', label: 'Auto-generated', icon: 'auto', kind: 'generated' },
  { id: 'dictionary', label: 'Local dictionary', icon: 'dictionary', kind: 'lookup', needs: 'localDictionary', definitions: 'local' },
  { id: 'online', label: 'Online service', icon: 'globe', kind: 'lookup', needs: 'network', definitions: 'api' },
  { id: 'manual', label: 'Entered by me', icon: 'pencil', kind: 'manual' },
]

/** The source taken when a word or name has nothing yet. */
export const PRON_DEFAULT_SOURCE = 'auto'

/** What each source says for a word, by lower-case word. A word a source has nothing for is simply absent. */
export const PRON_CANDIDATES: Record<string, Record<string, string>> = {
  auto: {
    alice: 'AL-iss', queen: 'kween', five: 'fyve', seven: 'SEV-un', two: 'too', knave: 'nayv', duchess: 'DUCH-iss', caterpillar: 'KAT-er-pil-er',
    croquet: 'KROH-kit', hedgehogs: 'HEJ-hogz', flamingoes: 'fluh-MIN-gohz', 'rose-tree': 'ROHZ-tree', hookah: 'HOO-kuh', cheshire: 'CHESH-er',
  },
  /** The local dictionary answers from the bundled sample dictionary. */
  dictionary: Object.fromEntries(Object.entries(DICTIONARY).map(([w, d]) => [w, d.say])),
  online: {
    croquet: 'kroh-KAY', flamingoes: 'fluh-MING-gohz', hookah: 'HOO-kah', knave: 'nayv', hedgehogs: 'HEJ-hogz', 'rose-tree': 'ROHZ-tree',
  },
}
