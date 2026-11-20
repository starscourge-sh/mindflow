import { revealRow } from '@/lib/menu-keys'
import { TaskAddress, TaskSite } from './haligtree/task-site'
import { BookMarked, Image as ImageIcon } from 'lucide-react'
import { showMediaFile } from '@/lib/media-files'
import { aimAt } from '@/lib/meeting'
import { useSeen } from '@/lib/reads-in'
import { Fragment, memo, useEffect, useId, useRef, useState, useSyncExternalStore, type ComponentProps, type CSSProperties, type ReactNode } from 'react'
import { smallPicture } from '@/lib/notes'
import { TASK_KIND } from './haligtree/everything'
import { FLOAT } from '@/lib/float'
import { motion, useIsPresent } from 'motion/react'
import { byKeys, sheetMotion } from '@/lib/motion'
import { chime, click, step, type Cue } from '@/lib/sound'
import { allThemes, applyTheme, currentTheme, themeName, type Theme } from '@/lib/theme'
import { Swatch } from './theme/theme-picker'
import type { Editor, JSONContent } from '@tiptap/core'
import { FindAndReplacePluginKey } from '@tiptap/extension-find-and-replace'

import { CAPTURE_TYPES } from './capture-kinds/capture-kind-picker'
import { whereFrom } from './capture-list'
import { HaligtreeEditor } from './haligtree'
import { AskWho, Kbd, Rolling, Tags, Typed, Pressed } from './haligtree/ui'
import { Marked } from './haligtree/shortcut-sheet'
import { useWorking } from './haligtree/beam'
import { AliveIcon } from '@/components/ui/alive-icon'
import { MenuGlyph, menuIcon } from '@/components/ui/menu-icon'
import { IslandBox, useFold, useIslands } from './haligtree/islands'
import { CalendarDays, Command, Plus } from 'lucide-react'
import { Orb } from './haligtree/orb'
import { isReadable, isWebPdf, openArticle } from './pdf/pdf-reader'
import { FREE_SITES, prefixed, type FreeHit, type FreeSite } from '@/lib/free-sites'
import { canSplit } from '@/lib/split'
import { said as tell } from '@/lib/host'
import { BookOpenText, ChevronRight, SearchX, SpellCheck, WifiOff } from 'lucide-react'
import MagnifierIcon from '@/components/ui/magnifier-icon'
import LayoutSidebarRightIcon from '@/components/ui/layout-sidebar-right-icon'
import { Chips } from './haligtree/display'
import { Highlight, useChosen } from './haligtree/glide'
import { Tip } from '@/components/haligtree/ui'
import { call, useLive, haligtree, whenInLine, type Pin, type Settings, type Task, type TaskFull } from '@/lib/haligtree'
import { Branches } from './haligtree/branches'
import { RowMenu, type RowItem } from './haligtree/row-menu'
import { taskMenu, useTaskNow } from './haligtree/tasks-view'
import { DOT_IN_LINE, SessionDot, spentSaid, useTaskTime } from './haligtree/task-time'
import { sideMenu, useFullMenu } from './haligtree/side-menu'
import { recentlyOpened } from '@/lib/open-today'
import { PriorityMark } from './haligtree/task-input'
import { BUCKETS, bucket, taskName } from '@/lib/tasks'
import { PRIORITY_NAMES } from '../../../main/task-words'
import { GlossLine, openGloss } from './haligtree/gloss-line'
import { age, dayjs, num, plural } from '../../../main/dates'
import { keyFor } from '@/lib/keys'
import { wordFor } from '@/lib/words'
import { ALL_WORDS, openWord } from './haligtree/term'
import { realMove } from '@/lib/real-move'
import { typeSaid } from '@/lib/capture-links'
import { EVENT_KIND, EventPeek } from './haligtree/calendar-events'
import { Sun } from 'lucide-react'
import { BookOpen, FileText, Gem, History } from '@/components/ui/icons'
import { PICKED_MARK, usePickMixed } from './haligtree/pick-mixed'
import { clip } from '../../../main/clip'
import { APP_NAME } from '../../../main/name'
import { hoverNote } from './haligtree/note-preview'
import { forgives, rank } from '@/lib/slash-rank'
import { ICE, KIND_ICON, type GoalKind } from '@/lib/goal-kind'
import { quoted } from '../../../main/clip'

type Capture = Awaited<ReturnType<typeof window.api.captures.find>>[number]

/** Something to do from the palette, with the key that does it anywhere. */
/** `cue` is its sound, on/off for a switch; a tap when it says nothing. */
/** `typed`: kept out of the list until something is typed. `themes`: opens the theme list in place, and is handed the one kept. */
/** `choices`: one action that opens a short list in place, "Goal on screen…" and then which goal and how. */
/** `heard`: words typed that ask for it outright ("20 min"): the action they make goes first, in its place. */
/** `typedChoice`: in its list of choices, words typed that make one of their own (“40” for 40 minutes), offered first. */
export type Action = { label: string; /** What it does, said in the preview beside the list (or on the row in focus where there is none), and found by search: the label stays a short name. Every action has one, so the card beside the list is never empty. */ hint: string; /** What ⌥↵ does instead: the same, to the side ("Open in the reader" on an address). */ aside?: () => void; /** One of the few offered before anything is typed; the rest are found by typing. */ first?: boolean; /** Other words a person might search for it by, never shown: "dictate" for recording. */ words?: string; keys?: string; run: () => void; cue?: Cue | null; own?: boolean; typed?: boolean; themes?: (theme: Theme, was?: Theme) => void; choices?: () => Choice[]; typedChoice?: (typed: string) => Choice | null; heard?: (typed: string) => Action | null; icon?: ComponentProps<typeof AliveIcon>['icon']; /** One of the rows a search with no match offers: what the words become. */ keep?: Keep }
/** What words that match nothing can be kept as, from ⌘K. `box`: written into quick capture. */
export type Keep = 'note' | 'task' | 'question' | 'box'
const KEPT_AS: Record<Keep, string> = { note: 'as a note', task: 'as a task', question: 'as a question', box: 'in quick capture' }
/** One of an action's choices: what it does, and a quiet word on where it stands now. `mark`: its own drawing before its words (a book's mark in its colour). */
export type Choice = { label: string; note?: string; mark?: ReactNode; run: () => void }

/** A row of ⌘K's "Look it up": a free site's line, one of its answers, one plain line on why there are none, or its ask under way.
 * `count`: a site asked as you type (“Look things up as I search”), folded to one row saying how many it found; `under`: one of
 * its answers, shown when that row is open, hung under it. */
type Look = { site: FreeSite; hit?: FreeHit; said?: string; asking?: boolean; count?: number; under?: boolean }

/** Room for the preview beside the list: the box's 640px window has none, so there it never shows. */
const ROOMY = '(min-width: 700px)'
const followRoomy = (change: () => void): (() => void) => {
  const query = matchMedia(ROOMY)
  query.addEventListener('change', change)
  return () => query.removeEventListener('change', change)
}

/** How many of the notes opened last ⌘K lists under Recent before anything is typed. */
const RECENT_COUNT = 5

/** The islands searched results fall into, in the Inbox's order (writing first): its kinds by their names, a gem among the writing, then the rest. */
const ISLAND_ORDER = ['Notes', 'Gems', ...CAPTURE_TYPES.slice(1).map((type) => type.many), 'Events', 'Journal', 'PDFs', 'Web pages', 'Files', 'Close spellings']
/** Which island a result goes in: a capture by its kind (a to-do among the tasks), anything else by what it is; one
 * found only by a close spelling of the words in an island of its own, last, never among the matches. */
const islandOf = (one: Capture): string =>
  one.match === 'near' ? 'Close spellings'
    : one.type === 'capture' ? (CAPTURE_TYPES.find((type) => type.id === one.kind) ?? CAPTURE_TYPES[0]).many
    : ({ task: 'Tasks', nugget: 'Gems', article: 'Gems', question: 'Gems', goal: 'Gems', event: 'Events', day: 'Journal', pdf: 'PDFs', web: 'Web pages', media: 'Files' } as Record<string, string>)[one.type] ?? 'Notes'
const byKind = (list: Capture[]): [string, Capture[]][] => {
  const by = new Map<string, Capture[]>()
  for (const one of list) {
    const name = islandOf(one)
    const kept = by.get(name)
    if (kept) kept.push(one)
    else by.set(name, [one])
  }
  return [...by.entries()].sort(([a], [b]) => ISLAND_ORDER.indexOf(a) - ISLAND_ORDER.indexOf(b))
}
/** An island's own mark where it is not one of the Inbox's kinds. */
const ISLAND_ICON: Record<string, React.JSX.Element> = {
  Recent: <History aria-hidden className="size-4 shrink-0 text-muted-foreground" />,
  Gems: <Gem aria-hidden className="size-4 shrink-0" style={{ color: 'var(--tt-color-text-purple)' }} />,
  Events: <CalendarDays aria-hidden className="size-4 shrink-0" style={{ color: 'var(--tt-color-text-blue)' }} />,
  Journal: <Sun aria-hidden className="size-4 shrink-0" style={{ color: 'var(--tt-color-text-orange)' }} />,
  PDFs: <FileText aria-hidden className="size-4 shrink-0" style={{ color: 'var(--tt-color-text-red)' }} />,
  'Web pages': <BookOpen aria-hidden className="size-4 shrink-0" style={{ color: 'var(--tt-color-text-blue)' }} />,
  Files: <ImageIcon aria-hidden className="size-4 shrink-0" style={{ color: 'var(--tt-color-text-purple)' }} />,
  'Close spellings': <SpellCheck aria-hidden className="size-4 shrink-0 text-muted-foreground" />
}

/**
 * Search, the way Notion's works: type, and the matches come up grouped by when
 * they were captured, with the one under the cursor previewed on the right.
 * Arrows move, Enter opens, Escape closes.
 */
export function Search({ onOpen: told, onAside: toldAside, onTab: toldTab, onClose, onKeep, keeps = ['note', 'task', 'question'], initial = '', actions: everyAction = [], placeholder, menus = true, scope, choose: chooseFirst, inPane, inCard = false }: { /** Drawn over quick capture's card and no further, at the card's own size and corners: the window never grows for it and the chips round the card stay in sight. */ inCard?: boolean;/** Drawn inside a pane of the split (⌘\\) as its page, not over the window: no scrim, not a dialog, and Esc (onClose) closes the pane. What it opens takes the pane's place. */ inPane?: { title: string; lead: ReactNode }; /** Opened straight on one action's choices, by its label (“Start focus…” from its key anywhere). */ choose?: string; /** Opened about one thing (a task picked on the Calendar): its name before the words, and only its actions until ⌫ leaves it. */ scope?: { label: string; actions: Action[] }; onOpen: (type: string, id: string) => void; /** ⌥↵: open it beside the page, in a pane of its own (the main window's split view). */ onAside?: (type: string, id: string) => void; onTab?: (type: string, id: string) => void; onClose: () => void; /** Words that match nothing, kept as something new (Arc's "search or make"). */ onKeep?: (as: Keep, text: string) => void; keeps?: Keep[]; initial?: string; actions?: Action[]; placeholder?: string; /** A right click on a result offers what its list's would; off where a pick is all a result is for. */ menus?: boolean }): React.JSX.Element {
  // A file added to Media with no note has no page of its own: it opens on its tile in Media, from any window. Where a pick is all a result is for, the picker decides.
  const onOpen = (type: string, id: string): void => (type === 'media' && menus ? (showMediaFile(id), onClose()) : told(type, id))
  const onAside = toldAside && ((type: string, id: string): void => (type === 'media' && menus ? (showMediaFile(id), onClose()) : toldAside(type, id)))
  const onTab = toldTab && ((type: string, id: string): void => (type === 'media' && menus ? (showMediaFile(id), onClose()) : toldTab(type, id)))
  const [query, setQuery] = useState(initial)
  const [scoped, setScoped] = useState(!!scope)
  const actions = scoped && scope ? scope.actions : everyAction
  // A free site's prefix and a space before the words ("w roman empire"): that site searched alone, its line the only row.
  const pre = !scoped && menus ? prefixed(query.trim()) : null
  // The words the list on screen answers. A reply for words since changed is
  // dropped: a slow search must not land over a quicker, newer one.
  const [searched, setSearched] = useState<string | null>(null)
  // Going away (AnimatePresence plays the exit): the keys and the clicks are
  // the page's again at once, and nothing here still counts as a dialog.
  const present = useIsPresent()
  const [sheet] = useState(() => sheetMotion(byKeys()))
  useEffect(() => void (!present && box.current?.blur()), [present])
  // Opening search sends out one ping.
  useEffect(() => void (!inPane && chime('search')), []) // eslint-disable-line react-hooks/exhaustive-deps
  // In a pane, whatever is picked replaces the picker there: nothing to close first.
  const leave = (): void => void (!inPane && onClose())
  const [found, setFound] = useState<Capture[]>([])
  // A search still out after 300ms: the last words' results go, and the orb
  // says it is looking. A quick one never shows either.
  const [slow, setSlow] = useState(false)
  // A search past a moment turns the beam too.
  useWorking(slow)
  // Notion's chips under the box: names only, one type of thing, one kind.
  const [titleOnly, setTitleOnly] = useState(false)
  const [types, setTypes] = useState<string[]>([])
  const [kinds, setKinds] = useState<string[]>([])
  const flip = (list: string[], id: string): string[] => (list.includes(id) ? list.filter((one) => one !== id) : [...list, id])
  const words = query.toLowerCase().split(/\s+/).filter((word) => word && !word.startsWith('kind:'))
  const matching = (slow ? [] : found).filter((one) =>
    (!titleOnly || words.every((word) => one.label.toLowerCase().includes(word))) &&
    (!types.length || types.includes(one.type === 'article' || one.type === 'question' || one.type === 'goal' ? 'nugget' : one.type)) &&
    (!kinds.length || kinds.includes(one.kind)))
  // Before anything is typed, the notes you opened last come first, under Recent.
  const [opened] = useState(() => recentlyOpened(RECENT_COUNT))
  const recent = query.trim() ? [] : opened.map((key) => matching.find((one) => `${one.type}:${one.id}` === key)).filter((one): one is Capture => !!one)
  const results = recent.length ? [...recent, ...matching.filter((one) => !recent.includes(one))] : matching
  // The Inbox's islands: before typing, one of what was opened and kept last; searched, one a kind, in the Inbox's
  // order, each its best matches first (main/captures.ts ranks them), a few showing and "Show N more" under them.
  const toIslands = useIslands('cmdk', true)
  const { groups: islandGroups, islands } = toIslands(pre ? [] : query.trim() ? byKind(results) : [['Recent', results]])
  // The rows the islands show, in order: what the arrows, Enter and ⇧↵ walk.
  const rowsShown = islandGroups.flatMap(([, list]) => list)
  // Raycast's ⌘K: what you can do comes first, matched by the same words,
  // then what you have written. One list, one cursor.
  // Typed, the open note's own actions come before places to go: "Archive"
  // with a note open means archive it, not the Archived list.
  // A word of Haligtree's own and a ?, "gloss?", asks what it means here: its
  // note comes first. A ? alone is left to search as before.
  const asked = query.trim().endsWith('?') ? wordFor(query.trim().slice(0, -1)) : undefined
  // Searched, and nothing anywhere has those words: Arc's command bar never
  // ends there. The words can be kept as something new, a question first
  // when they end in a question mark.
  const typed = query.trim()
  const said = clip(typed, 40)
  const keeping = !!onKeep && !scoped && !pre && !!typed && !typed.startsWith('kind:') && searched === query && !slow && !results.length
    ? (typed.endsWith('?') ? [...keeps.filter((one) => one === 'question'), ...keeps.filter((one) => one !== 'question')] : keeps)
      .map((as): Action => ({ label: `Keep ${quoted(said, 80)} ${KEPT_AS[as]}`, hint: 'Nothing is called that yet: Enter keeps it', keep: as, cue: null, run: () => onKeep?.(as, typed) }))
    : []
  const heard = typed ? actions.flatMap((one) => one.heard?.(typed) ?? []) : []
  // The actions answer the same words as the results under them, so the two change together, in one
  // frame, when a reply lands: matched to the box instead, they changed a frame early and the Enter
  // word under the list rolled twice a letter.
  const settled = searched ?? ''
  const settledWords = settled.toLowerCase().split(/\s+/).filter((word) => word && !word.startsWith('kind:'))
  const named = (one: Action): number => rank({ title: one.label, group: '', hint: one.hint, keywords: one.words?.split(' ') }, settledWords.join(' ')) ?? 8
  // A web address typed or pasted: the reader first, as every link's own menu offers it (pdf-reader.tsx, isReadable).
  // Its sound is the reader's own page turn, as it opens.
  const address = !scoped && isReadable(typed) ? typed : null
  const acting: Action[] = pre ? [] : [
    ...(address ? [{ label: 'Open in the reader', hint: `${URL.parse(address)?.hostname.replace(/^www\./, '') || 'The page'}, ${isWebPdf(address) ? 'its PDF read here' : 'read here as an article'}, kept with your notes`, cue: null, run: () => openArticle(address), aside: canSplit() ? () => openArticle(address, undefined, 'aside') : undefined }] : []),
    ...(asked ? [{ label: `What ${APP_NAME} means by ${asked.forms[0]}`, hint: asked.line, cue: null, run: () => openWord(asked.id) }] : []),
    ...heard,
    ...[...actions, { label: `${APP_NAME}’s words`, hint: 'What its own names mean', typed: true, cue: null, run: () => openWord(ALL_WORDS) }]
      .filter((one) => !(heard.length && one.heard) && (!one.typed || settled.trim()) && forgives(settledWords.join(' '), `${one.label} ${one.hint ?? ''} ${one.words ?? ''}`))
      // Then the best answer first, as the / menu ranks (lib/slash-rank.ts): the words as its name before the words only
      // in another's hint ("Add many cards at once" before "New deck", whose hint says "add many at once").
      .sort((a, b) => (settled.trim() ? Number(!!b.own) - Number(!!a.own) || named(a) - named(b) : 0))
      // Before typing, only the few most used (the page's own first), as Raycast opens: the rest are a word away.
      .filter((one, _, all) => settled.trim() || scoped || !all.some((each) => each.own || each.first) || one.own || one.first)
      .slice(0, settled.trim() ? 4 : scoped ? 12 : 6)
  ]
  // An action the words name ("What's new") is what Enter does; keeping the words as a note comes after it.
  const keepFirst = !acting.length
  // Each its own island, folded or open as last left: a folded one's rows are out of the arrows' way.
  const actionsIsland = useFold('cmdk.actions', { total: acting.length })
  const keepIsland = useFold('cmdk.keep', { total: keeping.length })
  const actingShown = actionsIsland.folded ? [] : acting
  const keepingShown = keepIsland.folded ? [] : keeping
  const doing = keepFirst ? [...keepingShown, ...actingShown] : [...actingShown, ...keepingShown]
  const [at, setAt] = useState(0)
  // Wikipedia and the other free sites, a line each under your own results, as Raycast's fallback commands: nothing
  // is sent to a site until its line is picked (↵ or a click), then only the words typed; or, with “Look things up as I
  // search” on, as you type, to the ticked sites whose terms allow it (below). Its answers take the line's
  // place, or one plain line says it could not be reached; words typed since bring the line back.
  const lookWords = pre?.words ?? typed
  const lookSites = pre ? [pre.site] : menus && !scoped && !address && lookWords.length > 1 && !typed.startsWith('kind:') ? FREE_SITES : []
  const [outside, setOutside] = useState<{ site: FreeSite['id']; words: string; hits: FreeHit[] | null; offline?: boolean; failed?: boolean } | null>(null)
  // “Look things up as I search” (Settings, off at first): the ticked sites whose terms allow it are asked once your own
  // results are in, with the words typed and nothing else. Each that found something is one folded row under your
  // results ("Wikipedia · 5 results ›"); one that found nothing shows nothing; one that did not answer keeps its line,
  // which asks again and says why. The last answer stays until the next one lands, so nothing blinks as you type.
  const settings = useLive(haligtree.settings, null as Settings | null)
  const asYouType = settings?.lookAsYouSearch && !pre ? lookSites.filter((one) => one.asYouType && (settings.lookSources ?? []).includes(one.id)) : []
  const [typedAsk, setTypedAsk] = useState<Partial<Record<FreeSite['id'], { words: string; hits?: FreeHit[] }>>>({})
  const [openSites, setOpenSites] = useState<FreeSite['id'][]>([])
  const typedSites = asYouType.map((one) => one.id).join(' ')
  useEffect(() => {
    if (!typedSites || searched !== query) return
    let old = false
    for (const site of asYouType)
      void call<{ hits?: FreeHit[] }>('free:search', site.id, lookWords).then((got) => !old && setTypedAsk((now) => ({ ...now, [site.id]: { words: lookWords, hits: got.hits } })))
    return () => void (old = true)
  }, [searched, typedSites]) // eslint-disable-line react-hooks/exhaustive-deps
  const lookRows: Look[] = lookSites.flatMap((site): Look[] => {
    const got = outside?.site === site.id && outside.words === lookWords ? outside : null
    const typedGot = asYouType.includes(site) ? typedAsk[site.id] : undefined
    if (!got && typedGot) {
      if (!typedGot.hits) return [{ site }]
      if (!typedGot.hits.length) return []
      return [{ site, count: typedGot.hits.length }, ...(openSites.includes(site.id) ? typedGot.hits.map((hit) => ({ site, hit, under: true })) : [])]
    }
    // Not yet answered as you type: nothing until it is, so a line never shows only to give way to its answer.
    if (!got && asYouType.includes(site)) return []
    if (!got) return [{ site }]
    if (got.offline) return [{ site, said: `${site.word} cannot be reached: this Mac is offline` }]
    if (got.failed) return [{ site, said: `${site.word} did not answer just now` }]
    if (!got.hits) return [{ site, asking: true }]
    if (!got.hits.length) return [{ site, said: `${site.word} has nothing by that name` }]
    return got.hits.map((hit) => ({ site, hit }))
  })
  const lookIsland = useFold('cmdk.look', { total: lookRows.length })
  const lookShown = lookIsland.folded ? [] : lookRows
  // Asked: the light goes to its first answer (or its line saying why there is none) when it comes.
  const landOn = useRef<string | null>(null)
  const askSite = (site: FreeSite): void => {
    const words = lookWords
    chime('tap')
    landOn.current = site.id
    setOutside({ site: site.id, words, hits: null })
    void call<{ hits?: FreeHit[]; offline?: true; failed?: true }>('free:search', site.id, words).then((got) =>
      setOutside((now) => (now?.site === site.id && now.words === words ? { site: site.id, words, hits: got.hits ?? null, offline: !!got.offline, failed: !!got.failed } : now)))
  }
  // Several results picked (⇧-click, or ⌘A once the words are all selected), to make tasks of or queue together.
  // The box keeps ⌘A for its words: the first press selects them, the next picks every result.
  const several = usePickMixed(results.map((one) => ({ type: one.type, id: one.id, title: one.label, status: one.status })), { keys: false })
  // A result's right click: a task's menu as on Today, a note's as in the sidebar.
  const tasks = useLive(haligtree.tasks, [] as Task[])
  const pins = useLive(haligtree.pins, [] as Pin[])
  const fullMenu = useFullMenu()
  const taskNow = useTaskNow()
  // The session running on a task, for its dot among a task row's marks (task-time.tsx).
  const taskTime = useTaskTime()
  const menuOf = (one: Capture): RowItem[] => {
    const task = one.type === 'task' ? tasks.find((each) => each.id === one.id) : null
    // An event found: its own menu is on the Calendar; here it opens.
    if (one.type === 'event') return [{ label: 'Open on the Calendar', run: () => onOpen('event', one.id) }]
    // A journal day found: its page opens.
    if (one.type === 'day') return [{ label: 'Open in the Journal', run: () => onOpen('day', one.id) }]
    // A PDF found: it opens in the reader.
    if (one.type === 'pdf' || one.type === 'web') return [{ label: 'Open in the reader', run: () => onOpen(one.type, one.id) }, ...(onAside ? [{ label: 'Open in the reader to the side', run: () => onAside(one.type, one.id) }] : [])]
    if (one.type === 'media') return [{ label: 'Show in Files', run: () => onOpen(one.type, one.id) }]
    const own = task
      ? taskMenu(task, { open: () => onOpen('task', one.id), now: taskNow })
      : fullMenu(one.type, one.id, () => onOpen(one.type, one.id)) ?? sideMenu(one.type, one.id, one.label, { onOpen, pinned: pins.some((pin) => pin.id === one.id), kind: one.kind, status: one.status })
    return several.menu(one) ?? [...own, ...several.rowItems(one)]
  }
  // What a kept row's clicks and menu reach for: always this render's, though the row was drawn earlier.
  const live = useRef({ menuOf, several, onOpen, doing: doing.length })
  live.current = { menuOf, several, onOpen, doing: doing.length }
  // Tab on a result asks who said it, without leaving search.
  const [asking, setAsking] = useState(false)
  const box = useRef<HTMLInputElement>(null)
  // In a pane, the page is unseen until its reads are in (page-swap.tsx), and an unseen box takes no focus: it takes the keys the moment it is seen.
  const seen = useSeen()
  useEffect(() => void (inPane && seen && box.current?.focus({ preventScroll: true })), [seen]) // eslint-disable-line react-hooks/exhaustive-deps
  // Notion's highlight pane: on by default, and a button to put it away.
  const [pane, setPane] = useState(true)
  const roomy = useSyncExternalStore(followRoomy, () => matchMedia(ROOMY).matches) && !inCard
  // This box, by name: of its asks, one main has not begun gives way to the next letter's.
  const asker = useId()
  useEffect(() => {
    let old = false
    const late = setTimeout(() => setSlow(true), 300)
    // Asked at every letter, at once: a reply for words since changed is dropped, so an older one never lands over a newer.
    void window.api.captures.find(query, undefined, asker).then((list) => {
      if (old) return
      clearTimeout(late)
      setSlow(false)
      setFound(list)
      setSearched(query)
      setAt(0)
    })
    return () => {
      old = true
      clearTimeout(late)
    }
  }, [query])
  // The kinds are many: one Kind chip opens them.
  const [kindsOpen, setKindsOpen] = useState(false)
  useEffect(() => setAt(0), [titleOnly, types, kinds])
  // The highlighted result stays in view as the arrows move it.
  useEffect(() => {
    revealRow(document.querySelector('[data-search-at]'))
  }, [at, rowsShown.length])
  const current = at >= doing.length ? rowsShown[at - doing.length] : undefined
  const action = at < doing.length ? doing[at] : undefined
  const look = at >= doing.length + rowsShown.length ? lookShown[at - doing.length - rowsShown.length] : undefined
  useEffect(() => {
    if (!outside || (!outside.hits && !outside.offline && !outside.failed) || landOn.current !== outside.site) return
    landOn.current = null
    const first = lookShown.findIndex((one) => one.site.id === outside.site)
    if (first >= 0) setAt(doing.length + rowsShown.length + first)
  }, [outside]) // eslint-disable-line react-hooks/exhaustive-deps
  /** A look row picked: an answer opens in the reader (to the side on ⌥, a new tab on ⌘); a line asks its site. */
  const runLook = (one: Look, how?: 'aside' | 'tab'): void => {
    if (one.asking) return
    // A site's folded answers: opened or folded again, the light staying on its row.
    if (one.count !== undefined) {
      const open = openSites.includes(one.site.id)
      chime(open ? 'fold' : 'slide')
      return setOpenSites(open ? openSites.filter((id) => id !== one.site.id) : [...openSites, one.site.id])
    }
    // A site never asked by the app: its own search, where it builds it.
    if (!one.hit) return askSite(one.site)
    leave()
    openArticle(one.hit.href, undefined, how)
  }
  // An action's own short list, opened in place: typed to narrow, Enter picks.
  const [choosing, setChoosing] = useState<{ action: Action; list: Choice[] } | null>(() => {
    const action = chooseFirst ? everyAction.find((one) => one.label === chooseFirst && one.choices) : undefined
    return action ? { action, list: action.choices!() } : null
  })
  const [choiceQuery, setChoiceQuery] = useState('')
  const [choiceAt, setChoiceAt] = useState(0)
  const total = doing.length + rowsShown.length + lookShown.length
  // One size and one shape from the moment it opens: the filters are always
  // there, and the preview half stays put whatever is highlighted, so
  // nothing grows or jumps as the arrows move or a letter is typed.
  const shown = pane && roomy && !choosing && !inPane
  const preview = shown && !!current
  // A gloss on anything found, a task included: there it lands in the task's log.
  const glossable = !!current && current.type !== 'day'
  // ⌘; pressed with the preview put away: the line opens under the row instead.
  const [glossing, setGlossing] = useState(false)
  useEffect(() => setGlossing(false), [current?.id])
  const backToBox = (): void => (setGlossing(false), box.current?.focus())
  // A modal holds the keys while it is open: a note under it taking focus back
  // (a right-click menu that opened search closes, and hands focus to its note)
  // would leave Esc and typing going to the note.
  useEffect(() => {
    // A pane's search is a page beside the note, not over it.
    if (inPane) return
    const keep = (event: FocusEvent): void => {
      const target = event.target as HTMLElement | null
      if (target?.closest?.('.ProseMirror') && !box.current?.closest('[role="dialog"]')?.contains(target)) box.current?.focus()
    }
    document.addEventListener('focusin', keep)
    return () => document.removeEventListener('focusin', keep)
  }, [!!inPane]) // eslint-disable-line react-hooks/exhaustive-deps
  // "Change theme…" turns the palette into the themes, each worn as the
  // highlight passes it; Enter keeps one, Escape puts the old one back.
  const [picking, setPicking] = useState<Action | null>(null)
  const ownChoice = choosing && choiceQuery.trim() ? choosing.action.typedChoice?.(choiceQuery) ?? null : null
  const choices = choosing ? [...(ownChoice ? [ownChoice] : []), ...choosing.list.filter((one) => choiceQuery.trim().toLowerCase().split(/\s+/).every((word) => `${one.label} ${one.note ?? ''}`.toLowerCase().includes(word)))] : []
  const unchoose = (): void => (chime('fold'), setChoosing(null))
  const choose = (one: Choice): void => {
    leave()
    one.run()
  }
  const [themeQuery, setThemeQuery] = useState('')
  const [themeAt, setThemeAt] = useState(0)
  // The theme worn before the list opened; cleared once one is kept.
  const before = useRef<Theme | null>(null)
  const worn = useRef<Theme | null>(null)
  const themes = picking ? allThemes().filter((one) => themeName(one).toLowerCase().includes(themeQuery.trim().toLowerCase())) : []
  const theme = themes[themeAt] as Theme | undefined
  useEffect(() => {
    if (!picking || !theme || theme === worn.current) return
    worn.current = theme
    // Each theme its own note, as in the options menu: passing them is a scale.
    step(allThemes().indexOf(theme))
    applyTheme(theme, false)
  }, [picking, theme])
  useEffect(() => {
    revealRow(document.querySelector('[data-theme-at]'))
  }, [themeAt, picking])
  // Closed mid-way (a click outside), the old theme comes back too.
  useEffect(() => () => void (before.current && applyTheme(before.current, false)), [])
  const pickTheme = (action: Action): void => {
    chime('slide')
    before.current = worn.current = currentTheme()
    setThemeQuery('')
    setThemeAt(Math.max(allThemes().indexOf(before.current), 0))
    setPicking(action)
  }
  const unpick = (): void => {
    chime('fold')
    if (before.current) applyTheme(before.current, false)
    before.current = null
    setPicking(null)
  }
  // Esc backs out with the keys anywhere in the window, not only in the box: over another app a press on the box's
  // row began the window's drag, so the box never had the keys, Esc reached nothing, and the window's own Esc stood
  // down for this dialog (16 Nov). Inside the search its own rows and boxes answer Esc first, one step at a time.
  useEffect(() => {
    if (!present || inPane) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (event.target instanceof Element && event.target.closest('[aria-label="Search"]')) return
      event.preventDefault()
      if (choosing) unchoose()
      else if (picking) unpick()
      else (chime('fold'), onClose())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const keep = (one: Theme): void => {
    const was = before.current ?? undefined
    before.current = null
    chime('settled')
    leave()
    picking?.themes?.(one, was)
  }
  // An action with nothing more to say than its name: a word asked about says what it means instead.
  const plain = !picking && !current && action && !action.keep && !(asked && action === doing[0]) ? action : undefined
  // One light for the rows, travelling to the one the pointer or the arrows reach.
  const rows = useRef<HTMLDivElement>(null)
  const lit = useChosen(rows, '[data-search-at], [data-theme-at], [data-choice-at]', `${picking ? 'theme' : choosing ? 'choice' : 'row'}:${picking ? themeAt : choosing ? choiceAt : at}`)
  const run = (action: Action, aside = false): void => {
    if (action.themes) return pickTheme(action)
    if (action.choices) {
      chime('slide')
      setChoiceQuery('')
      setChoiceAt(0)
      return setChoosing({ action, list: action.choices() })
    }
    // null: the action sounds for itself (the sound switch, the panel).
    if (action.cue !== null) chime(action.cue ?? 'tap')
    leave()
    ;(aside && action.aside ? action.aside : action.run)()
  }

  // One action's row, at `index` among the rows the arrows walk.
  const actionRow = (one: Action, index: number): React.JSX.Element => (
              <button
                key={one.label}
                type="button"
                className="relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left"
                data-search-at={index === at || undefined}
                onMouseMove={(event) => realMove(event) && setAt(index)}
                onClick={() => run(one)}
              >
                {/* Its icon, as in the menus, and its name alone: what it does is said beside the list, or on this row alone while it is in focus where there is no room for that. */}
                {one.icon ? <AliveIcon key={one.label} icon={one.icon} size={14} className="shrink-0 text-muted-foreground" /> : <MenuGlyph label={one.label} small />}
                <span data-action-label className="min-w-0 truncate">{one.label}</span>
                <span data-action-hint className="min-w-0 flex-1 truncate text-muted-foreground">{!shown && index === at ? one.hint : null}</span>
                {one.keys && <span className="flex shrink-0 gap-0.5"><Pressed keys={one.keys} each /></span>}
              </button>
  )
  // One result's row: `index` among the results showing, `island` the one it is drawn in.
  const resultRow = (capture: Capture, index: number, island: string): React.JSX.Element => {
              const kind = lookOf(capture)
              const on = index + doing.length === at
              return (
                <Fragment key={capture.id}>
                  {/* Drawn again only when what it shows changes: an arrow press redraws two rows, not sixty menus. */}
                  <Kept deps={[capture, index, on, several.picked(capture), several.count, rowsShown.length, island, tasks, pins, shown, menus, on && !asking && !preview]} draw={() => (
                  <RowMenu items={menus ? live.current.menuOf(capture) : []}>
                  <button
                    type="button"
                    // One line that never wraps (what it is, its name, a few tags, its kind at the right),
                    // and under it, only when there is one, the line it was found on: rows read as results, not loose text.
                    className={`relative flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left ${PICKED_MARK}`}
                    data-search-at={on || undefined}
                    onMouseMove={(event) => realMove(event) && setAt(live.current.doing + index)}
                    data-row
                    data-drag-open={`${capture.type}:${capture.id}`}
                    data-picked={several.picked(capture) || undefined}
                    // ⌘-click one in or out, ⇧-click a run, as in every list; a plain click opens it.
                    onClick={(event) => (live.current.several.click(event, capture) ? box.current?.focus() : (aimAt(capture.id, capture.line), live.current.onOpen(capture.type, capture.id)))}
                  >
                    <span data-row-line className="flex h-5 w-full min-w-0 items-center gap-2">
                      <kind.icon className="size-4 shrink-0" style={{ color: kind.tint }} />
                      {/* A task named by a link: its site's icon before its name, as in every task list (task-site.tsx). */}
                      {capture.type === 'task' && <TaskSite task={tasks.find((one) => one.id === capture.id) ?? {}} />}
                      <span {...(shown || capture.type === 'pdf' || capture.type === 'web' || capture.type === 'media' || capture.type === 'work' ? {} : hoverNote(capture.type, capture.id, { kind: capture.kind }))} {...(capture.type === 'pdf' ? { 'data-pdf-peek': capture.id.split('|')[0], 'data-pdf-peek-name': capture.id.split('|').slice(1).join('|') } : {})} data-row-title className="min-w-0 truncate leading-5">{/* A task's or an Inbox note's #tags as tags, never in its name: so it reads as it does on its own list. */}{(capture.type === 'day' ? dayName(capture.id) : taskName(capture.label ?? '').text) || 'New note'}</span>
                      {/* After the words, so a task's title starts where a note's does. */}
                      {/* In a focus session: the dot, first of the marks after its words. Its time is in its preview beside the list. */}
                      {capture.type === 'task' && <SessionDot id={capture.id} time={taskTime} className={DOT_IN_LINE} />}
                      {capture.type === 'task' && !!tasks.find((one) => one.id === capture.id)?.priority && <PriorityMark level={tasks.find((one) => one.id === capture.id)!.priority} />}
                      {/* A task's day, ahead or gone by, so a future one is told from a past one at a glance. */}
                      {capture.type === 'task' && <TaskDay task={tasks.find((one) => one.id === capture.id)} />}
                      {whereFrom(capture.source, capture.label) && <span className="min-w-0 max-w-[30%] shrink-[10] truncate text-xs text-muted-foreground">· {whereFrom(capture.source, capture.label)}</span>}
                      {/* The tags take only the room the title leaves (at least their "+N"), so a short title is never cut for them. */}
                      {capture.type !== 'day' && taskName(capture.label ?? '').tags.length > 0 && <span className="flex min-w-min flex-1 basis-0 overflow-hidden"><Tags tags={taskName(capture.label ?? '').tags} max={2} alone go={false} /></span>}
                      {/* In quiet words on one right edge for every row: what it is where an island holds many kinds, how old it is, as the Inbox says it, where its island already says what. */}
                      <span className="ml-auto flex shrink-0 items-center gap-2 pl-2 text-xs text-muted-foreground">
                        {on && !asking && !preview && capture.type === 'capture' && <span>{capture.attribution ?? 'Tab: who said it'}</span>}
                        <span data-row-kind>{island === 'Recent' || island === 'Gems' ? (capture.type === 'capture' ? (CAPTURE_TYPES.find((type) => type.id === capture.kind) ?? CAPTURE_TYPES[0]).label : typeSaid(capture.type)) : capture.type === 'task' || capture.type === 'event' ? null : age(capture.capturedAt)}</span>
                      </span>
                    </span>
                    {/* Why it came up: the line the words are on, the words marked, under the name and starting where it starts.
                        Found by a close spelling, the line first names the word that stood in ("Has “bargain”"), so it never reads as the words typed. */}
                    {(capture.line || capture.near?.length) && (
                      <span data-found-line data-found-picture={capture.picture ? '' : undefined} className="flex h-5 min-w-0 items-center gap-2 pl-6 text-sm leading-5 text-muted-foreground">
                        {/* Words read in a picture: the picture itself, small, beside them. */}
                        {capture.picture && <img src={capture.picture} alt="" className="size-5 shrink-0 rounded-[4px] border border-border/60 object-cover" />}
                        <span className="min-w-0 truncate">{capture.near?.length ? <span data-near-word className="text-(--mf-muted-strong)">Has {capture.near.map((one) => quoted(one, 30)).join(', ')}{capture.line ? ': ' : ''}</span> : null}{capture.picture && <span className="text-muted-foreground">In a picture: </span>}{capture.line && <Marked text={capture.line} query={[...(capture.near ?? []), ...words].join(' ')} />}</span>
                      </span>
                    )}
                  </button>
                  </RowMenu>
                  )} />
                  {index + doing.length === at && glossing && !preview && glossable && (
                    <div className="px-8 pb-1"><GlossLine id={capture.id} open onDone={backToBox} /></div>
                  )}
                  {index + doing.length === at && asking && (
                    <div className="px-8 pb-1">
                      <AskWho id={capture.id} onDone={() => {
                        setAsking(false)
                        box.current?.focus()
                        void window.api.captures.find(query).then(setFound)
                      }} />
                    </div>
                  )}
                </Fragment>
              )
  }
  // One row of "Look it up", `index` among the rows the arrows walk: drawn as a result's row is (its mark, its name, the
  // site's word at the right edge, and a second line under the name: what it is, beside its picture where it has one).
  const lookRow = (one: Look, index: number): React.JSX.Element => {
    const on = index === at
    const key = `${one.site.id}:${one.hit?.href ?? (one.said ? 'said' : one.asking ? 'asking' : 'line')}`
    if (one.asking) return <p key={key} data-search-at={on || undefined} data-look-asking={one.site.id} className="relative flex px-2 py-1.5"><Orb label={`Asking ${one.site.name}…`} /></p>
    const Mark = one.hit || one.count !== undefined ? BookOpen : one.said ? (outside?.offline ? WifiOff : SearchX) : null
    const open = one.count !== undefined && openSites.includes(one.site.id)
    const hit = one.hit
    // An answer's right-click: where it can open, as a link's own menu offers them (turn-into/clicked.tsx).
    const menu: RowItem[] = hit ? [
      { label: 'Open in the reader', run: () => runLook(one) },
      ...(canSplit() ? [{ label: 'Open in the reader to the side', run: () => runLook(one, 'aside') }] : []),
      { label: 'Open in the browser', run: () => (leave(), void window.open(hit.href, '_blank', 'noopener')) },
      { label: 'Copy link', run: () => void navigator.clipboard.writeText(hit.href).then(() => (chime('copy'), tell('Link copied')), () => tell('Could not copy the link', false)) }
    ] : []
    return (
      <RowMenu key={key} items={menu}>
      <button type="button" data-search-at={on || undefined} data-look={one.site.id} data-look-kind={one.hit ? 'hit' : one.said ? 'said' : one.count !== undefined ? 'count' : 'line'} aria-expanded={one.count !== undefined ? open : undefined}
        className="relative flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left"
        onMouseMove={(event) => realMove(event) && setAt(index)}
        onClick={(event) => (runLook(one, event.altKey ? 'aside' : event.metaKey ? 'tab' : undefined), box.current?.focus())}>
        <span className="flex h-5 w-full min-w-0 items-center gap-2">
          {Mark ? <Mark aria-hidden className="size-4 shrink-0" style={{ color: one.hit ? 'var(--tt-color-text-blue)' : 'var(--muted-foreground)' }} /> : <MenuGlyph label="Search" small />}
          <span data-look-title className="min-w-0 truncate leading-5">{one.hit ? one.hit.title : one.count !== undefined ? `${one.site.word} · ${plural(one.count, 'result')}` : one.said ?? `Search ${one.site.say} for ${quoted(clip(lookWords, 40), 80)}`}</span>
          {one.hit && !one.under && <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">{one.site.word}</span>}
          {one.count !== undefined && <ChevronRight aria-hidden className={`ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-(--mf-ease) ${open ? 'rotate-90' : ''}`} />}
        </span>
        {one.hit && (one.hit.line || one.hit.picture) && (
          <span data-look-line className="flex h-5 min-w-0 items-center gap-2 pl-6 text-sm leading-5 text-muted-foreground">
            {one.hit.picture && <img src={one.hit.picture} alt="" className="size-5 shrink-0 rounded-[4px] border border-border/60 object-cover" />}
            <span className="min-w-0 truncate">{one.hit.line}</span>
          </span>
        )}
      </button>
      </RowMenu>
    )
  }

  return (
    // A dialog, said so: what is under it (the box's keys, a celebration's Escape) knows to leave the keys alone.
    // Arc's command bar, by click: the scrim fades in over 120ms and the panel
    // rises 6px into place. By ⌘K it is simply there (sheetMotion).
    // In a pane it is the page itself: the same box, list and keys, with a calm line over them saying what the pane is for.
    <motion.div role={present && !inPane ? 'dialog' : undefined} aria-modal={(present && !inPane) || undefined} aria-label="Search"
      {...(inPane ? {} : sheet.scrim)} data-pane-picker={inPane ? '' : undefined} data-keeps-size={inCard || undefined}
      className={inPane ? 'flex min-h-0 min-w-0 flex-1 flex-col' : inCard ? `absolute inset-0 z-50 flex rounded-[inherit] ${present ? '' : 'pointer-events-none'}` : `fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[10vh] ${present ? '' : 'pointer-events-none'}`} onMouseDown={inPane ? undefined : onClose}>
      {inPane && (
        <div className="shrink-0 px-5 pt-8 pb-4">
          <h2 className="text-title font-medium">{inPane.title}</h2>
          <p className="mt-1 leading-relaxed text-muted-foreground">{inPane.lead}</p>
        </div>
      )}
      <motion.div
        {...(inPane ? {} : sheet.panel)}
        className={inPane ? 'mx-3 mb-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border text-sm' : inCard ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[inherit] bg-background text-sm' : `flex h-[70vh] w-[min(56rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl text-sm ${FLOAT}`} onMouseDown={(event) => event.stopPropagation()}>
        {/* The box's row sits under the window's drag strip along the top of quick capture's card: here a press is the
            box's, never a move of the window (the Mac's drag region, and Haligtree's own carry, lib/carry.ts). */}
        <label className="flex items-center gap-3 border-b px-4 py-3" style={{ WebkitAppRegion: 'no-drag', '--mf-drag': 0 } as CSSProperties}>
          <span className="text-muted-foreground"><AliveIcon icon={MagnifierIcon} size={16} /></span>
          {scoped && scope && !picking && !choosing && (
            <span data-search-scope className="flex max-w-[40%] shrink-0 items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-body font-medium text-foreground">
              <span className="truncate">{scope.label}</span>
            </span>
          )}
          <input
            ref={box}
            autoFocus
            className="flex-1 bg-transparent text-heading outline-none"
            placeholder={picking ? 'Pick a theme…' : choosing ? `${choosing.action.label.replace(/…$/, '')}: pick one…` : scoped && scope ? 'Tell it what to do: friday 3pm, +1h, 45 min, delete… ⌫ for everything' : placeholder ?? (actions.length ? 'Do something, or search everything…' : 'Search everything… kind:quote to narrow')}
            value={picking ? themeQuery : choosing ? choiceQuery : query}
            onChange={(event) => picking ? (setThemeQuery(event.target.value), setThemeAt(0)) : choosing ? (setChoiceQuery(event.target.value), setChoiceAt(0)) : setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (choosing) {
                if (event.key === 'Escape' || (event.key === 'Backspace' && !choiceQuery)) unchoose()
                else if (event.key === 'Enter') { if (choices[choiceAt]) choose(choices[choiceAt]) }
                else if (event.key === 'ArrowDown' || (event.ctrlKey && event.key === 'j')) { click('soft'); setChoiceAt((n) => Math.min(n + 1, choices.length - 1)) }
                else if (event.key === 'ArrowUp' || (event.ctrlKey && event.key === 'k')) { click('soft'); setChoiceAt((n) => Math.max(n - 1, 0)) }
                else return
                event.preventDefault()
              }
              else if (picking) {
                if (event.key === 'Escape' || (event.key === 'Backspace' && !themeQuery)) unpick()
                else if (event.key === 'Enter') { if (theme) keep(theme) }
                else if (event.key === 'ArrowDown' || (event.ctrlKey && event.key === 'j')) setThemeAt((n) => Math.min(n + 1, themes.length - 1))
                else if (event.key === 'ArrowUp' || (event.ctrlKey && event.key === 'k')) setThemeAt((n) => Math.max(n - 1, 0))
                else return
                event.preventDefault()
              }
              // In a pane, closing the pane makes its own sound.
              else if (event.key === 'Escape') { event.preventDefault(); if (!inPane) chime('fold'); onClose() }
              // ⌫ in an empty box opened about one thing: every action again.
              else if (event.key === 'Backspace' && scoped && !query) { chime('fold'); setScoped(false); setAt(0) }
              // ⌘A: the words first, as any box; pressed again with them all selected (or none typed), every result.
              else if (event.metaKey && !event.shiftKey && !event.altKey && event.code === 'KeyA' && results.length && event.currentTarget.selectionStart === 0 && event.currentTarget.selectionEnd === event.currentTarget.value.length) several.selectAll()
              // ⇧↵, Arc's instant link: the top result opens, wherever the highlight is.
              else if (event.key === 'Enter' && event.shiftKey && rowsShown[0]) onOpen(rowsShown[0].type, rowsShown[0].id)
              else if (event.key === 'Enter' && at < doing.length) run(doing[at], event.altKey)
              else if (event.key === 'Enter' && look) runLook(look, event.altKey ? 'aside' : event.metaKey ? 'tab' : undefined)
              else if (event.key === 'Enter' && current && event.altKey && onAside) onAside(current.type, current.id)
              else if (event.key === 'Enter' && current && event.metaKey && onTab) onTab(current.type, current.id)
              else if (event.key === 'Enter' && current) (aimAt(current.id, current.line), onOpen(current.type, current.id))
              else if (event.key === 'Tab' && current?.type === 'capture') setAsking(true)
              // Tab anywhere else stays in the box, so the arrows, Enter and Esc keep working.
              else if (event.key === 'Tab') { /* kept here */ }
              // ⌘; a thought on the highlighted one, without opening it.
              // Taken even on an action, so it never reaches a hint card behind search.
              else if (event.metaKey && event.key === ';') { if (glossable) { chime('tap'); setGlossing(true); if (preview) openGloss(current.id) } }
              // The arrows, or Ctrl-J and Ctrl-K: the editor's vim, carried into the box.
              else if (event.key === 'ArrowDown' || (event.ctrlKey && event.key === 'j')) { click('soft'); setAt((n) => Math.min(n + 1, total - 1)) }
              else if (event.key === 'ArrowUp' || (event.ctrlKey && event.key === 'k')) { click('soft'); setAt((n) => Math.max(n - 1, 0)) }
              else return
              event.preventDefault()
            }}
          />
          <Tip label={pane ? 'Hide the preview' : 'Show the preview'}>
          <button type="button" aria-label={pane ? 'Hide the preview' : 'Show the preview'} className={`rounded p-1 hover:bg-accent ${pane ? 'text-foreground' : 'text-muted-foreground'} ${roomy && !inPane ? '' : 'hidden'}`} onClick={() => { chime('tap'); setPane(!pane); box.current?.focus() }}>
            <AliveIcon icon={LayoutSidebarRightIcon} size={16} />
          </button>
          </Tip>
        </label>
        {/* One gap everywhere; the groups are told apart by a hairline, not by wider gaps. */}
        {/* A chip clicked hands the keys straight back to the box: the arrows and Esc never go dead. */}
        <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 border-b px-2 py-1.5" onClick={() => box.current?.focus()}>
          {choosing ? <span className="px-2 py-0.5 text-xs text-muted-foreground">⌫ or Esc goes back to every action</span> : picking ? <span className="px-2 py-0.5 text-xs text-muted-foreground">Each one is worn as you pass it</span> : <>
          <Chips options={[{ id: 'name', label: 'Titles only' }]} on={() => titleOnly} pick={() => setTitleOnly(!titleOnly)} />
          <span aria-hidden className="mx-1 h-3.5 w-px bg-border" />
          <Chips options={[{ id: 'capture', label: 'Captures' }, { id: 'nugget', label: 'Gems' }, { id: 'task', label: 'Tasks' }, { id: 'event', label: 'Events' }]} on={(id) => types.includes(id)} pick={(id) => setTypes(flip(types, id))} />
          <span aria-hidden className="mx-1 h-3.5 w-px bg-border" />
          <Chips options={[{ id: 'kind', label: kinds.length ? `Kind · ${num(kinds.length)}` : 'Kind…', tip: kindsOpen ? undefined : 'Quotes, terms, links and the other kinds of capture' }]} on={() => kindsOpen || kinds.length > 0} pick={() => setKindsOpen(!kindsOpen)} />
          {kindsOpen && <span aria-hidden className="mx-1 h-3.5 w-px bg-border" />}
          {kindsOpen && <Chips options={[...CAPTURE_TYPES]} on={(id) => kinds.includes(id)} pick={(id) => setKinds(flip(kinds, id))} />}
          </>}
        </div>
        <div className="flex min-h-0 flex-1">
          {/* mf-more: faded at an edge while there is more past it; the scroll
              padding keeps a row the arrows reach clear of that fade. */}
          {/* An island's fold or "Show more" clicked hands the keys straight back to the box, as a chip does. */}
          <div ref={rows} data-answers={searched ?? undefined} onClick={(event) => (event.target as HTMLElement).closest('[data-island-head], [data-island-more]') && box.current?.focus()} className={`mf-more relative isolate min-h-0 min-w-0 flex-1 scroll-pt-8 scroll-pb-12 overflow-y-auto p-2 ${shown ? 'w-1/2 flex-none' : ''}`}>
            {/* Over the islands' surfaces and under the rows (each row `relative`, drawn after it): at -z-10 an island's surface hid it. */}
            <Highlight chosen={lit} className="z-0 rounded-md bg-accent" />
            {choosing ? <>
              <div className="px-2 pt-1 pb-1 text-xs text-muted-foreground">{choosing.action.label.replace(/…$/, '')}</div>
              {choices.map((one, index) => (
                <button
                  // By its place too: two books may share a name.
                  key={`${index}:${one.label}`}
                  type="button"
                  // `relative`: drawn over the light under the rows, as an action's row is. Without it the lit choice's
                  // words were painted under the light, so the first choice (the one ↵ takes) showed as an empty band.
                  className="relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left"
                  data-choice=""
                  data-choice-at={index === choiceAt || undefined}
                  onMouseMove={(event) => realMove(event) && setChoiceAt(index)}
                  onClick={() => choose(one)}
                >
                  {one.mark}
                  {/* Cut where it runs long, the whole of it on rest (a title is shown only when its words are cut). */}
                  <span title={one.label} className="min-w-0 flex-1 truncate">{one.label}</span>
                  {one.note && <span data-choice-note className="shrink-0 text-xs text-muted-foreground">{one.note}</span>}
                </button>
              ))}
              {!choices.length && <p className="px-2 py-3 text-sm text-muted-foreground"><Typed text="None by that name." /></p>}
            </> : picking ? <>
              {themes.map((one, index) => (
                <button
                  key={one}
                  type="button"
                  className="relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left"
                  data-theme-at={index === themeAt || undefined}
                  // Only a mouse that really moves: a repaint under a resting
                  // cursor would otherwise pull the highlight back to it.
                  onMouseMove={(event) => realMove(event) && setThemeAt(index)}
                  onClick={() => keep(one)}
                >
                  <Swatch theme={one} />
                  <span className="min-w-0 flex-1 truncate">{themeName(one)}</span>
                  {one === before.current && <span role="img" aria-label="Current" className="shrink-0 text-muted-foreground">✓</span>}
                </button>
              ))}
              {!themes.length && <p className="px-2 py-3 text-sm text-muted-foreground"><Typed text="No theme by that name." /></p>}
            </> : <>
            {/* What can be done, an island of its own, as the Inbox draws a kind; words that match nothing, one of what they can become. */}
            {(keepFirst ? (['keep', 'act'] as const) : (['act', 'keep'] as const)).map((which) => {
              const act = which === 'act'
              const list = act ? acting : keeping
              if (!list.length) return null
              const drawn = act ? actingShown : keepingShown
              const from = act ? (keepFirst ? keepingShown.length : 0) : (keepFirst ? 0 : actingShown.length)
              return (
                // Every row showing, so no "Show more" under it (whole: false with all shown).
                <IslandBox key={which} plain name={act ? 'Actions' : 'Nothing called that yet'} island={{ ...(act ? actionsIsland : keepIsland), whole: false }} shown={list.length} uncounted={!act}
                  icon={act ? <Command aria-hidden className="size-4 shrink-0 text-muted-foreground" /> : <Plus aria-hidden className="size-4 shrink-0 text-muted-foreground" />}>
                  {drawn.map((one, step) => actionRow(one, from + step))}
                </IslandBox>
              )
            })}
            {!query.trim() && !doing.length && !acting.length && (
              <p className="px-2 py-3 text-body text-muted-foreground"><Typed text="Type to search notes, gems, writing and tasks. kind:quote narrows to one kind." /></p>
            )}
            {slow && query.trim() && (
              // The orb only if it is a real wait: a search back at once never shows it.
              <p className="flex px-2 py-2"><Orb label="Searching…" className="animate-in fade-in-0 duration-200" /></p>
            )}
            {!pre && query.trim() && searched === query && !results.length && !acting.length && !keeping.length && (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                <Typed text={types.length || kinds.length || titleOnly
                  ? 'Nothing matches with those filters. Turn a chip off to widen it.'
                  : 'Nothing matches. Try fewer words: every word has to appear somewhere.'} />
              </p>
            )}
            {/* Found only by close spellings: said first, so none of them reads as a match (the user, 15 Nov 2026, of
                "faustian": "why is it lying about occurence?"). */}
            {!pre && query.trim() && searched === query && results.length > 0 && results.every((one) => one.match === 'near') && !acting.length && (
              <p data-search-none className="px-2 py-3 text-sm text-muted-foreground">
                <Typed text={`Nothing has ${quoted(query.trim(), 40)} as you typed it. Below, words spelled close to it.`} />
              </p>
            )}
            {/* What was found, an island a kind; before typing, what was opened and kept last. */}
            {(() => {
              let from = 0
              return islandGroups.map(([name, list]) => {
                const start = from
                from += list.length
                const rows = list.map((capture, step) => resultRow(capture, start + step, name))
                const isle = islands?.[name]
                return isle ? <IslandBox key={name} plain name={name} island={isle} shown={list.length} icon={ISLAND_ICON[name]}>{rows}</IslandBox> : <Fragment key={name}>{rows}</Fragment>
              })
            })()}
            {/* Under your own results: Wikipedia and the other free sites, each asked when its line is picked, or as you type where Settings says so. */}
            {lookRows.length > 0 && (
              <IslandBox plain name={pre ? pre.site.word : 'Look it up'} island={{ ...lookIsland, whole: false }} shown={lookRows.length} uncounted
                icon={<BookOpenText aria-hidden className="size-4 shrink-0 text-muted-foreground" />}>
                {lookShown.map((one, step) => {
                  if (one.under) return null
                  const base = doing.length + rowsShown.length
                  // An open site's answers hang under its row, as children do everywhere (Branches): its trunk lit to the one in the light.
                  const under = one.count !== undefined && openSites.includes(one.site.id) ? lookShown.flatMap((each, place) => (each.under && each.site === one.site ? [place] : [])) : []
                  return (
                    <Fragment key={`${one.site.id}:${step}`}>
                      {lookRow(one, base + step)}
                      {under.length > 0 && <Branches current={under.findIndex((place) => base + place === at)} className="ml-5 flex flex-col">{under.map((place) => lookRow(lookShown[place], base + place))}</Branches>}
                    </Fragment>
                  )
                })}
              </IslandBox>
            )}
            </>}
          </div>
          {/* The right half, Notion's way: one framed card (its own fill, a hairline, rounded, inset from the edges) that shows
              the lit row. A result reads as it does, read only; an action says what it does, alone. One frame for all, so nothing jumps as the arrows move. */}
          {shown && (
            <div data-cmdk-panel className="mf-island m-3 ml-1 flex w-1/2 min-w-0 flex-col overflow-hidden rounded-[14px] border">
              <div className="min-h-0 flex-1 overflow-y-auto [--mf-padding:1rem_1.25rem]">
                {picking
                  ? theme && (
                    // A small page in the theme: the whole window wears it behind, this says which.
                    <div key={theme} className="flex flex-col gap-2 p-4">
                      <p className="font-heading text-xl font-semibold text-heading">{themeName(theme)}</p>
                      <p className="text-body text-foreground">The quick brown fox jumps over the lazy dog.</p>
                      <p className="text-body text-muted-foreground">Quieter words, for dates and asides.</p>
                      <p className="text-body"><span className="text-(--mf-accent-ink) underline underline-offset-2">A link</span> <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-xs">a chip</span></p>
                    </div>
                  )
                  : current
                  ? current.type === 'task' ? <TaskPreview id={current.id} /> : current.type === 'pdf' ? <PdfPeek label={current.label} id={current.id} /> : current.type === 'web' || current.type === 'work' ? <WebPeek label={current.label} site={current.source} /> : current.type === 'media' ? <MediaPeek label={current.label} id={current.id} kind={current.kind} /> : current.type === 'event' ? <EventPeek id={current.id} /> : <NotePreview capture={current} words={[...(current.near ?? []), ...words]} />
                  : look
                  ? <LookPeek key={`${look.site.id}:${look.hit?.href ?? look.count ?? ''}`} one={look} words={lookWords} offline={!!outside?.offline} open={openSites.includes(look.site.id)} />
                  : action?.keep
                    // Nothing found: the half says so, and what Enter does with the words.
                    ? <div key={action.label} className="flex flex-col gap-2 p-4">
                      <p className="text-base font-medium text-pretty text-foreground">Nothing called that yet.</p>
                      <p className="text-body text-pretty text-(--mf-muted-strong)"><strong className="font-semibold text-foreground">Enter keeps it</strong> {action.keep === 'box' ? 'in quick capture, ready to finish there.' : `${KEPT_AS[action.keep]}, and opens it to write more.`}</p>
                    </div>
                  : action
                    // A lit action: only that action, what it does, and (in the bar under it) its key. Nothing else
                    // in the card, so it never reads as the day or the pins.
                    // Laid out as a result's head is (PreviewHead): its icon, its name, then what it does and its key under it.
                    ? <div key={action.label} data-action-line={plain ? '' : undefined} className="flex flex-col gap-1.5 px-5 pt-5">
                      {action.icon ? <AliveIcon icon={action.icon} size={24} className="shrink-0 text-muted-foreground" /> : <ActionIcon label={action.label} />}
                      <div>
                        <p className="text-lg font-semibold text-pretty text-foreground">{action.label}</p>
                        {plain?.hint && <p data-action-said className="mt-0.5 text-body text-pretty text-muted-foreground">{plain.hint}</p>}
                        {plain?.keys && keyFor(plain.keys) && <p data-action-keys className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><span className="flex gap-0.5"><Pressed keys={plain.keys} each /></span> any time</p>}
                        {/* A word asked about says what it means here before Enter opens the rest. */}
                        {asked && action === doing[0] && <p className="mt-1 text-body text-muted-foreground">{asked.line}</p>}
                      </div>
                    </div>
                    : <p className="p-4 text-body text-muted-foreground">Move onto something to see it here.</p>}
              </div>
              {/* One bar under every item: a thought on a result (⌘; or a click),
                  or how to do an action; none where there is nothing to say. */}
              {(picking ? !!before.current : !!current) && <div className="flex min-h-9 shrink-0 items-center gap-3 border-t px-4 py-1.5 text-xs text-muted-foreground">
                {picking ? (
                  before.current && <span className="flex items-center gap-1.5"><Swatch theme={before.current} /> Was {themeName(before.current)}</span>
                ) : current?.type === 'event' ? (
                  <span><Kbd>↵</Kbd> open it on the Calendar</span>
                ) : current?.type === 'day' ? (
                  <span><Kbd>↵</Kbd> open it in the Journal</span>
                ) : current?.type === 'pdf' || current?.type === 'web' ? (
                  <span><Kbd>↵</Kbd> open it in the reader</span>
                ) : current?.type === 'media' ? (
                  <span><Kbd>↵</Kbd> show it in Files</span>
                ) : current ? (
                  <>
                    <div className="min-w-0 flex-1"><GlossLine key={current.id} id={current.id} open={glossing} onDone={backToBox} keys="⌘;" /></div>
                    {current.type === 'capture' && !glossing && !asking && (
                      <span className="shrink-0">{current.attribution ?? <><Kbd>Tab</Kbd> who said it</>}</span>
                    )}
                  </>
                ) : null}
              </div>}
            </div>
          )}
        </div>
        {/* How to drive it, always there; the Enter word follows what is highlighted. Each hint on one line; a narrow window puts the rest on a second row, and a short one keeps only navigate, the Enter word and esc. */}
        {several.bar ? (
          // Results picked: the line under the list is what can be done with them.
          <div data-pick-bar className="flex min-h-9 shrink-0 items-center border-t px-3 py-1">{several.bar}</div>
        ) : (
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-1.5 text-xs whitespace-nowrap text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="flex gap-0.5"><Kbd>↑</Kbd><Kbd>↓</Kbd></span> navigate</span>
          <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> <Rolling text={picking || action?.keep ? 'keep' : choosing || !menus ? 'pick' : action ? 'use' : look?.hit ? 'read' : look?.count !== undefined ? (openSites.includes(look.site.id) ? 'fold' : 'show them') : look ? 'ask' : 'open'} /></span>
          {!picking && !choosing && rowsShown.length > 0 && current !== rowsShown[0] && <span className="flex items-center gap-1.5 [@media(max-height:520px)]:hidden"><Kbd>⇧↵</Kbd> open the top result</span>}
          {!picking && !choosing && ((onAside && !action && current) || (canSplit() && look?.hit) || action?.aside) && <span className="flex items-center gap-1.5 [@media(max-height:520px)]:hidden"><Kbd>⌥↵</Kbd> to the side</span>}
          {!picking && !choosing && ((onTab && !action && current) || (canSplit() && look?.hit)) && <span className="flex items-center gap-1.5 [@media(max-height:520px)]:hidden"><Kbd>⌘↵</Kbd> new tab</span>}
          {!picking && !choosing && results.length > 1 && <span className="flex items-center gap-1.5 [@media(max-height:520px)]:hidden"><Kbd>⌘</Kbd>-click selects</span>}
          <span className="flex items-center gap-1.5"><Kbd>esc</Kbd> <Rolling text={picking || choosing ? 'back' : inPane ? 'close the tab' : 'close'} /></span>
        </div>
        )}
      </motion.div>
    </motion.div>
  )
}

/**
 * A note as the preview shows it: its start, read only, fetched for the one
 * highlighted rather than sent along with every result.
 */
/** What `draw` gives, drawn again only when one of `deps` changes. */
const Kept = memo(({ draw }: { deps: unknown[]; draw: () => ReactNode }) => <>{draw()}</>, (was, now) => was.deps.length === now.deps.length && was.deps.every((one, at) => Object.is(one, now.deps[at])))

/** A journal day found, as the Journal and the Feed name it. */
const DAY_KIND = { icon: Sun, tint: 'var(--tt-color-text-orange)' }
const PDF_KIND = { icon: FileText, tint: 'var(--tt-color-text-red)' }
/** A goal found, wearing its kind's mark (lib/goal-kind.ts): a flag, the someday telescope, or on ice. Search names its kind in `kind`. */
const goalLook = (kind: string): { icon: (typeof KIND_ICON)[GoalKind]; tint: string } =>
  ({ icon: KIND_ICON[(kind in KIND_ICON ? kind : 'dated') as GoalKind], tint: kind === 'iced' ? ICE : 'var(--tt-color-text-orange)' })
/** A web page kept as an article. */
const MEDIA_KIND = { icon: ImageIcon, tint: 'var(--tt-color-text-purple)' }
const WEB_KIND = { icon: BookOpen, tint: 'var(--tt-color-text-blue)' }
/** A work a note can cite (a book, an article), found by its title, authors, DOI or ISBN. */
const WORK_KIND = { icon: BookMarked, tint: 'var(--tt-color-text-brown)' }

/** Search's preview of a kept article: its title and the site it came from. */
function WebPeek({ label, site }: { label: string; site: string }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 p-4">
      <p className="text-base font-medium text-pretty text-foreground">{label}</p>
      <p className="text-body text-muted-foreground">Article{site ? `, ${site}` : ''}</p>
    </div>
  )
}

/**
 * Search's preview of a "Look it up" row. An answer as Wikipedia's own hover
 * card has it: its name in bold, its one line, its picture square-cornered on
 * the right, and where it opens. A site's line: what picking it sends, and
 * the prefix that searches that site alone. A line saying why there is none: itself.
 */
function LookPeek({ one, words, offline, open }: { one: Look; words: string; offline: boolean; open: boolean }): React.JSX.Element {
  const { site, hit } = one
  // The same mark as its row: the way out of reach, nothing found, or a search.
  const Said = offline ? WifiOff : SearchX
  const named = site.name.replace(/^the /, 'The ')
  if (hit)
    return (
      <div data-look-peek className="flex flex-col gap-3 p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-pretty text-foreground">{hit.title}</p>
            {hit.line && <p className="mt-0.5 text-body text-pretty text-muted-foreground">{hit.line}</p>}
          </div>
          {hit.picture && <img src={hit.picture} alt="" className="size-16 shrink-0 rounded-[4px] object-cover" />}
        </div>
        <p className="text-xs text-pretty text-muted-foreground">From {site.name}{hit.picture ? ', its picture from Wikimedia Commons' : ''}. Read here in the reader and kept with your notes, so it opens again offline.</p>
      </div>
    )
  // A site asked as you type: what it found, and that it was asked because Settings says so.
  if (one.count !== undefined)
    return (
      <div data-look-peek className="flex flex-col gap-1.5 px-5 pt-5">
        <BookOpen aria-hidden className="size-6 shrink-0" style={{ color: 'var(--tt-color-text-blue)' }} />
        <div>
          <p className="text-lg font-semibold text-pretty text-foreground">{`${named} found ${plural(one.count ?? 0, 'page')} for ${quoted(clip(words, 40), 80)}`}</p>
          <p className="mt-0.5 text-body text-pretty text-muted-foreground">Asked as you typed, with these words only, because “Look things up as I search” is on in Settings.</p>
          {<p className="mt-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground"><Kbd>↵</Kbd> {open ? 'folds them away.' : 'shows them, each with a line on what it is.'}</p>}
        </div>
      </div>
    )
  return (
    <div data-look-peek className="flex flex-col gap-1.5 px-5 pt-5">
      {one.said ? <Said aria-hidden className="size-6 shrink-0 text-muted-foreground" /> : <ActionIcon label="Search" />}
      <div>
        <p className="text-lg font-semibold text-pretty text-foreground">{one.said ?? (one.asking ? `Asking ${site.name}…` : `Search ${site.name} for ${quoted(clip(words, 40), 80)}`)}</p>
        {one.said && <p className="mt-0.5 flex flex-wrap items-center gap-1 text-body text-pretty text-muted-foreground"><Kbd>↵</Kbd> asks {site.name} again.</p>}
        {!one.said && <p className="mt-0.5 text-body text-pretty text-muted-foreground">{named}’s own search, asked only when you pick this line, and only with these words: nothing of your notes is sent.</p>}
        {!one.said && !one.asking && <p className="mt-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground"><Kbd>↵</Kbd> asks it. To search {site.word} alone, type <Kbd>{site.prefix}</Kbd> and a space before the words.</p>}
      </div>
    </div>
  )
}

/** Search's preview of a PDF: its title and the file it came as. */
/** A file in Media with no note: itself, and where it is. */
function MediaPeek({ label, id, kind }: { label: string; id: string; kind: string }): React.JSX.Element {
  const src = id.slice(0, id.indexOf('|'))
  return (
    <div className="flex flex-col gap-2 p-4">
      <p className="text-base font-medium text-pretty text-foreground">{label}</p>
      <p className="text-body text-muted-foreground">In Files, in no note yet</p>
      {kind !== 'audio' && <MediaPeekFace src={src} kind={kind} />}
    </div>
  )
}
/** A picture as it is; a video's frame or a document's first page as the Mac's Quick Look draws it (none: nothing). */
function MediaPeekFace({ src, kind }: { src: string; kind: string }): React.JSX.Element | null {
  const picture = kind === 'picture' || kind === 'gif'
  const [face, setFace] = useState(picture ? src : '')
  useEffect(() => {
    if (picture) return void setFace(src)
    let live = true
    void smallPicture(src, true).then((made) => live && setFace(made), () => undefined)
    return () => void (live = false)
  }, [src, picture])
  return face ? <img src={face} alt="" className="max-h-64 w-full rounded-lg object-contain" /> : null
}
function PdfPeek({ label, id }: { label: string; id: string }): React.JSX.Element {
  const name = id.slice(id.indexOf('|') + 1)
  return (
    <div className="flex flex-col gap-2 p-4">
      <p className="text-base font-medium text-pretty text-foreground">{label}</p>
      <p className="text-body text-muted-foreground">PDF{name ? `, ${name}` : ''}</p>
    </div>
  )
}
const dayName = (day: string): string => dayjs(day).format(dayjs(day).year() === dayjs().year() ? 'dddd D MMMM' : 'dddd D MMMM YYYY')

/** What a result wears, in its row and atop its preview: a task the task mark it has everywhere else, not the to-do kind's. */
const lookOf = (capture: Capture): { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; tint?: string } =>
  capture.type === 'goal' ? goalLook(capture.kind) : capture.type === 'task' ? TASK_KIND : capture.type === 'event' ? EVENT_KIND : capture.type === 'day' ? DAY_KIND : capture.type === 'pdf' ? PDF_KIND : capture.type === 'web' ? WEB_KIND : capture.type === 'media' ? MEDIA_KIND : capture.type === 'work' ? WORK_KIND : CAPTURE_TYPES.find((type) => type.id === capture.kind) ?? CAPTURE_TYPES[0]

/** The plain words of a body's first block, to tell whether it already starts with the result's name. */
const firstWords = (body: unknown): string => {
  const words = (node: JSONContent | undefined): string => (node?.text ?? '') + (node?.content ?? []).map(words).join('')
  return (typeof body === 'string' ? body.split('\n')[0] : words((body as JSONContent | null)?.content?.[0])).trim()
}

/** Atop the preview, as Notion's card: what it is, its name, and where it lives, quietly. Its name is left out where the body opens with it. */
/** An action's own drawing, at a result head's size, from its words as its row's is. */
function ActionIcon({ label }: { label: string }): React.JSX.Element {
  const Icon = menuIcon(label)
  return <Icon aria-hidden className="size-6 shrink-0 text-muted-foreground" />
}

function PreviewHead({ capture, named }: { capture: Capture; named: boolean }): React.JSX.Element {
  const look = lookOf(capture)
  const kind = capture.type === 'capture' ? (CAPTURE_TYPES.find((type) => type.id === capture.kind) ?? CAPTURE_TYPES[0]).label : typeSaid(capture.type)
  const where = whereFrom(capture.source, capture.label)
  return (
    <div data-preview-head className="flex flex-col gap-1.5 px-5 pt-5">
      <look.icon className="size-6 shrink-0" style={{ color: look.tint }} />
      {named && <p className="text-lg font-semibold text-pretty text-foreground">{(capture.type === 'day' ? dayName(capture.id) : taskName(capture.label ?? '').text) || 'New note'}</p>}
      <p className="text-xs text-muted-foreground">{[kind, where, capture.capturedAt && age(capture.capturedAt)].filter(Boolean).join(' · ')}</p>
    </div>
  )
}

function NotePreview({ capture, words }: { capture: Capture; /** The words searched for: lit where they stand, the first brought into view (for a close spelling, the words that stood in). */ words: string[] }): React.JSX.Element | null {
  const { type, id } = capture
  // Lit as a note's own find lights them, the first in view: where it matches is shown, never only said (the user, 15 Nov
  // 2026: "why is it lying about occurence?").
  const editor = useRef<Editor | null>(null)
  const lit = (one: Editor): void => {
    if (one.isDestroyed) return
    // At once, in one step, not after the find bar's pause for typing (250 ms): the first match is gone to right after.
    one.view.dispatch(one.state.tr.setMeta(FindAndReplacePluginKey, { searchTerm: words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), useRegex: true }))
    if (!words.length) return
    one.commands.goToNextResult()
    // Brought into view as the note's own find brings it (search-bar.tsx `centre`): at once, or once a long note has drawn it.
    const centre = (): boolean => {
      const match = one.view.dom.querySelector('.find-and-replace-result-current')
      match?.scrollIntoView({ block: 'center', behavior: 'instant' })
      return !!match
    }
    if (!centre()) requestAnimationFrame(centre)
  }
  useEffect(() => void (editor.current && lit(editor.current)), [words.join(' ')]) // eslint-disable-line react-hooks/exhaustive-deps
  // The last one stays until the next arrives: no blank flash between rows.
  const [shown, setShown] = useState<{ id: string; body: unknown; capture: Capture } | null>(null)
  useEffect(() => {
    let old = false
    void window.api.captures.peek(type, id, words).then((body) => !old && setShown({ id, body, capture }))
    return () => void (old = true)
  }, [type, id, words.join(' ')]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!shown) return null
  const name = taskName(shown.capture.label ?? '').text.trim()
  const opens = firstWords(shown.body)
  return (
    <div key={shown.id}>
      <PreviewHead capture={shown.capture} named={!!name && !(opens && (opens.startsWith(name) || name.startsWith(opens)))} />
      <HaligtreeEditor defaultContent={(shown.body as JSONContent | string | null) ?? ''} readOnly toolbar={false} handles={false} slash={false} outline={false} autofocus={false} onReady={(one) => ((editor.current = one), lit(one))} />
    </div>
  )
}

/**
 * A task as the preview shows it: its name, when it is planned and due, how
 * much it matters, its steps and its notes. A task's notes alone were often
 * empty, which left the preview an empty frame.
 */
function TaskPreview({ id }: { id: string }): React.JSX.Element | null {
  const [task, setTask] = useState<TaskFull | null>(null)
  const time = useTaskTime()
  useEffect(() => {
    let old = false
    void haligtree.task(id).then((found) => !old && setTask(found))
    return () => void (old = true)
  }, [id])
  // The time spent on it, last of its facts: the row itself is one line with no room for it.
  const spent = time.of(id)
  if (!task) return null
  const later = bucket(task)
  const facts = [
    task.dueAt ? `Scheduled ${whenInLine(task.dueAt, !!task.allDay)}` : later ? BUCKETS[later] : 'No date',
    task.deadline && `Due by ${whenInLine(task.deadline, !task.deadlineTimed)}`,
    task.priority ? PRIORITY_NAMES[task.priority] : null,
    task.status !== 'open' && (task.status === 'done' ? 'Done' : 'Dropped'),
    spent && spentSaid(task, spent.minutes)
  ].filter(Boolean)
  const notes = /"text":|"src":/.test(JSON.stringify(task.notes ?? null))
  return (
    <div key={task.id} className="flex flex-col gap-3 p-4 text-body">
      <div>
        <p className="flex items-center gap-2 text-base font-medium text-foreground"><TaskSite task={task} /><span className="min-w-0">{taskName(task.title).text || 'Untitled task'}</span><Tags tags={taskName(task.title).tags} go={false} /></p>
        {task.link && <p className="mt-0.5 flex min-w-0 text-meta text-muted-foreground"><TaskAddress task={task} /></p>}
        <p data-task-facts className="mt-1 text-muted-foreground">{facts.join(' · ')}</p>
      </div>
      {task.subtasks.length > 0 && (
        <ul className="flex flex-col gap-1">
          {task.subtasks.map((one, index) => (
            <li key={index} className={`flex items-baseline gap-2 ${one.done ? 'text-muted-foreground line-through' : ''}`}>
              <span aria-hidden className="shrink-0">{one.done ? '☑' : '☐'}</span>
              <span className="min-w-0">{one.text}</span>
            </li>
          ))}
        </ul>
      )}
      {notes && (
        <div className="-mx-4 border-t pt-1">
          <HaligtreeEditor defaultContent={task.notes as JSONContent} readOnly toolbar={false} handles={false} slash={false} outline={false} search={false} autofocus={false} />
        </div>
      )}
    </div>
  )
}

/** The day a task found is planned for, or due by, said as the lists say it. */
function TaskDay({ task }: { task: Task | undefined }): React.JSX.Element | null {
  const at = task?.dueAt ?? task?.deadline
  if (!task || !at || task.status !== 'open') return null
  const late = dayjs(at).isBefore(dayjs(), 'day')
  return (
    <span data-search-task-day className={`shrink-0 text-control font-medium tabular-nums ${late ? 'text-[var(--tt-color-text-red)]' : 'text-foreground'}`}>
      {task.dueAt ? '' : 'Due '}{whenInLine(at, task.dueAt ? !!task.allDay : !task.deadlineTimed)}
    </span>
  )
}

