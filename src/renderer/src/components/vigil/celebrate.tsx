import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion, useIsPresent, type Easing, type Variants } from 'motion/react'
import { Volume2, VolumeX, X } from 'lucide-react'
import { vigil, type MomentKind } from '@/lib/vigil'
import { chime } from '@/lib/sound'
import { EASE, shift } from '@/lib/motion'
import { GrainFill, NOISE, useCover } from './grain'
import { Tip } from './ui'
import { working } from './beam'
import { TooltipProvider } from '@/components/ui/tooltip'

/**
 * Celebrations: a small card on the rare milestones (src/main/celebrate.ts
 * decides which, and when), in the window where it happened. It plays a GIF,
 * a picture or a short clip from your own folder, or with none a grainy
 * cover, says what happened in a line, and goes by itself. It never takes
 * focus, so typing carries on under it. A sprite (a figure on a see-through
 * background, which a card would only crop) comes on by itself instead: it
 * runs or hops in from the nearest side, says it in a speech bubble, and
 * goes back the way it came.
 */

export type Moment = { id: string; kind: MomentKind; rank: number; headline: string; line?: string; mark: string; tint: string
  /** A preview of one file in particular, from Settings. */
  play?: Media }
type Media = { url: string; video: boolean; name: string; sprite?: boolean
  /** From Giphy: said so on the card, as its terms ask, with its still frame for when nothing should move. */
  giphy?: true; still?: string; width?: number; height?: number }
/** A sprite's size on screen, worked out from its own once it has loaded. */
type Size = { width: number; height: number; pixel: boolean }

const PREVIEW = 'A preview. The real ones come on their own, on milestones like this.'
const SAMPLES: Record<MomentKind, Omit<Moment, 'id' | 'kind' | 'rank' | 'line'>> = {
  kept: { headline: '100 captures kept', mark: '100', tint: 'var(--tt-color-text-blue)' },
  streak: { headline: '7 days in a row', mark: '7', tint: 'var(--tt-color-text-orange)' },
  inbox: { headline: 'Inbox empty', mark: '0', tint: 'var(--tt-color-text-green)' },
  tasks: { headline: "Today's tasks, all done", mark: '3', tint: 'var(--tt-color-text-green)' },
  year: { headline: 'Saved a year ago', mark: '1y', tint: 'var(--tt-color-text-purple)' },
  answered: { headline: 'Your first question answered', mark: '1', tint: 'var(--tt-color-text-yellow)' },
  goalHalf: { headline: 'Halfway there', mark: '½', tint: 'var(--tt-color-text-orange)' },
  goal30: { headline: '30 days to go', mark: '30', tint: 'var(--tt-color-text-orange)' },
  goal7: { headline: 'One week to go', mark: '7', tint: 'var(--tt-color-text-orange)' },
  goalDay: { headline: 'The day is here', mark: '14', tint: 'var(--tt-color-text-purple)' },
  goalMade: { headline: 'You made it', mark: '✓', tint: 'var(--tt-color-text-green)' },
  stickyDone: { headline: 'All done', mark: '✓', tint: 'var(--tt-color-text-green)' },
  started: { headline: 'You are all set.', mark: '✓', tint: 'var(--tt-color-text-orange)' },
  taskDone: { headline: 'Done', mark: '✓', tint: 'var(--tt-color-text-green)' }
}
/** One now, in this window, to see what they look like: nothing is counted. Any kind, unless one is named, playing `play` if given. */
export function tryCelebration(kind?: MomentKind, play?: Media): void {
  const kinds = Object.keys(SAMPLES) as MomentKind[]
  const one = kind ?? kinds[Math.floor(Math.random() * kinds.length)]
  const detail: Moment = { id: `try:${one}`, kind: one, rank: 0, line: PREVIEW, ...SAMPLES[one], play }
  window.dispatchEvent(new CustomEvent('vigil:celebrate', { detail }))
}

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
 * A GIF from Giphy, when it is on (main says null when it is not, or has no
 * key, or is offline). Never waited on for long: past three seconds the card
 * plays what it would have anyway, and the GIF is kept for the next one.
 */
const fromGiphy = (): Promise<Media | null> =>
  // The beam turns while it is fetched.
  working(Promise.race([vigil.celebrationGiphy().catch(() => null), new Promise<null>((done) => setTimeout(() => done(null), 3000))]))

/**
 * What a card plays: one given to it (a preview), then a file of your own for
 * this kind, then the GIF pinned for it, then a random GIF from Giphy (with
 * that switch on), then any from the folder; with none of these, Vigil's own
 * card (Fallback).
 */
async function chooseMedia(moment: Moment, own: Media[], items: Media[]): Promise<Media | null> {
  return moment.play ?? pickOwn(moment.kind, own) ?? (await vigil.giphyPinned(moment.kind).catch(() => null)) ?? (await fromGiphy()) ?? pick(items)
}

const LAST = 'celebrated-last'

/** One of this kind's own files, never the one it showed last while it has others. */
function pickOwn(kind: MomentKind, own: Media[]): Media | null {
  const usable = own.filter((one) => !LONG.has(one.url))
  if (!usable.length) return null
  let last: Record<string, string> = {}
  try {
    last = JSON.parse(localStorage.getItem(LAST) ?? '{}') ?? {}
  } catch {
    // None remembered: any will do.
  }
  const from = usable.length > 1 ? usable.filter((one) => one.url !== last[kind]) : usable
  const one = from[Math.floor(Math.random() * from.length)]
  try {
    localStorage.setItem(LAST, JSON.stringify({ ...last, [kind]: one.url }))
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
  const [shown, setShown] = useState<{ moment: Moment; media: Media | null; key: number; sprite?: Size } | null>(null)
  const current = useRef(shown)
  current.current = shown
  const items = useRef<Media[]>([])
  // The files picked for the kind showing, for another if one runs too long.
  const own = useRef<Media[]>([])
  // One that came while the window was away waits for it to be back.
  const waiting = useRef<Moment | null>(null)
  const shownAt = useRef(0)

  useEffect(() => {
    const show = async (moment: Moment): Promise<void> => {
      const [all, picks] = await Promise.all([vigil.celebrations().catch(() => []), vigil.celebrationPicks().catch(() => ({}))])
      items.current = all
      shownAt.current = Date.now()
      // One of the files picked for this kind of moment, passing over any that ran too long, or else one from the folder.
      own.current = (picks as Partial<Record<MomentKind, Media[]>>)[moment.kind] ?? []
      const media = await chooseMedia(moment, own.current, items.current)
      // A sprite is loaded first, so it comes on at its size; one that will not load goes on a card.
      const sprite = media?.sprite ? await measure(media.url) : undefined
      setShown({ moment, media, key: Date.now(), sprite })
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
    <>
    {/* Under menus, search and dialogs (z-50 and up): a celebration never covers what you are using. */}
    <div data-celebration className={`pointer-events-none fixed z-[45] ${box ? 'inset-x-0 bottom-[7.75rem] flex justify-center' : 'right-5 bottom-5'}`}>
      <AnimatePresence>
        {shown && !shown.sprite && (
          <Card
            key={shown.key}
            moment={shown.moment}
            media={shown.media}
            origin={box ? 'bottom center' : 'bottom right'}
            onDone={() => setShown(null)}
            onTooLong={() => setShown((now) => now && { ...now, media: pickOwn(now.moment.kind, own.current) ?? pick(items.current) })}
          />
        )}
      </AnimatePresence>
    </div>
    {/* A sprite's own strip along the bottom, clipped at its sides so it never shows past the note. */}
    <div data-celebration className={`pointer-events-none fixed z-[45] overflow-hidden ${box ? 'inset-x-0 bottom-[7.75rem] h-72' : 'inset-x-0 bottom-0 h-80'}`}>
      <AnimatePresence>
        {shown?.sprite && (
          <Sprite key={shown.key} moment={shown.moment} media={shown.media!} size={shown.sprite} from={box ? 'left' : 'right'} onDone={() => setShown(null)} />
        )}
      </AnimatePresence>
    </div>
    </>
  )
}

/** How tall a sprite may be, and how wide: a window's, and a sticky's smaller one. */
type Bounds = { low: number; high: number; wide: number }
const ROOMY: Bounds = { low: 96, high: 140, wide: 220 }
const SMALL: Bounds = { low: 64, high: 96, wide: 140 }

const STILL = { WebkitAppRegion: 'no-drag' } as CSSProperties

/**
 * A sticky's own celebration, its list all ticked (the sticky decides when;
 * main says whether one may show now). Media fills the paper and fades back
 * to the note; a sprite hops up from its bottom edge, smaller, and goes back
 * down. Never takes focus from the sticky's editor. `onDone` once it has gone.
 */
export function StickyCelebration({ moment, onDone }: { moment: Moment; onDone: () => void }): React.JSX.Element {
  const [shown, setShown] = useState<{ media: Media | null; sprite?: Size } | null>(null)
  const items = useRef<Media[]>([])
  const own = useRef<Media[]>([])
  useEffect(() => {
    let live = true
    void (async () => {
      const [all, picks] = await Promise.all([vigil.celebrations().catch(() => []), vigil.celebrationPicks().catch(() => ({}))])
      items.current = all
      own.current = (picks as Partial<Record<MomentKind, Media[]>>)[moment.kind] ?? []
      const media = await chooseMedia(moment, own.current, items.current)
      const sprite = media?.sprite ? await measure(media.url, SMALL) : undefined
      if (!live) return
      setShown({ media, sprite })
      chime('cheer')
    })()
    return () => void (live = false)
  }, [moment])
  return (
    // A sticky's window has no tooltips of its own for the card's buttons to use.
    <TooltipProvider delayDuration={500}>
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-[inherit]" style={STILL}>
      <AnimatePresence onExitComplete={onDone}>
        {shown && !shown.sprite && (
          <Card key="card" fill moment={moment} media={shown.media} origin="center" onDone={() => setShown(null)}
            onTooLong={() => setShown((now) => now && { ...now, media: pickOwn(moment.kind, own.current) ?? pick(items.current) })} />
        )}
        {shown?.sprite && <Sprite key="sprite" moment={moment} media={shown.media!} size={shown.sprite} from="bottom" onDone={() => setShown(null)} />}
      </AnimatePresence>
    </div>
    </TooltipProvider>
  )
}

/**
 * A sprite's size on screen: 96 to 140 pixels tall and no wider than 220
 * (less on a sticky), keeping its shape. Small pixel art is scaled by whole
 * steps and kept blocky, so its pixels stay square. Nothing if it does not
 * load in time.
 */
async function measure(url: string, { low, high, wide }: Bounds = ROOMY): Promise<Size | undefined> {
  const image = new Image()
  image.src = url
  const loaded = await Promise.race([image.decode().then(() => true, () => false), new Promise<boolean>((done) => setTimeout(() => done(false), 2000))])
  if (!loaded) return undefined
  // An SVG with no size of its own is drawn square.
  const naturalW = image.naturalWidth || 120
  const naturalH = image.naturalHeight || 120
  const pixel = naturalH < 128 && naturalW < 256
  const steps = Math.floor(high / naturalH)
  let height = pixel ? (naturalH * steps >= low ? naturalH * steps : low) : Math.min(high, Math.max(low, naturalH))
  let width = (naturalW / naturalH) * height
  if (width > wide) {
    height *= wide / width
    width = wide
  }
  return { width: Math.round(width), height: Math.round(height), pixel }
}

/**
 * Being put away: by its own timer, a click or Escape. Set once it is on its
 * way out (put away, or another in its place), so Escape goes on to whatever
 * is under it and never puts the next one away.
 */
function usePutAway(onDone: () => void): { done: React.RefObject<() => void>; present: boolean } {
  const present = useIsPresent()
  const leaving = useRef(false)
  if (!present) leaving.current = true
  const done = useRef(onDone)
  done.current = () => {
    if (leaving.current) return
    leaving.current = true
    onDone()
  }
  // Escape puts it away first, before anything else hears the key. Not while
  // search, a dialog or a menu is open over it: that Escape is theirs.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || leaving.current) return
      if (document.querySelector('[role=dialog], [role=alertdialog], [role=menu], [role=listbox], [cmdk-root]')) return
      event.preventDefault()
      event.stopImmediatePropagation()
      done.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  return { done, present }
}

const still = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
/** The small round buttons over the picture: solid near-black, so they read on any of them and the picture never shows through. */
const OVER = 'absolute flex size-6 items-center justify-center rounded-full bg-neutral-900 text-white/90 transition-colors hover:bg-black hover:text-white'

function Card({ moment, media, origin, fill, onDone, onTooLong }: {
  moment: Moment
  media: Media | null
  origin: string
  /** Over a sticky's paper, filling it, its headline in a bar along the bottom. */
  fill?: boolean
  onDone: () => void
  onTooLong: () => void
}): React.JSX.Element {
  const [hover, setHover] = useState(false)
  const [loud, setLoud] = useState(false)
  const [broken, setBroken] = useState(false)
  const [ready, setReady] = useState(!media?.video)
  const { done } = usePutAway(onDone)
  // Gone after seven seconds (six on a sticky), unless the pointer is on it.
  useEffect(() => {
    if (hover) return
    const timer = setTimeout(() => done.current(), fill ? 6000 : 7000)
    return () => clearTimeout(timer)
  }, [hover])
  useEffect(() => {
    setBroken(false)
    setReady(!media?.video)
  }, [media?.url])

  const quick = still() ? 0 : 1
  // A GIF from Giphy is shown whole-ish, at its own shape (within reason), and
  // with Motion off or Reduce motion as its still frame.
  const giphy = !!media?.giphy && !broken
  const tall = giphy && !fill && media?.width && media.height ? Math.round(Math.min(220, Math.max(130, (276 * media.height) / media.width))) : undefined
  const frozen = giphy && quick === 0 && !!media?.still
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
      onClick={() => done.current()}
      className={fill
        ? 'pointer-events-auto absolute inset-0 flex cursor-default flex-col overflow-hidden rounded-[inherit] bg-popover text-popover-foreground select-none'
        : 'pointer-events-auto w-72 cursor-default rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-(--mf-panel-shadow) select-none'}
    >
      <div className={`relative overflow-hidden ${fill ? 'min-h-0 flex-1' : 'h-40 rounded-lg'}`} style={{ background: `color-mix(in oklab, ${moment.tint} 30%, var(--popover))`, height: tall }}>
        {media && !broken ? (
          frozen ? (
            <img src={media.still} alt="" draggable={false} onError={() => setBroken(true)} className="absolute inset-0 size-full object-cover" />
          ) : media.video ? (
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
          <button type="button" tabIndex={-1} aria-label="Dismiss" className={`${OVER} top-1.5 right-1.5`} onClick={(event) => (event.stopPropagation(), done.current())}>
            <X className="size-3.5" />
          </button>
        </Tip>
        {giphy && (
          // Giphy's terms ask for this wherever one of theirs is shown.
          <span data-giphy-attribution className="absolute bottom-1.5 left-1.5 rounded-[4px] bg-neutral-900 px-1.5 py-0.5 text-[0.625rem] leading-none font-semibold tracking-[0.02em] text-white/90">
            Powered by GIPHY
          </span>
        )}
        {media?.video && !broken && !giphy && (
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
      {fill ? (
        // In the sticky's own type, as its title is set.
        <p className="flex shrink-0 items-center gap-1.5 border-t px-3 py-1.5 text-control font-medium text-foreground">
          <span aria-hidden className="text-(--tt-color-text-green)">{moment.mark}</span>
          <span className="truncate">{moment.headline}</span>
        </p>
      ) : (
        <div className="px-1.5 pt-2 pb-1">
          <p className="truncate text-sm leading-snug font-semibold text-foreground">{moment.headline}</p>
          {moment.line && <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">{moment.line}</p>}
        </div>
      )}
    </motion.div>
  )
}

/** How long a sprite takes to come on, and to go again. */
const ENTER = 0.9
const LEAVE = 0.6
/** Three hops, each lower than the last. */
const HOPS = ['translateY(0px)', 'translateY(-16px)', 'translateY(0px)', 'translateY(-10px)', 'translateY(0px)', 'translateY(-5px)', 'translateY(0px)']
const HOP_EASE: Easing[] = ['easeOut', 'easeIn', 'easeOut', 'easeIn', 'easeOut', 'easeIn']

/**
 * A sprite on its own: no card, just the figure. It comes on from the side
 * nearest where it rests (the right in the main window, the left in the box),
 * never mirrored, since which way a sprite was drawn facing is unknown and a
 * flip mid-way read as a spin. It says what happened in a bubble, and after six seconds (longer while the pointer is on it) goes
 * back the way it came. A GIF moves by itself and slides; a still picture
 * hops, and bobs while it waits. With Motion off it is simply there; with
 * Reduce motion it fades.
 */
function Sprite({ moment, media, size, from, onDone }: {
  moment: Moment
  media: Media
  size: Size
  /** The side it comes on from; the bottom edge in a sticky, hopping up into it. */
  from: 'left' | 'right' | 'bottom'
  onDone: () => void
}): React.JSX.Element {
  const [hover, setHover] = useState(false)
  const [here, setHere] = useState(false)
  const { done, present } = usePutAway(onDone)
  const off = document.documentElement.dataset.motion === 'off'
  const calm = still()
  const moving = /\.gif$/i.test(media.name)
  useEffect(() => {
    const timer = setTimeout(() => setHere(true), calm ? 0 : ENTER * 1000)
    return () => clearTimeout(timer)
  }, [])
  useEffect(() => {
    if (!here || hover) return
    const timer = setTimeout(() => done.current(), 6000)
    return () => clearTimeout(timer)
  }, [here, hover])

  // Far enough to start wholly out of sight, past the side it comes from.
  const away = from === 'right' ? size.width + 40 : -(window.innerWidth / 2 + size.width / 2 + 24)
  const slide = (by: number): string => (from === 'bottom' ? `translateY(${size.height + 16}px)` : `translateX(${by}px)`)
  const phase = !present ? 'out' : here ? 'rest' : 'in'
  const hop: Variants = moving || calm ? {} : {
    in: { transform: HOPS, transition: { duration: ENTER, ease: HOP_EASE } },
    rest: { transform: ['translateY(0px)', 'translateY(-3px)', 'translateY(0px)'], transition: { duration: 2.4, ease: 'easeInOut', repeat: Infinity } },
    out: { transform: HOPS, transition: { duration: LEAVE, delay: 0.12, ease: HOP_EASE } }
  }
  const hold = {
    // Never takes focus from where you were typing.
    onMouseDown: (event: React.MouseEvent) => event.preventDefault(),
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    onClick: () => done.current()
  }
  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={calm ? { opacity: 0 } : { transform: slide(away) }}
      animate={calm ? { opacity: 1 } : { transform: from === 'bottom' ? 'translateY(0px)' : 'translateX(0px)' }}
      exit={calm ? { opacity: 0, transition: { duration: off ? 0 : 0.15 } } : { transform: slide(away), transition: { duration: LEAVE, delay: 0.12, ease: 'easeIn' } }}
      transition={calm ? { duration: off ? 0 : 0.2 } : { duration: ENTER, ease: 'easeOut' }}
      className={`absolute flex flex-col ${from === 'right' ? 'right-5 bottom-5 items-end' : from === 'bottom' ? 'inset-x-0 bottom-1 items-center' : 'inset-x-0 bottom-0 items-center'}`}
    >
      <AnimatePresence>
        {here && present && (
          <motion.div
            {...hold}
            initial={{ opacity: 0, transform: shift('scale(0.92)') }}
            animate={{ opacity: 1, transform: 'scale(1)' }}
            exit={{ opacity: 0, transition: { duration: off ? 0 : 0.1 } }}
            transition={{ duration: off ? 0 : 0.18, ease: EASE }}
            style={{ transformOrigin: from === 'right' ? `calc(100% - ${size.width / 2}px) 100%` : '50% 100%' }}
            className="pointer-events-auto relative mb-2.5 w-max max-w-[min(14rem,calc(100vw-4rem))] cursor-default rounded-xl border bg-popover px-3 py-2 text-popover-foreground shadow-(--mf-panel-shadow) select-none"
          >
            <p className="text-sm leading-snug font-semibold text-foreground">{moment.headline}</p>
            {moment.line && <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">{moment.line}</p>}
            {/* Its tail, pointing down at the sprite. */}
            <span aria-hidden className="absolute -bottom-[5px] size-2.5 rotate-45 border-r border-b bg-popover" style={from === 'right' ? { right: Math.max(10, size.width / 2 - 5) } : { left: 'calc(50% - 5px)' }} />
          </motion.div>
        )}
      </AnimatePresence>
      <div {...hold} className="pointer-events-auto cursor-default" style={{ width: size.width, height: size.height }}>
        <motion.img
          src={media.url}
          alt=""
          draggable={false}
          initial={{ transform: 'translateY(0px)' }}
          variants={hop}
          animate={phase}
          className="size-full select-none"
          style={{ imageRendering: size.pixel ? 'pixelated' : undefined, filter: 'drop-shadow(0 2px 2px rgb(0 0 0 / 0.18))' }}
        />
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
