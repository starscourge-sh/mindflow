import { useEffect, type CSSProperties } from 'react'
import { ArrowUpRight, X } from 'lucide-react'

import '@/assets/styles/_variables.scss'
import { glance } from './note-preview'
import { chime } from '@/lib/sound'
import { useAppearance, useLive, vigil } from '@/lib/vigil'

const DRAG = { WebkitAppRegion: 'drag' } as CSSProperties
const STILL = { WebkitAppRegion: 'no-drag' } as CSSProperties

/** Stick a note on the desktop, or take it down, with its own sound. */
export const stickOnDesktop = (type: string, id: string, on = true): void => {
  chime(on ? 'stick' : 'unstick')
  window.api.stick(type, id, on)
}

/**
 * One note stuck on the desktop: a small card in a window of its own, over
 * everything, in the theme's colours. The card drags anywhere; its words
 * follow every edit, since it reads the note live.
 */
export function StickyNote({ type, id }: { type: string; id: string }): React.JSX.Element | null {
  // Sounds, Motion and tag colours obey Settings here as in any window.
  useAppearance()
  const note = useLive(
    () => (type === 'capture'
      ? window.api.captures.get(id).then((found) => found && { title: found.title || '', body: found.body, private: !!found.private, tier: 'capture' })
      : vigil.item(id).then((found) => found && { title: found.title, body: found.body, private: !!found.private, tier: found.tier as string })),
    undefined as { title: string; body: unknown; private: boolean; tier: string } | null | undefined,
    [type, id]
  )
  // A see-through window: only the card is drawn.
  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
  }, [])
  // Deleted since it was stuck: nothing left to show, so it comes down.
  useEffect(() => void (note === null && window.api.stick(type, id, false)), [note, type, id])
  if (!note) return null
  const text = glance(note.body).trim()
  const title = note.title || text.split('\n')[0].slice(0, 80) || 'Untitled'

  return (
    <div className="h-screen p-2">
      <div
        data-private={note.private ? '' : undefined}
        className="group flex h-full flex-col overflow-hidden rounded-xl border bg-popover text-control text-foreground shadow-(--mf-panel-shadow)"
        style={DRAG}
      >
        <div className="flex items-center gap-1 px-3 pt-2">
          <p className="private-text min-w-0 flex-1 truncate font-medium">{title}</p>
          {/* Shown on hover, so at rest it is only the note. */}
          <span className="flex opacity-0 transition-opacity group-hover:opacity-100" style={STILL}>
            <button type="button" title="Open it" aria-label="Open it" onClick={() => window.api.openInHome(note.tier, id)} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
              <ArrowUpRight className="size-3.5" />
            </button>
            <button type="button" title="Take it off the desktop" aria-label="Take it off the desktop" onClick={() => stickOnDesktop(type, id, false)} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </span>
        </div>
        <p className="private-text min-h-0 flex-1 overflow-y-auto whitespace-pre-line px-3 pt-1 pb-3 text-muted-foreground" style={STILL}>
          {text.startsWith(title) ? text.slice(title.length).trim() : text}
        </p>
      </div>
    </div>
  )
}
