import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Volume2, VolumeX, X } from 'lucide-react'
import { vigil } from '@/lib/vigil'
import { chime } from '@/lib/sound'
import { EASE } from '@/lib/motion'
import { GrainFill, NOISE, useCover } from './grain'
import { Tip } from './ui'

/**
 * Celebrations: a small card on the rare milestones (src/main/celebrate.ts
 * decides which, and when), in the window where it happened. It plays a GIF,
 * a picture or a short clip from your own folder, or with none a grainy
 * cover, says what happened in a line, and goes by itself. It never takes
 * focus, so typing carries on under it.
 */

export type Moment = { id: string; rank: number; headline: string; line?: string; mark: string; tint: string }
type Media = { url: string; video: boolean; name: string }

const PREVIEW = 'A preview. The real ones come on their own, on milestones like this.'
const SAMPLES: Moment[] = [
  { id: 'try:kept', rank: 0, headline: '100 captures kept', line: PREVIEW, mark: '100', tint: 'var(--tt-color-text-blue)' },
  { id: 'try:inbox', rank: 0, headline: 'Inbox empty', line: PREVIEW, mark: '0', tint: 'var(--tt-color-text-green)' },
  { id: 'try:streak', rank: 0, headline: '7 days in a row', line: PREVIEW, mark: '7', tint: 'var(--tt-color-text-orange)' }
]
/** One now, in this window, to see what they look like: nothing is counted. */
export const tryCelebration = (): void =>
  void window.dispatchEvent(new CustomEvent('vigil:celebrate', { detail: SAMPLES[Math.floor(Math.random() * SAMPLES.length)] }))

/** Clips found to run past 20 seconds: passed over from then on. */
const LONG = new Set<string>()
const RECENT = 'celebrated-recent'

/** Something from the folder, never one of the last few shown while there are others. */
function pick(items: Media[]): Media | null {
  const usable = items.filter((one) => !LONG.has(one.url))
  if (!usable.length) return null
  let recent: string[] = []
  try {
    recent = JSON.parse(localStorage.getItem(RECENT) ?? '[]')
  } catch {
    // None remembered: any will do.
  }
  const fresh = usable.filter((one) => !recent.includes(one.url))
  const from = fresh.length ? fresh : usable
  const one = from[Math.floor(Math.random() * from.length)]
  try {
    localStorage.setItem(RECENT, JSON.stringify([one.url, ...recent.filter((url) => url !== one.url)].slice(0, Math.min(5, usable.length - 1))))
  } catch {
    // Not remembered; a repeat is no harm.
  }
  return one
}

/**
 * Where celebrations show in a window: bottom right in the main window,
 * bottom centre in the box, above its footer. One at a time.
 */
export function Celebrations({ place }: { place: 'home' | 'box' }): React.JSX.Element {
  const [shown, setShown] = useState<{ moment: Moment; media: Media | null; key: number } | null>(null)
  const current = useRef(shown)
  current.current = shown
  const items = useRef<Media[]>([])
  // One that came while the window was away waits for it to be back.
  const waiting = useRef<Moment | null>(null)
  const shownAt = useRef(0)

  useEffect(() => {
    const show = async (moment: Moment): Promise<void> => {
      items.current = await vigil.celebrations().catch(() => [])
      shownAt.current = Date.now()
      setShown({ moment, media: pick(items.current), key: Date.now() })
      chime('cheer')
    }
    const arrive = (moment: Moment): void => {
      if (document.hidden) waiting.current = moment
      else void show(moment)
    }
    const back = (): void => {
      const moment = waiting.current
      if (!moment || document.hidden) return
      waiting.current = null
      setTimeout(() => void show(moment), 300)
    }
    const onTry = (event: Event): void => arrive((event as CustomEvent<Moment>).detail)
    window.api.celebrateHere(true)
    const offCelebrate = window.api.onCelebrate(arrive)
    const offShown = window.api.onShown(back)
    // The box goes as soon as a capture is kept: one that only just came is
    // kept for the next time it opens, rather than spent unseen.
    const offHiding = window.api.onHiding(() => {
      if (current.current && Date.now() - shownAt.current < 1500) waiting.current = current.current.moment
      setShown(null)
    })
    window.addEventListener('vigil:celebrate', onTry)
    document.addEventListener('visibilitychange', back)
    return () => {
      window.api.celebrateHere(false)
      offCelebrate()
      offShown()
      offHiding()
      window.removeEventListener('vigil:celebrate', onTry)
      document.removeEventListener('visibilitychange', back)
    }
  }, [])

  const box = place === 'box'
  return (
    <div className={`pointer-events-none fixed z-[70] ${box ? 'inset-x-0 bottom-[7.75rem] flex justify-center' : 'right-5 bottom-5'}`}>
      <AnimatePresence>
        {shown && (
          <Card
            key={shown.key}
            moment={shown.moment}
            media={shown.media}
            origin={box ? 'bottom center' : 'bottom right'}
            onDone={() => setShown(null)}
            onTooLong={() => setShown((now) => now && { ...now, media: pick(items.current) })}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

const still = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches
/** The small round buttons over the picture: dark glass, so they read on any of them. */
const OVER = 'absolute flex size-6 items-center justify-center rounded-full bg-black/45 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/65 hover:text-white'

function Card({ moment, media, origin, onDone, onTooLong }: {
  moment: Moment
  media: Media | null
  origin: string
  onDone: () => void
  onTooLong: () => void
}): React.JSX.Element {
  const [hover, setHover] = useState(false)
  const [loud, setLoud] = useState(false)
  const [broken, setBroken] = useState(false)
  const [ready, setReady] = useState(!media?.video)
  const done = useRef(onDone)
  done.current = onDone
  // Gone after five seconds, unless the pointer is on it.
  useEffect(() => {
    if (hover) return
    const timer = setTimeout(() => done.current(), 5000)
    return () => clearTimeout(timer)
  }, [hover])
  // Escape puts it away first, before anything else hears the key.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      done.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  useEffect(() => {
    setBroken(false)
    setReady(!media?.video)
  }, [media?.url])

  const quick = still() ? 0 : 1
  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, transform: 'scale(0.96)' }}
      animate={{ opacity: 1, transform: 'scale(1)' }}
      exit={{ opacity: 0, transform: 'scale(0.96)', transition: { duration: 0.15 * quick, ease: EASE } }}
      transition={{ duration: 0.22 * quick, ease: EASE }}
      style={{ transformOrigin: origin }}
      // Never takes focus from where you were typing.
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onDone}
      className="pointer-events-auto w-72 cursor-default rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-(--mf-panel-shadow) select-none"
    >
      <div className="relative h-40 overflow-hidden rounded-lg" style={{ background: `color-mix(in oklab, ${moment.tint} 30%, var(--popover))` }}>
        {media && !broken ? (
          media.video ? (
            <video
              src={media.url}
              autoPlay
              loop
              playsInline
              disablePictureInPicture
              muted={!loud}
              onLoadedMetadata={(event) => {
                if (event.currentTarget.duration > 20) {
                  LONG.add(media.url)
                  onTooLong()
                } else setReady(true)
              }}
              onError={() => setBroken(true)}
              className={`absolute inset-0 size-full object-cover transition-opacity duration-150 ${ready ? 'opacity-100' : 'opacity-0'}`}
            />
          ) : (
            <img src={media.url} alt="" draggable={false} onError={() => setBroken(true)} className="absolute inset-0 size-full object-cover" />
          )
        ) : (
          <Fallback moment={moment} />
        )}
        <Tip label="Dismiss  Esc">
          <button type="button" tabIndex={-1} aria-label="Dismiss" className={`${OVER} top-1.5 right-1.5`} onClick={(event) => (event.stopPropagation(), onDone())}>
            <X className="size-3.5" />
          </button>
        </Tip>
        {media?.video && !broken && (
          <Tip label={loud ? 'Sound off' : 'Sound on'}>
            <button type="button" tabIndex={-1} aria-label={loud ? 'Sound off' : 'Sound on'} className={`${OVER} right-1.5 bottom-1.5`} onClick={(event) => {
              event.stopPropagation()
              setLoud((on) => !on)
            }}>
              {loud ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
            </button>
          </Tip>
        )}
      </div>
      <div className="px-1.5 pt-2 pb-1">
        <p className="truncate text-sm leading-snug font-semibold text-foreground">{moment.headline}</p>
        {moment.line && <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">{moment.line}</p>}
      </div>
    </motion.div>
  )
}

/** With no folder: a grainy cover (or a grainy wash of its colour), its number set large on it. */
function Fallback({ moment }: { moment: Moment }): React.JSX.Element {
  const cover = useCover(moment.id)
  return (
    <>
      {cover ? (
        <GrainFill cover={cover} tint={moment.tint} large />
      ) : (
        <span aria-hidden className="absolute inset-0" style={{
          background: `radial-gradient(120% 90% at 18% 8%, color-mix(in oklab, ${moment.tint} 60%, white) 0%, transparent 60%), linear-gradient(150deg, color-mix(in oklab, ${moment.tint} 85%, black), color-mix(in oklab, ${moment.tint} 40%, black))`
        }}>
          <span className="absolute inset-0 opacity-[0.22] mix-blend-overlay" style={{ backgroundImage: NOISE, backgroundSize: '160px' }} />
        </span>
      )}
      <span aria-hidden className="absolute bottom-2.5 left-3 font-heading text-[2.75rem] leading-none font-bold tracking-[-0.03em] text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.3)]">{moment.mark}</span>
    </>
  )
}
