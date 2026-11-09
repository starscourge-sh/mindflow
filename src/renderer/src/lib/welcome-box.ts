import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { dayjs } from '../../../main/dates'
import { seeded, typingWaits } from './typing'
import { still } from '@/lib/motion'
import { story } from './welcome-stories'

/**
 * The box, while the welcome runs. The welcome lives in the main window and
 * the box in its own, so they talk through the storage both windows share:
 *
 * - its empty line types out examples of each kind in turn, a note first,
 *   instead of "Type / for commands…" (the stylesheet does the rest,
 *   main.css): new ones, never the ones on the welcome's cards behind it
 * - it opens without taking the caret, so those lines can be watched typing
 *   in; a click, or the first key pressed, puts the caret in (that key is
 *   the first letter written)
 * - a starter asked for with `fillBox` is waiting in the box when it opens,
 *   written in whole, with who said it and where it is from already filled
 * - the kind chip wears the accent, gives a small pulse each time its guess
 *   changes, and the first time says what it is
 * - lesson mode (`useLesson`): what is not being taught is calm, and what
 *   draws on your history (completions, Similar to, what is waiting) is hidden
 *
 * Only while the welcome is open.
 */

export type Starter = { kind: 'note' | 'todo' | 'quote' | 'word' | 'link'; text: string; who?: string; where?: string }

/** The day the welcome's story falls on: two days from now by name, so the day read back is that day and never "today". */
export const STORY_DAY = dayjs().add(2, 'day').format('dddd')

/**
 * One of each kind, each showing off what its kind does: a plain thought first, the todo last. Catch shows the quote and
 * the todo (with the thought the story follows, welcome-flow.tsx), both from the story told now (welcome-stories.ts):
 * a line from its book, and its task on the story's day. The rest are the sandbox's.
 */
export const starters = (): Starter[] => [
  // The most common thing caught: a thought of your own, about a book.
  { kind: 'note', text: 'In Frankenstein, Victor never names the creature. Maybe that is the point.' },
  // A thought first, never a chore: Haligtree is a book of things worth keeping before it is a task list.
  // A line from the story's book, in its own words.
  { kind: 'quote', ...story().quote },
  // The sandbox keeps the same word in the same words (sandbox-seed.ts).
  { kind: 'word', text: 'petrichor\nThe smell of rain on dry earth.' },
  // Its name and picture are fetched when it is kept (cardUp); the welcome shows them from LINK_PAGE.
  { kind: 'link', text: 'https://en.wikipedia.org/wiki/Dune_(novel)' },
  // The story's task, on the story's day (Remember shows it on that day's sticky).
  { kind: 'todo', text: `${story().task} on ${STORY_DAY} 8pm` }
]

/**
 * What quick capture's empty line types out while the welcome is up: one of
 * each kind, never the examples on the welcome's own cards, so opening it
 * teaches something new. Only the first line of each is shown.
 */
export const EXAMPLES: Record<Starter['kind'], string> = {
  note: 'Frodo never wanted the ring. Maybe that is why he could carry it.',
  quote: '“While thou livest, while it is in thy power, be good.” - Marcus Aurelius, Meditations',
  word: 'anagnorisis',
  link: 'https://en.wikipedia.org/wiki/Rosetta_Stone',
  todo: 'Ask Hermione for the potions notes tomorrow 5pm'
}
/** The examples in order, a note first; with a kind, that kind leads and the rest follow. */
export const examples = (first: Starter['kind'] = 'note'): string[] => {
  // The one order of kinds (kindRank): Note, Task, then the rest.
  const order: Starter['kind'][] = ['note', 'todo', 'quote', 'word', 'link']
  return [first, ...order.filter((one) => one !== first)].map((one) => EXAMPLES[one])
}

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
  // ⌃L picks the kind of what you are writing in the box: yours to use in the welcome too.
  if (event.ctrlKey && !event.metaKey) return /^[0-9]$/.test(key) || ['j', 'k', 'f'].includes(key) || (!box && key === 'l')
  return event.altKey && !event.metaKey && !event.ctrlKey && event.code === 'KeyC'
}

/** Holds those keys back in this window while `on()` says the welcome is running; `told` hears each one. */
export function holdKeys(on: () => boolean, box: boolean, told: (event: KeyboardEvent) => void): void {
  addEventListener('keydown', (event) => {
    if (!on() || !heldInWelcome(event, box)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    told(event)
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
 * Whether the welcome is running, for the box: true from the moment it starts,
 * already known before the box is next shown, so it opens at its size at once.
 * Lesson mode (above) only begins once the box is up.
 */
export function useWelcoming(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    let live = true
    void window.api.haligtree<boolean>('onboarding:welcoming').then((now) => void (live && setOn(!!now)), () => undefined)
    const off = window.api.onWelcoming(setOn)
    return () => ((live = false), off())
  }, [])
  return on
}

// Who said a quote, read the same way everywhere (main/import.ts).
export { saidBy } from '../../../main/import'

const read = <T>(key: string): T | null => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null
  } catch {
    return null
  }
}

const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'

export function useWelcomePlaceholder(onFields?: (who: string, where: string, kind: Starter['kind']) => void, onExample?: (typed: string) => void): void {
  const fields = useRef(onFields)
  fields.current = onFields
  // Told each example as it starts to type in, whole, so the kind chip shows what it guesses the line is, once per line.
  const example = useRef(onExample)
  example.current = onExample
  useEffect(() => {
    const root = document.documentElement
    let timers: ReturnType<typeof setTimeout>[] = []
    let on = false
    const stop = (): void => {
      timers.forEach(clearTimeout)
      timers = []
      on = false
      chip = null
      watchChip.disconnect()
      example.current?.('')
      delete root.dataset.welcomePh
      delete root.dataset.welcomeFirst
      root.style.removeProperty('--mf-welcome-ph')
    }
    const show = (text: string): void => root.style.setProperty('--mf-welcome-ph', JSON.stringify(text))
    const lines = (): string[] => {
      const left = read<{ lines: string[] }>(LEFT)?.lines
      return left?.length ? left : examples()
    }
    const run = (n: number): void => {
      const all = lines()
      const line = all[n % all.length]
      // Every line types in, the first too, as soon as the box is up: it opens without the caret so they can be watched.
      // Typed as a person types (lib/typing.ts), never more than 2.6s a line; with Motion off, whole.
      let at = 0
      example.current?.(line)
      if (still()) show(line)
      else {
        show('')
        typingWaits(line, seeded(n + 7), 1, 2600).forEach((wait, i) => {
          at += wait
          timers.push(setTimeout(() => show(line.slice(0, i + 1)), at))
        })
      }
      timers.push(setTimeout(() => run(n + 1), at + 3000))
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
      if (!editor.isEmpty && !starters().some((one) => one.text === now)) return void localStorage.removeItem(FILL)
      localStorage.removeItem(FILL)
      if (now === asked.text) return void fields.current?.(asked.who ?? '', asked.where ?? '', asked.kind)
      const lines = asked.text.split('\n').map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] }))
      // Written in on purpose: the caret goes with it.
      touched = true
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
      if (!on || still()) return
      delete now.dataset.lit
      void now.offsetWidth
      now.dataset.lit = ''
    })

    // While the welcome is up the box opens without the caret, so its lines can be
    // watched typing in. A click puts the caret in; so does the first key, which is
    // written as the first letter. Until then any focus the box gives itself is let go.
    let touched = false
    const editorOf = (): Editor | null => {
      const editor = (document.querySelector(EDITOR) as (HTMLElement & { editor?: Editor }) | null)?.editor
      return editor && !editor.isDestroyed ? editor : null
    }
    const inEditor = (): boolean => !!document.activeElement?.closest?.(EDITOR)
    const letGo = (): void => {
      if (on && !touched && inEditor()) (document.activeElement as HTMLElement).blur()
    }
    const onFocus = (): void => void (on && !touched && setTimeout(letGo, 0))
    const onPointer = (): void => void (touched = true)
    const onKey = (event: KeyboardEvent): void => {
      if (!on || touched) return
      touched = true
      if (inEditor()) return
      const editor = editorOf()
      if (!editor) return
      // A letter, a number or a mark: written in, as the first one. Any other key (Esc, ⌘↵) does what it always does.
      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        editor.chain().focus('end').insertContent(event.key).run()
      } else editor.commands.focus('end')
    }
    document.addEventListener('focusin', onFocus, true)
    window.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('keydown', onKey, true)

    const start = (): void =>
      void (window.api.haligtree<boolean>('onboarding:welcoming')).then((welcoming) => {
        stop()
        if (!welcoming) return
        on = true
        touched = false
        letGo()
        // The box takes the caret a frame after it shows: let that go too.
        requestAnimationFrame(() => setTimeout(letGo, 30))
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
      document.removeEventListener('focusin', onFocus, true)
      window.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('keydown', onKey, true)
      watchChip.disconnect()
      window.removeEventListener('storage', onStorage)
      offShown()
      offHiding()
    }
  }, [])
}
