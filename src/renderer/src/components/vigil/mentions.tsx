import { useEffect, useState } from 'react'
import { ChevronRight, Link2 } from 'lucide-react'

import { chime } from '@/lib/sound'
import { vigil } from '@/lib/vigil'
import { Tip, refuse, toast } from './ui'

type Found = Awaited<ReturnType<typeof vigil.mentions>>

/**
 * Under the note, as Obsidian keeps them: every note that links here, with
 * the line it does it in, and every note that names this one without a link
 * yet. One press makes that mention a link. Unlinked ones start folded.
 */
export function Mentions({ id, onOpen }: { id: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element | null {
  const [found, setFound] = useState<Found | null>(null)
  const [unfolded, setUnfolded] = useState(false)
  useEffect(() => {
    const load = (): void => void vigil.mentions(id).then(setFound)
    load()
    // Again once things settle, not on every keystroke of an autosave.
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = window.api.captures.onChange(() => {
      clearTimeout(timer)
      timer = setTimeout(load, 1500)
    })
    return () => {
      clearTimeout(timer)
      stop()
    }
  }, [id])
  if (!found || (!found.linked.length && !found.unlinked.length)) return null

  const row = (one: Found['linked'][number], link?: boolean): React.JSX.Element => (
    <div key={one.id} data-private={one.private ? '' : undefined} className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50">
      <button type="button" data-row className="min-w-0 flex-1 text-left" onClick={() => onOpen?.(one.type, one.id)}>
        <span className="private-text block truncate font-medium text-foreground">{one.title || 'Untitled'}</span>
        <span className="private-text line-clamp-2 text-control text-muted-foreground">{one.snippet}</span>
      </button>
      {link && (
        <Tip label="Make this mention a link">
          <button
            type="button"
            aria-label="Link it"
            className="mt-0.5 flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-control text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
            onClick={() => void vigil.linkMention(one.type, one.id, id).then((ok) => {
              if (!ok) return refuse('Could not link it there: the name is split by formatting, or already a link. Use @ to link it by hand')
              chime('pin')
              toast('Linked')
            })}
          >
            <Link2 className="size-3.5" /> Link
          </button>
        </Tip>
      )}
    </div>
  )

  return (
    <section data-chrome className="mx-auto mt-6 mb-16 w-full max-w-[44rem] border-t px-10 pt-4 text-body">
      {found.linked.length > 0 && (
        <>
          <h3 className="mb-1 px-2 text-meta text-muted-foreground">{found.linked.length} linked {found.linked.length === 1 ? 'mention' : 'mentions'}</h3>
          {found.linked.map((one) => row(one))}
        </>
      )}
      {found.unlinked.length > 0 && (
        <>
          <button type="button" onClick={() => setUnfolded(!unfolded)} className="mt-3 mb-1 flex items-center gap-1 px-2 text-meta text-muted-foreground hover:text-foreground">
            <ChevronRight className={`size-3 transition-transform ${unfolded ? 'rotate-90' : ''}`} />
            {found.unlinked.length} unlinked {found.unlinked.length === 1 ? 'mention' : 'mentions'}
          </button>
          {unfolded && found.unlinked.map((one) => row(one, true))}
        </>
      )}
    </section>
  )
}
