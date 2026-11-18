import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { inBin, type BinKind } from './to-bin'

/**
 * The main window's Back and Forward, as a page sees them. One rule: Back
 * returns to exactly what you saw before the click. So a page says what it
 * shows: opening a note is a step (`go`), a tab, a filter or the day on show
 * is kept in the step you are on (`keep`), never a step of its own.
 */
/** `folder`: a Writing or Gems folder the list is in; a note opened there keeps it, as Finder's window stays in its folder. */
/**
 * How a page was scrolled, box by box: the box's path in the page, its scroll, and the row at its top
 * (its id, and how far below the box's top edge it starts). Put back by the row, so whatever grew or
 * shrank above it meanwhile (a fold, "Show more", a resize, a list filling late) never moves it.
 */
export type Scrolled = [path: string, top: number, row?: string, at?: number][]
export type Step = { id: string; focus?: string; folder?: string; nonce?: number; tab?: string; scroll?: Scrolled }
export type Nav = {
  here: Step
  /** Something else opened in this page, or nothing (null): a step. */
  go: (focus: string | null) => void
  /** Kept in the step you are on: what Back returns to. */
  keep: (patch: Partial<Pick<Step, 'focus' | 'tab'>>) => void
  /** Another tab of this page, as a step of its own: Back returns to the one before (the Inbox's older captures). */
  step: (patch: Partial<Pick<Step, 'tab'>>) => void
}
export const NavContext = createContext<Nav | null>(null)
export const useNav = (): Nav | null => useContext(NavContext)

/**
 * A page with one thing open beside its list. Follows the step's focus (Back
 * and Forward), and makes opening another, or closing it, a step. Returns
 * `hush`, called just before closing it without a step (opened in a window
 * of its own, so Back must not bring it back here too).
 *
 * Given the list on show and what kind of thing it holds (`follow`), what is
 * open never outlives its row: once it leaves the list for the Bin (⌫, a
 * menu, its own button, another window), the pane moves on to the next one
 * still there, or closes, as Mail does. Left any other way (a new date, done)
 * it stays open. Neither is a step, so Back never returns to what is binned.
 */
export function useOpened(id: string | undefined, focus: string | undefined, pick: (id: string) => void, close: () => void, follow?: { shown: readonly string[]; kind: BinKind }): () => void {
  const nav = useNav()
  // What the step already says is open, so following it is never a step too.
  const said = useRef(id)
  const silent = useRef(false)
  // Before the frame is drawn: Back and Forward swap the note in the same
  // frame as the step, never one frame of the old note under the new step.
  useLayoutEffect(() => {
    if (focus && focus !== id) pick(focus)
    else if (!focus && id) (silent.current = true, close())
  }, [focus]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (said.current === id) return
    said.current = id
    if (silent.current) return void ((silent.current = false), nav?.keep({ focus: id }))
    nav?.go(id ?? null)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  const now = useRef({ id, follow, pick, close })
  now.current = { id, follow, pick, close }
  const seen = useRef<readonly string[] | undefined>(undefined)
  useEffect(() => {
    const was = seen.current
    seen.current = follow?.shown
    if (!follow || !id || !was?.includes(id) || follow.shown.includes(id)) return
    // A moment for the rest of a move of many to land, then asked whether it went to the Bin.
    setTimeout(() => void inBin(follow.kind, id).then((gone) => {
      const { id: open, follow: last, pick, close } = now.current
      if (!gone || open !== id || !last || last.shown.includes(id)) return
      const at = was.indexOf(id)
      const next = [...was.slice(at + 1), ...was.slice(0, at).reverse()].find((one) => last.shown.includes(one))
      silent.current = true
      if (next) pick(next)
      else close()
    }), 120)
  }, [follow?.shown.join('\n')]) // eslint-disable-line react-hooks/exhaustive-deps
  // Told it went to the Bin, by whatever way (lib/to-bin.ts): onto the next one at once, or the one before at the end.
  useEffect(() => {
    let off: string | null = null
    const heard = (event: Event): void => {
      const gone = (event as CustomEvent<string[]>).detail
      const { id: open, follow: last, pick, close } = now.current
      if (!open || !last || !gone.includes(open)) return
      event.preventDefault()
      off = open
      const at = last.shown.indexOf(open)
      const left = (ids: readonly string[]): string | undefined => ids.find((one) => !gone.includes(one))
      const next = at < 0 ? undefined : left(last.shown.slice(at + 1)) ?? left([...last.shown.slice(0, at)].reverse())
      silent.current = true
      if (next) pick(next)
      else close()
    }
    // Undone: the one it moved off open again, as Mail selects a message it undeleted.
    const back = (event: Event): void => void (off && (event as CustomEvent<string[]>).detail.includes(off) && ((silent.current = true), now.current.pick(off), (off = null)))
    window.addEventListener('haligtree:binned', heard)
    window.addEventListener('haligtree:came-back', back)
    return () => (window.removeEventListener('haligtree:binned', heard), window.removeEventListener('haligtree:came-back', back))
  }, [])
  return () => void (silent.current = true)
}

/**
 * Something a page shows that Back should find as it was (a tab, a filter,
 * the day on show), kept in the step rather than being one. Follows the step
 * when Back or Forward changes it.
 */
export function useKept<T extends string>(key: 'tab' | 'focus', value: T, set: (value: T) => void, start: T): void {
  const nav = useNav()
  // Only from this page's own steps: a page on its way out is handed the next
  // page's step for a moment, and Questions' “answered” tab made Home crash.
  const page = useRef(nav?.here.id)
  const mine = nav?.here.id === page.current
  const held = mine ? ((nav?.here[key] as T | undefined) ?? start) : value
  // Back or Forward brought another: followed in this same draw, before any layout effect reads it. Followed a draw
  // later, the Inbox's "Show dealt with too" came back after the step's open task was looked for among the waiting
  // captures, so ⌘[ onto Everything with a task open landed with nothing open (the Back button's flight hid it).
  const [followed, setFollowed] = useState(held)
  if (followed !== held) {
    setFollowed(held)
    if (nav && held !== value) set(held)
  }
  useEffect(() => {
    if (nav && held !== value) set(held)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const said = useRef(value)
  useEffect(() => {
    if (said.current === value) return
    said.current = value
    if (mine) nav?.keep({ [key]: value === start ? undefined : value })
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * A place inside a page that a person would call a place (Feed's Reading,
 * Media's PDFs, a Settings section, a Review deck): moving to another is a
 * step of its own, so Back, Forward, the mouse's side buttons and a relaunch
 * all find it. The place a page opens on is written into the step it opened
 * on, never a step of its own.
 */
export function useStepped<T extends string>(value: T, set: (value: T) => void): void {
  const nav = useNav()
  // Only from this page's own steps, as useKept.
  const page = useRef(nav?.here.id)
  const mine = nav?.here.id === page.current
  const held = mine ? (nav?.here.tab as T | undefined) : undefined
  const said = useRef<T | null>(null)
  // Back, Forward or a relaunch brought another place: show it. What this page wrote itself is not one:
  // followed while the page had moved on, the two took turns for ever (Files on a ⌘K'd file, React #185).
  useEffect(() => {
    if (held !== undefined && held !== value && held !== said.current) set(held)
  }, [held]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!mine || !nav || said.current === value) return
    const first = said.current === null
    said.current = value
    if (first) return void (held === undefined && nav.keep({ tab: value }))
    nav.step({ tab: value })
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
}
