import { useEffect, useState, type CSSProperties } from 'react'
import { ArrowUpRight, X } from 'lucide-react'

import '@/assets/styles/_variables.scss'
import { glance } from './note-preview'
import { Rolling, toast } from './ui'
import { chime } from '@/lib/sound'
import { useAppearance, useLive, vigil } from '@/lib/vigil'

const DRAG = { WebkitAppRegion: 'drag' } as CSSProperties
const STILL = { WebkitAppRegion: 'no-drag' } as CSSProperties

/** Stick a note on the desktop, or take it down, with its own sound; undoable. */
export const stickOnDesktop = (type: string, id: string, on = true): void => {
  chime(on ? 'stick' : 'unstick')
  window.api.stick(type, id, on)
  toast(on ? 'Stuck on the desktop' : 'Taken off the desktop', () => window.api.stick(type, id, !on))
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
  // Taking it down closes this window, so no toast here could undo it: the
  // first press asks, the second takes it down. Moving away lets the question go.
  const [asking, setAsking] = useState(false)
  // Deleted since it was stuck: nothing left to show, so it comes down.
  useEffect(() => void (note === null && window.api.stick(type, id, false)), [note, type, id])
  if (!note) return null
  const text = glance(note.body).trim()
  const title = note.title || text.split('\n')[0].slice(0, 80) || 'Untitled'

  return (
    <div className="h-screen p-2">
      <div
        data-private={note.private ? '' : undefined}
        // Solid, as the timer pill is: a glass theme's colours would let the desktop show through.
        // And a shadow small enough to end inside the window's margin, not be cut off at it.
        style={{ ...DRAG, backgroundImage: 'linear-gradient(var(--popover), var(--popover)), linear-gradient(var(--background), var(--background))', backgroundColor: 'Canvas' }}
        onMouseLeave={() => setAsking(false)}
        className="group flex h-full flex-col overflow-hidden rounded-xl border text-control text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.12),0_2px_6px_rgb(0_0_0/0.08)]"
      >
        <div className="flex items-center gap-1 px-3 pt-2">
          <p className="private-text min-w-0 flex-1 truncate font-medium">{title}</p>
          {/* Shown on hover, so at rest it is only the note. */}
          <span className={`flex items-center transition-opacity group-hover:opacity-100 ${asking ? 'opacity-100' : 'opacity-0'}`} style={STILL}>
            <button type="button" title="Open it" aria-label="Open it" onClick={() => window.api.openInHome(note.tier, id)} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
              <ArrowUpRight className="size-3.5" />
            </button>
            <button type="button" title="Take it off the desktop" aria-label="Take it off the desktop"
              onClick={() => {
                if (!asking) return (chime('tap'), setAsking(true))
                chime('unstick')
                window.api.stick(type, id, false)
              }}
              className={`flex h-6 items-center justify-center gap-1 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground ${asking ? 'px-1.5 text-xs text-foreground' : 'w-6'}`}>
              {asking && <Rolling by="word" text="Take down?" />}
              <X className="size-3.5" />
            </button>
          </span>
        </div>
        {/* A long note scrolls, and fades out at the bottom as the box does, instead of stopping hard at the edge. */}
        <p className="private-text min-h-0 flex-1 overflow-y-auto whitespace-pre-line px-3 pt-1 pb-6 text-muted-foreground [mask-image:linear-gradient(to_bottom,#000_calc(100%-1.75rem),transparent)]" style={STILL}>
          {text.startsWith(title) ? text.slice(title.length).trim() : text}
        </p>
      </div>
    </div>
  )
}
