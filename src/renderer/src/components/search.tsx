import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type ComponentProps } from 'react'
import { FLOAT } from '@/lib/float'
import { motion, useIsPresent } from 'motion/react'
import { shift } from '@/lib/motion'
import { chime, click, step, type Cue } from '@/lib/sound'
import { allThemes, applyTheme, currentTheme, themeName, type Theme } from '@/lib/theme'
import { Swatch } from './theme/theme-picker'
import type { JSONContent } from '@tiptap/core'

import { CAPTURE_TYPES } from './capture-kinds/capture-kind-picker'
import { whereFrom } from './capture-list'
import { MindflowEditor } from './mindflow'
import { AskWho, Kbd, Rolling, Tags, Typed, Pressed } from './vigil/ui'
import { useWorking } from './vigil/beam'
import { AliveIcon } from './vigil/alive-icon'
import { Orb } from './vigil/orb'
import MagnifierIcon from '@/components/ui/magnifier-icon'
import LayoutSidebarRightIcon from '@/components/ui/layout-sidebar-right-icon'
import { Chips } from './vigil/display'
import { Highlight, useChosen } from './vigil/glide'
import { Tip } from '@/components/vigil/ui'
import { useLive, vigil, whenInLine, type Pin, type Task, type TaskFull } from '@/lib/vigil'
import { RowMenu, type RowItem } from './vigil/row-menu'
import { taskMenu, useTaskNow } from './vigil/tasks-view'
import { sideMenu } from './vigil/open-today'
import { PriorityMark } from './vigil/task-input'
import { BUCKETS, bucket, taskName } from '@/lib/tasks'
import { PRIORITY_NAMES } from '../../../main/task-words'
import { GlossLine, openGloss } from './vigil/gloss-line'
import { dayjs, daysSince } from '../../../main/dates'
import { keyFor } from '@/lib/keys'
import { wordFor } from '@/lib/words'
import { ALL_WORDS, openWord } from './vigil/term'
import { realMove } from '@/lib/real-move'
import { typeSaid } from '@/lib/capture-links'
import { PICKED_MARK, usePickMixed } from './vigil/pick-mixed'

type Capture = Awaited<ReturnType<typeof window.api.captures.find>>[number]

/** Something to do from the palette, with the key that does it anywhere. */
/** `cue` is its sound, on/off for a switch; a tap when it says nothing. */
/** `typed`: kept out of the list until something is typed. `themes`: opens the theme list in place, and is handed the one kept. */
/** `choices`: one action that opens a short list in place, "Goal on screen…" and then which goal and how. */
/** `heard`: words typed that ask for it outright ("20 min"): the action they make goes first, in its place. */
export type Action = { label: string; keys?: string; run: () => void; cue?: Cue | null; own?: boolean; typed?: boolean; themes?: (theme: Theme, was?: Theme) => void; choices?: () => Choice[]; heard?: (typed: string) => Action | null; icon?: ComponentProps<typeof AliveIcon>['icon']; /** One of the rows a search with no match offers: what the words become. */ keep?: Keep }
/** What words that match nothing can be kept as, from ⌘K. `box`: written into quick capture. */
export type Keep = 'note' | 'task' | 'question' | 'box'
const KEPT_AS: Record<Keep, string> = { note: 'as a note', task: 'as a task', question: 'as a question', box: 'in quick capture' }
/** One of an action's choices: what it does, and a quiet word on where it stands now. */
export type Choice = { label: string; note?: string; run: () => void }

/** Room for the preview beside the list: the box's 640px window has none, so there it never shows. */
const ROOMY = '(min-width: 700px)'
const followRoomy = (change: () => void): (() => void) => {
  const query = matchMedia(ROOMY)
  query.addEventListener('change', change)
  return () => query.removeEventListener('change', change)
}

/** Which of Notion's three groups a date falls in. */
const groupOf = (at: string): string => {
  return dayjs(at).isSame(dayjs(), 'day') ? 'Today' : daysSince(at) <= 30 ? 'Past 30 days' : 'Older'
}

/**
 * Search, the way Notion's works: type, and the matches come up grouped by when
 * they were captured, with the one under the cursor previewed on the right.
 * Arrows move, Enter opens, Escape closes.
 */
export function Search({ onOpen, onAside, onClose, onKeep, keeps = ['note', 'task', 'question'], initial = '', actions = [], placeholder, menus = true }: { onOpen: (type: string, id: string) => void; /** ⌥↵: open it beside the page, in a pane of its own (the main window's split view). */ onAside?: (type: string, id: string) => void; onClose: () => void; /** Words that match nothing, kept as something new (Arc's "search or make"). */ onKeep?: (as: Keep, text: string) => void; keeps?: Keep[]; initial?: string; actions?: Action[]; placeholder?: string; /** A right click on a result offers what its list's would; off where a pick is all a result is for. */ menus?: boolean }): React.JSX.Element {
  const [query, setQuery] = useState(initial)
  // The words the list on screen answers. A reply for words since changed is
  // dropped: a slow search must not land over a quicker, newer one.
  const [searched, setSearched] = useState<string | null>(null)
  // Going away (AnimatePresence plays the exit): the keys and the clicks are
  // the page's again at once, and nothing here still counts as a dialog.
  const present = useIsPresent()
  useEffect(() => void (!present && box.current?.blur()), [present])
  // Opening search sends out one ping.
  useEffect(() => chime('search'), [])
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
  const results = (slow ? [] : found).filter((one) =>
    (!titleOnly || words.every((word) => one.label.toLowerCase().includes(word))) &&
    (!types.length || types.includes(one.type === 'article' || one.type === 'question' || one.type === 'goal' ? 'nugget' : one.type)) &&
    (!kinds.length || kinds.includes(one.kind)))
  // Raycast's ⌘K: what you can do comes first, matched by the same words,
  // then what you have written. One list, one cursor.
  // Typed, the open note's own actions come before places to go: "Archive"
  // with a note open means archive it, not the Archived list.
  // A word of Vigil's own and a ?, "gloss?", asks what it means here: its
  // note comes first. A ? alone is left to search as before.
  const asked = query.trim().endsWith('?') ? wordFor(query.trim().slice(0, -1)) : undefined
  // Searched, and nothing anywhere has those words: Arc's command bar never
  // ends there. The words can be kept as something new, a question first
  // when they end in a question mark.
  const typed = query.trim()
  const said = typed.length > 40 ? `${typed.slice(0, 40)}…` : typed
  const keeping = !!onKeep && !!typed && !typed.startsWith('kind:') && searched === query && !slow && !results.length
    ? (typed.endsWith('?') ? [...keeps.filter((one) => one === 'question'), ...keeps.filter((one) => one !== 'question')] : keeps)
      .map((as): Action => ({ label: `Keep “${said}” ${KEPT_AS[as]}`, keep: as, cue: null, run: () => onKeep?.(as, typed) }))
    : []
  const heard = typed ? actions.flatMap((one) => one.heard?.(typed) ?? []) : []
  const acting = [
    ...(asked ? [{ label: `What Vigil means by ${asked.forms[0]}`, cue: null, run: () => openWord(asked.id) }] : []),
    ...heard,
    ...[...actions, { label: 'Vigil’s words: what its own names mean', typed: true, cue: null, run: () => openWord(ALL_WORDS) }]
      .filter((one) => !(heard.length && one.heard) && (!one.typed || query.trim()) && words.every((word) => one.label.toLowerCase().includes(word)))
      .sort((a, b) => (query.trim() ? Number(!!b.own) - Number(!!a.own) : 0)).slice(0, query.trim() ? 4 : 12)
  ]
  // An action the words name ("What's new") is what Enter does; keeping the words as a note comes after it.
  const keepFirst = !acting.length
  const doing = keepFirst ? [...keeping, ...acting] : [...acting, ...keeping]
  const [at, setAt] = useState(0)
  // Several results picked (⇧-click, or ⌘A once the words are all selected), to make tasks of or queue together.
  // The box keeps ⌘A for its words: the first press selects them, the next picks every result.
  const several = usePickMixed(results.map((one) => ({ type: one.type, id: one.id, title: one.label, status: one.status })), { keys: false })
  // A result's right click: a task's menu as on Today, a note's as in the sidebar.
  const tasks = useLive(vigil.tasks, [] as Task[])
  const pins = useLive(vigil.pins, [] as Pin[])
  const taskNow = useTaskNow()
  const menuOf = (one: Capture): RowItem[] => {
    const task = one.type === 'task' ? tasks.find((each) => each.id === one.id) : null
    const own = task
      ? taskMenu(task, { open: () => onOpen('task', one.id), now: taskNow })
      : sideMenu(one.type, one.id, one.label, { onOpen, pinned: pins.some((pin) => pin.id === one.id), kind: one.kind, status: one.status })
    return several.menu(one) ?? [...own, ...several.rowItems(one)]
  }
  // Tab on a result asks who said it, without leaving search.
  const [asking, setAsking] = useState(false)
  const box = useRef<HTMLInputElement>(null)
  // Notion's highlight pane: on by default, and a button to put it away.
  const [pane, setPane] = useState(true)
  const roomy = useSyncExternalStore(followRoomy, () => matchMedia(ROOMY).matches)
  useEffect(() => {
    let old = false
    const late = setTimeout(() => setSlow(true), 300)
    // Asked once the typing pauses, not for every letter of a word on the way.
    const ask = setTimeout(() => void window.api.captures.find(query).then((list) => {
      if (old) return
      clearTimeout(late)
      setSlow(false)
      setFound(list)
      setSearched(query)
      setAt(0)
    }), 80)
    return () => {
      old = true
      clearTimeout(late)
      clearTimeout(ask)
    }
  }, [query])
  // The kinds are many: one Kind chip opens them.
  const [kindsOpen, setKindsOpen] = useState(false)
  useEffect(() => setAt(0), [titleOnly, types, kinds])
  // The highlighted result stays in view as the arrows move it.
  useEffect(() => {
    document.querySelector('[data-search-at]')?.scrollIntoView({ block: 'nearest' })
  }, [at, results.length])
  const current = at >= doing.length ? results[at - doing.length] : undefined
  const action = at < doing.length ? doing[at] : undefined
  // An action's own short list, opened in place: typed to narrow, Enter picks.
  const [choosing, setChoosing] = useState<{ action: Action; list: Choice[] } | null>(null)
  const [choiceQuery, setChoiceQuery] = useState('')
  const [choiceAt, setChoiceAt] = useState(0)
  const total = doing.length + results.length
  // One size and one shape from the moment it opens: the filters are always
  // there, and the preview half stays put whatever is highlighted, so
  // nothing grows or jumps as the arrows move or a letter is typed.
  const shown = pane && roomy && !choosing
  const preview = shown && !!current
  // A gloss on anything found, a task included: there it lands in the task's log.
  const glossable = !!current
  // ⌘; pressed with the preview put away: the line opens under the row instead.
  const [glossing, setGlossing] = useState(false)
  useEffect(() => setGlossing(false), [current?.id])
  const backToBox = (): void => (setGlossing(false), box.current?.focus())
  // "Change theme…" turns the palette into the themes, each worn as the
  // highlight passes it; Enter keeps one, Escape puts the old one back.
  const [picking, setPicking] = useState<Action | null>(null)
  const choices = choosing ? choosing.list.filter((one) => choiceQuery.trim().toLowerCase().split(/\s+/).every((word) => `${one.label} ${one.note ?? ''}`.toLowerCase().includes(word))) : []
  const unchoose = (): void => (chime('fold'), setChoosing(null))
  const choose = (one: Choice): void => {
    onClose()
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
    document.querySelector('[data-theme-at]')?.scrollIntoView({ block: 'nearest' })
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
  const keep = (one: Theme): void => {
    const was = before.current ?? undefined
    before.current = null
    chime('settled')
    onClose()
    picking?.themes?.(one, was)
  }
  // An action with nothing more to say than its name: a word asked about says what it means instead.
  const plain = !picking && !current && action && !action.keep && !(asked && action === doing[0]) ? action : undefined
  // One light for the rows, travelling to the one the pointer or the arrows reach.
  const rows = useRef<HTMLDivElement>(null)
  const lit = useChosen(rows, '[data-search-at], [data-theme-at], [data-choice-at]', `${picking ? 'theme' : choosing ? 'choice' : 'row'}:${picking ? themeAt : choosing ? choiceAt : at}`)
  const run = (action: Action): void => {
    if (action.themes) return pickTheme(action)
    if (action.choices) {
      chime('slide')
      setChoiceQuery('')
      setChoiceAt(0)
      return setChoosing({ action, list: action.choices() })
    }
    // null: the action sounds for itself (the sound switch, the panel).
    if (action.cue !== null) chime(action.cue ?? 'tap')
    onClose()
    action.run()
  }

  return (
    // A dialog, said so: what is under it (the box's keys, a celebration's Escape) knows to leave the keys alone.
    // Arc's command bar: the scrim fades in over 120ms and the panel rises 6px
    // into place from a hair smaller; away, both go in 90ms. Quick enough for
    // something summoned hundreds of times a day, and never a blink.
    <motion.div role={present ? 'dialog' : undefined} aria-modal={present || undefined} aria-label="Search"
      initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.12, ease: 'easeOut' } }} exit={{ opacity: 0, transition: { duration: 0.09, ease: 'easeIn' } }}
      className={`fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[10vh] ${present ? '' : 'pointer-events-none'}`} onMouseDown={onClose}>
      <motion.div
        initial={{ opacity: 0, transform: shift('translateY(6px) scale(0.98)') }}
        animate={{ opacity: 1, transform: shift('translateY(0px) scale(1)'), transition: { type: 'spring', duration: 0.12, bounce: 0 } }}
        exit={{ opacity: 0, transform: shift('translateY(3px) scale(0.99)'), transition: { duration: 0.09, ease: 'easeIn' } }}
        className={`flex h-[70vh] w-[min(56rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl text-sm ${FLOAT}`} onMouseDown={(event) => event.stopPropagation()}>
        <label className="flex items-center gap-3 border-b px-4 py-3">
          <span className="text-muted-foreground"><AliveIcon icon={MagnifierIcon} size={16} /></span>
          <input
            ref={box}
            autoFocus
            className="flex-1 bg-transparent text-heading outline-none"
            placeholder={picking ? 'Pick a theme…' : choosing ? `${choosing.action.label.replace(/…$/, '')}: pick one…` : placeholder ?? (actions.length ? 'Do something, or search everything…' : 'Search everything… kind:quote to narrow')}
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
              else if (event.key === 'Escape') { event.preventDefault(); chime('fold'); onClose() }
              // ⌘A: the words first, as any box; pressed again with them all selected (or none typed), every result.
              else if (event.metaKey && !event.shiftKey && !event.altKey && event.code === 'KeyA' && results.length && event.currentTarget.selectionStart === 0 && event.currentTarget.selectionEnd === event.currentTarget.value.length) several.selectAll()
              // ⇧↵, Arc's instant link: the top result opens, wherever the highlight is.
              else if (event.key === 'Enter' && event.shiftKey && results[0]) onOpen(results[0].type, results[0].id)
              else if (event.key === 'Enter' && at < doing.length) run(doing[at])
              else if (event.key === 'Enter' && current && event.altKey && onAside) onAside(current.type, current.id)
              else if (event.key === 'Enter' && current) onOpen(current.type, current.id)
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
          <button type="button" aria-label={pane ? 'Hide the preview' : 'Show the preview'} className={`rounded p-1 hover:bg-accent ${pane ? 'text-foreground' : 'text-muted-foreground'} ${roomy ? '' : 'hidden'}`} onClick={() => { chime(pane ? 'fold' : 'slide'); setPane(!pane); box.current?.focus() }}>
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
          <Chips options={[{ id: 'capture', label: 'Captures' }, { id: 'nugget', label: 'Gems' }, { id: 'task', label: 'Tasks' }]} on={(id) => types.includes(id)} pick={(id) => setTypes(flip(types, id))} />
          <span aria-hidden className="mx-1 h-3.5 w-px bg-border" />
          <Chips options={[{ id: 'kind', label: kinds.length ? `Kind · ${kinds.length}` : 'Kind' }]} on={() => kindsOpen || kinds.length > 0} pick={() => setKindsOpen(!kindsOpen)} />
          {kindsOpen && <span aria-hidden className="mx-1 h-3.5 w-px bg-border" />}
          {kindsOpen && <Chips options={CAPTURE_TYPES} on={(id) => kinds.includes(id)} pick={(id) => setKinds(flip(kinds, id))} />}
          </>}
        </div>
        <div className="flex min-h-0 flex-1">
          {/* mf-more: faded at an edge while there is more past it; the scroll
              padding keeps a row the arrows reach clear of that fade. */}
          <div ref={rows} className={`mf-more relative isolate min-h-0 min-w-0 flex-1 scroll-pt-8 scroll-pb-12 overflow-y-auto p-2 ${shown ? 'w-1/2 flex-none' : ''}`}>
            <Highlight spot={lit.spot} snap={lit.snap} className="rounded-sm bg-accent" />
            {choosing ? <>
              <div className="px-2 pt-1 pb-1 text-xs text-muted-foreground">{choosing.action.label.replace(/…$/, '')}</div>
              {choices.map((one, index) => (
                <button
                  key={one.label}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left"
                  data-choice-at={index === choiceAt || undefined}
                  onMouseMove={(event) => realMove(event) && setChoiceAt(index)}
                  onClick={() => choose(one)}
                >
                  <span className="min-w-0 flex-1 truncate">{one.label}</span>
                  {one.note && <span className="shrink-0 text-xs text-muted-foreground">{one.note}</span>}
                </button>
              ))}
              {!choices.length && <p className="px-2 py-3 text-sm text-muted-foreground"><Typed text="None by that name." /></p>}
            </> : picking ? <>
              {themes.map((one, index) => (
                <button
                  key={one}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left"
                  data-theme-at={index === themeAt || undefined}
                  // Only a mouse that really moves: a repaint under a resting
                  // cursor would otherwise pull the highlight back to it.
                  onMouseMove={(event) => realMove(event) && setThemeAt(index)}
                  onClick={() => keep(one)}
                >
                  <Swatch theme={one} />
                  <span className="min-w-0 flex-1 truncate">{themeName(one)}</span>
                  {one === before.current && <span aria-label="Current" className="shrink-0 text-muted-foreground">✓</span>}
                </button>
              ))}
              {!themes.length && <p className="px-2 py-3 text-sm text-muted-foreground"><Typed text="No theme by that name." /></p>}
            </> : <>
            {doing.map((one, index) => (
              <Fragment key={one.label}>
              {keeping.length > 0 && index === (keepFirst ? 0 : acting.length) && <div className={`px-2 pb-1 text-xs text-muted-foreground ${index ? 'pt-3' : 'pt-1'}`}>Nothing called that yet</div>}
              {acting.length > 0 && index === (keepFirst ? keeping.length : 0) && <div className={`px-2 pb-1 text-xs text-muted-foreground ${index ? 'pt-3' : 'pt-1'}`}>Actions</div>}
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left"
                data-search-at={index === at || undefined}
                onMouseMove={(event) => realMove(event) && setAt(index)}
                onClick={() => run(one)}
              >
                <span className="min-w-0 flex-1 truncate">{one.label}</span>
                {one.icon && <AliveIcon key={one.label} icon={one.icon} size={14} className="text-muted-foreground" />}
                {one.keys && <span className="flex shrink-0 gap-0.5"><Pressed keys={one.keys} each /></span>}
              </button>
              </Fragment>
            ))}
            {!query.trim() && !doing.length && (
              <p className="px-2 py-3 text-body text-muted-foreground"><Typed text="Type to search notes, gems, writing and tasks. kind:quote narrows to one kind." /></p>
            )}
            {slow && query.trim() && (
              // The orb only if it is a real wait: a search back at once never shows it.
              <p className="flex px-2 py-2"><Orb state="searching" label="Searching…" className="animate-in fade-in-0 duration-200" /></p>
            )}
            {query.trim() && searched === query && !results.length && !doing.length && (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                <Typed text={types.length || kinds.length || titleOnly
                  ? 'Nothing matches with those filters. Turn a chip off to widen it.'
                  : 'Nothing matches. Try fewer words: every word has to appear somewhere.'} />
              </p>
            )}
            {results.map((capture, index) => {
              const kind = CAPTURE_TYPES.find((type) => type.id === capture.kind) ?? CAPTURE_TYPES[0]
              const group = groupOf(capture.capturedAt)
              return (
                <Fragment key={capture.id}>
                  {group !== (index ? groupOf(results[index - 1].capturedAt) : '') && (
                    <div className="px-2 pt-3 pb-1 text-xs text-muted-foreground">{group}</div>
                  )}
                  <RowMenu items={menus ? menuOf(capture) : []}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left ${PICKED_MARK}`}
                    data-search-at={index + doing.length === at || undefined}
                    onMouseMove={(event) => realMove(event) && setAt(index + doing.length)}
                    data-row
                    data-drag-open={`${capture.type}:${capture.id}`}
                    data-picked={several.picked(capture) || undefined}
                    onClick={(event) => (event.shiftKey ? (several.toggle(capture), box.current?.focus()) : onOpen(capture.type, capture.id))}
                  >
                    <kind.icon className="size-4 shrink-0" style={{ color: kind.tint }} />
                    <span className="min-w-0 truncate">{(capture.type === 'task' ? taskName(capture.label ?? '').text : capture.label) || 'Untitled'}</span>
                    {capture.type === 'task' && <Tags tags={taskName(capture.label ?? '').tags} />}
                    {/* After the words, so a task's title starts where a note's does. */}
                    {capture.type === 'task' && !!tasks.find((one) => one.id === capture.id)?.priority && <PriorityMark level={tasks.find((one) => one.id === capture.id)!.priority} />}
                    {capture.type !== 'capture' && <span className="shrink-0 rounded bg-accent px-1.5 text-xs text-muted-foreground">{typeSaid(capture.type)}</span>}
                    {whereFrom(capture.source, capture.label) && <span className="min-w-0 max-w-[40%] truncate text-xs text-muted-foreground">· {whereFrom(capture.source, capture.label)}</span>}
                    {index + doing.length === at && !asking && !preview && capture.type === 'capture' && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{capture.attribution ?? 'Tab: who said it'}</span>}
                  </button>
                  </RowMenu>
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
            })}
            </>}
          </div>
          {/* The capture as it reads, not its raw text: the same editor, read
              only. An action shows what it does and its keys instead, so the
              half never empties or closes as the arrows pass over it. */}
          {shown && plain ? (
            // A plain action has nothing to preview: one line saying it, and its keys, not an empty frame.
            <div className="m-3 ml-0 w-1/2 min-w-0">
              <div key={plain.label} data-action-line className="flex items-center gap-3 rounded-lg border px-4 py-2.5 animate-in fade-in-0 duration-150">
                <span className="min-w-0 flex-1 text-body text-pretty text-foreground">{plain.label}</span>
                {plain.keys && keyFor(plain.keys) && <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"><span className="flex gap-0.5"><Pressed keys={plain.keys} each /></span> any time</span>}
              </div>
            </div>
          ) : shown && (
            <div className="m-3 ml-0 flex w-1/2 min-w-0 flex-col overflow-hidden rounded-lg border">
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
                  ? current.type === 'task' ? <TaskPreview id={current.id} /> : <NotePreview type={current.type} id={current.id} />
                  : action?.keep
                    // Nothing found: the half says so, and what Enter does with the words.
                    ? <div key={action.label} className="flex flex-col gap-2 p-4 animate-in fade-in-0 duration-150">
                      <p className="text-base font-medium text-pretty text-foreground">Nothing called that yet.</p>
                      <p className="text-body text-pretty text-foreground/80"><strong className="font-semibold text-foreground">Enter keeps it</strong> {action.keep === 'box' ? 'in quick capture, ready to finish there.' : `${KEPT_AS[action.keep]}, and opens it to write more.`}</p>
                    </div>
                  : action
                    ? <div key={action.label} className="p-4">
                      <p className="text-base font-medium text-pretty text-foreground">{action.label}</p>
                      {/* A word asked about says what it means here before Enter opens the rest. */}
                      {asked && action === doing[0] && <p className="mt-1 text-body text-muted-foreground">{asked.line}</p>}
                    </div>
                    : <p className="p-4 text-body text-muted-foreground">Move onto something to see it here.</p>}
              </div>
              {/* One bar under every item: a thought on a result (⌘; or a click),
                  or how to do an action. */}
              <div className="flex min-h-9 shrink-0 items-center gap-3 border-t bg-accent/25 px-3 py-1.5 text-xs text-muted-foreground">
                {picking ? (
                  before.current && <span className="flex items-center gap-1.5"><Swatch theme={before.current} /> Was {themeName(before.current)}</span>
                ) : current ? (
                  <>
                    <div className="min-w-0 flex-1"><GlossLine key={current.id} id={current.id} open={glossing} onDone={backToBox} keys="⌘;" /></div>
                    {current.type === 'capture' && !glossing && !asking && (
                      <span className="shrink-0">{current.attribution ?? <><Kbd>Tab</Kbd> who said it</>}</span>
                    )}
                  </>
                ) : action && (
                  <>
                    {action.keys && keyFor(action.keys) && <span className="flex items-center gap-1.5"><span className="flex gap-0.5"><Pressed keys={action.keys} each /></span> any time</span>}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        {/* How to drive it, always there; the Enter word follows what is highlighted. */}
        {several.bar ? (
          // Results picked: the line under the list is what can be done with them.
          <div data-pick-bar className="flex min-h-9 shrink-0 items-center border-t px-3 py-1">{several.bar}</div>
        ) : (
        <div className="flex shrink-0 items-center gap-4 border-t px-4 py-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="flex gap-0.5"><Kbd>↑</Kbd><Kbd>↓</Kbd></span> navigate</span>
          <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> <Rolling text={picking || action?.keep ? 'keep' : choosing ? 'pick' : action ? 'use' : 'open'} /></span>
          {!picking && !choosing && results.length > 0 && current !== results[0] && <span className="flex items-center gap-1.5"><Kbd>⇧↵</Kbd> open the top result</span>}
          {onAside && !picking && !choosing && !action && current && <span className="flex items-center gap-1.5"><Kbd>⌥↵</Kbd> to the side</span>}
          {!picking && !choosing && results.length > 1 && <span className="flex items-center gap-1.5"><Kbd>⇧</Kbd>-click selects</span>}
          <span className="flex items-center gap-1.5"><Kbd>esc</Kbd> <Rolling text={picking || choosing ? 'back' : 'close'} /></span>
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
function NotePreview({ type, id }: { type: string; id: string }): React.JSX.Element | null {
  // The last one stays until the next arrives: no blank flash between rows.
  const [shown, setShown] = useState<{ id: string; body: unknown } | null>(null)
  useEffect(() => {
    let old = false
    void window.api.captures.peek(type, id).then((body) => !old && setShown({ id, body }))
    return () => void (old = true)
  }, [type, id])
  if (!shown) return null
  return (
    <div key={shown.id}>
      <MindflowEditor defaultContent={(shown.body as JSONContent | string | null) ?? ''} readOnly toolbar={false} handles={false} slash={false} outline={false} search={false} autofocus={false} />
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
  useEffect(() => {
    let old = false
    void vigil.task(id).then((found) => !old && setTask(found))
    return () => void (old = true)
  }, [id])
  if (!task) return null
  const later = bucket(task)
  const facts = [
    task.dueAt ? `Scheduled ${whenInLine(task.dueAt, !!task.allDay)}` : later ? BUCKETS[later] : 'Not scheduled',
    task.deadline && `Due ${whenInLine(task.deadline, !task.deadlineTimed)}`,
    task.priority ? PRIORITY_NAMES[task.priority] : null,
    task.status !== 'open' && (task.status === 'done' ? 'Done' : 'Dropped')
  ].filter(Boolean)
  const notes = /"text":|"src":/.test(JSON.stringify(task.notes ?? null))
  return (
    <div key={task.id} className="flex flex-col gap-3 p-4 text-body">
      <div>
        <p className="flex items-center gap-2 text-base font-medium text-foreground"><span className="min-w-0">{taskName(task.title).text || 'Untitled task'}</span><Tags tags={taskName(task.title).tags} /></p>
        <p className="mt-1 text-muted-foreground">{facts.join(' · ')}</p>
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
          <MindflowEditor defaultContent={task.notes as JSONContent} readOnly toolbar={false} handles={false} slash={false} outline={false} search={false} autofocus={false} />
        </div>
      )}
    </div>
  )
}
