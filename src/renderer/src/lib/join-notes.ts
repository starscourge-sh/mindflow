import { haligtree, type NoteSide } from './haligtree'
import { binned, seeTheBin } from './to-bin'
import { binFlight } from './fly-home'
import { expectBack, stays } from './room'
import { tear } from './sound'
import { readMarkdownGently } from '@/components/haligtree/haligtree-editor'
import { refuse, toast } from '@/components/haligtree/ui'

/** A note as an offer or a link names it, its id for a capture or "tier:id" for a gem, a page or the rest: one side of a join. */
export const sideOf = (key: string): NoteSide => (key.includes(':') ? { table: 'nuggets', id: key.slice(key.indexOf(':') + 1) } : { table: 'captures', id: key })

/** Why nothing was joined, as checked in the main process. */
const NOT = { same: 'It is the same note, so nothing was joined', gone: 'That note is gone now, so nothing was joined', bin: 'That note is in the Bin, so nothing was joined' }

/**
 * Two notes made one, by every way there is: "Join them" under a note that nearly repeats another (note-offers.tsx),
 * and "Merge into another note…" (merge-picker.tsx). `other`'s words go under `keep`'s, after a rule, and `other` to
 * the Bin, in the main process on the notes as stored (haligtree.ts `notes:join`), never through an open editor: an
 * editor showing `keep` opens it again from the book, the way a note opens (lib/same-words.ts). One notice says it,
 * with "Open the Bin", and its Undo (or ⌘Z) puts both back as they were. Gives back whether they were joined.
 */
export async function joinNotes(keep: NoteSide, other: NoteSide, said: string): Promise<boolean> {
  // Words typed and not saved yet go first: the join is made of the notes as stored.
  window.dispatchEvent(new Event('haligtree:flush'))
  // The other's row, where one is on screen, crumples now and flies to the Bin once it is there, as every way to the
  // Bin shows it (lib/to-bin.ts `moveToBin`); not joined, it is itself again.
  const flight = binFlight(other.id)
  const not = (why: string): boolean => (stays([other.id]), refuse(why), false)
  let made = await haligtree.joinNotes(keep, other)
  if ('markdown' in made) {
    // One of them is still the Markdown it came in as (main sends it): read here as its editor reads it, without
    // holding the window, and given back with the words it was read from, used only while those are still stored.
    const doc = await readMarkdownGently(made.text)
    if (!doc) return not('Its words could not be read here, so nothing was joined')
    const read = { doc, from: made.text }
    made = await haligtree.joinNotes(keep, other, made.markdown === 'keep' ? { keep: read } : { other: read })
    if ('markdown' in made) return not('It changed as it was read, so nothing was joined')
  }
  if ('why' in made) return not(NOT[made.why])
  const { token } = made
  // The Bin's one sound, and every page with the other open moves off it (false: one did).
  flight?.()
  tear()
  const stayed = binned([other.id])
  toast(said, () => (expectBack([other.id]), void haligtree.unjoinNotes(token).then((back) => {
    if (!back) return refuse('Too long ago to take back here: the note holds both, and the other is in the Bin')
    // A page that moved off the other opens it again, as Mail selects a message it undeleted (lib/nav.ts); one that
    // stayed on the note that was kept (“Join them” under it) stays there, and that note opens again as it was.
    if (!stayed) window.dispatchEvent(new CustomEvent('haligtree:came-back', { detail: [other.id] }))
    // Written in since the join: its words stay as they are, nothing of them lost, and the other is back beside it.
    if (back === 'both') refuse('The note was written in since, so it keeps both sets of words; the other is out of the Bin')
  })), 'success', seeTheBin)
  return true
}
