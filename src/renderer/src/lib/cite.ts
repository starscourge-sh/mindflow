import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'

import { call } from './haligtree'
import { chime } from './sound'
import { ask, refuse, toast } from '@/components/haligtree/ui'
import { doiIn, isbnIn, names, surname } from '../../../main/cite-ids'
import { personKey } from '../../../main/names'
import { openSource } from './sources'
import type { Citer, LookupResult, Work } from '../../../main/cite'

export type { Citer, Work } from '../../../main/cite'
export { loneDoi, chipLabel } from '../../../main/cite-ids'

export const cite = {
  lookup: (text: string) => call<LookupResult>('cite:lookup', text),
  works: () => call<Work[]>('works'),
  save: (work: Work) => call<Work | null>('work:save', work),
  citers: (title: string) => call<Citer[]>('work:citers', title)
}

/** What a citation keeps of its work, and its page. `pending` is the DOI or ISBN while it is looked up, or when it was not found. */
export type CiteAttrs = Work & { work: string; page: string; pending: string; failed?: string }

const EMPTY: Work = { title: '', authors: '', year: '', publisher: '', doi: '', isbn: '', url: '', what: '' }
/** One plain line: "Shelley, Mary. 1831. Frankenstein. Henry Colburn. https://doi.org/…". */
export function citedLine(attrs: Partial<CiteAttrs>): string {
  const who = names(attrs.authors ?? '')
  const first = who[0] ? (who[0].includes(',') ? who[0] : `${surname(who[0])}, ${who[0].split(/\s+/).slice(0, -1).join(' ')}`.replace(/, $/, '')) : ''
  const people = who.length > 1 ? `${[first, ...who.slice(1, -1)].join(', ')} and ${who.at(-1)}` : first
  const link = attrs.doi ? `https://doi.org/${attrs.doi}` : attrs.isbn ? `ISBN ${attrs.isbn}` : attrs.url ?? ''
  return [people, attrs.year, attrs.work || attrs.title, attrs.publisher].filter(Boolean).map((one) => String(one).replace(/\.$/, '')).join('. ') + (link ? `. ${link}` : '.')
}

/** A work's fields as a citation's. */
const attrsOf = (work: Work, page: string): CiteAttrs => ({ ...work, work: work.title, page, pending: '', failed: '' })

/** "Frankenstein, p. 82" as the work and the page. */
export function splitPage(typed: string): { text: string; page: string } {
  const found = /[,\s]+(?:p|pp|page|pages)\.?\s*([\divxlc]+(?:\s*[-–]\s*[\divxlc]+)?)\s*$/i.exec(typed)
  return found ? { text: typed.slice(0, found.index).trim(), page: found[1].replace(/\s+/g, '') } : { text: typed.trim(), page: '' }
}

/** Why a lookup found nothing, in plain words. */
const whyNot = (error: string, id: string): string =>
  error === 'offline' ? `Could not look up ${id}: you seem to be offline. Fill its details in by hand, or try again later` : `Nothing was found for ${id}. Check it, or fill its details in by hand`

/** The work's details asked one at a time; only the title is needed. */
export async function fillByHand(guess: Partial<Work> = {}): Promise<Work | null> {
  const title = (await ask('The work’s title', 'Frankenstein', { action: 'Next', initial: guess.title || undefined }))?.trim()
  if (!title) return null
  const authors = await ask('Who wrote it? Several, with a ; between', 'Mary Shelley', { action: 'Next', initial: guess.authors || undefined, skip: 'Not known' })
  if (authors === null) return null
  const year = await ask('The year it came out', '1831', { action: 'Next', initial: guess.year || undefined, skip: 'Not known' })
  if (year === null) return null
  const publisher = await ask('Its publisher or journal', 'Henry Colburn', { action: 'Keep the work', initial: guess.publisher || undefined, skip: 'Not known' })
  if (publisher === null) return null
  return cite.save({ ...EMPTY, ...guess, title, authors: authors.trim(), year: year.trim(), publisher: publisher.trim() })
}

/** Where a citation sits, found by what it is waiting for. */
function chipAt(editor: Editor, pending: string): { pos: number; node: PMNode } | null {
  let hit: { pos: number; node: PMNode } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (hit) return false
    if (node.type.name === 'citation' && node.attrs.pending === pending && !node.attrs.work) hit = { pos, node }
    return true
  })
  return hit
}

/** Lookups on their way, by DOI or ISBN: their chips show the orb. */
export const looking = new Set<string>()

function setChip(editor: Editor, pending: string, attrs: Partial<CiteAttrs>): void {
  const at = chipAt(editor, pending)
  if (!at || editor.isDestroyed) return
  editor.view.dispatch(editor.state.tr.setNodeMarkup(at.pos, undefined, { ...at.node.attrs, ...attrs }))
}

/** A citation's details asked by hand, in place of one that was not found. */
export async function fillChip(editor: Editor, pending: string): Promise<void> {
  const id = doiIn(pending) ? { doi: doiIn(pending)! } : { isbn: isbnIn(pending) ?? '' }
  const work = await fillByHand(id)
  if (!work) return
  setChip(editor, pending, attrsOf(work, chipAt(editor, pending)?.node.attrs.page ?? ''))
  chime('done')
}

/** A DOI or ISBN looked up while the writing goes on; its chip fills in when it is back, or says it was not found. */
async function lookUp(editor: Editor, id: string): Promise<void> {
  looking.add(id)
  const found = await cite.lookup(id)
  looking.delete(id)
  if ('work' in found) {
    const kept = (await cite.save(found.work)) ?? found.work
    setChip(editor, id, attrsOf(kept, chipAt(editor, id)?.node.attrs.page ?? ''))
    return
  }
  setChip(editor, id, { failed: found.error })
  chime('nope')
  toast(whyNot(found.error, id), undefined, 'warning', { label: 'Fill it in by hand', key: 'F', run: () => void fillChip(editor, id) })
}

/** "Cite a source": a DOI, an ISBN or a work's title, a page if given; the chip goes in at once. */
export async function citeInto(editor: Editor, given?: string, range?: { from: number; to: number }): Promise<void> {
  const typed = given ?? (await ask('Cite a source', 'A DOI, an ISBN or a work’s title, then p. 82 if you like', { action: 'Cite', field: 'medium' }))
  if (!typed?.trim()) return
  const { text, page } = splitPage(typed)
  const id = doiIn(text) ?? isbnIn(text)
  const place = (attrs: Partial<CiteAttrs>): void => {
    const chain = editor.chain().focus()
    ;(range ? chain.insertContentAt(range, { type: 'citation', attrs }) : chain.insertContent({ type: 'citation', attrs })).run()
    chime('pop')
  }
  if (id) {
    looking.add(id)
    place({ pending: id, page })
    void lookUp(editor, id)
    return
  }
  const known = (await cite.works()).find((one) => personKey(one.title) === personKey(text))
  const work = known ?? (await fillByHand({ title: text }))
  if (work) place(attrsOf(work, page))
}

/** "Add from DOI or ISBN" on the Sources page: the work kept as a source, and its page opened. */
export async function addWork(waiting: (on: boolean) => void = () => undefined): Promise<Work | null> {
  const typed = (await ask('Add a work from its DOI or ISBN', '10.1000/xyz123 or 978-0-14-143947-1', { action: 'Look it up' }))?.trim()
  if (!typed) return null
  const id = doiIn(typed) ?? isbnIn(typed)
  if (!id) {
    refuse('That is not a DOI or an ISBN. A DOI starts with 10. and has a /; an ISBN has 10 or 13 digits')
    return null
  }
  waiting(true)
  const found = await cite.lookup(id).finally(() => waiting(false))
  const opened = (work: Work | null): Work | null => (work && (chime('page'), openSource('medium', work.title)), work)
  if ('work' in found) return opened(await cite.save(found.work))
  chime('nope')
  toast(whyNot(found.error, id), undefined, 'warning', { label: 'Fill it in by hand', key: 'F', run: () => void fillByHand(doiIn(id) ? { doi: id } : { isbn: id }).then(opened) })
  return null
}
