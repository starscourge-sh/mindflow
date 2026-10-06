import { useEffect, useState, type CSSProperties } from 'react'
import { alive } from '@/components/ui/alive-icon'
import XIcon from '@/components/ui/x-icon'
import { AliveIcon } from '@/components/ui/alive-icon'
import ExternalLinkIcon from '@/components/ui/external-link-icon'

import '@/assets/styles/_variables.scss'
import { glance } from './note-preview'
import { Rolling, toast } from './ui'
import { chime } from '@/lib/sound'
import { useAppearance, useLive, vigil } from '@/lib/vigil'

// itshover drawings in lucide's place, moving when their control is pointed at.
const X = alive(XIcon)

const DRAG = { WebkitAppRegion: 'drag' } as CSSProperties
const STILL = { WebkitAppRegion: 'no-drag' } as CSSProperties

/**
 * Each note's own lean, 1.2 to 3 degrees, sized from its id so it is the same
 * every launch; which way goes by its place in line, so neighbours lean apart.
 */
const tiltOf = (id: string, nth: number): number => {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0
  const lean = 1.2 + (Math.abs(hash) % 19) / 10
  return nth % 2 ? lean : -lean
}

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
  // ⌘W takes it down as its X does: the window has no close of its own, so macOS would not.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || event.key.toLowerCase() !== 'w') return
      event.preventDefault()
      chime('unstick')
      window.api.stick(type, id, false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [type, id])
  // Deleted since it was stuck: nothing left to show, so it comes down.
  useEffect(() => void (note === null && window.api.stick(type, id, false)), [note, type, id])
  if (!note) return null
  const text = glance(note.body).trim()
  const title = note.title || text.split('\n')[0].slice(0, 80) || 'Untitled'

  return (
    // Room all round for the lean, the lift and the shadow, so none of it is cut off at the window's edge.
    <div className="h-screen p-5">
      <div
        data-private={note.private ? '' : undefined}
        // Paper: solid, as the timer pill is (a glass theme's colours would let the desktop show through),
        // warmed a little and lit from the top. Leans its own way; pointed at, it straightens and lifts.
        style={{
          ...DRAG,
          '--tilt': `${tiltOf(id, Number(new URLSearchParams(location.search).get('nth')) || 0)}deg`,
          backgroundImage: 'linear-gradient(rgb(255 255 255 / 0.05), transparent 40%), linear-gradient(rgb(240 190 80 / 0.09), rgb(240 190 80 / 0.09)), linear-gradient(var(--popover), var(--popover)), linear-gradient(var(--background), var(--background))',
          backgroundColor: 'Canvas'
        } as CSSProperties}
        onMouseLeave={() => setAsking(false)}
        className="group relative flex h-full rotate-(--tilt) flex-col rounded-lg border text-control text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.14),0_4px_10px_-2px_rgb(0_0_0/0.16)] transition-[rotate,scale,box-shadow] duration-500 ease-[cubic-bezier(0.34,1.36,0.64,1)] hover:scale-102 hover:rotate-0 hover:shadow-[0_2px_4px_rgb(0_0_0/0.12),0_10px_18px_-4px_rgb(0_0_0/0.24)] motion-reduce:transition-none"
      >
        {/* A strip of tape holding it up. */}
        <span aria-hidden className="pointer-events-none absolute -top-2 left-1/2 h-4 w-14 -translate-x-1/2 -rotate-2 rounded-[2px] bg-[color-mix(in_oklab,var(--foreground)_10%,transparent)] backdrop-blur-[1px]" />
        <div className="flex items-center gap-1 px-3 pt-2">
          <p className="private-text min-w-0 flex-1 truncate font-medium">{title}</p>
          {/* Shown on hover, so at rest it is only the note. */}
          <span className={`flex items-center transition-opacity group-hover:opacity-100 ${asking ? 'opacity-100' : 'opacity-0'}`} style={STILL}>
            <button type="button" title="Open it" aria-label="Open it" onClick={() => window.api.openInHome(note.tier, id)} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
              <AliveIcon icon={ExternalLinkIcon} size={14} />
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
