import { Orb } from './orb'

/**
 * A note on its way: its pane and its name, where the note will be, from the
 * frame it is asked for. Its words fill in as they are read. Shown only while
 * they are still being read (a big book, a busy moment), so Back, Forward or
 * a step down the list never leaves the note before on screen under the new
 * one's name. The same box as an open note's pane, so nothing moves when the
 * words arrive.
 */
export function NoteComing({ id, title }: { id: string; title?: string | null }): React.JSX.Element {
  return (
    <div data-open={id} data-coming className="note-pane flex min-w-0 flex-[1.4] flex-col overflow-y-auto [--mf-padding:1rem_3.25rem] @[40rem]/page:[--mf-padding:1rem_4.75rem] @[56rem]/page:border-l">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-6">
        {/* The header's room, so the name sits where the note's own title will. */}
        <div aria-hidden className="-mt-3 mb-1 h-7 shrink-0" />
        <NoteWaiting title={title} />
      </div>
    </div>
  )
}

/**
 * The note's name and the one wait sign, where its words will be: as a note opens (above), and in place of the
 * words of one opened again from the book in a page that stays (its words put in whole: two notes joined, and that
 * taken back; lib/same-words.ts `reread`).
 */
export function NoteWaiting({ title }: { title?: string | null }): React.JSX.Element {
  return (
    <>
      <div className="note-column mb-2 shrink-0">
        <p className="font-heading text-title font-semibold tracking-[-0.018em] text-balance">{title?.trim() || 'New note'}</p>
      </div>
      {/* Still being read a beat later (a big book): the one wait sign, where
          its words will be, never a blank page under the name. Held back
          150ms, so a quick open never flashes it. */}
      <div data-note-waiting className="note-column mf-after-a-beat pt-3">
        <Orb label="Opening the note…" />
      </div>
    </>
  )
}
