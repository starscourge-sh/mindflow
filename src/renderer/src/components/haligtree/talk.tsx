import { useEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

import { Orb } from '@/components/haligtree/orb'
import { startWorking } from '@/components/haligtree/beam'
import { refuse } from '@/components/haligtree/ui'
import { haligtree, useLive, type Settings } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { spoken } from '@/lib/spoken'

/**
 * Talk to type, in any text field: hold the talk key (⌥Space, or the right
 * ⌥ alone) and what you say is typed at the caret, on this Mac
 * (main/dictation.ts). The words come in faint as they are heard and firm up
 * when Apple settles them; Esc takes the faint words away. A bare Orb sits
 * by the caret and the beam turns round the window while it listens.
 */
type Field = { kind: 'editor'; editor: Editor; at: number } | { kind: 'input'; input: HTMLInputElement | HTMLTextAreaElement; at: number; length: number }
type Session = { field: Field; how: 'hold' | 'tap'; heard: string; stopping: boolean; endBeam: () => void; off: () => void }

let session: Session | null = null
const listeners = new Set<() => void>()
const tell = (): void => listeners.forEach((one) => one())
const subscribe = (listen: () => void): (() => void) => (listeners.add(listen), () => void listeners.delete(listen))

const KEY = new PluginKey<DecorationSet>('talk')
/** The faint words in a note: drawn at the caret, not part of the note until they firm up. */
const faint = (at: number, text: string): Plugin =>
  new Plugin({
    key: KEY,
    state: {
      init: (_config, state) => DecorationSet.create(state.doc, text ? [widget(at, text)] : []),
      apply: (tr, set) => {
        const words = tr.getMeta(KEY) as string | undefined
        const moved = set.map(tr.mapping, tr.doc)
        if (words === undefined) return moved
        const place = moved.find()[0]?.from ?? at
        return DecorationSet.create(tr.doc, words ? [widget(place, words)] : [])
      }
    },
    props: { decorations: (state) => KEY.getState(state) }
  })
const widget = (at: number, text: string): Decoration =>
  Decoration.widget(at, () => {
    const span = document.createElement('span')
    span.className = 'mf-talk-faint'
    span.dataset.talk = 'faint'
    span.textContent = text
    return span
  }, { side: 1, key: text })

/** The text field the caret is in now, if any: a note (TipTap) or a plain field that takes words. */
function fieldHere(): Field | null {
  const active = document.activeElement as HTMLElement | null
  const tiptap = active?.closest?.('.tiptap') as (HTMLElement & { editor?: Editor }) | null
  const editor = tiptap?.editor
  if (editor?.isEditable) return { kind: 'editor', editor, at: editor.state.selection.to }
  if (active instanceof HTMLTextAreaElement || (active instanceof HTMLInputElement && /^(text|search|)$/.test(active.type)))
    if (!active.readOnly && !active.disabled) return { kind: 'input', input: active, at: active.selectionEnd ?? active.value.length, length: 0 }
  return null
}

/** What comes before the caret: a new sentence or the middle of one decides the first capital and the space. */
const before = (field: Field): string =>
  field.kind === 'editor' ? field.editor.state.doc.textBetween(Math.max(0, field.at - 80), field.at, '\n', ' ') : field.input.value.slice(0, field.at)

/** The words so far, shown where the caret was: faint in a note, picked and greyed in a plain field. */
function show(field: Field, text: string): void {
  if (field.kind === 'editor') {
    if (!field.editor.isDestroyed) field.editor.view.dispatch(field.editor.state.tr.setMeta(KEY, text))
    return
  }
  const { input } = field
  input.focus()
  input.setSelectionRange(field.at, field.at + field.length)
  const words = input instanceof HTMLInputElement ? text.replace(/\n+/g, ' ') : text
  // The browser's own typing: React hears it, and ⌘Z takes it back.
  if (words) document.execCommand('insertText', false, words)
  else if (field.length) document.execCommand('delete')
  field.length = words.length
  input.setSelectionRange(field.at, field.at + field.length)
}

/** The words settled: typed into a note for good, the caret after them. */
function firm(field: Field, text: string): void {
  if (field.kind === 'input') {
    show(field, text)
    field.input.setSelectionRange(field.at + field.length, field.at + field.length)
    return
  }
  const { editor } = field
  if (editor.isDestroyed) return
  const place = (KEY.getState(editor.state)?.find()[0]?.from as number | undefined) ?? field.at
  const tr = editor.state.tr.setMeta(KEY, '')
  let at = Math.min(place, tr.doc.content.size)
  // Each "new line" a new paragraph, the caret after the last word.
  text.split('\n').forEach((part, i) => {
    if (i) (tr.split(at), (at += 2))
    if (part) (tr.insertText(part, at), (at += part.length))
  })
  if (text) tr.setSelection(TextSelection.create(tr.doc, at)).scrollIntoView()
  editor.view.dispatch(tr)
  editor.view.focus()
}

function end(how: 'kept' | 'cancelled'): void {
  const now = session
  if (!now) return
  session = null
  now.off()
  now.endBeam()
  const { field } = now
  if (how === 'cancelled') show(field, '')
  else firm(field, now.heard)
  if (field.kind === 'editor' && !field.editor.isDestroyed) field.editor.unregisterPlugin(KEY)
  if (field.kind === 'input') delete field.input.dataset.talking
  chime('listened')
  tell()
}

/**
 * Start listening into the field the caret is in, or into `editor` at its caret
 * (the slash menu's “Dictate”, which may have taken the focus when clicked).
 * `tap`: until the talk key is pressed again, Enter, or a click.
 */
export async function talkInto(how: 'hold' | 'tap' = 'tap', editor?: Editor): Promise<void> {
  // One at a time, counted from the first wait: a second press while the
  // microphone is still being asked for would hang a second listener on the words.
  if (session || starting) return
  starting = true
  try {
    await beginTalk(how, editor)
  } finally {
    starting = false
  }
}
let starting = false

async function beginTalk(how: 'hold' | 'tap', editor?: Editor): Promise<void> {
  const field: Field | null = editor?.isEditable ? { kind: 'editor', editor, at: editor.state.selection.to } : fieldHere()
  if (!field) return
  if (field.kind === 'editor') field.editor.view.focus()
  if (!(await window.api.haligtree<boolean>('mic:ask'))) {
    refuse('Haligtree may not use the microphone. Allow it in System Settings, under Privacy & Security, then Microphone')
    return
  }
  const started = await window.api.haligtree<{ ok: true } | { error: { code: string; message: string } }>('dictate:start')
  if ('error' in started) {
    refuse(started.error.message)
    return
  }
  const lead = before(field)
  const off = window.api.onDictation((line) => {
    const now = session
    if (!now) return
    if (line.error) {
      refuse(String((line.error as { message: string }).message))
      end('cancelled')
    } else if (line.partial || line.final) {
      now.heard = spoken(String(((line.partial ?? line.final) as { text: string }).text), lead)
      if (line.final) end('kept')
      else show(now.field, now.heard)
      tell()
    } else if (line.ended) end(now.stopping ? 'kept' : 'cancelled')
  })
  if (field.kind === 'editor') field.editor.registerPlugin(faint(field.at, ''))
  else field.input.dataset.talking = ''
  session = { field, how, heard: '', stopping: false, endBeam: startWorking(), off }
  chime('listen')
  tell()
}

/** Stop listening: the words heard so far are kept once Apple settles them. */
export function talkStop(): void {
  if (!session || session.stopping) return
  session.stopping = true
  void window.api.haligtree('dictate:stop')
}

/** Esc: nothing more is heard and the faint words go. */
export function talkCancel(): void {
  if (!session) return
  void window.api.haligtree('dictate:cancel')
  end('cancelled')
}

export const talking = (): boolean => session !== null

/** Where the caret is, for the Orb. */
function caretBox(): { left: number; top: number } | null {
  const field = session?.field
  if (!field) return null
  if (field.kind === 'editor') {
    if (field.editor.isDestroyed) return null
    const at = (KEY.getState(field.editor.state)?.find()[0]?.from as number | undefined) ?? field.at
    const place = field.editor.view.coordsAtPos(at)
    const words = field.editor.view.dom.querySelector('[data-talk=faint]')?.getBoundingClientRect()
    return { left: (words?.width ? words.right : place.left) + 6, top: (place.top + place.bottom) / 2 - 10 }
  }
  const box = field.input.getBoundingClientRect()
  return { left: box.right - 26, top: box.top + Math.min(box.height, 40) / 2 - 10 }
}

/** The talk keys, read from Settings, and the Orb by the caret. One in every window (main.tsx). */
export function Talk(): React.JSX.Element | null {
  const settings = useLive(haligtree.settings, null as Settings | null)
  useSyncExternalStore(subscribe, () => session?.heard ?? (session ? '' : null))
  const [, redraw] = useState(0)
  // Ways out of listening, however it began (the talk key or the slash menu's
  // “Dictate”, which works with the talk keys off): Esc drops the words, Enter
  // or a click keeps them.
  useEffect(() => {
    const down = (event: KeyboardEvent): void => {
      if (!session) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        talkCancel()
      } else if (session.how === 'tap' && event.key === 'Enter') {
        event.preventDefault()
        event.stopImmediatePropagation()
        talkStop()
      }
    }
    const click = (): void => void (session?.how === 'tap' && talkStop())
    window.addEventListener('keydown', down, true)
    window.addEventListener('mousedown', click, true)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('mousedown', click, true)
    }
  }, [])
  useEffect(() => {
    if (!settings || settings.talkToType === false) return
    const key = settings.talkKey ?? 'alt-space'
    const taps = settings.talkTaps === true
    /** The right ⌥ held alone: another key while it is down was a chord, so nothing is heard. */
    let chord = false
    const isTalkKey = (event: KeyboardEvent): boolean =>
      key === 'right-alt' ? event.code === 'AltRight' : event.code === 'Space' && event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey
    const down = (event: KeyboardEvent): void => {
      if (isTalkKey(event)) {
        if (!fieldHere() && !session) return
        if (key !== 'right-alt') event.preventDefault()
        if (event.repeat) return
        chord = false
        if (session) return talkStop()
        if (key === 'right-alt' && taps) return
        void talkInto(taps ? 'tap' : 'hold')
        return
      }
      if (key === 'right-alt' && event.altKey) {
        chord = true
        if (session?.how === 'hold' && !session.heard) talkCancel()
      }
    }
    const up = (event: KeyboardEvent): void => {
      if (key === 'right-alt' && event.code === 'AltRight' && taps && !chord && !session) return void talkInto('tap')
      const released = key === 'right-alt' ? event.code === 'AltRight' : event.code === 'Space' || event.key === 'Alt'
      if (released && session?.how === 'hold') talkStop()
    }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    // The window put away mid-word: whatever was heard is kept.
    const away = (): void => void (session?.how === 'hold' && talkStop())
    window.addEventListener('blur', away)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('blur', away)
    }
  }, [settings])
  // The Orb follows the caret as the words grow and as the page scrolls.
  useEffect(() => {
    if (!session) return
    const again = (): void => redraw((n) => n + 1)
    window.addEventListener('scroll', again, true)
    return () => window.removeEventListener('scroll', again, true)
  })
  const box = caretBox()
  if (!box) return null
  return createPortal(
    <div data-talk="orb" className="pointer-events-none fixed z-[70]" style={{ left: box.left, top: box.top }}>
      <Orb state="listening" />
    </div>,
    document.body
  )
}
