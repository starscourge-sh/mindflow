import { createContext, useContext, useEffect, useRef } from 'react'

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
 */
export function useOpened(id: string | undefined, focus: string | undefined, pick: (id: string) => void, close: () => void): () => void {
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
  return () => void (silent.current = true)
}

/**
 * Something a page shows that Back should find as it was (a tab, a filter,
 * the day on show), kept in the step rather than being one. Follows the step
 * when Back or Forward changes it.
 */
export function useKept<T extends string>(key: 'tab' | 'focus', value: T, set: (value: T) => void, start: T): void {
  const nav = useNav()
  const held = (nav?.here[key] as T | undefined) ?? start
  useEffect(() => {
    if (nav && held !== value) set(held)
  }, [held]) // eslint-disable-line react-hooks/exhaustive-deps
  const said = useRef(value)
  useEffect(() => {
    if (said.current === value) return
    said.current = value
    nav?.keep({ [key]: value === start ? undefined : value })
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
}
