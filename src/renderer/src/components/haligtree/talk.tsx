import { useEffect, useSyncExternalStore } from 'react'
import { Check, X } from 'lucide-react'
import { useCentreOn } from '@/lib/centre-on'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

import { startWorking } from '@/components/haligtree/beam'
import { refuse, refuseMic } from '@/components/haligtree/ui'
import { haligtree, useLive, type Settings } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { spoken } from '@/lib/spoken'
import { dictation, stopRecording } from '@/lib/recording'

/**
 * Talk to type, in any text field: hold the talk key (⌥Space, or the right
 * ⌥ alone) and what you say is typed at the caret, on this Mac
 * (main/dictation.ts). The words come in faint as they are heard and firm up
 * when Apple settles them; Esc takes the faint words away. The talk pill (its
 * levels, × and ✓) is the one sign that it listens: no Orb rides along the
 * words, sliding as they arrive and sitting on the placeholder at the start.
 * The beam turns round the window while it listens, except in quick capture,
 * whose card is a short pill the light could not go evenly round.
 */
type Field = { kind: 'editor'; editor: Editor; at: number } | { kind: 'input'; input: HTMLInputElement | HTMLTextAreaElement; at: number; length: number }
type Session = { field: Field; how: 'hold' | 'tap'; heard: string; stopping: boolean; endBeam: () => void; off: () => void; /** How loud the voice was, newest last, as the helper says it (an older helper says nothing: the pill rests flat). */ levels: number[]; /** The microphone is on and every word from here is kept: until then the pill says "Getting ready…". */ ready: boolean }

let session: Session | null = null
const listeners = new Set<() => void>()
// While it listens the page says so (data-talking): an empty line's placeholder steps aside at once, so the words
// heard never land on top of "Write a thought…" (main.css).
const tell = (): void => (document.documentElement.toggleAttribute('data-talking', !!session), listeners.forEach((one) => one()))
const subscribe = (listen: () => void): (() => void) => (listeners.add(listen), () => void listeners.delete(listen))

const KEY = new PluginKey<DecorationSet>('talk')
/** The faint words in a note: drawn before the caret (side -1), so the caret follows the end of the words as they arrive; not part of the note until they firm up. */
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
  }, { side: -1, key: text })

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
    if (field.editor.isDestroyed) return
    field.editor.view.dispatch(field.editor.state.tr.setMeta(KEY, text))
    // The newest words kept in sight as they arrive: once the box was full they ran on out of view below it (the
    // user's 8bc629d7: "it does not auto scroll as the person continues to speak"). The caret sits after them.
    keepInSight(field.editor.view.dom.querySelector<HTMLElement>('[data-talk="faint"]'))
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

/** The last line of the faint words brought into view in whatever scrolls the note, only when it is out of sight. */
function keepInSight(words: HTMLElement | null): void {
  const text = words?.lastChild
  if (!words || !text) return
  const range = document.createRange()
  range.selectNodeContents(text)
  range.collapse(false)
  const end = range.getBoundingClientRect()
  for (let at = words.parentElement; at; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at)
    if (!/(auto|scroll)/.test(overflowY) || at.scrollHeight <= at.clientHeight) continue
    const box = at.getBoundingClientRect()
    const room = 12
    if (end.bottom > box.bottom - room) at.scrollTop += end.bottom - box.bottom + room
    return
  }
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
  // A voice note recording: stopped and kept first. Never both at once.
  stopRecording(true)
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
    refuseMic(true)
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
    if (line.ready) {
      now.ready = true
      tell()
    } else if (typeof line.level === 'number') {
      now.levels.push(line.level)
      if (now.levels.length > BARS) now.levels.shift()
      tell()
    } else if (line.error) {
      // The helper heard no microphone at all (native/listen.swift, code "mic"): said the one way, with the way to settings.
      if ((line.error as { code?: string }).code === 'mic') refuseMic(false)
      else refuse(String((line.error as { message: string }).message))
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
  session = { field, how, heard: '', stopping: false, endBeam: window.api?.room?.left ? () => undefined : startWorking(), off, levels: [], ready: false }
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
// Told to the recorder (lib/recording.ts): it stops dictation before a voice note starts.
dictation.stop = () => void (session && talkStop())

/** The talk keys, read from Settings, and the talk pill. One in every window (main.tsx). */
export function Talk(): React.JSX.Element | null {
  const settings = useLive(haligtree.settings, null as Settings | null)
  useSyncExternalStore(subscribe, () => (session ? `${session.heard}|${session.levels.length}|${session.levels.at(-1) ?? ''}` : null))
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
    // A click anywhere keeps the words, except on the pill, whose own × and ✓ say which.
    const click = (event: MouseEvent): void => void (session?.how === 'tap' && !(event.target as Element | null)?.closest?.('[data-talk-pill]') && talkStop())
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
  if (!session) return null
  return createPortal(<TalkPill />, document.body)
}

/** How many bars the pill's waveform shows, the newest at the right. */
const BARS = 28

/**
 * While words are heard: a small pill under the field, centred on it, in the
 * round controls' surface (mf-voice-pill): × drops the words, the voice's
 * level as bars, ✓ keeps them. The bars come from the helper's own levels;
 * an older helper sends none, and they rest flat.
 */
function TalkPill(): React.JSX.Element | null {
  const field = session?.field
  const over = field ? (field.kind === 'editor' ? (field.editor.isDestroyed ? null : (field.editor.view.dom as HTMLElement)) : field.input) : null
  const middle = useCentreOn(over)
  if (!session) return null
  const levels = session.levels
  const bars = Array.from({ length: BARS }, (_, i) => levels[levels.length - BARS + i] ?? 0)
  return (
    <div data-talk-pill role="group" aria-label="Talking to type" onMouseDown={(event) => event.preventDefault()}
      className="mf-voice-pill fixed bottom-28 left-1/2 z-[1000] flex w-[220px] -translate-x-1/2 items-center gap-1.5 px-0.5 animate-in fade-in-0 duration-150"
      style={middle === null ? undefined : { left: middle }}>
      <button type="button" aria-label="Cancel" title="Drop the words  Esc" onClick={talkCancel}
        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,scale] duration-150 hover:bg-accent hover:text-foreground active:scale-[0.97]">
        <X className="size-3.5" />
      </button>
      {session.ready ? (
        <span data-talk-level className="flex h-5 min-w-0 flex-1 items-center justify-center gap-[3px]">
          {bars.map((level, i) => (
            // Louder is taller, eased so a quiet voice still shows; silence is a dot.
            <span key={i} className="w-[2px] rounded-full bg-foreground/70 transition-[height] duration-100 ease-out" style={{ height: `${Math.max(2, Math.min(20, Math.sqrt(level) * 60))}px` }} />
          ))}
        </span>
      ) : (
        // Until the microphone is on, it says so: listening is shown only once every word will be kept.
        <span data-talk-getting-ready role="status" className="flex h-5 min-w-0 flex-1 items-center justify-center text-control"><span className="mf-shimmer" data-text="Getting ready…">Getting ready…</span></span>
      )}
      <button type="button" aria-label="Keep the words" title="Keep the words" onClick={talkStop}
        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform duration-150 active:scale-[0.97]">
        <Check className="size-3.5" strokeWidth={3} />
      </button>
    </div>
  )
}
