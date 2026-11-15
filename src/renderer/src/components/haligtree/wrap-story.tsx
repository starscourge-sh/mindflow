import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { WrappedParagraph } from './ai-offers'
import { AnimatePresence, motion } from 'motion/react'
import { createPortal } from 'react-dom'
import { useCornerDock, useLayerOpen } from '@/lib/layer-watch'
import { chime, type Cue } from '@/lib/sound'
import { EASE, shift, still } from '@/lib/motion'
import { useLive, haligtree, type Item, type Recap, type Settings, type SpanSession, type Task } from '@/lib/haligtree'
import { taskName } from '@/lib/tasks'
import { Button } from '@/components/ui/button'
import { X } from '@/components/ui/icons'
import { usePicturesFrom } from './recap-view'
import { Bands, Burst, CurvedGallery, CurvedLoop, Echo, FallingWords, Folder, In, OpArt, Roll, Scribble, Silk, Stack, TextLoop, Tiled, type Op } from './wrap-art'
import { FOLDER_LINES, INTROS, OUTROS, PALETTES, STAGE, WORLDS, nextSeed, pick, seeded, type Palette, type World } from './wrap-worlds'
import { drawingFor } from './grain'
import { Tip, Typed, refuse, sayNow, toast } from './ui'
import { plannedVsDid, shortSaid } from './planned-did'
import { streaks } from '../../../../main/focus-numbers'
import { dayjs, dayKey, dayName, noon, num, plural } from '../../../../main/dates'
import { APP_NAME } from '../../../../main/name'
import { quoted } from '../../../../main/clip'

/**
 * A month or a week, wrapped: a story of a few cards, one thing each, the
 * way Spotify Wrapped tells a year. What you captured most, your busiest
 * day, the hours of focus, planned against did, the gems kept, the longest
 * run of days, and what you said went well. Only cards with something true
 * to say are shown. ← and → (or a click on either side) turn, Esc closes.
 * Made from your own notes, on this Mac.
 *
 * It comes to you: once a month ends, the first open after the 1st offers
 * "Your October, wrapped" (WrapOffer), and the Sunday digest opens the week's.
 */

/** "month:2026-10" or "week:2026-10-12". */
export const openWrap = (id: string, world?: World | 'surprise'): void => void window.dispatchEvent(new CustomEvent('haligtree:wrap', { detail: world ? { id, world } : id }))
/** The month to wrap now: the one before until the 7th, as the recap reads it. */
export const monthToWrap = (): string => `month:${(dayjs().date() < 7 ? dayjs().subtract(1, 'month') : dayjs()).format('YYYY-MM')}`

type Span = { period: 'week' | 'month'; from: string; to: string }
const spanOf = (id: string): Span => {
  const [period, at] = id.split(':') as ['week' | 'month', string]
  const from = dayjs(period === 'month' ? `${at}-01` : at).startOf(period)
  return { period, from: dayKey(from), to: dayKey(from.endOf(period)) }
}

type Wrapped = {
  name: string
  recap: Recap
  focus: { minutes: number; sessions: number }
  plan: ReturnType<typeof plannedVsDid>
  gems: Item[]
  run: number
  well: string[]
}

async function wrapOf({ period, from, to }: Span): Promise<Wrapped> {
  const [since, until] = [dayjs(from).startOf('day').toISOString(), dayjs(to).endOf('day').toISOString()]
  const mondays: string[] = []
  for (let monday = dayjs(from).startOf('week'); dayKey(monday) <= to; monday = monday.add(1, 'week')) mondays.push(dayKey(monday))
  const [recap, sessions, tasks, gems, days, pages] = await Promise.all([
    haligtree.recap(period, since),
    haligtree.sessionsSpan(since, until) as Promise<SpanSession[]>,
    haligtree.tasks() as Promise<Task[]>,
    haligtree.items('nugget'),
    haligtree.dayCaptures(from, to),
    Promise.all(mondays.map((monday) => haligtree.period(`week:${monday}`)))
  ])
  const minutes = new Map<string, number>()
  const worked = new Set<string>()
  let total = 0
  for (const one of sessions) {
    const n = Math.max(0, ((one.endedAt ? Date.parse(one.endedAt) : Date.now()) - Date.parse(one.startedAt) - (one.pausedMs || 0)) / 60_000)
    minutes.set(one.taskId, (minutes.get(one.taskId) ?? 0) + n)
    worked.add(dayKey(one.startedAt))
    total += n
  }
  // A run of days with something caught or focused on, inside the span.
  const busy = new Set([...worked, ...Object.entries(days.counts).filter(([, n]) => n > 0).map(([day]) => day)].filter((day) => day >= from && day <= to))
  // What went well, in your words: each week's summary from Close the week, and its page's wins.
  const well = pages.flatMap((page) => [page.fields.summary, page.fields.wins]).flatMap((text) => (text ?? '').split('\n')).map((line) => line.replace(/^[-*•]\s*/, '').trim()).filter(Boolean)
  return {
    name: period === 'month' ? dayjs(from).format(dayjs(from).isSame(dayjs(), 'year') ? 'MMMM' : 'MMMM YYYY') : `the week of ${dayjs(from).format('D MMMM')}`,
    recap,
    focus: { minutes: Math.round(total), sessions: sessions.length },
    plan: plannedVsDid(tasks, minutes, from, to),
    gems: gems.filter((gem) => !gem.private && dayKey(gem.createdAt) >= from && dayKey(gem.createdAt) <= to),
    run: streaks(busy, to).best,
    well: [...new Set(well)]
  }
}

/** At most this many cards: the first and the last always, the rest by what there is to say. */
const MOST = 11

/** `worst`: worst-case numbers laid over the real ones, taken only under test (break-ui). */
type Ask = { id: string; world?: World | 'surprise'; worst?: Partial<Facts> }

/** The story, over the window, when asked for (openWrap). */
export function WrapSheet(): React.JSX.Element | null {
  const [ask, setAsk] = useState<(Ask & { seed: number; n: number }) | null>(null)
  useEffect(() => {
    let n = 0
    const listen = (event: Event): void => {
      const detail = (event as CustomEvent<string | Ask>).detail
      const one = typeof detail === 'string' ? { id: detail } : detail
      chime('slide')
      setAsk({ ...one, seed: nextSeed(), n: ++n })
    }
    window.addEventListener('haligtree:wrap', listen)
    return () => window.removeEventListener('haligtree:wrap', listen)
  }, [])
  return <AnimatePresence>{ask && <Story key={`${ask.id}:${ask.n}`} id={ask.id} seed={ask.seed} forced={ask.world === 'surprise' ? undefined : ask.world} worst={window.api.quiet ? ask.worst : undefined} onClose={() => (chime('fold'), setAsk(null))} />}</AnimatePresence>
}

type Facts = {
  name: string; title: string; range: string; period: 'week' | 'month'; from: string
  captures: number; tags: { name: string; n: number }[]; minutes: number; sessions: number
  planned: number; did: number; planRows: { name: string; planned: number; did: number }[]
  pictures: { src: string; title: string }[]; notes: string[]; notesLabel: string; gems: number
  run: number; busiest: { label: string; n: number } | null; well: string[]; kind: string
}
type Kind = 'intro' | 'tags' | 'focus' | 'plan' | 'pictures' | 'notes' | 'well' | 'run' | 'busiest' | 'outro' | 'report'

/** What the month most was, in a word: the report card's "Top kind". */
const kindOf = (f: { captures: number; minutes: number; gems: number; planned: number }): string =>
  f.minutes >= 600 ? 'Deep worker' : f.gems >= 5 ? 'Gem keeper' : f.captures >= 40 ? 'Collector' : f.planned ? 'Planner' : f.captures ? 'Noticer' : 'Quiet'

const FAN = ['your words', 'your days', 'your hours']
const ENTRANCES = ['up', 'left', 'scale'] as const

function Story({ id, seed, forced, worst, onClose }: { id: string; seed: number; forced?: World; worst?: Partial<Facts>; onClose: () => void }): React.JSX.Element {
  const span = spanOf(id)
  const [data, setData] = useState<Wrapped | null>(null)
  useEffect(() => void wrapOf(span).then(setData), [id]) // eslint-disable-line react-hooks/exhaustive-deps
  const pictures = usePicturesFrom(dayjs(span.from).startOf('day').toISOString(), dayjs(span.to).endOf('day').toISOString())
  // The seed picks the world, its palette, each card's layout, the art and the lines: never the same twice.
  const look = useMemo<Look>(() => {
    const rand = seeded(seed)
    const world = forced ?? pick(rand, WORLDS)
    return { world, p: pick(rand, PALETTES[world]), intro: pick(rand, INTROS), outro: pick(rand, OUTROS), folder: pick(rand, FOLDER_LINES), entrance: pick(rand, ENTRANCES), op: pick(rand, ['rings', 'checker', 'stripes', 'arcs'] as const) }
  }, [seed, forced])
  const [at, setAt] = useState(0)
  const [byKey, setByKey] = useState(false)
  const [dir, setDir] = useState(1)

  const facts = useMemo<Facts | null>(() => {
    if (!data || !pictures) return null
    const { recap, focus, plan, gems, run, well, name } = data
    const pictured = new Set(pictures.map((one) => one.id))
    const flow = [...pictures, ...gems.filter((gem) => !pictured.has(gem.id)).map((gem) => ({ src: drawingFor(gem.id).url, title: gem.title || 'New note' }))]
    const notes = recap.sources.length ? recap.sources.map((one) => one.name) : gems.map((gem) => gem.title || 'New note')
    return {
      name, period: span.period, from: span.from, title: span.period === 'month' ? `Your ${name}, wrapped` : 'Your week, wrapped',
      range: `${dayjs(span.from).format('D MMM')} to ${dayjs(span.to).format('D MMM YYYY')}`,
      captures: recap.captures, tags: recap.tags, minutes: focus.minutes, sessions: focus.sessions,
      planned: plan.planned, did: plan.did, planRows: plan.rows.map((row) => ({ name: taskName(row.task.title).text, planned: row.planned, did: row.did })),
      pictures: flow, notes, notesLabel: recap.sources.length ? 'Top sources' : 'Gems kept', gems: gems.length, run,
      busiest: recap.busiestDay ? { label: dayName(noon(recap.busiestDay.name), 'never'), n: recap.busiestDay.n } : null,
      well, kind: kindOf({ captures: recap.captures, minutes: focus.minutes, gems: gems.length, planned: plan.planned }),
      ...worst
    }
  }, [data, pictures]) // eslint-disable-line react-hooks/exhaustive-deps

  const kinds = useMemo<Kind[]>(() => {
    if (!facts) return []
    const f = facts
    const rand = seeded(seed + 1)
    // The most to say first; near equals trade places now and then.
    const middle: [number, Kind][] = []
    if (f.tags.length || f.captures) middle.push([1, 'tags'])
    if (f.minutes >= 1) middle.push([2, 'focus'])
    if (f.planRows.length) middle.push([3, 'plan'])
    if (f.pictures.length) middle.push([3, 'pictures'])
    if (f.notes.length) middle.push([4, 'notes'])
    if (f.well.length) middle.push([5, 'well'])
    if (f.run >= 2) middle.push([5, 'run'])
    if (f.busiest) middle.push([6, 'busiest'])
    const order = middle.map(([rank, kind]) => [rank + rand() * 1.5, kind] as const).sort((a, b) => a[0] - b[0]).slice(0, MOST - 3).map(([, kind]) => kind)
    return ['intro', ...order, 'outro', 'report']
  }, [facts, seed])

  const last = kinds.length - 1
  const cue = WORLD_CUES[look.world]
  const go = (to: number, key = false): void => {
    const next = Math.max(0, Math.min(last, to))
    if (next === at) return
    chime(next === last ? cue.last : cue.turn)
    setByKey(key)
    setDir(next > at ? 1 : -1)
    setAt(next)
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if ((event.key === 'Enter' || event.key === ' ') && (event.target as HTMLElement | null)?.closest?.('[data-wrap-keep] button')) return
      if (event.key === 'Escape') onClose()
      else if (['ArrowRight', ' ', 'Enter', 'l', 'j'].includes(event.key)) go(at + 1, true)
      else if (['ArrowLeft', 'h', 'k'].includes(event.key)) go(at - 1, true)
      else return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  // The last card, kept as a picture of what shows, to paste or to save.
  const shown = useRef<HTMLDivElement>(null)
  const downOnDim = useRef(false)
  const pressedAt = useRef(0)
  const keep = async (save: boolean): Promise<void> => {
    const box = shown.current?.getBoundingClientRect()
    const png = box && (await window.api.pictureOfRect({ x: box.left, y: box.top, width: box.width, height: box.height }))
    if (!png) return refuse('Could not make the picture', 'error')
    const name = `${data ? (span.period === 'month' ? data.name : `Week of ${dayjs(span.from).format('D MMMM')}`) : 'Wrapped'}, wrapped.png`
    if (save) return void ((await window.api.savePicture(name, png)) && (chime('saved'), toast('Saved as an image')))
    if (!(await window.api.copyPicture(png))) return refuse('Could not put the picture on the clipboard', 'error')
    chime('copy')
    toast('Copied as an image: paste it anywhere')
  }

  const { p, world } = look
  const kind = kinds[at]
  const variant = Math.floor(seeded(seed + at * 31)() * 3)
  return (
    <motion.div role="dialog" aria-modal aria-label={facts?.title ?? 'Wrapped'} data-wrap-story={id} data-wrap-world={world}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }} transition={{ duration: 0.25 }}
      className="fixed inset-0 z-50 grid place-items-center overflow-hidden [-webkit-app-region:no-drag]" style={{ background: STAGE.dim }}
      // Closed by a click that began and ended on the dim, never by a drag let go over it.
      onPointerDown={(event) => void (downOnDim.current = event.target === event.currentTarget)} onClick={(event) => event.target === event.currentTarget && downOnDim.current && onClose()}>
      <Backdrop glow={p.glow} />
      {/* A wide card over the dimmed app; on a small window, the whole window, as on a phone. */}
      <motion.div ref={shown} data-wrap-card={kind ?? 'loading'}
        initial={still() ? false : { opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        className="wrap-card @container relative flex flex-col overflow-hidden"
        style={{ background: p.bg, color: p.ink, boxShadow: STAGE.shadow, '--wrap-quiet': `color-mix(in srgb, ${p.ink} 72%, ${p.bg})`, '--wrap-bg': p.bg } as React.CSSProperties}>
        <div className="relative min-h-0 flex-1" onPointerDown={(event) => void (pressedAt.current = event.clientX)} onClick={(event) => {
          // A drag (the stack, the gallery) let go is not a turn.
          if (Math.abs(event.clientX - pressedAt.current) > 6 || (event.target as HTMLElement).closest('button, a, [data-wrap-stack], [data-wrap-gallery]')) return
          const box = event.currentTarget.getBoundingClientRect()
          go(event.clientX - box.left > box.width / 3 ? at + 1 : at - 1)
        }}>
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            {facts && kind && (
              <motion.div key={at} className="absolute inset-0"
                initial={byKey || still() ? false : { opacity: 0, transform: shift(`translateX(${24 * dir}px)`) }} animate={{ opacity: 1, transform: shift('translateX(0px)'), transition: { duration: 0.24, ease: EASE } }}
                custom={dir} variants={{ gone: (to: number) => ({ opacity: 0, transform: shift(`translateX(${-12 * to}px)`), transition: { duration: byKey ? 0 : 0.12, ease: EASE } }) }} exit="gone">
                <Card kind={kind} f={facts} look={look} variant={variant} seed={seed + at} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {/* Where you are, as bars that fill, over the card; the close beside them. */}
        <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-3 px-4 pt-3">
          <div className="flex flex-1 gap-1">
            {kinds.map((one, index) => (
              <button key={one} type="button" aria-label={`Card ${num(index + 1)} of ${num(kinds.length)}`} aria-current={index === at || undefined} onClick={() => go(index)}
                className="h-1 flex-1 cursor-pointer rounded-[2px] transition-opacity duration-200" style={{ background: p.ink, opacity: index <= at ? 0.9 : 0.25 }} />
            ))}
          </div>
          <Tip label="Close  Esc"><button type="button" aria-label="Close" onClick={onClose} className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full transition-opacity hover:opacity-70" style={{ color: p.ink }}><X className="size-4" /></button></Tip>
        </div>
        <div data-wrap-keep className="absolute right-4 bottom-4 z-20 flex h-8 items-center gap-2">
          <AnimatePresence>
            {at === last && kinds.length > 0 && (
              <motion.div key="keep" className="flex items-center gap-2" initial={still() ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.3, delay: 0.7 } }} exit={{ opacity: 0, transition: { duration: 0.1 } }}>
                <button type="button" data-wrap-copy onClick={() => void keep(false)} className="h-8 cursor-pointer rounded-full px-3.5 text-[13px] font-semibold" style={{ background: p.ink, color: p.bg }}>Copy as image</button>
                <button type="button" data-wrap-save onClick={() => void keep(true)} className="h-8 cursor-pointer rounded-full px-3.5 text-[13px] font-semibold" style={{ boxShadow: `inset 0 0 0 1.5px ${p.ink}`, color: p.ink }}>Save as image…</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {at !== last && <span className="pointer-events-none absolute bottom-5 left-5 z-20 text-[11px] font-bold tracking-[0.08em] uppercase text-(--wrap-quiet)">{APP_NAME}</span>}
      </motion.div>
    </motion.div>
  )
}

/** Each world's own chimes: a turn, and the last card. */
const WORLD_CUES: Record<World, { turn: Cue; last: Cue }> = {
  files: { turn: 'page', last: 'wrapped' },
  sticker: { turn: 'pop', last: 'cheer' },
  kinetic: { turn: 'shift', last: 'wrapped' },
  night: { turn: 'riffle', last: 'reveal' }
}

/** Behind the card: the app dimmed, a slow glow in the card's colours, grain and a vignette. */
function Backdrop({ glow }: { glow: [string, string] }): React.JSX.Element {
  const drift = (dx: number, dy: number): { x?: number[]; y?: number[]; scale?: number[] } => (still() ? {} : { x: [0, dx, 0], y: [0, dy, 0], scale: [1, 1.15, 1] })
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <motion.div className="absolute top-[10%] left-[15%] size-[55vmax] rounded-full opacity-45 blur-[90px]" style={{ background: glow[0] }} animate={drift(80, 40)} transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="absolute right-[5%] bottom-0 size-[45vmax] rounded-full opacity-35 blur-[90px]" style={{ background: glow[1] }} animate={drift(-60, -50)} transition={{ duration: 23, repeat: Infinity, ease: 'easeInOut' }} />
      <svg className="absolute inset-0 size-full opacity-[0.14] mix-blend-overlay"><filter id="wrap-grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" /></filter><rect width="100%" height="100%" filter="url(#wrap-grain)" /></svg>
      <div className="absolute inset-0" style={{ background: STAGE.vignette }} />
    </div>
  )
}

type Look = { world: World; p: Palette; intro: string; outro: string; folder: string; entrance: (typeof ENTRANCES)[number]; op: Op }
/** An empty month says so, rather than promising cards it does not have. */
const opening = (f: Facts, line: string): string => (!f.captures && !f.minutes ? `A quiet ${f.period}: nothing caught or focused on yet.` : fill(line, f.name))
const fill = (line: string, name: string): string => line.replaceAll('{name}', name).replace(/^./, (c) => c.toUpperCase())
const hours = (minutes: number): string => (minutes >= 120 ? `${num(Math.round(minutes / 60))} hours` : `${num(minutes)} minutes`)

const BIG = 'text-[clamp(28px,6cqi,50px)] leading-[1.02] font-black tracking-tight break-words'
const HUGE = 'text-[clamp(52px,14cqi,120px)] leading-[0.9] font-black tracking-tighter'
/** A line under a heading or number, saying what it counts: never a label above one. */
const CAPTION = 'mt-3 text-[15px] font-semibold text-(--wrap-quiet)'

/** Two halves on a wide card, one above the other on a narrow one; a seeded variant flips them. */
function Split({ a, b, flip }: { a: ReactNode; b: ReactNode; flip: boolean }): React.JSX.Element {
  return (
    <div className="relative grid h-full grid-rows-[auto_1fr] gap-6 px-7 pt-14 pb-14 @2xl:grid-cols-2 @2xl:grid-rows-1 @2xl:items-center @2xl:px-12">
      <div className={`min-w-0 ${flip ? '@2xl:order-2' : ''}`}>{a}</div>
      <div className="relative min-h-0 min-w-0 self-stretch">{b}</div>
    </div>
  )
}

/** A few lines ranked, the way the report card lists them. */
function Ranked({ rows, accent }: { rows: { name: string; n: number }[]; accent: string }): React.JSX.Element {
  return (
    <ol className="grid h-full min-w-0 grid-cols-1 content-center gap-2">
      {rows.map((row, i) => (
        <In key={row.name} at={0.3 + i * 0.06} from="left" className="min-w-0">
          <li className="flex items-baseline gap-3 text-[clamp(16px,2.6cqi,22px)] font-bold">
            <span className="w-5 tabular-nums" style={{ color: accent }}>{i + 1}</span>
            <span className="min-w-0 flex-1 truncate" dir="auto">#{row.name}</span>
            <span className="text-[13px] tabular-nums text-(--wrap-quiet)">{num(row.n)}</span>
          </li>
        </In>
      ))}
    </ol>
  )
}

/** One card: the world's art behind, its words in front, laid out for the width it has. */
function Card({ kind, f, look, variant, seed }: { kind: Kind; f: Facts; look: Look; variant: number; seed: number }): React.JSX.Element {
  const { p, world } = look
  const e = look.entrance
  const flip = variant === 1
  const top = f.tags.slice(0, 5)
  const names = top.map((t) => `#${t.name}`)
  const split = (a: ReactNode, b: ReactNode): ReactElement => <Split a={a} b={b} flip={flip} />

  const art = ((): ReactNode => {
    if (world === 'night') return <><Silk base={p.bg} a={p.glow[0]} b={p.glow[1]} lines={variant === 2} /><div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${p.bg}, transparent 75%)` }} /></>
    if (world === 'kinetic') return <motion.div className="absolute inset-0" style={{ background: p.bg }} initial={still() ? false : { clipPath: 'inset(0 0 100% 0)' }} animate={{ clipPath: 'inset(0 0 0% 0)' }} transition={{ duration: 0.35, ease: EASE }} />
    if (world === 'sticker' && kind !== 'report') return <>
      <Burst color={p.accent} kind={variant ? 'flower' : 'sun'} className={`absolute hidden size-[40cqi] opacity-90 @2xl:block ${flip ? '-bottom-[12cqi] -left-[10cqi]' : '-top-[12cqi] -right-[10cqi]'}`} />
      <Burst color={p.alt} kind={variant ? 'sun' : 'flower'} points={9} className={`absolute size-[16cqi] ${flip ? 'top-[10%] right-[5%]' : 'bottom-[10%] left-[4%]'}`} />
    </>
    return null
  })()

  const side = (): ReactElement => {
    // The scribble draws over the art half only, so it never crosses words.
    if (world === 'files') return <In at={0.1} from="scale" className="absolute inset-0 overflow-hidden rounded-[6px]"><OpArt kind={look.op} ink={p.alt} bg={p.soft} className="size-full" /><Scribble seed={seed} color={p.accent} width={3} className="pointer-events-none absolute top-[10%] left-0 w-full" delay={0.35} /></In>
    if (world === 'sticker') return <In at={0.15} from="scale" className="grid h-full place-items-center"><Burst color={p.soft} kind="flower" className="max-h-full w-[80%]" /></In>
    if (world === 'kinetic') return <div className="relative h-full overflow-hidden"><Tiled word={f.tags[0]?.name ?? f.name} color={p.soft} rows={8} /></div>
    return <div />
  }

  const body = ((): ReactElement => {
    switch (kind) {
      case 'intro':
        if (world === 'kinetic') return <div className="relative grid h-full content-center gap-4 overflow-hidden px-8 @2xl:px-14"><Tiled word={f.name} color={p.soft} /><div className="relative"><Echo text={f.name} color={p.ink} size={64} /></div><In at={0.6}><p className="relative text-[18px] font-bold">{opening(f, look.intro)}</p></In></div>
        return split(<>
                    <In at={0.12} from={e}><h2 className={`${BIG} mt-2`} style={{ color: world === 'files' ? p.ink : p.accent }}>{f.title}</h2></In>
          <In at={0.5} from={e}><p className="mt-4 text-[17px] leading-snug font-medium opacity-90"><Typed story text={opening(f, look.intro)} /></p></In>
        </>, world === 'night' ? <div className="grid h-full place-items-center text-center text-[clamp(36px,8cqi,72px)] leading-none font-black tracking-tight" style={{ color: p.accent }}><TextLoop words={[f.name, ...FAN]} /></div> : side())
      case 'tags':
        if (!top.length) return split(<><In at={0.15}><div className={HUGE} style={{ color: p.accent }}><Roll n={f.captures} /></div></In><In at={0.45}><p className={CAPTION}>things caught</p></In></>, side())
        if (world === 'sticker') return split(<><In at={0.12}><h2 className={BIG}>What you captured most</h2></In><In at={0.45}><p className={CAPTION}>{plural(f.captures, 'thing')} caught</p></In><In at={0.4}><p className="mt-3 text-[14px] text-(--wrap-quiet)">Drag the top card away to see the next.</p></In></>,
          <In at={0.25} from="scale" className="grid h-full place-items-center"><Stack cards={top.map((t, i) => ({ title: `#${t.name}`, note: `${plural(t.n, 'capture')}, number ${i + 1}` }))} colors={[p.accent, p.alt, p.soft]} ink={p.bg} /></In>)
        if (world === 'kinetic') return <div className="relative grid h-full content-center gap-2 overflow-hidden px-8 @2xl:px-14"><Echo text={`#${top[0].name}`} color={p.ink} size={top[0].name.length > 12 ? 30 : 58} /><CurvedLoop words={names} color={p.accent} bend={variant * 30} /></div>
        if (world === 'night') return split(<><div className={BIG} style={{ color: p.accent }}><TextLoop words={names} /></div><In at={0.3}><p className="mt-3 text-[15px] text-(--wrap-quiet)">{plural(f.captures, 'thing')} caught in all.</p></In></>, <Ranked rows={top} accent={p.accent} />)
        return split(<><In at={0.12}><h2 className={BIG}>What you captured most</h2></In><In at={0.45}><p className={CAPTION}>{plural(f.captures, 'thing')} caught</p></In></>, <Ranked rows={top} accent={p.accent} />)
      case 'focus':
        if (world === 'sticker') return split(<><In at={0.12}><h2 className={BIG}>{hours(f.minutes)}, over {plural(f.sessions, 'session')}.</h2></In><In at={0.45}><p className={CAPTION}>minutes focused, five times over</p></In></>, <div className="grid h-full content-center"><Bands n={f.minutes} colors={[p.accent, p.alt, p.soft, p.ink, p.accent]} ink={p.bg} /></div>)
        if (world === 'kinetic') return <div className="relative grid h-full content-center overflow-hidden px-8 @2xl:px-14"><Tiled word="focus" color={p.soft} /><div className="relative"><Echo text={num(f.minutes)} color={p.ink} size={84} /><In at={0.5}><p className="text-[17px] font-bold">That is {hours(f.minutes)}, over {plural(f.sessions, 'session')}.</p></In></div></div>
        return split(<><In at={0.12}><div className={HUGE} style={{ color: p.accent }}><Roll n={f.minutes} /></div></In><In at={0.45}><p className={CAPTION}>minutes focused: {hours(f.minutes)}, over {plural(f.sessions, 'session')}.</p></In></>, side())
      case 'plan': {
        const rows = [...f.planRows].sort((a, b) => Math.abs(b.did - b.planned) - Math.abs(a.did - a.planned)).slice(0, 4)
        const most = Math.max(1, ...rows.flatMap((row) => [row.planned, row.did]))
        return split(<><In at={0.12}><h2 className={BIG}>You planned {shortSaid(f.planned)}{f.did ? ` and did ${shortSaid(f.did)}` : ''}.</h2></In><In at={0.45}><p className={CAPTION}>Planned against did</p></In></>,
          <div className="grid h-full grid-cols-1 content-center gap-4">{rows.map((row, i) => (
            <In key={row.name + i} at={0.3 + i * 0.07} from="left" className="min-w-0"><p className="truncate text-[15px] font-semibold" dir="auto">{row.name}</p>
              <div className="mt-1 h-2 rounded-full" style={{ background: p.soft, width: `${(row.planned / most) * 100}%` }} />
              <motion.div className="mt-1 h-2 origin-left rounded-full" style={{ background: p.accent, width: `${(row.did / most) * 100}%` }} initial={still() ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.45 + i * 0.07, duration: 0.4, ease: EASE }} /></In>
          ))}<p className="text-[12px] font-semibold text-(--wrap-quiet)">Upper bar planned, lower bar did.</p></div>)
      }
      case 'pictures':
        if (world === 'night') return <div className="relative grid h-full grid-rows-[auto_1fr] px-8 pt-14 @2xl:px-12"><In><h2 className={BIG} style={{ color: p.accent }}>{plural(f.pictures.length, 'picture')}, kept.</h2></In><CurvedGallery pictures={f.pictures} /></div>
        return split(<><In at={0.12}><h2 className={BIG}>{f.gems ? `${plural(f.gems, 'gem')} kept, and what you saw` : 'What you saw'}</h2></In></>,
          <div className="relative grid h-full place-items-center">{f.pictures.slice(0, 3).map((one, i) => (
            <motion.img key={one.src + i} src={one.src} alt={one.title} className="absolute aspect-[4/5] h-[78%] max-h-[300px] rounded-[4px] object-cover"
              style={{ boxShadow: `0 0 0 6px ${p.bg}, 0 0 0 8px ${p.ink}`, zIndex: 3 - i }}
              initial={still() ? false : { opacity: 0, y: 30, rotate: 0 }} animate={{ opacity: 1, y: 0, rotate: (i - 1) * (world === 'sticker' ? 9 : 5) + (variant - 1) * 2, x: (i - 1) * 40 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20, delay: still() ? 0 : 0.2 + i * 0.1 }} />
          ))}</div>)
      case 'notes':
        if (world === 'files') return split(<In><h2 className={BIG}>{look.folder}</h2><p className={CAPTION}>{f.notesLabel}</p></In>, <div className="grid h-full content-center"><Folder titles={f.notes.map((note) => quoted(note, 60))} color={p.accent} paper={STAGE.paper} ink={STAGE.paperInk} /></div>)
        return split(<><In at={0.12}><h2 className={BIG}>{look.folder}</h2></In><In at={0.45}><p className={CAPTION}>{f.notesLabel}</p></In></>, <ol className="grid h-full min-w-0 grid-cols-1 content-center gap-2">{f.notes.slice(0, 5).map((note, i) => <In key={note + i} at={0.3 + i * 0.06} from="left" className="min-w-0"><li className="flex gap-3 text-[17px] font-semibold"><span className="w-5 tabular-nums" style={{ color: p.accent }}>{i + 1}</span><span className="min-w-0 truncate" dir="auto">{note}</span></li></In>)}</ol>)
      case 'well':
        return split(<><In at={0.12}><h2 className={BIG}>In your words</h2></In><In at={0.45}><p className={CAPTION}>What went well</p></In></>, <ul className="grid h-full content-center gap-3">{f.well.slice(0, 4).map((line, i) => <In key={line} at={0.3 + i * 0.1}><li className="text-[17px] leading-snug font-medium" dir="auto">{quoted(line, 90)}</li></In>)}</ul>)
      case 'run':
        return split(<><In at={0.12}><div className={HUGE} style={{ color: p.accent }}><Roll n={f.run} /></div></In><In at={0.5}><p className="mt-2 text-[17px] font-medium">days in a row with something caught or focused on. Not a streak to keep: just how it went.</p></In></>,
          <div className="grid h-full max-w-[280px] grid-cols-7 content-center gap-1.5">{Array.from({ length: Math.min(f.run, 35) }, (_, i) => <motion.span key={i} className="aspect-square rounded-[3px]" style={{ background: p.accent }} initial={still() ? false : { opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 + i * 0.015, type: 'spring', stiffness: 400, damping: 20 }} />)}</div>)
      case 'busiest':
        return split(<><In at={0.12}><h2 className={BIG} style={{ color: p.accent }}>Your busiest day was {f.busiest?.label}</h2></In><In at={0.4}><p className="mt-2 text-[17px] font-medium">{plural(f.busiest?.n ?? 0, 'capture')} in one day.</p></In></>, side())
      case 'outro':
        if (world === 'kinetic') return <div className="relative h-full"><div className="relative z-10 px-8 pt-16 @2xl:px-14"><Echo text={f.name} color={p.ink} size={52} /><In at={0.5}><p className="mt-3 text-[18px] font-bold">{fill(look.outro, f.name)}</p></In></div><FallingWords words={f.tags.length ? f.tags.slice(0, 18).map((t) => `#${t.name}`) : [f.name, 'notes', 'days']} colors={[p.accent, p.alt, p.soft, p.ink]} ink={p.bg} seed={seed} /></div>
        return split(<><In><h2 className={BIG} style={{ color: p.accent }}><Typed story text={fill(look.outro, f.name)} /></h2></In>{f.period === 'week' && <In at={0.8}><WrappedParagraph monday={f.from} /></In>}</>, world === 'night' ? <div /> : side())
      case 'report':
        return <Report f={f} look={look} />
    }
  })()
  return <div className="absolute inset-0 overflow-hidden">{art}{body}</div>
}

/** The card to keep: the month on its side, a framed picture, two ranked lists, a big number and a word. */
function Report({ f, look }: { f: Facts; look: Look }): React.JSX.Element {
  const { p, world } = look
  const frame = world === 'files' ? <OpArt kind={look.op} ink={p.alt} bg={p.soft} className="size-full" />
    : world === 'sticker' ? <div className="grid size-full place-items-center" style={{ background: p.alt }}><Burst color={p.accent} className="size-[140%]" /></div>
    : world === 'kinetic' ? <div className="relative size-full overflow-hidden" style={{ background: p.alt }}><Tiled word={f.name} color={p.soft} /></div>
    : <Silk base={p.bg} a={p.glow[0]} b={p.glow[1]} />
  const picture = f.pictures[0]
  const list = (title: string, rows: string[]): ReactElement => (
    <div className="min-w-0"><p className="text-[11px] font-semibold text-(--wrap-quiet)">{title}</p>
      <ol className="mt-1 space-y-0.5 text-[14px] font-bold">{rows.length ? rows.slice(0, 5).map((row, i) => <li key={row + i} className="truncate" dir="auto">{i + 1} {row}</li>) : <li className="text-(--wrap-quiet)">None yet</li>}</ol></div>
  )
  return (
    <div className="relative grid h-full grid-rows-[minmax(0,1fr)_auto] gap-3 px-6 pt-11 pb-14 @2xl:grid-cols-[1.05fr_1fr] @2xl:grid-rows-1 @2xl:gap-5 @2xl:px-10" data-wrap-report>
      <In from="scale" className="relative min-h-[64px] overflow-hidden rounded-[6px]">
        <div className="absolute inset-0">{frame}</div>
        <div className="absolute inset-[8%] left-[22%] overflow-hidden rounded-[4px]" style={{ background: p.soft }}>
          {picture ? <img src={picture.src} alt={picture.title} className="size-full object-cover" /> : <div className="grid size-full place-items-center p-4 text-center text-[20px] font-black break-words">{f.tags[0] ? `#${f.tags[0].name}` : f.name}</div>}
        </div>
        <div className="absolute inset-y-0 left-0 grid w-[22%] place-items-center overflow-hidden" style={{ background: p.bg }}>
          <span className="text-[17px] font-black whitespace-nowrap @2xl:text-[clamp(26px,6.5cqi,54px)]" style={{ color: p.accent, writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{f.period === 'month' ? f.name.split(' ')[0] : 'Week'}</span>
        </div>
      </In>
      <div className="grid min-w-0 content-center gap-3 @2xl:gap-5">
        <In at={0.2} className="grid grid-cols-2 gap-x-4">{list('Top tags', f.tags.map((t) => `#${t.name}`))}{list(f.notesLabel, f.notes)}</In>
        <In at={0.35} className="grid grid-cols-2 gap-4">
          <div><p className="text-[11px] font-semibold text-(--wrap-quiet)">Minutes focused</p><p className="text-[clamp(26px,5cqi,40px)] leading-none font-black"><Roll n={f.minutes} delay={0.5} /></p></div>
          <div className="min-w-0"><p className="text-[11px] font-semibold text-(--wrap-quiet)">Top kind</p><p className="text-[clamp(20px,3.6cqi,30px)] leading-[0.95] font-black" style={{ color: p.accent }}>{f.kind}</p></div>
        </In>
      </div>
    </div>
  )
}

/**
 * The month's wrap, come to you: on the first open after a month ends,
 * "Your October, wrapped", once. Opened, or put away with Not now; a line
 * turns these offers off (Settings has it too). The very first time Haligtree
 * sees a month go by it only notes it, so a new book is never greeted with
 * a month it was not there for.
 */
export function WrapOffer(): React.JSX.Element | null {
  const settings = useLive(haligtree.settings, null as Settings | null)
  const [offer, setOffer] = useState<string | null>(null)
  const month = dayjs().subtract(1, 'month').format('YYYY-MM')
  useEffect(() => {
    if (!settings || settings.wrapOffer === false || offer) return
    const seen = settings.wrapOffered ?? ''
    if (seen >= month) return
    if (!seen) return void haligtree.setSettings({ wrapOffered: month })
    // Offered once, said so at once: a second window or a reload never offers it again.
    void haligtree.setSettings({ wrapOffered: month })
    void haligtree.recap('month', `${month}-01`).then((recap) => {
      if (!recap.captures && !recap.reviews) return
      setTimeout(() => (chime('noted'), setOffer(month)), 1500)
    })
  }, [settings, month]) // eslint-disable-line react-hooks/exhaustive-deps
  const name = offer ? dayjs(`${offer}-01`).format('MMMM') : ''
  const close = (): void => (chime('fold'), setOffer(null))
  const never = (): void => {
    close()
    sayNow(haligtree.setSettings({ wrapOffer: false }), 'No more monthly wraps offered. Settings has them, under What comes back to you', () => void haligtree.setSettings({ wrapOffer: true }))
  }
  // A corner card as a milestone is: at the sidebar's foot where there is one, never while a menu or picker is open.
  const blocked = useLayerOpen(!!offer)
  // With the sidebar folded there is no room that covers nothing: the offer waits, kept, until there is.
  const dock = useCornerDock()
  const card = (
    <AnimatePresence>
    {offer && !blocked && dock && <motion.aside data-wrap-offer={offer} aria-label={`Your ${name}, wrapped`}
      initial={{ opacity: 0, transform: shift('translateY(8px)') }} animate={{ opacity: 1, transform: shift('translateY(0px)') }} transition={{ duration: 0.3, ease: EASE }}
      exit={{ opacity: 0, transform: shift('translateY(8px)'), transition: { duration: 0.15, ease: EASE } }}
      className={`mb-2 flex w-full flex-col gap-3 rounded-xl border bg-background p-4 shadow-(--mf-panel-shadow)`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-heading text-heading font-semibold text-foreground">Your {name}, wrapped</p>
          <p className="mt-0.5 text-body text-foreground/85">{name} is over. A few cards on what it held: what you caught, where your focus went, and what you planned against what you did.</p>
        </div>
        <Tip label="Not now"><button type="button" aria-label="Not now" onClick={close} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><X className="size-3.5" /></button></Tip>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" data-wrap-open onClick={() => (setOffer(null), openWrap(`month:${offer}`))}>Open</Button>
        <Button size="sm" variant="ghost" onClick={close}>Not now</Button>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={never} className="text-muted-foreground">Don't offer these</Button>
      </div>
    </motion.aside>}
    </AnimatePresence>
  )
  return dock ? createPortal(card, dock) : null
}

/** The Settings row's own words, so they read the same as the offer. */
export const WRAP_SETTING: { title: string; note: string; more: string } = {
  title: 'Your month in notes, wrapped',
  note: `After a month ends, the first time you open ${APP_NAME} it offers that month as a few cards, once.`,
  more: `What you captured most, your busiest day, focus hours, planned against did, gems kept, your longest run and what went well. The Sunday notification opens the week's. ${num(MOST)} cards at most; nothing leaves this Mac.`
}
