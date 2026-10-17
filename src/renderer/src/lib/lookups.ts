import type { Answer } from '../../../main/define'
import { chime } from './sound'
import { notes } from './notes'
import { call, vigil } from './vigil'
import { refuse, toast } from '@/components/vigil/ui'

/**
 * A lookup: a word or a question kept to be answered, as a Word. It is asked
 * while its meaning or answer is empty and answered once written (main
 * captures.ts LOOKUP); the asked ones wait in Lookups. A single word the
 * dictionary knows is saved answered at once, its meaning as the answer.
 */
export async function saveLookup(text: string, origin?: string | null): Promise<string | null> {
  const asked = text.replace(/\s+/g, ' ').trim()
  if (!asked) return null
  let id: string
  try {
    id = await window.api.captures.create({ kind: 'word', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: asked }] }] }, markdown: asked, ...(origin ? { origin } : {}) })
  } catch {
    refuse('Could not keep it', 'error')
    return null
  }
  // One word: the dictionary is asked, offline or not known it simply waits as asked.
  const word = /^\p{L}[\p{L}'-]{1,40}$/u.test(asked) ? asked : null
  const answer = word ? await call<Answer>('define', word).catch(() => null) : null
  const found = answer && 'found' in answer ? answer.found : null
  if (found) {
    await notes.setField('captures', id, 'definition', found.definition)
    if (found.example) await notes.setField('captures', id, 'example', found.example)
  }
  chime('saved')
  toast(found ? `Looked up and kept, answered: ${found.definition}` : 'Kept in Lookups, asked: write the answer when you find it', () => void vigil.unlift('capture', id).then(() => chime('undo')), 'success',
    { label: 'Open Lookups', key: 'L', run: () => window.api.openInHome('view', 'lookups') })
  return id
}
