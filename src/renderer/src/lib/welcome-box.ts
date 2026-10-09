import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { dayjs } from '../../../main/dates'

/**
 * The box, while the welcome runs. The welcome lives in the main window and
 * the box in its own, so they talk through the storage both windows share:
 *
 * - its empty line types out the starters still to try, in turn, instead of
 *   "Type / for commands…" (the stylesheet does the rest, main.css)
 * - the starter picked for "Your turn" is waiting in the box when it opens,
 *   written in whole, with who said it and where it is from already filled
 * - the kind chip wears the accent, gives a small pulse each time its guess
 *   changes, and the first time says what it is
 * - lesson mode (`useLesson`): what is not being taught is calm, and what
 *   draws on your history (completions, Similar to, what is waiting) is hidden
 *
 * Only while the welcome is open.
 */

export type Starter = { kind: 'todo' | 'quote' | 'word' | 'link'; text: string; who?: string; where?: string }

/** Three things to catch, one of each kind, each showing off what its kind does. */
export const STARTERS: Starter[] = [
  // Two days from now by name, so the day read back is that day and never "today".
  { kind: 'todo', text: `Book tickets for the Star Wars marathon on ${dayjs().add(2, 'day').format('dddd')} 7pm` },
  // Yoda, to Luke on Dagobah, in The Empire Strikes Back (1980).
  { kind: 'quote', text: '“Do or do not. There is no try.”', who: 'Yoda', where: 'The Empire Strikes Back' },
  { kind: 'word', text: 'petrichor\nThe smell of rain falling on dry earth.' },
  // Its name and picture are fetched when it is kept (cardUp); the welcome shows them from LINK_PAGE.
  { kind: 'link', text: 'https://en.wikipedia.org/wiki/Dune_(novel)' }
]

const FILL = 'welcome-fill'
const LEFT = 'welcome-left'

/** From the welcome: have this starter waiting in the box when it is next on screen. Null takes it back. */
export const fillBox = (starter: Starter | null): void => {
  try {
    if (starter) localStorage.setItem(FILL, JSON.stringify({ ...starter, at: Date.now() }))
    else localStorage.removeItem(FILL)
  } catch {
    // Nothing written in for you; the box still opens.
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

/**
 * The keys held back while the welcome runs, in the box (`box`) and the main
 * window: the side panel and its tabs, search, a new note, back and forward,
 * the source, focus and the window's size. The main process holds the same
 * ones before they reach a page (index.ts, heldInWelcome); this catches them
 * in the page as well, ahead of every other listener, for keys that arrive
 * another way.
 */
export function heldInWelcome(event: KeyboardEvent, box: boolean): boolean {
  const key = event.key.toLowerCase()
  if (event.metaKey && !event.ctrlKey && !event.altKey) {
    if (event.shiftKey) return ['y', 'r', 'd', 'f', 'c', 'k'].includes(key)
    if (/^[1-9]$/.test(key)) return !box
    return ['\\', 'k', 'p', 'n', '[', ']', 'e', 'f', ',', 'l', 'j', 'g', 't', 'w', 'm', 'h'].includes(key) || (!box && key === 'b')
  }
  if (event.ctrlKey && !event.metaKey) return /^[0-9]$/.test(key) || ['j', 'k', 'l', 'f'].includes(key)
  return event.altKey && !event.metaKey && !event.ctrlKey && event.code === 'KeyC'
}

/** Holds those keys back in this window while `on()` says the welcome is running; `told` hears each one. */
export function holdKeys(on: () => boolean, box: boolean, told: () => void): void {
  addEventListener('keydown', (event) => {
    if (!on() || !heldInWelcome(event, box)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    told()
  }, true)
}

/** Whether the box is in lesson mode now: the welcome is running. */
export function useLesson(): boolean {
  const root = document.documentElement
  const [on, setOn] = useState(() => root.hasAttribute('data-welcome-ph'))
  useEffect(() => {
    const watch = new MutationObserver(() => setOn(root.hasAttribute('data-welcome-ph')))
    watch.observe(root, { attributes: true, attributeFilter: ['data-welcome-ph'] })
    return () => watch.disconnect()
  }, [root])
  return on
}

/**
 * A quote's "- Name" at the end of its line: the name, for Who said it, and
 * after a comma where it is from ("- Marcus Aurelius, Meditations"). Only
 * after a closing quote mark, so a dash in the middle of a thought is left alone.
 */
export const saidBy = (line: string): { who: string; where: string } => {
  const tail = /[”"']\s*[-–—]\s*([^-–—”"']{2,90}?)\s*$/.exec(line)?.[1]?.trim() ?? ''
  const [who = '', ...rest] = tail.split(',')
  return { who: who.trim(), where: rest.join(',').trim() }
}

const read = <T>(key: string): T | null => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null
  } catch {
    return null
  }
}

const EDITOR = '.tiptap.ProseMirror.mindflow-editor:not(.is-line)'

export function useWelcomePlaceholder(onFields?: (who: string, where: string, kind: Starter['kind']) => void): void {
  const fields = useRef(onFields)
  fields.current = onFields
  useEffect(() => {
    const root = document.documentElement
    let timers: ReturnType<typeof setTimeout>[] = []
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
      return left?.length ? left : STARTERS.map((one) => one.text.split('\n')[0])
    }
    const run = (n: number): void => {
      const all = lines()
      const line = all[n % all.length]
      // The first is there the moment the box opens, so the line is never blank; the rest type in.
      if (quiet() || n === 0) show(line)
      else for (let i = 1; i <= line.length; i++) timers.push(setTimeout(() => show(line.slice(0, i)), i * 38))
      timers.push(setTimeout(() => run(n + 1), (quiet() || n === 0 ? 0 : line.length * 38) + 3000))
    }

    // The starter picked in the welcome, waiting in the box: written in whole
    // (the welcome has just shown it being typed), its fields filled. Over an
    // empty box, or one still holding an untouched starter; never over your words.
    const fill = (): void => {
      const asked = read<Starter & { at: number }>(FILL)
      if (!asked || !on || document.visibilityState !== 'visible') return
      if (Date.now() - asked.at > 10 * 60_000) return void localStorage.removeItem(FILL)
      const editor = (document.querySelector(EDITOR) as (HTMLElement & { editor?: Editor }) | null)?.editor
      if (!editor || editor.isDestroyed) return
      const now = editor.getText({ blockSeparator: '\n' }).trim()
      if (!editor.isEmpty && !STARTERS.some((one) => one.text === now)) return void localStorage.removeItem(FILL)
      localStorage.removeItem(FILL)
      if (now === asked.text) return void fields.current?.(asked.who ?? '', asked.where ?? '', asked.kind)
      const lines = asked.text.split('\n').map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] }))
      editor.chain().setContent({ type: 'doc', content: lines }, { emitUpdate: true }).focus('end').run()
      fields.current?.(asked.who ?? '', asked.where ?? '', asked.kind)
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
    const offHiding = window.api.onHiding(stop)
    return () => {
      stop()
      watchChip.disconnect()
      window.removeEventListener('storage', onStorage)
      offShown()
      offHiding()
    }
  }, [])
}
