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
        <div className="note-column mb-2 shrink-0">
          <p className="font-heading text-title font-semibold tracking-[-0.018em] text-balance">{title?.trim() || 'Untitled'}</p>
        </div>
      </div>
    </div>
  )
}
