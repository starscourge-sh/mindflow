import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement, type ReactNode } from 'react'
import { WrappedParagraph } from './ai-offers'
import { AnimatePresence, motion } from 'motion/react'
import { createPortal } from 'react-dom'
import { useCornerDock, useLayerOpen } from '@/lib/layer-watch'
import { chime, type Cue } from '@/lib/sound'
import { EASE, shift, still } from '@/lib/motion'
import { useSurface } from '@/lib/use-alive'
import { call, useLive, haligtree, type Item, type Recap, type Settings, type SpanSession, type Task } from '@/lib/haligtree'
import { useHas } from '@/lib/needs'
import type { Lean, Voice, WrapPage } from '../../../../main/wrap-lines'
import { taskName } from '@/lib/tasks'
import { Button } from '@/components/ui/button'
import { X } from '@/components/ui/icons'
import { usePicturesFrom } from './recap-view'
import { PictureRow } from './picture-row'
import { DateStamp, In, InkLine, JournalField, KraftTape, LampWash, MarginNote, Roll, Silk, TippedPrint } from './wrap-art'
import { FOLDER_LINES, HUES, INTROS, OUTROS, PALETTES, STAGE, WORLDS, nextSeed, pick, seeded, type Palette, type World } from './wrap-worlds'
import { drawingFor } from './grain'
import { Tip, Typed, refuse, sayNow, toast } from './ui'
import { plannedVsDid } from './planned-did'
import { bySite, sentAwaySince, timesSaid } from './site-block-field'
import { dayjs, dayKey, dayName, howLong, noon, num, plural } from '../../../../main/dates'
import { APP_NAME } from '../../../../main/name'
import { quoted } from '../../../../main/clip'

/**
 * A month or a week, wrapped: a scrapbook of a few cards, one thing each
 * (Spotify Wrapped’s pace, Midori notebook’s feel). What you caught and tagged,
 * gems kept, pages and pictures, reading finished, then busiest day and runs;
 * focus hours, blocked sites and planned-vs-did come later, never as the lead.
 * Only cards with something true to say are shown. ← → turn, Esc closes.
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
  focus: { minutes: number; sessions: number; tasks: { name: string; minutes: number }[] }
  plan: ReturnType<typeof plannedVsDid>
  gems: Item[]
  run: { n: number; from: string; to: string }
  busy: string[]
  days: Record<string, number>
  well: string[]
  sites: { site: string; count: number }[]
  reads: Reads
  /** The span before, for the lead-ins' "against last time": its captures, minutes of focus and tags. */
  before: { captures: number; minutes: number; tags: { name: string; n: number }[] }
}
/** Articles read in the reader this span (main/read-time.ts): finished only with their end reached and half their reading time spent. */
type Reads = { total: number; finished: number; left: { title: string; minutes: number; needs: number }[] }

async function wrapOf({ period, from, to }: Span): Promise<Wrapped> {
  const [since, until] = [dayjs(from).startOf('day').toISOString(), dayjs(to).endOf('day').toISOString()]
  const mondays: string[] = []
  for (let monday = dayjs(from).startOf('week'); dayKey(monday) <= to; monday = monday.add(1, 'week')) mondays.push(dayKey(monday))
  const prior = dayjs(from).subtract(1, period)
  const [priorSince, priorUntil] = [prior.startOf(period).toISOString(), prior.endOf(period).toISOString()]
  const [recap, sessions, tasks, gems, days, pages, sent, read, priorRecap, priorSessions] = await Promise.all([
    haligtree.recap(period, since),
    haligtree.sessionsSpan(since, until) as Promise<SpanSession[]>,
    haligtree.tasks() as Promise<Task[]>,
    haligtree.items('nugget'),
    haligtree.dayCaptures(from, to),
    Promise.all(mondays.map((monday) => haligtree.period(`week:${monday}`))),
    sentAwaySince(since),
    window.api.haligtree('read:stats', since) as Promise<{ rows: { title: string; minutes: number; needs: number; finished: boolean; lastAt: string }[] }>,
    haligtree.recap(period, priorSince),
    haligtree.sessionsSpan(priorSince, priorUntil) as Promise<SpanSession[]>
  ])
  const inSpan = read.rows.filter((one) => one.lastAt <= until)
  const minutes = new Map<string, number>()
  const worked = new Set<string>()
  let total = 0
  const spent = (one: SpanSession): number => Math.max(0, ((one.endedAt ? Date.parse(one.endedAt) : Date.now()) - Date.parse(one.startedAt) - (one.pausedMs || 0)) / 60_000)
  for (const one of sessions) {
    const n = spent(one)
    minutes.set(one.taskId, (minutes.get(one.taskId) ?? 0) + n)
    worked.add(dayKey(one.startedAt))
    total += n
  }
  // The longest run of days with something caught or focused on, inside the span, and where it began and ended.
  const busy = new Set([...worked, ...Object.entries(days.counts).filter(([, n]) => n > 0).map(([day]) => day)].filter((day) => day >= from && day <= to))
  let run = { n: 0, from, to: from }
  for (let day = dayjs(from), n = 0; dayKey(day) <= to; day = day.add(1, 'day')) {
    n = busy.has(dayKey(day)) ? n + 1 : 0
    if (n > run.n) run = { n, from: dayKey(day.subtract(n - 1, 'day')), to: dayKey(day) }
  }
  // Where the focus went: the tasks with the most of it.
  const named = new Map(tasks.map((task) => [task.id, taskName(task.title).text]))
  const most = [...minutes].filter(([id, n]) => named.has(id) && n >= 1).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, n]) => ({ name: named.get(id)!, minutes: Math.round(n) }))
  // What went well, in your words: each week's summary from Close the week, and its page's wins.
  const well = pages.flatMap((page) => [page.fields.summary, page.fields.wins]).flatMap((text) => (text ?? '').split('\n')).map((line) => line.replace(/^[-*•]\s*/, '').trim()).filter(Boolean)
  return {
    name: period === 'month' ? dayjs(from).format(dayjs(from).isSame(dayjs(), 'year') ? 'MMMM' : 'MMMM YYYY') : `the week of ${dayjs(from).format('D MMMM')}`,
    recap,
    focus: { minutes: Math.round(total), sessions: sessions.length, tasks: most },
    plan: plannedVsDid(tasks, minutes, from, to),
    gems: gems.filter((gem) => !gem.private && dayKey(gem.createdAt) >= from && dayKey(gem.createdAt) <= to),
    run,
    busy: [...busy],
    days: days.counts,
    well: [...new Set(well)],
    sites: bySite(sent, since, until),
    reads: { total: inSpan.length, finished: inSpan.filter((one) => one.finished).length, left: inSpan.filter((one) => !one.finished).map((one) => ({ title: one.title, minutes: one.minutes, needs: one.needs })) },
    before: { captures: priorRecap.captures, tags: priorRecap.tags, minutes: Math.round(priorSessions.reduce((sum, one) => sum + spent(one), 0)) }
  }
}

/**
 * Enough to tell a story: at least three of the things the cards are made of (things caught, gems kept, focus
 * sessions, articles finished, tasks planned). Pages are not counted: no card tells them, so a new book's page or two
 * is never a story. The user, 22 Nov, opened "Your week, wrapped" on a week with one page in it and got an empty cover
 * and "None yet" tiles.
 */
const enough = (d: Wrapped): boolean => d.recap.captures + d.gems.length + d.focus.sessions + d.reads.finished + d.plan.rows.length >= 3
/** Whether a span ("week:2026-11-16", "month:2026-10") has enough to wrap: Home and the month's offer ask before offering it. */
export const worthWrapping = (id: string): Promise<boolean> => wrapOf(spanOf(id)).then(enough, () => false)

type Picture = { src: string; title: string; type: string; id: string; stored?: string }
/** What the Mac's Vision calls a picture of words, a page or a screen (main/picture-sight.ts): never a story's hero. */
const PAGES = new Set(['document', 'screenshot', 'text', 'receipt', 'chart', 'diagram', 'table', 'spreadsheet', 'printed_page', 'handwriting', 'paper', 'letter', 'invoice', 'menu', 'whiteboard', 'blackboard', 'computer', 'monitor', 'screen', 'display', 'website', 'map', 'calendar', 'book', 'magazine', 'poster', 'sign', 'card', 'qr_code', 'barcode'])
const ART_WORDS = new Set(['art', 'painting', 'paintings', 'drawing', 'sketch', 'illustrations'])
/** The most words a hero may hold: a caption on a photo, a signature on a painting; a page of figures holds hundreds. */
const HERO_WORDS = 6
const nameIn = (src: string): string => src.replace(/^[a-z]+:\/\/assets\//, '').replace(/\?.*$/, '')
/**
 * The pictures fit to be the story's big picture, best first: your own photos and art, never a screenshot of a page
 * of figures or a table (they can be private, and they are no picture of the month). A picture is taken only once the
 * Mac has read it for words (main/picture-words.ts, kept, so most are known at once) and found almost none, and Vision
 * does not call it a page or a screen; paintings and drawings first. Read one at a time, the span's order, until two
 * are found or ten were asked: never a crowd of readings at once. None fit, and the cards draw their own motif instead.
 */
async function heroesOf(pictures: Picture[]): Promise<Picture[]> {
  const sight = await call<{ labels: Record<string, string[]> }>('pictures:sight').catch(() => ({ labels: {} as Record<string, string[]> }))
  const labels = new Map(Object.entries(sight.labels).map(([src, said]) => [nameIn(src), said.map((one) => one.toLowerCase())]))
  const found: { one: Picture; art: boolean }[] = []
  let asked = 0
  for (const one of pictures) {
    if (!one.stored || one.type === 'gem' || found.length >= 2 || asked >= 10) continue
    const said = labels.get(nameIn(one.stored)) ?? []
    if (said.some((label) => PAGES.has(label))) continue
    asked++
    const words = await window.api.imageText(one.stored).catch(() => null)
    if (words === null || words.split(/\s+/).filter((word) => /\p{L}|\d/u.test(word)).length > HERO_WORDS) continue
    found.push({ one, art: said.some((label) => ART_WORDS.has(label)) })
  }
  return found.sort((a, b) => Number(b.art) - Number(a.art)).map(({ one }) => one)
}

/** At most this many cards: the first and the last always, the rest by what there is to say. */
const MOST = 12

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
  return <AnimatePresence>{ask && <Story key={`${ask.id}:${ask.n}`} id={ask.id} seed={ask.seed} forced={ask.world === 'surprise' ? undefined : ask.world} worst={window.api.quiet ? ask.worst : undefined} onClose={() => (chime('fold'), setAsk(null))} onLeave={() => setAsk(null)} />}</AnimatePresence>
}

type Facts = {
  name: string; title: string; range: string; period: 'week' | 'month'; from: string; to: string
  captures: number; tags: { name: string; n: number }[]; minutes: number; sessions: number; focusTasks: { name: string; minutes: number }[]
  planned: number; did: number; planRows: { name: string; planned: number; did: number }[]
  pictures: Picture[]; notes: string[]; notesLabel: string; gems: number
  /** The story's big pictures (heroesOf): your own photos and art, none of words; empty, and a drawn motif stands in. */
  heroes: Picture[]
  run: number; runFrom: string; runTo: string; busy: string[]; days: Record<string, number>
  busiest: { label: string; day: string; n: number } | null; well: string[]; kind: string; sites: { site: string; count: number }[]; reads: Reads
  /** Captures by hour of the day, and the hour most came in; null with too few to say. */
  hours: number[]; hour: number | null
  before: Wrapped['before']
  /** Too little for a story (enough): one honest card in its stead, saying what there is. */
  thin: boolean
  /** The span's pages, by name, for that card. */
  pages: string[]
}
type Kind = 'quiet' | 'intro' | 'tags' | 'focus' | 'sites' | 'reading' | 'plan' | 'pictures' | 'notes' | 'well' | 'run' | 'busiest' | 'hours' | 'outro' | 'report'

/** What the month most was, in a word: the report card's "Top kind". */
const kindOf = (f: { captures: number; minutes: number; gems: number; planned: number; reads: number }): string =>
  f.gems >= 5 ? 'Gem keeper' : f.captures >= 40 ? 'Collector' : f.reads >= 5 ? 'Reader' : f.minutes >= 600 ? 'Deep worker' : f.planned ? 'Planner' : f.captures ? 'Noticer' : 'Quiet'

const ENTRANCES = ['up', 'left', 'scale', 'lift'] as const
/** The card is wide over the dimmed app from this size; under it, the whole window (main.css .wrap-card). */
const WIDE = '(min-width: 640px) and (min-height: 560px)'
const useWide = (): boolean => useSyncExternalStore((on) => {
  const query = matchMedia(WIDE)
  query.addEventListener('change', on)
  return () => query.removeEventListener('change', on)
}, () => matchMedia(WIDE).matches)

function Story({ id, seed, forced, worst, onClose, onLeave }: { id: string; seed: number; forced?: World; worst?: Partial<Facts>; onClose: () => void; onLeave: () => void }): React.JSX.Element {
  const span = spanOf(id)
  const [data, setData] = useState<Wrapped | null>(null)
  useEffect(() => void wrapOf(span).then(setData), [id]) // eslint-disable-line react-hooks/exhaustive-deps
  const pictures = usePicturesFrom(dayjs(span.from).startOf('day').toISOString(), dayjs(span.to).endOf('day').toISOString())
  const [heroes, setHeroes] = useState<Picture[] | null>(null)
  useEffect(() => {
    if (!pictures) return
    let live = true
    void heroesOf(pictures).then((found) => live && setHeroes(found), () => live && setHeroes([]))
    return () => void (live = false)
  }, [pictures])
  const surface = useSurface()
  // The seed picks the world, its palette, each card's layout and the lines: never the same twice.
  const look = useMemo<Look>(() => {
    const rand = seeded(seed)
    const world = forced ?? pick(rand, WORLDS)
    // Files wears the paper of the app's own theme: cream under a light one, charcoal under a dark one. Night is always night.
    const fits = PALETTES[world].filter((one) => world !== 'files' || (parseInt(one.bg.slice(1, 3), 16) > 128) === (surface === 'light'))
    return { world, p: pick(rand, fits.length ? fits : PALETTES[world]), intro: pick(rand, INTROS), outro: pick(rand, OUTROS), folder: pick(rand, FOLDER_LINES), entrance: pick(rand, ENTRANCES) }
  }, [seed, forced, surface])
  const [at, setAt] = useState(0)
  const [byKey, setByKey] = useState(false)
  const [dir, setDir] = useState(1)
  const wide = useWide()

  // Too little to tell: the span's pages, by name, read only then, for the one card that says what there is. A full
  // story reads nothing more than it did.
  const thin = !!data && !enough(data)
  const [pageNames, setPageNames] = useState<string[] | null>(null)
  useEffect(() => {
    if (!thin) return
    let live = true
    const inSpan = (at: string): boolean => dayKey(at) >= span.from && dayKey(at) <= span.to
    void haligtree.items('article').then((all) => live && setPageNames(all.filter((page) => !page.private && inSpan(page.createdAt)).map((page) => page.title.trim() || 'Untitled')), () => live && setPageNames([]))
    return () => void (live = false)
  }, [thin]) // eslint-disable-line react-hooks/exhaustive-deps

  const facts = useMemo<Facts | null>(() => {
    if (!data || !pictures || !heroes || (thin && !pageNames)) return null
    const { recap, focus, plan, gems, run, well, name, busy, days, sites, reads, before } = data
    // The span's pictures, and its gems with none of their own on their paper drawing: one flowing row.
    const pictured = new Set(pictures.map((one) => one.id))
    const flow = [...pictures, ...gems.filter((gem) => !pictured.has(gem.id)).map((gem) => ({ src: drawingFor(gem.id).url, title: gem.title || 'New note', type: 'gem', id: gem.id }))]
    const notes = recap.sources.length ? recap.sources.map((one) => one.name) : gems.map((gem) => gem.title || 'New note')
    return {
      name, period: span.period, from: span.from, to: span.to, title: span.period === 'month' ? `Your ${name}, wrapped` : 'Your week, wrapped',
      range: `${dayjs(span.from).format('D MMM')} to ${dayjs(span.to).format('D MMM YYYY')}`,
      captures: recap.captures, tags: recap.tags, minutes: focus.minutes, sessions: focus.sessions, focusTasks: focus.tasks,
      planned: plan.planned, did: plan.did, planRows: plan.rows.map((row) => ({ name: taskName(row.task.title).text, planned: row.planned, did: row.did })),
      pictures: flow, heroes, notes, notesLabel: recap.sources.length ? 'Top sources' : 'Gems kept', gems: gems.length,
      run: run.n, runFrom: run.from, runTo: run.to, busy, days,
      busiest: recap.busiestDay ? { label: dayName(noon(recap.busiestDay.name), 'never'), day: recap.busiestDay.name, n: recap.busiestDay.n } : null,
      // An hour is said only with enough caught to mean something, and one hour clearly ahead of the next.
      hours: recap.hours, hour: thinkingHour(recap.hours),
      well, kind: kindOf({ captures: recap.captures, minutes: focus.minutes, gems: gems.length, planned: plan.planned, reads: reads.finished }), sites, reads, before,
      thin, pages: pageNames ?? [],
      ...worst
    }
  }, [data, pictures, heroes, pageNames]) // eslint-disable-line react-hooks/exhaustive-deps

  // On a Mac with Apple Intelligence, a few words over each page: the page's plain statement, written here from its
  // facts (wrapSays), said again by the model in the voice of the story's look (main/wrap-lines.ts); the page's own
  // sentence under it keeps every number. Lead-ins already written come at once and the first card waits for that answer
  // only; new ones come while the cards turn. A page shows the plain statement until its own is in, and keeps whatever it
  // showed first, so nothing changes under the reader.
  const ai = useHas('ai') && !worst
  // The plain statements are the app's own, made by rules: every Mac has them. Apple Intelligence only says them again.
  const says = useMemo(() => (facts ? wrapSays(facts) : null), [facts])
  const asked = ai && !facts?.thin ? says : null
  const voice = VOICE[look.world]
  const [written, setWritten] = useState<{ leads: Record<string, string> | null; done: boolean }>({ leads: null, done: false })
  useEffect(() => {
    if (!asked) return
    let live = true
    type Said = { leads: Record<string, string> | null } | { error: string }
    const said = (one: Said): void => void (live && setWritten({ leads: 'leads' in one ? one.leads : null, done: true }))
    void window.api.haligtree<Said>('ai:wrap', id, asked, true, voice).then((kept) => {
      said(kept)
      if ('leads' in kept && !kept.leads) void window.api.haligtree<Said>('ai:wrap', id, asked, false, voice).then(said, () => undefined)
    }, () => said({ leads: null }))
    return () => void (live = false)
  }, [asked, voice]) // eslint-disable-line react-hooks/exhaustive-deps
  const shownLeads = useRef(new Map<Kind, string | undefined>())
  const leadFor = (one: Kind): string | undefined => {
    // Without Apple Intelligence a page shows its statement only where it says what the page's own sentence doesn't,
    // how it went against last time; never a repeat of the sentence under it.
    const page = says?.find((each) => each.page === one)
    if (!shownLeads.current.has(one)) shownLeads.current.set(one, written.leads?.[one] ?? (page && (ai || againstLast(page)) ? page.says : undefined))
    return shownLeads.current.get(one)
  }
  const ready = !!facts && (!asked || written.done)

  const kinds = useMemo<Kind[]>(() => {
    if (!facts) return []
    const f = facts
    // Too little to tell: one card that says so, never an intro, an outro and a report card of empty tiles.
    if (f.thin) return ['quiet']
    const rand = seeded(seed + 1)
    // The most to say first; near equals trade places now and then.
    // Book keep first (tags, notes/gems, reading, pictures), then the month's
    // shape (well, run, busiest, hours). Focus, blocked sites and plan-vs-did
    // last: writers open a wrap for what they kept, not a productivity score.
    const middle: [number, Kind][] = []
    if (f.tags.length || f.captures) middle.push([1, 'tags'])
    if (f.notes.length) middle.push([1.2, 'notes'])
    if (f.reads.total) middle.push([1.5, 'reading'])
    if (f.pictures.length) middle.push([2, 'pictures'])
    if (f.well.length) middle.push([2.5, 'well'])
    if (f.run >= 2) middle.push([3, 'run'])
    if (f.busiest) middle.push([3.5, 'busiest'])
    if (f.hour !== null) middle.push([4, 'hours'])
    if (f.minutes >= 1) middle.push([5, 'focus'])
    if (f.sites.length) middle.push([5.5, 'sites'])
    if (f.planRows.length) middle.push([6, 'plan'])
    // Rank by book-first weight + a little luck, then keep at most MOST-3. Never drop notes,
    // reading or focus when they earned a place: the probe (and the person) expects them.
    const ranked = middle.map(([rank, kind]) => [rank + rand() * 1.2, kind] as const).sort((a, b) => a[0] - b[0]).map(([, kind]) => kind)
    const must = new Set<Kind>((['notes', 'reading', 'focus'] as Kind[]).filter((k) => ranked.includes(k)))
    const order: Kind[] = []
    const room = MOST - 3
    for (const kind of ranked) {
      if (order.length >= room) break
      const mustLeft = [...must].filter((k) => !order.includes(k)).length
      if (!must.has(kind) && room - order.length <= mustLeft) continue
      order.push(kind)
    }
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
  // Collage is look-only inside Wrapped: never open a note, never step the story aside.
  void onLeave

  const { p, world } = look
  const kind = kinds[at]
  const variant = Math.floor(seeded(seed + at * 31)() * 3)
  // Quiet stays near ink so night leads stay bright and cream captions stay dark (08-faint-headline).
  const quiet = `color-mix(in srgb, ${p.ink} 92%, ${p.bg})`
  // Same Settings › Grain as the dark frame: one SVG, one switch. Never a second cheap noise layer.
  const settings = useLive(haligtree.settings, null as Settings | null)
  const grainOn = settings?.frameGrain !== false
  return (
    <motion.div role="dialog" aria-modal aria-label={facts?.title ?? 'Wrapped'} data-wrap-story={id} data-wrap-world={world}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }} transition={{ duration: 0.25 }}
      className="fixed inset-0 z-50 grid place-items-center overflow-hidden [-webkit-app-region:no-drag]" style={{ background: STAGE.dim }}
      // Closed by a click that began and ended on the dim, never by a drag let go over it.
      onPointerDown={(event) => void (downOnDim.current = event.target === event.currentTarget)} onClick={(event) => event.target === event.currentTarget && downOnDim.current && onClose()}>
      <Backdrop p={p} hue={HUES[at % HUES.length]} />
      {/* A wide card over the dimmed app; on a small window, the whole window, as on a phone. The app's own pieces inside
          (the flowing row of pictures, the week's paragraph) read the card's ink and paper through the theme's names. */}
      <motion.div ref={shown} data-wrap-card={kind ?? 'loading'} data-wrap-grain={grainOn ? '' : undefined} data-wrap-paper={light(p.bg) ? '' : undefined}
        initial={still() ? false : { opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        className="wrap-card @container relative flex flex-col overflow-hidden"
        style={{ background: p.bg, color: p.ink, boxShadow: STAGE.shadow, perspective: '1400px', '--wrap-quiet': quiet, '--wrap-bg': p.bg, '--foreground': p.ink, '--muted-foreground': quiet, '--mf-muted-strong': quiet, '--background': p.bg } as React.CSSProperties}>
        {/* No card Silk: night aurora read as Spotify smoke (07-gems-smoke). Texture is Settings › Grain only. */}
        <div className="relative z-[2] min-h-0 flex-1" onPointerDown={(event) => void (pressedAt.current = event.clientX)} onClick={(event) => {
          // Collage (photos, slips, stamps, page leaf) never turns the card; only empty story ground and chrome do.
          if (Math.abs(event.clientX - pressedAt.current) > 6 || (event.target as HTMLElement).closest('button, a, [data-wrap-flow], [data-wrap-collage], [data-wrap-folder], [data-wrap-cover], [data-picture-row]')) return
          const box = event.currentTarget.getBoundingClientRect()
          go(event.clientX - box.left > box.width / 3 ? at + 1 : at - 1)
        }}>
          {/* Z-push through the journal: the next page comes from depth, the last pushes past — never a sideways slideshow. */}
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            {facts && ready && kind && (
              <motion.div key={at} className="absolute inset-0 origin-center"
                style={{ transformStyle: 'preserve-3d' }}
                initial={byKey || still() ? false : { opacity: 0, transform: shift(dir > 0 ? 'scale(0.88) translateZ(-72px)' : 'scale(1.06) translateZ(36px)') }}
                animate={{ opacity: 1, transform: shift('scale(1) translateZ(0px)'), transition: still() ? { duration: 0.12 } : { type: 'spring', stiffness: 240, damping: 26 } }}
                custom={dir}
                variants={{
                  gone: (to: number) => ({
                    opacity: 0,
                    transform: shift(to > 0 ? 'scale(1.08) translateZ(48px)' : 'scale(0.9) translateZ(-56px)'),
                    transition: { duration: byKey ? 0 : 0.22, ease: EASE }
                  })
                }}
                exit="gone">
                <Card kind={kind} f={facts} look={look} variant={variant} seed={seed + at} wide={wide} lead={leadFor(kind)} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {/* Progress + close: real top breathing room on cream and ink alike (never flush to the card edge). */}
        <div data-wrap-chrome className="absolute inset-x-0 top-0 z-20 flex items-center gap-3 px-5 pt-7">
          <div className="flex flex-1 gap-1.5">
            {/* One card has nowhere to turn: no bars for it. */}
            {kinds.length > 1 && kinds.map((one, index) => (
              <button key={one} type="button" aria-label={`Card ${num(index + 1)} of ${num(kinds.length)}`} aria-current={index === at || undefined} onClick={() => go(index)}
                className="h-1 flex-1 cursor-pointer rounded-[2px] transition-opacity duration-200" style={{ background: p.ink, opacity: index <= at ? 0.9 : 0.25 }} />
            ))}
          </div>
          <Tip label="Close  Esc"><button type="button" aria-label="Close" onClick={onClose} className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full transition-opacity hover:opacity-70" style={{ color: p.ink }}><X className="size-4" /></button></Tip>
        </div>
        <div data-wrap-keep className="absolute right-4 bottom-4 z-20 flex h-8 items-center gap-2">
          <AnimatePresence>
            {/* The report card is the one to keep; the quiet card is nothing to share. */}
            {at === last && kinds[last] === 'report' && (
              <motion.div key="keep" className="flex items-center gap-2" initial={still() ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.3, delay: 0.7 } }} exit={{ opacity: 0, transition: { duration: 0.1 } }}>
                <button type="button" data-wrap-copy onClick={() => void keep(false)} className="h-8 cursor-pointer rounded-full px-3.5 text-[13px] font-semibold active:scale-[0.97]" style={{ background: p.ink, color: p.bg }}>Copy as image</button>
                <button type="button" data-wrap-save onClick={() => void keep(true)} className="h-8 cursor-pointer rounded-full px-3.5 text-[13px] font-semibold active:scale-[0.97]" style={{ boxShadow: `inset 0 0 0 1.5px ${p.ink}`, color: p.ink }}>Save as image…</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {at !== last && <span data-wrap-brand className="pointer-events-none absolute bottom-5 left-5 z-20 text-[11px] font-bold tracking-[0.08em] uppercase"
          style={{ color: kind === 'notes' || kind === 'well' || kind === 'pictures' ? STAGE.paperInk : 'var(--wrap-quiet)' }}>{APP_NAME}</span>}
      </motion.div>
    </motion.div>
  )
}

/** Each world's own chimes: a turn, and the last card. */
const WORLD_CUES: Record<World, { turn: Cue; last: Cue }> = {
  files: { turn: 'page', last: 'wrapped' },
  night: { turn: 'riffle', last: 'reveal' }
}

/** A paper is light when its red is over half: the light inside it is kept fainter there, so the ink stays sharp. */
const light = (hex: string): boolean => parseInt(hex.slice(1, 3), 16) > 128

/**
 * Behind the card: the app dimmed, and over it a slow aurora in the look's colours (Silk, see-through), its hue turning
 * a little on each card; a vignette at the edges. The light alone moves, on the GPU, at a quarter of the pixels; it
 * stops while the window is hidden and is one still frame with Motion off or Reduce motion.
 */
function Backdrop({ p, hue }: { p: Palette; hue: number }): React.JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <Silk clear base={p.bg} a={p.glow[0]} b={p.glow[1]} hue={hue} strength={0.62} className="absolute inset-0 size-full opacity-80" />
      <div className="absolute inset-0" style={{ background: STAGE.vignette }} />
    </div>
  )
}

type Look = { world: World; p: Palette; intro: string; outro: string; folder: string; entrance: (typeof ENTRANCES)[number] }
/** An empty month says so, rather than promising cards it does not have. */
const opening = (f: Facts, line: string): string => (!f.captures && !f.minutes ? `A quiet ${f.period}: nothing caught or focused on yet.` : fill(line, f.name, f.period))
const fill = (line: string, name: string, period: string): string => line.replaceAll('{name}', name).replaceAll('{period}', period).replace(/^./, (c) => c.toUpperCase())
const and = (words: string[]): string => new Intl.ListFormat('en', { type: 'conjunction' }).format(words)
/** A site's name that breaks only after its dots: news.ycombinator.com never splits mid-word. */
const siteWords = (site: string): ReactNode => site.length <= 16 ? <span className="whitespace-nowrap">{site}</span> : site.split(/(?<=\.)/).map((part, i) => <span key={i}>{i ? <wbr /> : null}{part}</span>)
/** A length kept on one line in a heading: "3 h 30 min", never "3" at a line's end and "h 30 min" under it. */
const held = (minutes: number): string => howLong(minutes).replace(/ /g, '\u00a0')

const BIG = 'font-heading text-[clamp(28px,6cqi,50px)] leading-[1.02] font-semibold tracking-[-0.02em] break-words'
const HUGE = 'font-heading text-[clamp(52px,14cqi,120px)] leading-[0.9] font-semibold tracking-[-0.03em]'
/** A long heading steps down by its length, so a long tag or site still sits in two or three lines. */
const fit = (text: string): string => (text.length <= 16 ? BIG : text.length <= 30 ? 'font-heading text-[clamp(24px,4.6cqi,38px)] leading-[1.05] font-semibold tracking-[-0.02em] break-words' : 'font-heading text-[clamp(20px,3.4cqi,28px)] leading-[1.1] font-semibold tracking-[-0.02em] break-words')
/** A line under a heading or number, saying what it counts: never a label above one. */
const CAPTION = 'mt-3 text-[15px] leading-snug font-semibold text-(--wrap-quiet) text-pretty'
/** A card with one thing to say says it alone, centred and large: never a big word beside a half-empty column. */
const SOLO_CAPTION = 'mx-auto mt-4 max-w-[44ch] text-[17px] leading-snug font-semibold text-(--wrap-quiet) text-balance'
/** A lone heading (one tag, one site) as large as its length lets it be, still in two or three lines at most. */
const solo = (text: string): string => `font-heading ${text.length <= 12 ? 'text-[clamp(44px,11cqi,92px)] leading-[0.95]' : text.length <= 24 ? 'text-[clamp(34px,7.4cqi,64px)] leading-[1]' : 'text-[clamp(26px,5.2cqi,44px)] leading-[1.05]'} font-semibold tracking-[-0.03em] break-words text-balance`
/** A list is drawn only with this many in it; fewer are said in the card's sentence instead. */
const LIST = 3

/** Two halves on a wide card, one above the other on a narrow one; a seeded variant flips them. */
function Split({ a, b, flip }: { a: ReactNode; b: ReactNode; flip: boolean }): React.JSX.Element {
  return (
    <div className="relative grid h-full grid-rows-[auto_1fr] gap-5 px-7 pt-16 pb-14 @2xl:grid-cols-2 @2xl:grid-rows-1 @2xl:items-center @2xl:gap-8 @2xl:px-12">
      <div className={`min-w-0 ${flip ? '@2xl:order-2' : ''}`}>{a}</div>
      <div className="relative min-h-0 min-w-0 self-stretch">{b}</div>
    </div>
  )
}

/** One centred line or two, for the first and last cards where there is nothing to chart. */
function Centre({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="relative grid h-full content-center justify-items-center gap-4 px-8 pt-16 pb-14 text-center @2xl:px-20">{children}</div>
}

/** A few lines ranked, the way the report card lists them. */
function Ranked({ rows, accent }: { rows: { name: string; n: number }[]; accent: string }): React.JSX.Element {
  return (
    <ol className="grid h-full min-w-0 grid-cols-1 [align-content:safe_center] gap-2">
      {rows.map((row, i) => (
        <In key={row.name} at={0.22 + i * 0.05} from="pop" pace="snap" className="min-w-0">
          <li className="flex items-baseline gap-3 text-[clamp(16px,2.6cqi,22px)] font-bold">
            <span className="w-5 shrink-0 tabular-nums" style={{ color: accent }}>{i + 1}</span>
            <span className="min-w-0 flex-1 truncate" dir="auto">#{row.name}</span>
            <span className="shrink-0 text-[13px] tabular-nums text-(--wrap-quiet)">{plural(row.n, 'capture')}</span>
          </li>
        </In>
      ))}
    </ol>
  )
}

/**
 * Kinetic line with a brief human slip, then the real words type in — Midori
 * hand, never a neon typewriter gag.
 */
function CorrectedTyped({ text }: { text: string }): React.JSX.Element {
  const first = text.trim().split(/\s+/)[0] ?? ''
  const slip = first.length >= 4
    ? `${first.slice(0, 1)}${first[2]}${first[1]}${first.slice(3)}`
    : first.length ? `${first}e` : ''
  if (still() || !slip || slip === first) return <Typed story text={text} />
  return (
    <span className="relative inline">
      <motion.span aria-hidden className="pointer-events-none absolute left-0 top-0 font-hand text-[0.95em] line-through decoration-[1.5px]"
        style={{ color: 'color-mix(in srgb, currentColor 55%, transparent)' }}
        initial={{ opacity: 0.7, y: 0 }} animate={{ opacity: 0, y: -3 }}
        transition={{ delay: 0.32, duration: 0.22, ease: EASE }}>{slip}</motion.span>
      <Typed story text={text} delay={780} />
    </span>
  )
}

/** Bars, one a row, each with its name and what it stands for in words: the first in the loud colour. */
// `of`: each row's own whole (a read's minutes of its reading time), so a bar is its share of that, never of the longest row.
function Rows({ rows: all, p, wide, small = 3 }: { rows: { name: ReactNode; key: string; said: string; n: number; of?: number }[]; p: Palette; wide: boolean; /** How many on a small card: fewer under a tall heading. */ small?: number }): React.JSX.Element {
  // Three on a small card, so the list never reaches the card's foot.
  const rows = all.slice(0, wide ? 5 : small)
  const most = Math.max(1, ...rows.map((row) => row.n))
  return (
    <div data-wrap-rows className="grid h-full grid-cols-1 [align-content:safe_center] gap-4">
      {rows.map((row, i) => (
        <In key={row.key} at={0.3 + i * 0.07} from="left" className="min-w-0">
          <p className="flex items-baseline gap-3 text-[15px] font-semibold"><span className="min-w-0 flex-1 truncate" dir="auto">{row.name}</span><span className="shrink-0 tabular-nums">{row.said}</span></p>
          <motion.div className="mt-1.5 h-2 origin-left rounded-none" style={{ width: `${Math.max(2, Math.min(1, row.n / (row.of ?? most)) * 100)}%`, background: i ? `color-mix(in srgb, ${p.ink} 55%, ${p.bg})` : p.accent }}
            initial={still() ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.4 + i * 0.07, duration: 0.4, ease: EASE }} />
        </In>
      ))}
    </div>
  )
}

/** The span's days as a calendar, a week a row: run days as stamp-ink washes, busy days as graphite marks, quiet days a faint ruled box. Never app-calendar pills. */
function Calendar({ f, p }: { f: Facts; p: Palette }): React.JSX.Element {
  const busy = new Set(f.busy)
  const first = dayjs(f.from).startOf('week')
  const cells: (string | null)[] = []
  for (let day = first; dayKey(day) <= f.to || cells.length % 7; day = day.add(1, 'day')) cells.push(dayKey(day) >= f.from && dayKey(day) <= f.to ? dayKey(day) : null)
  // A week is one row, large enough to read at a glance; a month's four or five rows smaller, to fit beside its number.
  const week = cells.length <= 7
  const size = week ? 'size-[clamp(30px,6cqi,48px)] text-[14px]' : 'size-[clamp(18px,3.6cqi,28px)] text-[11px]'
  const lean = (i: number): number => ((i * 17) % 5) - 2
  return (
    <div data-wrap-calendar className="grid h-full place-items-center">
      <div className="grid grid-cols-7 gap-[clamp(4px,0.7cqi,6px)] p-2" style={{ background: `color-mix(in srgb, ${p.ink} 4%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${p.ink} 10%, transparent)` }}>
        {Array.from({ length: 7 }, (_, i) => <span key={`d${i}`} className={`${size} grid place-items-center text-[10px] font-semibold uppercase tracking-[0.08em] text-(--wrap-quiet)`}>{first.add(i, 'day').format('dd')[0]}</span>)}
        {cells.map((day, i) => {
          if (!day) return <span key={i} className={size} />
          const inRun = day >= f.runFrom && day <= f.runTo
          return (
            <motion.span key={day} data-day={day} data-run={inRun || undefined} className={`${size} grid place-items-center leading-none font-semibold tabular-nums`}
              style={{
                rotate: `${lean(i)}deg`,
                ...(inRun
                  ? { background: `color-mix(in srgb, ${p.accent} 88%, ${p.ink})`, color: p.bg, clipPath: 'polygon(4% 2%, 98% 0%, 100% 96%, 2% 100%)' }
                  : busy.has(day)
                    ? { background: `color-mix(in srgb, ${p.ink} 22%, ${p.bg})`, color: p.ink, clipPath: 'polygon(1% 3%, 100% 1%, 97% 100%, 0% 96%)' }
                    : { boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${p.ink} 18%, ${p.bg})`, color: 'var(--wrap-quiet)' })
              }}
              initial={still() ? false : { opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 + i * 0.012, type: 'spring', stiffness: 400, damping: 24 }}>
              {dayjs(day).date()}
            </motion.span>
          )
        })}
      </div>
    </div>
  )
}

/** The hour most captures came in, when there are 8 or more and it holds more than the next hour does; else null. */
const thinkingHour = (hours: number[]): number | null => {
  const total = hours.reduce((sum, n) => sum + n, 0)
  const order = hours.map((n, hour) => [n, hour] as const).sort((a, b) => b[0] - a[0])
  return total >= 8 && order[0][0] > order[1][0] ? order[0][1] : null
}
const hourSaid = (hour: number): string => `${hour}:00`

/** The voice each look speaks in (main/wrap-lines.ts VOICES): pulp crime for every look, the user's pick (21 Nov). */
const VOICE: Record<World, Voice> = { files: 'pulp', night: 'pulp' }

/**
 * Each page's lead-in as a plain statement, written here from its facts, never a number (the page's sentence says
 * those): "You caught more than last week.", "Tuesday was your busiest day by far." The model only says it again
 * (main/wrap-lines.ts), keeping its lean and the things it names. Every page a story could show, whichever this open
 * picks, so the lead-ins are kept per story and not per open. Only pages with a change to state or a thing to name.
 */
/** A statement that compares with last time ("more than last month", "new this month"), which no page's own sentence says. */
const againstLast = (page: WrapPage): boolean => page.lean !== null || page.names.includes('new')

function wrapSays(f: Facts): WrapPage[] {
  const last = `last ${f.period}`
  const lean = (now: number, before: number): Lean => (!before ? (now ? 'up' : 'same') : now > before * 1.3 ? 'up' : now < before * 0.77 ? 'down' : 'same')
  const moved: Record<Exclude<Lean, null>, string> = { up: 'more than', down: 'less than', same: 'as much as' }
  const pages: WrapPage[] = []
  const page = (kind: Kind, says: string, leans: Lean = null, names: string[] = []): void => void pages.push({ page: kind, says, lean: leans, names, span: f.period })
  const caught = lean(f.captures, f.before.captures)
  const focused = lean(f.minutes, f.before.minutes)
  if (f.captures) page('intro', `You caught ${moved[caught!]} ${last}.`, caught)
  else if (f.minutes >= 1) page('intro', `You focused ${moved[focused!]} ${last}.`, focused)
  if (f.tags.length) {
    const top = f.tags[0].name
    const had = f.before.tags.find((one) => one.name === top)?.n ?? 0
    if (!had) page('tags', `#${top} was new this ${f.period}.`, null, [top, 'new'])
    else if (f.tags[0].n > had * 1.3) page('tags', `#${top} came up more than ${last}.`, 'up', [top])
    else page('tags', `#${top} came up most this ${f.period}.`, null, [top])
  } else if (f.captures) page('tags', 'None of it was tagged.')
  if (f.minutes >= 1) page('focus', `You focused ${moved[focused!]} ${last}.`, focused)
  if (f.busiest) {
    const counts = Object.values(f.days).filter((n) => n > 0).sort((a, b) => a - b)
    const usual = counts.length ? counts[Math.floor((counts.length - 1) / 2)] : 0
    const day = dayjs(f.busiest.day).format('dddd')
    page('busiest', `${day} was your busiest day${usual > 0 && f.busiest.n >= usual * 2 ? ' by far' : ''}.`, null, [day])
  }
  if (f.hour !== null) {
    const time = f.hour >= 5 && f.hour < 12 ? 'morning' : f.hour >= 12 && f.hour < 17 ? 'afternoon' : f.hour >= 17 && f.hour < 22 ? 'evening' : 'night'
    page('hours', `Your ideas came in the ${time}.`, null, [time])
  }
  const kind = f.kind.toLowerCase()
  page('outro', `This ${f.period}, you were ${kind === 'quiet' ? 'quiet' : `a ${kind}`}.`, null, kind === 'quiet' ? [] : [kind])
  return pages
}

/** The busiest days: every day with the most captures, so a tie is lit and said as one, never one of two equal bars. */
const busiestDays = (f: Facts): string[] => {
  const most = Math.max(0, ...Object.entries(f.days).filter(([day]) => day >= f.from && day <= f.to).map(([, n]) => n))
  return most ? Object.keys(f.days).filter((day) => day >= f.from && day <= f.to && f.days[day] === most).sort() : f.busiest ? [f.busiest.day] : []
}

/**
 * Each day of the span as a bar of its captures, on one height scale, the busiest lit and the rest muted. A week's
 * seven bars each carry their count over them and their day under them; a month's thirty are too many to label, so
 * only the busiest says its count and the first and last dates sit under the row.
 */
function DayBars({ f, p }: { f: Facts; p: Palette }): React.JSX.Element {
  const days: string[] = []
  for (let day = dayjs(f.from); dayKey(day) <= f.to; day = day.add(1, 'day')) days.push(dayKey(day))
  const lit = new Set(busiestDays(f).map((day) => days.indexOf(day)))
  const each = days.length <= 7
  return <Bars p={p} mark="days" values={days.map((day) => f.days[day] ?? 0)} lit={lit} ticks={each ? days.map((day) => dayjs(day).format('ddd')) : undefined} under={each ? [] : [dayjs(f.from).format('D MMM'), dayjs(f.to).format('D MMM')]} />
}
/** The day's 24 hours as bars of the span's captures, the thinking hour lit the same way. */
const HourBars = ({ f, p }: { f: Facts; p: Palette }): React.JSX.Element => <Bars p={p} mark="hours" values={f.hours} lit={new Set(f.hour === null ? [] : [f.hour])} under={['midnight', 'noon', '23:00']} />

/**
 * A row of bars on one scale: `lit` in the loud colour, the rest muted. With `ticks` (a few bars) every bar has its
 * count over it and its tick under it; without, only the lit ones say their count, and the words `under` spread beneath.
 */
function Bars({ p, mark, values, lit, ticks, under }: { p: Palette; mark: string; values: number[]; lit: Set<number>; ticks?: string[]; under: string[] }): React.JSX.Element {
  const most = Math.max(1, ...values)
  const few = !!ticks
  return (
    <div {...{ [`data-wrap-${mark}`]: '' }} className="grid h-full content-center">
      <div className={`flex h-[clamp(96px,24cqi,180px)] items-end pt-7 ${few ? 'gap-2.5' : 'gap-[3px]'}`}>
        {values.map((n, i) => {
          const top = lit.has(i)
          return (
            <div key={i} className="relative flex h-full flex-1 items-end justify-center">
              {(top || few) && <span data-wrap-peak={top || undefined} className="absolute left-1/2 -translate-x-1/2 text-[13px] font-black whitespace-nowrap tabular-nums" style={{ bottom: `calc(${(n / most) * 100}% + 5px)`, color: top ? p.accent : 'var(--wrap-quiet)' }}>{num(n)}</span>}
              <motion.div className={`w-full origin-bottom rounded-[2px] ${few ? 'max-w-[40px]' : 'max-w-2'}`} style={{ height: n ? `max(4px, ${(n / most) * 100}%)` : '2px', background: top ? p.accent : n ? `color-mix(in srgb, ${p.ink} 34%, ${p.bg})` : `color-mix(in srgb, ${p.ink} 16%, ${p.bg})` }}
                initial={still() ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 0.3 + i * (few ? 0.04 : 0.012), duration: 0.36, ease: EASE }} />
            </div>
          )
        })}
      </div>
      {few
        ? <div className="mt-2 flex gap-2.5 text-[12px] font-semibold text-(--wrap-quiet)">{ticks.map((tick, i) => <span key={i} className="flex-1 text-center" style={lit.has(i) ? { color: p.accent } : undefined}>{tick}</span>)}</div>
        : <div className="mt-2 flex justify-between text-[12px] font-semibold text-(--wrap-quiet)">{under.map((word) => <span key={word}>{word}</span>)}</div>}
    </div>
  )
}

/** One card: its words in front, its own chart or your own pictures beside them, laid out for the width it has. */
// `lead`: a few words written on this Mac from the page's facts (wrapFacts), over its words; the page's own sentence
// under it says every number.
function Card({ kind, f, look, variant, seed, wide, lead }: { kind: Kind; f: Facts; look: Look; variant: number; seed: number; wide: boolean; lead?: string }): React.JSX.Element {
  const { p, world } = look
  const e = look.entrance
  const flip = variant === 1
  const top = f.tags.slice(0, 5)
  const night = world === 'night'
  const kicker = lead ? <In at={0.05} from={e}><p data-wrap-lead className="mb-3 text-[15px] leading-snug font-semibold text-pretty" style={{ color: p.ink }}>{lead}</p></In> : null
  const split = (a: ReactNode, b: ReactNode): ReactElement => <Split a={<>{kicker}{a}</>} b={b} flip={flip} />
  const caption = (own: ReactNode): ReactElement => <p className={CAPTION}>{own}</p>
  /** Headlines on a cream journal page: graphite ink, never the night palette's pale wash. */
  const pageHead = (own: ReactNode, className = BIG): ReactElement => <h2 className={className} style={{ color: STAGE.paperInk }}>{own}</h2>
  const pageCap = (own: ReactNode): ReactElement => <p className={CAPTION} style={{ color: `color-mix(in srgb, ${STAGE.paperInk} 82%, ${STAGE.paper})` }}>{own}</p>
  const pageLead = lead ? <In at={0.05} from={e}><p data-wrap-lead className="mb-3 text-[15px] leading-snug font-semibold text-pretty" style={{ color: `color-mix(in srgb, ${STAGE.paperInk} 82%, ${STAGE.paper})` }}>{lead}</p></In> : null
  /** One thing to say, alone in the middle of the card: the lead-in, the heading, then its sentence under it. */
  const alone = (head: ReactNode, said: ReactNode, more?: ReactNode): ReactElement => (
    <Centre>
      {/* Quiet blotter behind a lone number so the card is still a desk, not empty air. No KEPT badge. */}
      <div aria-hidden data-wrap-collage className="pointer-events-none absolute inset-[8%] -z-10 opacity-60" style={{
        background: `color-mix(in srgb, ${p.accent} 10%, ${p.soft})`,
        backgroundImage: 'var(--wrap-paper-grain)',
        backgroundSize: '120px',
        clipPath: 'polygon(0.5% 1.2%, 99% 0.3%, 100% 98.5%, 1% 99.2%)'
      }} />
      <LampWash ink={p.ink} accent={p.accent} className="pointer-events-none -z-10 opacity-70" />
      {kicker}<In at={0.18} from={e} pace="linger">{head}</In><In at={0.58} pace="linger"><p className={SOLO_CAPTION}>{said}</p></In>{more && <In at={0.78} from="lift" pace="snap" className="w-full">{more}</In>}
    </Centre>
  )

  /**
   * Open Midori on a desk: blotter, deckled page, photo print or kept slip,
   * stamp, margin scrap, worn tapes — layered density, never one lonely motif.
   */
  const cover = (picture: Picture | undefined): ReactElement => (
    <div data-wrap-cover data-wrap-collage className="absolute inset-0 [container-type:size]"
      onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
      <In at={0.1} from="scale" className="absolute inset-0">
        <JournalField ink={STAGE.paperInk} paper={STAGE.paper} accent={p.accent} grid="dot" className="absolute inset-0">
          <div className="absolute inset-0 px-[14%] pt-5 pb-6 pr-5 text-left">
            <div className="mb-3 flex items-start justify-between gap-2">
              <p className="m-0 text-[11px] font-semibold tracking-[0.06em] uppercase" style={{ color: `color-mix(in srgb, ${STAGE.paperInk} 72%, ${STAGE.paper})` }}>subject</p>
              <DateStamp label={dayjs(f.to).format('MMM D').toUpperCase()} color={p.accent} seed={seed + 7} />
            </div>
            {picture
              ? <TippedPrint src={picture.stored ?? picture.src} alt={picture.title} ink={STAGE.paperInk} paper={STAGE.paper} className="mb-3 h-[48%] w-[88%] max-w-[300px]" />
              : null}
            <InkLine className="text-[clamp(18px,3.4cqi,26px)]" style={{ color: STAGE.paperInk }}>{f.name}</InkLine>
            <p className="mt-2 text-[14px] leading-snug font-semibold" style={{ color: `color-mix(in srgb, ${STAGE.paperInk} 78%, ${STAGE.paper})` }}>
              {f.period === 'month' ? f.name : `the week of ${dayjs(f.from).format('D MMMM')}`}
            </p>
            <KraftTape kind="washi" seed={seed + 3} wear={0.55} tint={`color-mix(in srgb, ${p.accent} 20%, #d8c9a8)`}
              className="absolute bottom-[14%] left-[16%] w-[32%] rotate-[-5deg]" />
          </div>
        </JournalField>
      </In>
    </div>
  )

  const body = ((): ReactElement => {
    switch (kind) {
      case 'quiet': {
        // Said plainly: there is not much yet, here is what there is, and when it becomes a story.
        const now = dayKey() <= f.to
        const head = f.period === 'week' ? (now ? 'Not much to wrap yet this week' : `Not much to wrap for ${f.name}`) : `Not much to wrap in ${f.name}${now ? ' yet' : ''}`
        const names = (titles: string[]): string => (titles.length && titles.length <= LIST ? `: ${and(titles.map((one) => quoted(one, 60)))}` : '')
        const there = [
          f.pages.length && `${plural(f.pages.length, 'page')} kept${names(f.pages)}`,
          f.gems && `${plural(f.gems, 'gem')} kept${names(f.notesLabel === 'Gems kept' ? f.notes : [])}`,
          f.captures && `${plural(f.captures, 'thing')} caught`,
          f.minutes >= 1 && `${plural(f.minutes, 'minute')} focused`,
          f.reads.finished && `${plural(f.reads.finished, 'article')} finished`
        ].filter((one): one is string => !!one)
        return (
          <Centre>
            <In at={0.2} from={e} pace="linger"><h2 data-wrap-quiet-head className={`${BIG} text-balance`}>{head}</h2></In>
            {there.length > 0 && <In at={0.48} pace="linger"><ul data-wrap-quiet-has className="mt-4 space-y-1 text-[19px] leading-snug font-bold">{there.map((line) => <li key={line} dir="auto">{line}</li>)}</ul></In>}
            <In at={0.68} pace="linger"><p className={SOLO_CAPTION}>{there.length ? 'Once a few more things are caught, kept or focused on, this becomes a few cards.' : 'Nothing caught, kept or focused on yet. Once a few things are, this becomes a few cards.'}</p></In>
          </Centre>
        )
      }
      case 'intro':
        if (night) return <Centre>{kicker}<In at={0.16} from={e} pace="linger"><h2 className="font-heading text-[clamp(40px,10cqi,84px)] leading-[0.95] font-semibold tracking-[-0.03em] text-balance" style={{ color: p.accent }}>{f.title}</h2></In><In at={0.55} from={e} pace="linger"><p className="max-w-[34ch] text-[17px] leading-snug font-semibold"><CorrectedTyped text={opening(f, look.intro)} /></p></In></Centre>
        return split(<>
          <In at={0.16} from={e} pace="linger"><h2 className={`${BIG} mt-2`}>{f.title}</h2></In>
          <In at={0.55} from={e} pace="linger"><p className="mt-4 text-[17px] leading-snug font-semibold"><CorrectedTyped text={opening(f, look.intro)} /></p></In>
        </>, cover(f.heroes[0]))
      case 'tags': {
        if (!top.length) return alone(<div className={HUGE} style={{ color: p.accent }}><Roll n={f.captures} /></div>, <>{f.captures === 1 ? 'thing caught' : 'things caught'} this {f.period}, none of them tagged</>)
        const lead = `#${top[0].name}`
        const most = <>came up most: {plural(top[0].n, 'capture')} of the {num(f.captures)} {f.captures === 1 ? 'thing' : 'things'} you caught</>
        if (top.length < LIST) return alone(<h2 className={solo(lead)} style={{ color: p.accent }} dir="auto">{lead}</h2>, <>{most}{top[1] ? <>, then <span dir="auto">#{top[1].name}</span> with {plural(top[1].n, 'capture')}</> : null}.</>)
        return split(<><In at={0.12}><h2 className={fit(lead)} style={{ color: p.accent }} dir="auto">{lead}</h2></In><In at={0.45}>{caption(most)}</In></>, <Ranked rows={top} accent={p.accent} />)
      }
      case 'focus': {
        // Counted in minutes, as Spotify counts listening: a whole number that rolls up, never hours rounded up or down;
        // past an hour the sentence says it in hours too.
        const big = f.minutes
        const unit = `${f.minutes === 1 ? 'minute' : 'minutes'} of focus${f.minutes >= 60 ? ` (${howLong(f.minutes)})` : ''}`
        const number = <div className={HUGE} style={{ color: p.accent }}><Roll n={big} /></div>
        const [one, two] = f.focusTasks
        if (f.focusTasks.length < LIST)
          return alone(number, <>{unit}, over {plural(f.sessions, 'session')}{one ? <>. {howLong(one.minutes)} of it on {quoted(one.name, 60)}{two ? <>, {howLong(two.minutes)} on {quoted(two.name, 60)}</> : null}</> : null}.</>)
        // Each task's bar is its share of all the focus, so the bars and the big number agree.
        return split(<><In at={0.12}>{number}</In><In at={0.45}>{caption(<>{unit}, over {plural(f.sessions, 'session')}. Where most of it went:</>)}</In></>,
          <Rows p={p} wide={wide} small={2} rows={f.focusTasks.map((task) => ({ key: task.name, name: task.name, said: howLong(task.minutes), n: task.minutes, of: Math.max(1, f.minutes) }))} />)
      }
      case 'sites': {
        const [first, ...rest] = f.sites
        const total = f.sites.reduce((n, one) => n + one.count, 0)
        const head = <>Kept you off <span style={{ color: p.accent }}>{siteWords(first.site)}</span> {timesSaid(first.count)} this {f.period}</>
        if (f.sites.length < LIST) return alone(<h2 className={fit(first.site)}>{head}</h2>, rest.length ? `and ${rest[0].site} ${timesSaid(rest[0].count)}: sent away ${plural(total, 'time')} while you focused.` : 'The one site it had to send away while you focused.')
        return split(<><In at={0.12}><h2 className={fit(first.site)}>{head}</h2></In>
          <In at={0.45}>{caption(<>{`and ${and(rest.slice(0, 2).map((one) => `${one.site} ${timesSaid(one.count)}`))}${rest.length > 2 ? `, and ${plural(rest.length - 2, 'more site')}` : ''}: sent away ${plural(total, 'time')} while you focused.`}</>)}</In></>,
          <Rows p={p} wide={wide} rows={f.sites.slice(0, 5).map((one) => ({ key: one.site, name: one.site, said: timesSaid(one.count), n: one.count }))} />)
      }
      case 'reading': {
        // Finished means its end reached with half its reading time spent on it: said under the number, so it is never a guess.
        const { total, finished, left } = f.reads
        const head = <h2 className={BIG}>You finished {num(finished)} of {plural(total, 'article')} you opened.</h2>
        const said = `Finished means its end reached with at least half its reading time spent on it.${left.length ? ` ${num(left.length)} left part way, to pick back up${left.length < LIST ? `: ${and(left.map((one) => quoted(one.title, 50)))}` : ''}.` : ''}`
        if (left.length < LIST) return alone(head, said)
        return split(<><In at={0.12}>{head}</In><In at={0.45}>{caption(said)}</In></>,
          <Rows p={p} wide={wide} rows={left.slice(0, 5).map((one, i) => ({ key: `${one.title}${i}`, name: one.title, said: `${one.minutes < 1 ? 'under a minute' : `${num(one.minutes)} min`} of ${num(Math.max(1, one.needs))}`, n: one.minutes, of: Math.max(1, one.needs) }))} />)
      }
      case 'plan': {
        const rows = [...f.planRows].sort((a, b) => Math.abs(b.did - b.planned) - Math.abs(a.did - a.planned)).slice(0, wide ? 4 : 2)
        const most = Math.max(1, ...rows.flatMap((row) => [row.planned, row.did]))
        const head = <h2 className={BIG}>You planned {held(f.planned)}{f.did ? ` and did ${held(f.did)}` : ''}.</h2>
        const said = <>on {plural(f.planRows.length, 'task')} with a time planned and a date this {f.period}</>
        const bars = (
          <div className="grid h-full w-full grid-cols-1 [align-content:safe_center] gap-4 text-left">{rows.map((row, i) => (
            <In key={row.name + i} at={0.3 + i * 0.07} from="left" className="min-w-0">
              <p className="truncate text-[15px] font-semibold" dir="auto">{row.name}</p>
              {/* The time planned as the track, what was done filling it: the words say both. */}
              <div className="relative mt-1.5 h-2 rounded-none" style={{ background: `color-mix(in srgb, ${p.ink} 18%, ${p.bg})`, width: `${(row.planned / most) * 100}%` }}>
                <motion.div className="absolute inset-y-0 left-0 origin-left rounded-none" style={{ background: p.accent, width: `${(row.did / Math.max(1, row.planned)) * 100}%` }} initial={still() ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.45 + i * 0.07, duration: 0.4, ease: EASE }} />
              </div>
              <p className="mt-1 text-[13px] font-semibold text-(--wrap-quiet)">{row.did ? `did ${howLong(row.did)} of ${howLong(row.planned)} planned` : `${howLong(row.planned)} planned, none done yet`}</p>
            </In>
          ))}</div>
        )
        // One or two tasks: the sentence in the middle and their bars under it, a column as wide as a line of words.
        if (rows.length < LIST) return alone(head, said, <div className="mx-auto mt-2 w-full max-w-[420px]">{bars}</div>)
        return split(<><In at={0.12}>{head}</In><In at={0.45}>{caption(said)}</In></>, bars)
      }
      case 'pictures':
        return (
          // Full journal page (refs): never an empty Spotify slide with smoke silk.
          <div data-wrap-flow data-wrap-collage className="absolute inset-0"
            onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <JournalField ink={STAGE.paperInk} paper={STAGE.paper} accent={p.accent} grid="dot" className="absolute inset-0">
              <div className="absolute inset-0 grid grid-rows-[auto_1fr] gap-4 px-[12%] pt-16 pb-10 pr-8 text-left">
                <div>
                  {pageLead}
                  <In at={0.1} pace="linger">{pageHead(f.gems ? `${plural(f.gems, 'gem')} kept, and what you saw` : 'What you saw')}{pageCap(<>{plural(f.pictures.length, 'picture and gem', 'pictures and gems')} from {f.period === 'month' ? f.name : 'this week'}</>)}</In>
                  <DateStamp label={dayjs(f.to).format('MMM D').toUpperCase()} color={p.accent} seed={41} className="mt-3" />
                </div>
                <In at={0.28} from="lift" pace="snap" className="min-h-0 min-w-0 self-stretch">
                  <PictureRow items={f.pictures} height={wide ? 300 : 190} label="Pictures and gems" onOpen={() => undefined} />
                </In>
                <KraftTape kind="washi" seed={47} wear={0.5} tint={`color-mix(in srgb, ${p.accent} 18%, #d8c9a8)`}
                  className="absolute bottom-[10%] right-[12%] w-[22%] rotate-[7deg]" />
              </div>
            </JournalField>
          </div>
        )
      case 'notes': {
        // Whole card is the journal page (refs) on cream for every world — never pale night ink on empty dark.
        const stamp = dayjs(f.to).format('MMM D').toUpperCase()
        const tip = f.heroes[0] ? { src: f.heroes[0].stored ?? f.heroes[0].src, alt: f.heroes[0].title } : undefined
        const shown = f.notes.slice(0, tip ? 4 : 6)
        return (
          <div className="absolute inset-0" data-wrap-folder>
            <JournalField ink={STAGE.paperInk} paper={STAGE.paper} accent={p.accent} grid="quad" className="absolute inset-0">
              <div className="absolute inset-0 flex flex-col px-[12%] pt-16 pb-10 pr-8 text-left @2xl:flex-row @2xl:gap-8">
                <div className="mb-4 min-w-0 @2xl:mb-0 @2xl:w-[42%] @2xl:shrink-0">
                  {pageLead}
                  <In>{pageHead(fill(look.folder, f.name, f.period))}{pageCap(f.notesLabel)}</In>
                  <DateStamp label={stamp} color={p.accent} seed={19} className="mt-4" />
                </div>
                <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                  {tip && <TippedPrint src={tip.src} alt={tip.alt} ink={STAGE.paperInk} paper={STAGE.paper} at={0.2} className="mb-3 h-[36%] w-[90%] max-w-[280px] self-end" />}
                  <ol className="relative m-0 flex list-none flex-col gap-3 p-0">
                    {shown.map((note, i) => (
                      <In key={note + i} at={0.32 + i * 0.08} from="lift" pace="snap">
                        <li className="min-w-0"><InkLine className={shown.length <= 3 ? 'text-[clamp(18px,2.8cqi,24px)]' : 'text-[clamp(15px,2.3cqi,19px)]'} style={{ color: STAGE.paperInk }}><span className="mr-2" style={{ color: p.accent }}>•</span>{quoted(note, 72)}</InkLine></li>
                      </In>
                    ))}
                  </ol>
                  {shown.length <= 3 && <MarginNote text={f.notesLabel} ink={STAGE.paperInk} paper={STAGE.paper} seed={29} className="absolute bottom-[18%] right-[4%] max-w-[40%] text-[13px]" />}
                  <KraftTape kind="washi" seed={23} wear={0.55} tint={`color-mix(in srgb, ${p.accent} 18%, #d8c9a8)`}
                    className="absolute bottom-0 left-0 w-[28%] rotate-[-4deg]" />
                </div>
              </div>
            </JournalField>
          </div>
        )
      }
      case 'well': {
        // Full-bleed journal page: handwriting in the field, date stamp, one washi — never floating slips.
        const lines = f.well.slice(0, wide ? 5 : 3)
        const stamp = dayjs(f.to).format('MMM D').toUpperCase()
        return (
          <div className="absolute inset-0">
            <JournalField ink={STAGE.paperInk} paper={STAGE.paper} accent={p.accent} grid="dot" className="absolute inset-0">
              <div className="absolute inset-0 flex flex-col px-[12%] pt-16 pb-10 pr-8 text-left">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {pageLead}
                    <In at={0.1}>{pageHead('What went well')}{pageCap('From your weekly notes')}</In>
                  </div>
                  <DateStamp label={stamp} color={p.accent} seed={31} className="mt-1 shrink-0" />
                </div>
                <div className="relative flex min-h-0 flex-1 flex-col gap-5 overflow-hidden">
                  {lines.map((line, i) => (
                    <In key={line} at={0.28 + i * 0.11} from="lift" pace={i === 0 ? 'linger' : 'snap'}>
                      <div dir="auto"><InkLine className="text-[clamp(16px,2.6cqi,22px)]" style={{ color: STAGE.paperInk }}>{quoted(line, 160)}</InkLine></div>
                      <span aria-hidden className="mt-1.5 block h-px opacity-20" style={{ background: `linear-gradient(90deg, ${STAGE.paperInk}, transparent)`, width: `${82 - i * 9}%` }} />
                    </In>
                  ))}
                </div>
                <KraftTape kind="washi" seed={44} wear={0.55} tint={`color-mix(in srgb, ${p.accent} 20%, #d8c9a8)`}
                  className="absolute bottom-[12%] right-[10%] w-[22%] rotate-[8deg]" />
              </div>
            </JournalField>
          </div>
        )
      }
      case 'run': {
        const said = <>days in a row with something caught or focused on, {dayjs(f.runFrom).format('D MMMM')} to {dayjs(f.runTo).format('D MMMM')}. Not a streak to keep: just how it went.</>
        const number = <div className={HUGE} style={{ color: p.accent }}><Roll n={f.run} /></div>
        // A week's one row of days goes under the number, wide enough to read; a month's grid beside it.
        if (f.period === 'week') return alone(number, said, <div className="mt-2"><Calendar f={f} p={p} /></div>)
        return split(<><In at={0.12}>{number}</In><In at={0.5}>{caption(said)}</In></>, <Calendar f={f} p={p} />)
      }
      case 'busiest': {
        const counts = Object.values(f.days).filter((n) => n > 0).sort((a, b) => a - b)
        const usual = counts.length ? counts[Math.floor((counts.length - 1) / 2)] : 0
        const tops = busiestDays(f)
        const n = f.days[tops[0]] ?? f.busiest?.n ?? 0
        const named = and(tops.map((day) => dayName(noon(day), 'never')))
        return split(<><In at={0.12}><h2 className={BIG}>{tops.length > 1 ? 'Your busiest days were ' : 'Your busiest day was '}<span style={{ color: p.accent }}>{named}</span></h2></In>
          <In at={0.4}>{caption(<>{plural(n, 'capture')} in one day{tops.length > 1 ? ', each' : ''}{usual && usual < n ? `, where a usual day held ${num(usual)}` : ''}.</>)}</In></>, <DayBars f={f} p={p} />)
      }
      case 'hours':
        return split(<><In at={0.12}><h2 className={BIG}>Ideas came most around <span style={{ color: p.accent }}>{hourSaid(f.hour ?? 0)}</span></h2></In>
          <In at={0.4}>{caption(<>{num(f.hours[f.hour ?? 0])} of your {plural(f.captures, 'capture')} came in that hour. A good time to keep free for thinking.</>)}</In></>, <HourBars f={f} p={p} />)
      case 'outro':
        if (night) return <Centre>{kicker}<In pace="linger"><h2 className={`${BIG} text-balance`} style={{ color: p.accent }}><CorrectedTyped text={fill(look.outro, f.name, f.period)} /></h2></In>{f.period === 'week' && <In at={0.85} pace="linger"><WrappedParagraph monday={f.from} /></In>}</Centre>
        // The second of your pictures, so the story never ends on the one it opened with; with one or none, the motif.
        return split(<><In pace="linger"><h2 className={BIG}><CorrectedTyped text={fill(look.outro, f.name, f.period)} /></h2></In>{f.period === 'week' && <In at={0.85} pace="linger"><WrappedParagraph monday={f.from} /></In>}</>, cover(f.heroes[1]))
      case 'report':
        return <Report f={f} look={look} />
    }
  })()
  return <div className="absolute inset-0 overflow-hidden">{body}</div>
}

/** The card to keep: one journal page with a tipped print, date stamp, lists — no KEPT badge. */
function Report({ f, look }: { f: Facts; look: Look }): React.JSX.Element {
  const { p } = look
  const picture = f.heroes[0]
  const month = f.period === 'month' ? f.name.split(' ')[0] : 'Week'
  const stamp = dayjs(f.to).format('MMM D').toUpperCase()
  // A tile with nothing in it is not drawn: never "None yet", a 0 or "Quiet" set large as if it were news.
  const list = (title: string, rows: string[]): ReactElement | null => rows.length ? (
    <div className="min-w-0"><p className="text-[11px] font-semibold tracking-[0.04em] uppercase text-(--wrap-quiet)">{title}</p>
      <ol className="mt-1 space-y-0.5 text-[14px] font-semibold">{rows.slice(0, 5).map((row, i) => <li key={row + i} className="truncate" dir="auto">{i + 1} {row}</li>)}</ol></div>
  ) : null
  const lists = [list('Top tags', f.tags.map((t) => `#${t.name}`)), list(f.notesLabel, f.notes)].filter(Boolean)
  const figures = [
    f.minutes > 0 && <div key="minutes"><p className="font-heading text-[clamp(26px,5cqi,40px)] leading-none font-semibold"><Roll n={f.minutes} delay={0.5} /></p><p className="mt-1 text-[11px] font-semibold text-(--wrap-quiet)">{f.minutes === 1 ? 'minute' : 'minutes'} focused</p></div>,
    f.kind !== 'Quiet' && <div key="kind" className="min-w-0"><p className="font-heading text-[clamp(20px,3.6cqi,30px)] leading-[0.95] font-semibold" style={{ color: p.accent }}>{f.kind}</p><p className="mt-1 text-[11px] font-semibold text-(--wrap-quiet)">your kind of {f.period}</p></div>
  ].filter(Boolean)
  return (
    <div className="relative grid h-full grid-rows-[minmax(0,1fr)_auto] gap-3 px-6 pt-16 pb-14 @2xl:grid-cols-[1.05fr_1fr] @2xl:grid-rows-1 @2xl:gap-5 @2xl:px-10" data-wrap-report data-wrap-collage
      onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
      <In from="scale" className="relative min-h-[64px] overflow-hidden">
        <JournalField ink={STAGE.paperInk} paper={STAGE.paper} accent={p.accent} grid="quad" className="absolute inset-0" />
        {/* Month as a vertical margin title, like ref subject labels. */}
        <div className="absolute inset-y-[8%] left-[3%] z-[2] grid w-[14%] place-items-center overflow-hidden [container-type:size]">
          <span data-wrap-month className="font-heading font-semibold whitespace-nowrap tracking-[-0.02em]" style={{ color: p.accent, writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: `min(48px, calc(88cqh / ${(0.66 * month.length).toFixed(2)}), 70cqw)` }}>{month}</span>
        </div>
        {picture
          ? <TippedPrint src={picture.stored ?? picture.src} alt={picture.title} ink={STAGE.paperInk} paper={STAGE.paper}
            className="absolute inset-[14%_10%_18%_22%] z-[3]" />
          : (
            <div className="absolute inset-[18%_12%_22%_24%] z-[3] grid place-items-center p-4 text-center font-heading text-[20px] font-semibold break-words"
              style={{ background: STAGE.paper, color: STAGE.paperInk, boxShadow: '0 8px 20px -10px rgb(0 0 0 / 0.35)', rotate: '-1.5deg' }}>
              {f.tags[0] ? `#${f.tags[0].name}` : f.name}
            </div>
            )}
        <DateStamp label={stamp} color={p.accent} seed={55} className="absolute top-[10%] right-[8%] z-10" />
        <KraftTape kind="washi" seed={61} wear={0.5} tint={`color-mix(in srgb, ${p.accent} 22%, #d8c9a8)`}
          className="absolute top-[12%] left-[30%] z-10 w-[28%] rotate-[-6deg]" />
      </In>
      <div className="grid min-w-0 [align-content:safe_center] gap-3 @2xl:gap-5">
        {lists.length > 0 && <In at={0.2} className="grid grid-cols-2 gap-x-4">{lists}</In>}
        {figures.length > 0 && <In at={0.35} className="grid grid-cols-2 gap-4">{figures}</In>}
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
    // Offered only with a story to tell (enough): a month of one page is not one.
    void worthWrapping(`month:${month}`).then((worth) => {
      if (!worth) return
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
  more: `What you captured most, your busiest day and the hour ideas came most, focus hours and where they went, the sites it kept you off, planned against did, gems kept, your longest run and what went well. The Sunday notification opens the week's. ${num(MOST)} cards at most; nothing leaves this Mac.`
}
