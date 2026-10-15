import { useEffect, useState } from 'react'
import { READS, SHORTCUTS } from './shortcuts'

/**
 * Keys you have changed. Every key is still handled where it works, under its
 * own default; this layer sits in front of all of them in every window. A key
 * you moved somewhere new is caught first and pressed again as its default,
 * so nothing else has to know, and the default itself, moved or cleared,
 * stops doing anything.
 *
 * Saved in settings as { default keys: your keys, or null for none }.
 */
export type KeyChanges = Record<string, string | null>

let changes: KeyChanges = {}
const told = new Set<() => void>()
const load = (): void =>
  void (window.api.vigil('settings') as Promise<{ keys?: KeyChanges }>).then((settings) => {
    const next = settings.keys ?? {}
    if (JSON.stringify(next) === JSON.stringify(changes)) return
    changes = next
    told.forEach((tell) => tell())
  })

/** The keys you press for something, given the keys it was made with: '' when you cleared it. */
export const keyFor = (keys: string): string => (keys in changes ? (changes[keys] ?? '') : keys)

/** A tip's label with its keys ("Settings  ⌘,") as you press them now. */
export function withKeys(label: string): string {
  const at = label.lastIndexOf('  ')
  if (at < 0) return label
  const now = keyFor(label.slice(at + 2))
  return now ? label.slice(0, at + 2) + now : label.slice(0, at)
}

/** Every change, kept fresh: for whatever draws keys. */
export function useKeyChanges(): KeyChanges {
  const [, redraw] = useState(0)
  useEffect(() => {
    const tell = (): void => redraw((n) => n + 1)
    told.add(tell)
    return () => void told.delete(tell)
  }, [])
  return changes
}

export const saveKeys = (next: KeyChanges): void => {
  changes = next
  told.forEach((tell) => tell())
  void window.api.vigil('settings:set', { keys: next })
}

/**
 * Keys that stay as they are. Some do their job by being the key (Esc, ↵, the
 * arrows, typing / or + or a task's !alert), some stand for a run (1 to 4, ⌘1 to ⌘9), ⌘, ⌘O and ⌘Q
 * are taken before the page sees them, and the editor's own formatting keys are
 * kept so writing always behaves the same.
 */
export const fixed = (keys: string): boolean =>
  /Esc|↵|←|→|↑|↓|Space|⇥|⌫/.test(keys) ||
  ['/', '+', '⌘', '⌥', '⌘,', '⌘O', '⌘Q', '⌘Z', '⌘1', '1', '⌘B', '⌘I', '⌘U', '⇧⌘S', '⌥⌘T'].includes(keys) ||
  /^⌥⌘\d$/.test(keys) ||
  // Words typed in a task ("!alert") or read by quick capture, not keys.
  keys.startsWith('!') || SHORTCUTS.some((one) => one.keys === keys && one.group === READS)

/** Each changeable default, once, with every place it works. */
export const KEYED = [...new Set(SHORTCUTS.map((one) => one.keys))]

/**
 * Keys that now do two different things: your key landing on another one's,
 * yours or a default still in place. Keyed by the shared keys.
 */
export function clashes(list: KeyChanges = changes): Map<string, string[]> {
  const by = new Map<string, string[]>()
  for (const keys of KEYED) {
    const now = keys in list ? list[keys] : keys
    if (now) by.set(now, [...(by.get(now) ?? []), keys])
  }
  return new Map([...by].filter(([, all]) => all.length > 1))
}

// --- reading a key press ------------------------------------------------------

const NAMED: Record<string, string> = {
  Period: '.', Comma: ',', Slash: '/', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';',
  Quote: "'", Backquote: '`', Minus: '−', Equal: '+', Enter: '↵', NumpadEnter: '↵', Escape: 'Esc', Tab: '⇥',
  Space: 'Space', Backspace: '⌫', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→'
}

/**
 * A key press, written the way the list writes keys: ⌃⌥⇧⌘ then the key, read
 * from where the key is (so ⌥ never turns a letter into ∫). ? and # are their
 * own keys, ⇧ included; null for a modifier on its own.
 */
export function comboOf(event: KeyboardEvent): string | null {
  const { code } = event
  let key = /^Key[A-Z]$/.test(code) ? code.slice(3) : /^Digit\d$/.test(code) ? code.slice(5) : NAMED[code]
  if (!key) return null
  let shift = event.shiftKey
  if (shift && code === 'Slash') (key = '?'), (shift = false)
  if (shift && code === 'Digit3') (key = '#'), (shift = false)
  if (code === 'Equal') shift = false
  return `${event.ctrlKey ? '⌃' : ''}${event.altKey ? '⌥' : ''}${shift ? '⇧' : ''}${event.metaKey ? '⌘' : ''}${key}`
}

const CODES: Record<string, [code: string, key: string, shift?: boolean]> = {
  ...Object.fromEntries(Object.entries(NAMED).map(([code, glyph]) => [glyph, [code, code.startsWith('Arrow') || code === 'Enter' || code === 'Escape' || code === 'Tab' || code === 'Backspace' ? code : glyph]])),
  Space: ['Space', ' '], '↵': ['Enter', 'Enter'], '−': ['Minus', '-'], '+': ['Equal', '='], '?': ['Slash', '?', true], '#': ['Digit3', '#', true]
}

/** One step of keys as the event it stands for, for pressing it again. */
function eventFor(step: string): KeyboardEventInit {
  const base = step.replace(/^[⌃⌥⇧⌘]+/, '') || step
  const mods = step.slice(0, step.length - base.length)
  const shift = mods.includes('⇧')
  const [code, key, shifted] = /^[A-Z]$/.test(base) ? [`Key${base}`, shift ? base : base.toLowerCase()] : /^\d$/.test(base) ? [`Digit${base}`, base] : (CODES[base] ?? [base, base])
  return { key, code, ctrlKey: mods.includes('⌃'), altKey: mods.includes('⌥'), shiftKey: shift || !!shifted, metaKey: mods.includes('⌘'), bubbles: true, cancelable: true, composed: true }
}

// --- the layer in front -------------------------------------------------------

/**
 * While Settings listens for a new key, every key goes to it alone, before
 * anything else in the window can act on it: ⌘K is recorded, not obeyed.
 */
let listening: ((event: KeyboardEvent) => void) | null = null
export const listen = (to: typeof listening): void => void (listening = to)

/** Writing words, where a plain letter is a letter: fields, and the editor outside vim's normal mode. */
const writing = (): boolean => {
  const active = document.activeElement as HTMLElement | null
  if (!active) return false
  if (active.closest?.('[data-vim-mode]')?.getAttribute('data-vim-mode') === 'normal') return false
  return active.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)
}

let pressing = false
let first = ''
let firstAt = 0

function onKey(event: KeyboardEvent): void {
  if (listening && !pressing) return void (event.preventDefault(), event.stopImmediatePropagation(), listening(event))
  if (pressing || !Object.keys(changes).length) return
  const combo = comboOf(event)
  if (!combo) return
  // Plain keys while writing are words: neither moved nor stopped.
  if (!/[⌃⌥⌘]/.test(combo) && writing()) return void (first = '')
  const yours = new Map(Object.entries(changes).filter(([, now]) => now).map(([was, now]) => [now as string, was]))
  const before = first
  const two = before && Date.now() - firstAt < 1500 ? `${before} ${combo}` : ''
  const take = (): void => (event.preventDefault(), event.stopImmediatePropagation(), void (first = ''))
  const press = (was: string, seen = ''): void => {
    const steps = was.split(' ')
    // The first of two keys the page already had, when it is the same one.
    if (seen && steps.length > 1 && steps[0] === seen) steps.shift()
    pressing = true
    try {
      for (const step of steps) (event.target ?? window).dispatchEvent(new KeyboardEvent('keydown', eventFor(step)))
    } finally {
      pressing = false
    }
  }
  if (two && yours.has(two)) return (take(), press(yours.get(two)!, before))
  // Two keys you moved (G I): the second stops, and a key that means nothing
  // goes in its place, so the page is not left waiting after its G.
  if (two && two in changes) return (take(), press('Unidentified'))
  // The second of two keys still as made (G I) is theirs, whatever I alone now is.
  if (two && KEYED.includes(two)) return void (first = '')
  if (yours.has(combo)) return (take(), press(yours.get(combo)!))
  if (combo in changes && !fixed(combo)) return take()
  first = combo
  firstAt = Date.now()
}

// Installed once per window, ahead of every other key listener.
if (typeof window !== 'undefined' && 'api' in window) {
  window.addEventListener('keydown', onKey, true)
  load()
  window.api.captures.onChange(load)
}
