import { createContext, useContext, useEffect, useRef } from 'react'
import { inBin, type BinKind } from './to-bin'

/**
 * The main window's Back and Forward, as a page sees them. One rule: Back
 * returns to exactly what you saw before the click. So a page says what it
 * shows: opening a note is a step (`go`), a tab, a filter or the day on show
 * is kept in the step you are on (`keep`), never a step of its own.
 */
export type Step = { id: string; focus?: string; nonce?: number; tab?: string; scroll?: [string, number][] }
export type Nav = {
  here: Step
  /** Something else opened in this page, or nothing (null): a step. */
  go: (focus: string | null) => void
  /** Kept in the step you are on: what Back returns to. */
  keep: (patch: Partial<Pick<Step, 'focus' | 'tab'>>) => void
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
  useEffect(() => {
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
  useEffect(() => {
    if (nav && held !== value) set(held)
  }, [held]) // eslint-disable-line react-hooks/exhaustive-deps
  const said = useRef(value)
  useEffect(() => {
    if (said.current === value) return
    said.current = value
    if (mine) nav?.keep({ [key]: value === start ? undefined : value })
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
}
