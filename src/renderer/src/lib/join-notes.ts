import { haligtree, type NoteSide } from './haligtree'
import { binned, seeTheBin } from './to-bin'
import { binFlight } from './fly-home'
import { expectBack, stays } from './room'
import { tear } from './sound'
import { readMarkdownGently } from '@/components/haligtree/haligtree-editor'
import { refuse, toast } from '@/components/haligtree/ui'
import { still } from './motion'

/** A note as an offer or a link names it, its id for a capture or "tier:id" for a gem, a page or the rest: one side of a join. */
export const sideOf = (key: string): NoteSide => (key.includes(':') ? { table: 'nuggets', id: key.slice(key.indexOf(':') + 1) } : { table: 'captures', id: key })

/** Why nothing was joined, as checked in the main process. */
const NOT = { same: 'It is the same note, so nothing was joined', gone: 'That note is gone now, so nothing was joined', bin: 'That note is in the Bin, so nothing was joined' }

/**
 * Two notes made one, by every way there is: "Join them" under a note that nearly repeats another (note-offers.tsx),
 * and "Merge into another note…" (merge-picker.tsx). `keep` stays whole; of `other`'s blocks only those whose words
 * `keep` holds nowhere come over, under a rule (none, no rule), and `other` goes whole to the Bin; links elsewhere to
 * `other` lead to `keep`. Done in the main process on the notes as stored (haligtree.ts `notes:join`), never through
 * an open editor: an editor showing `keep` opens it again from the book, the way a note opens (lib/same-words.ts).
 * One notice says what came over (`said`: lines added, links led here), with "Open the Bin", and its Undo (or ⌘Z)
 * puts everything back as it was. Gives back whether they were joined.
 */
export async function joinNotes(keep: NoteSide, other: NoteSide, said: (added: number, links: number) => string): Promise<boolean> {
  // Words typed and not saved yet go first: the join is made of the notes as stored.
  window.dispatchEvent(new Event('haligtree:flush'))
  // The other's row, where one is on screen, crumples now and flies to the Bin once it is there, as every way to the
  // Bin shows it (lib/to-bin.ts `moveToBin`); not joined, it is itself again.
  const flight = binFlight(other.id)
  const not = (why: string): boolean => (stays([other.id]), refuse(why), false)
  let made = await haligtree.joinNotes(keep, other)
  // A side still the Markdown it came in as (main sends it; both, one after the other): read here as its editor reads
  // it, without holding the window, and given back with the words it was read from, used only while those are stored.
  let given: Partial<Record<'keep' | 'other', { doc: unknown; from: string }>> = {}
  for (let round = 0; 'markdown' in made && round < 2; round++) {
    const doc = await readMarkdownGently(made.text)
    if (!doc) return not('Its words could not be read here, so nothing was joined')
    const read = { doc, from: made.text }
    given = made.markdown === 'keep' ? { ...given, keep: read } : { ...given, other: read }
    made = await haligtree.joinNotes(keep, other, given)
  }
  if ('markdown' in made) return not('It changed as it was read, so nothing was joined')
  if ('why' in made) return not(NOT[made.why])
  const { token, added, links, mark, opens } = made
  // The Bin's one sound, and every page with the other open moves off it (false: one did).
  flight?.()
  tear()
  const stayed = binned([other.id])
  toast(said(added, links), () => (expectBack([other.id]), void haligtree.unjoinNotes(token).then((back) => {
    if (!back) return refuse('Too long ago to take back here: the note holds both, and the other is in the Bin')
    // A page that moved off the other opens it again, as Mail selects a message it undeleted (lib/nav.ts); one that
    // stayed on the note that was kept (“Join them” under it) stays there, and that note opens again as it was.
    if (!stayed) window.dispatchEvent(new CustomEvent('haligtree:came-back', { detail: [other.id] }))
    // Written in since the join: its words stay as they are, nothing of them lost, and the other is back beside it.
    if (back === 'both') refuse('The note was written in since, so it keeps both sets of words; the other is out of the Bin')
  })), 'success', mark ? { label: 'Show what came over', key: 'S', run: () => showJoined(mark, opens, keep.id) } : seeTheBin, undefined, 8000)
  // The note opens on where it happened: scrolled to the divider, what came over lit a moment.
  if (mark) showJoined(mark, opens, keep.id)
  return true
}

/**
 * The divider a join put in (extensions/joined-from.ts) brought into view, and the lines under it, what came over, lit
 * a moment. The note kept opens first where it is not on screen; it is looked for as it opens again from the book.
 */
export function showJoined(mark: string, opens: string, id: string): void {
  let tries = 0
  const look = (): void => {
    const divider = document.querySelector<HTMLElement>(`[data-joined-at="${CSS.escape(mark)}"]`)
    if (divider && divider.getClientRects().length) return land(divider)
    // Not on screen a moment on (the note was left as it went to the Bin, or another page is in front): opened.
    if (tries === 6) window.api.openInHome(opens, id)
    if (++tries < 50) setTimeout(look, 100)
  }
  look()
}

const land = (divider: HTMLElement): void => {
  divider.scrollIntoView({ block: 'center', behavior: still() ? 'auto' : 'smooth' })
  // Lit by a rule of its own, not by marks on the lines: the editor draws its lines again and would take marks away.
  const mark = CSS.escape(divider.dataset.joinedAt ?? '')
  const rule = document.createElement('style')
  rule.dataset.joinedLit = mark
  const paint = (on: boolean): void => void (rule.textContent = `.tiptap.ProseMirror [data-joined-at="${mark}"] ~ * { background-color: ${on ? 'color-mix(in oklab, var(--tt-color-highlight-yellow, #fde68a) 55%, transparent)' : 'transparent'}; border-radius: 4px; transition: background-color ${still() ? 0 : 900}ms var(--mf-ease, ease-out); }`)
  paint(true)
  document.head.append(rule)
  setTimeout(() => paint(false), 1400)
  setTimeout(() => rule.remove(), 2600)
}
