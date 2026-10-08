import { useEffect } from 'react'
import type { Editor } from '@tiptap/core'

/**
 * The box, while the welcome is asking for three things of different kinds.
 * The welcome lives in the main window and the box in its own, so they talk
 * through the storage both windows share:
 *
 * - its empty line types out the starters still to try, in turn, instead of
 *   "Type / for commands…" (the stylesheet does the rest, main.css)
 * - a starter clicked in the welcome is typed into the box here, letter by
 *   letter, so the kind chip can be seen changing its guess
 * - the kind chip wears the accent, gives a small pulse each time its guess
 *   changes, and the first time says what it is
 *
 * Only while the welcome is open.
 */

export type Starter = { kind: 'todo' | 'quote' | 'word'; text: string }

/** Three things to catch, one of each kind, each showing off what its kind does. */
export const STARTERS: Starter[] = [
  { kind: 'todo', text: 'Call Sam tomorrow at 6pm' },
  { kind: 'quote', text: '“Waste no more time arguing what a good man should be. Be one.” - Marcus Aurelius' },
  { kind: 'word', text: 'sonder' }
]

const FILL = 'welcome-fill'
const LEFT = 'welcome-left'

/** From the welcome: type these words into the box when it is next on screen. */
export const fillBox = (text: string): void => {
  try {
    localStorage.setItem(FILL, JSON.stringify({ text, at: Date.now() }))
  } catch {
    // Nothing typed for you; the box still opens.
  }
}

/** From the welcome: the starters still to try, and whether nothing has been caught yet. */
export const tellBox = (lines: string[], first: boolean): void => {
  try {
    localStorage.setItem(LEFT, JSON.stringify({ lines, first }))
  } catch {
    // The box keeps the full list.
  }
}

const read = <T>(key: string): T | null => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null
  } catch {
    return null
  }
}

const EDITOR = '.tiptap.ProseMirror.mindflow-editor:not(.is-line)'

export function useWelcomePlaceholder(): void {
  useEffect(() => {
    const root = document.documentElement
    let timers: ReturnType<typeof setTimeout>[] = []
    let typing: ReturnType<typeof setTimeout>[] = []
    let on = false
    const quiet = (): boolean => root.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
    const stop = (): void => {
      timers.forEach(clearTimeout)
      timers = []
      on = false
      chip = null
      watchChip.disconnect()
      delete root.dataset.welcomePh
      delete root.dataset.welcomeFirst
      root.style.removeProperty('--mf-welcome-ph')
    }
    const show = (text: string): void => root.style.setProperty('--mf-welcome-ph', JSON.stringify(text))
    const lines = (): string[] => {
      const left = read<{ lines: string[] }>(LEFT)?.lines
      return left?.length ? left : STARTERS.map((one) => one.text)
    }
    const run = (n: number): void => {
      const all = lines()
      const line = all[n % all.length]
      // The first is there the moment the box opens, so the line is never blank; the rest type in.
      if (quiet() || n === 0) show(line)
      else for (let i = 1; i <= line.length; i++) timers.push(setTimeout(() => show(line.slice(0, i)), i * 38))
      timers.push(setTimeout(() => run(n + 1), (quiet() || n === 0 ? 0 : line.length * 38) + 3000))
    }

    // A starter asked for from the welcome, typed into an empty box a letter
    // at a time (all at once with Motion off). Taken once, and only while fresh.
    const fill = (): void => {
      const asked = read<{ text: string; at: number }>(FILL)
      if (!asked || !on || document.visibilityState !== 'visible') return
      localStorage.removeItem(FILL)
      if (Date.now() - asked.at > 8000) return
      const editor = (document.querySelector(EDITOR) as (HTMLElement & { editor?: Editor }) | null)?.editor
      if (!editor || editor.isDestroyed || !editor.isEmpty) return
      typing.forEach(clearTimeout)
      typing = []
      if (quiet()) return void editor.chain().focus('end').insertContent(asked.text).run()
      const letters = [...asked.text]
      letters.forEach((letter, i) => typing.push(setTimeout(() => {
        if (!editor.isDestroyed) editor.chain().focus('end').insertContent(letter).run()
      }, 180 + i * 28)))
    }

    // The kind chip: lit while the welcome is up, and a small pulse each time its guess changes.
    let chip: HTMLElement | null = null
    let said = ''
    const watchChip = new MutationObserver(() => {
      const now = document.querySelector<HTMLElement>('[data-kind-chip]')
      if (now !== chip) {
        chip = now
        said = now?.textContent ?? ''
        return
      }
      const text = now?.textContent ?? ''
      if (!now || text === said) return
      said = text
      if (!on || quiet()) return
      delete now.dataset.lit
      void now.offsetWidth
      now.dataset.lit = ''
    })

    const start = (): void =>
      void (window.api.vigil('onboarding:welcoming') as Promise<boolean>).then((welcoming) => {
        stop()
        if (!welcoming) return
        on = true
        // Watched only while the welcome is up: the rest of the time the box owes it nothing.
        watchChip.observe(document.body, { subtree: true, childList: true, characterData: true })
        root.dataset.welcomePh = ''
        if (read<{ first: boolean }>(LEFT)?.first !== false) root.dataset.welcomeFirst = ''
        run(0)
        // The editor has the caret a frame after the window shows.
        setTimeout(fill, 120)
      }).catch(() => undefined)
    start()
    const onStorage = (event: StorageEvent): void => {
      if (event.key === FILL && event.newValue) fill()
    }
    window.addEventListener('storage', onStorage)
    const offShown = window.api.onShown(start)
    const offHiding = window.api.onHiding(() => {
      typing.forEach(clearTimeout)
      typing = []
      stop()
    })
    return () => {
      stop()
      typing.forEach(clearTimeout)
      watchChip.disconnect()
      window.removeEventListener('storage', onStorage)
      offShown()
      offHiding()
    }
  }, [])
}
