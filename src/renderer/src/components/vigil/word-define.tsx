import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { noteOffline, offline, whenOnline } from '@/lib/offline'
import type { Editor } from '@tiptap/core'
import { Check, Volume2 } from 'lucide-react'

import type { Answer, Defined } from '../../../../main/define'
import { chime } from '@/lib/sound'
import { Kbd, toast } from './ui'
import { RowMenu } from './row-menu'
import { menuShowing } from '@/lib/menu-keys'
import { vigil } from '@/lib/vigil'
import './word-define.css'

/**
 * A word's meaning, offered while you write it, the way the Mac's Look Up
 * does: once the box holds a single word and you pause, the Mac's own
 * Dictionary is asked (the web only when it has nothing), and the meaning
 * shows quietly under the word, in room the writing already keeps, so
 * nothing you wrote moves. Saved with the word only when you take it (Tab,
 * or a click); Create alone keeps just the word. Esc puts it away for this
 * word; its right-click menu can stop it for good (Settings, “Word
 * meanings”). While it is asked, nothing shows for the first moment; a
 * longer wait shows two faint lines where it will appear.
 * Offline, the one shared line says so once (lib/offline.ts), and the
 * word is looked up again when the connection is back.
 */

/** The one word a line asks about: "serendipity", "define serendipity", "serendipity meaning". */
export const defineable = (text: string): string | null => {
  const line = text.trim()
  if (!line || line.includes('\n')) return null
  return /^(?:define\s+)?(\p{L}[\p{L}'-]{2,40})(?:\s+meaning)?$/iu.exec(line)?.[1] ?? null
}

export type Definition = {
  word: string
  /** `none`: the dictionary does not know it and has no nearer spelling. `quiet`: offline, nothing said. */
  state: 'looking' | 'found' | 'fix' | 'none' | 'quiet'
  found?: Defined
  fix?: string
  /** Taken with Tab or a click: saved with the note as its definition and example. */
  kept: boolean
}

/** How long a lookup may take before its two faint lines show: a quick answer never flickers them. */
export const WAIT_SHOWN = 300

export function useDefinition(word: string | null): { definition: Definition | null; keep: () => void; hide: () => void } {
  const key = word?.toLowerCase() ?? null
  const [definition, setDefinition] = useState<Definition | null>(null)
  // Put away with Esc: that word says nothing more in this capture. Emptying the box forgets it.
  const [hidden, setHidden] = useState<string | null>(null)
  useEffect(() => void (!key && setHidden(null)), [key])
  // Bumped when the connection comes back, so a word asked about offline is looked up again.
  const [back, setBack] = useState(0)
  useEffect(() => {
    if (!key) return setDefinition(null)
    let live = true
    // A pause in the typing first: a word on its way to a sentence is not looked up.
    const wait = setTimeout(() => {
      setDefinition({ word: key, state: 'looking', kept: false })
      void (window.api.vigil('define', key) as Promise<Answer>).then((answer) => {
        if (!live) return
        if (answer && 'found' in answer) setDefinition({ word: key, state: 'found', found: answer.found, kept: false })
        else if (answer && 'miss' in answer && answer.fix) setDefinition({ word: key, state: 'fix', fix: answer.fix, kept: false })
        else if (answer && 'miss' in answer) setDefinition({ word: key, state: 'none', kept: false })
        else quiet()
      }, () => live && quiet())
    }, 450)
    let unwatch = (): void => undefined
    const quiet = (): void => {
      setDefinition({ word: key, state: 'quiet', kept: false })
      if (!offline()) return
      noteOffline()
      unwatch = whenOnline(() => setBack((n) => n + 1))
    }
    return () => {
      live = false
      clearTimeout(wait)
      unwatch()
    }
  }, [key, back])
  const shown = definition && definition.word === key && hidden !== key ? definition : null
  // Tab takes it, and Tab again leaves it out: what Create will keep is always one key away.
  const keep = (): void => {
    if (shown?.state !== 'found') return
    chime(shown.kept ? 'off' : 'noted')
    setDefinition({ ...shown, kept: !shown.kept })
  }
  const hide = (): void => {
    if (!shown) return
    chime('tap')
    setHidden(shown.word)
    setDefinition((now) => (now ? { ...now, kept: false } : now))
  }
  return { definition: shown, keep, hide }
}

/** The misspelt word swapped for its fix where it stands, keeping a capital it had. */
export function fixIn(editor: Editor | null, word: string, fix: string): void {
  if (!editor) return
  let at = -1
  let typed = ''
  editor.state.doc.descendants((node, pos) => {
    if (at >= 0 || !node.isText) return at < 0
    const index = (node.text ?? '').toLowerCase().indexOf(word.toLowerCase())
    if (index >= 0) (at = pos + index, (typed = (node.text ?? '').slice(index, index + word.length)))
    return false
  })
  if (at < 0) return
  const cased = /^\p{Lu}/u.test(typed) ? fix.charAt(0).toUpperCase() + fix.slice(1) : fix
  chime('tap')
  editor.chain().focus().insertContentAt({ from: at, to: at + word.length }, cased).run()
}

/** Its sound: the recording the web dictionary has, fetched by the app; otherwise the Mac's own voice says it. */
const say = async (found: Defined): Promise<void> => {
  if (!found.audio) {
    if (typeof speechSynthesis === 'undefined') return chime('nope')
    speechSynthesis.cancel()
    const line = new SpeechSynthesisUtterance(found.word)
    line.lang = 'en'
    return void speechSynthesis.speak(line)
  }
  const bytes = (await window.api.vigil('define:audio', found.audio).catch(() => null)) as Uint8Array | null
  if (!bytes) return chime('nope')
  const src = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'audio/mpeg' }))
  const audio = new Audio(src)
  audio.onended = audio.onerror = () => URL.revokeObjectURL(src)
  void audio.play().catch(() => URL.revokeObjectURL(src))
}

/** Back to the writing after a click or a menu: the box is for typing. */
const backToWriting = (): void => document.querySelector<HTMLElement>('.tiptap.ProseMirror')?.focus()

/** Turned off from the moment itself, said where to bring it back, and undoable. */
export function stopLookingUp(before: 'one-word' | 'word-kind' = 'one-word'): void {
  chime('off')
  void vigil.setSettings({ wordMeanings: 'off' })
  toast('Words are no longer looked up. Settings › “Word meanings” brings it back.', () => void vigil.setSettings({ wordMeanings: before }), 'info')
}

export function DefineGhost({ definition, onKeep, onHide, onFix, picked = false, mode = 'one-word' }: {
  definition: Definition | null
  onKeep: () => void
  onHide: () => void
  onFix: (fix: string) => void
  /** Word was picked by hand: a word the dictionary does not know is said so, not passed over. */
  picked?: boolean
  mode?: 'one-word' | 'word-kind'
}): React.JSX.Element | null {
  // Tab takes it (and leaves it out again) before the editor's own Tab; Esc puts it away before the box does.
  const live = useRef<Definition | null>(null)
  live.current = definition
  const acts = useRef({ onKeep, onHide })
  acts.current = { onKeep, onHide }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const now = live.current
      if (!now || event.shiftKey || event.metaKey || event.altKey || event.ctrlKey) return
      if (!(event.target as HTMLElement | null)?.closest?.('.ProseMirror') || menuShowing('.tiptap-suggestion-popup')) return
      if (event.key === 'Tab' && now.state === 'found') acts.current.onKeep()
      // Esc, while a meaning (or its fix) is up: that Esc is the meaning's, not the box's.
      else if (event.key === 'Escape' && now.state !== 'quiet' && (now.state !== 'looking' || shownLate.current) && !document.querySelector('[role=menu], [role=dialog]')) acts.current.onHide()
      else return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  // The two faint lines only once the wait is long enough to notice.
  const [late, setLate] = useState(false)
  const shownLate = useRef(false)
  shownLate.current = late
  const looking = definition?.state === 'looking'
  useEffect(() => {
    if (!looking) return setLate(false)
    const timer = setTimeout(() => setLate(true), WAIT_SHOWN)
    return () => clearTimeout(timer)
  }, [looking])
  // Up against the word and lined up with it, laid over the room the editor
  // keeps below its last line: placed on that room rather than after it, so
  // it takes no room of its own and the writing never moves.
  const box = useRef<HTMLDivElement>(null)
  const room = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = box.current
    const prose = el?.closest('.mf-faded')?.querySelector<HTMLElement>('.tiptap.ProseMirror')
    if (!el || !prose) return
    const surface = prose.parentElement!
    const place = (): void => {
      const last = [...prose.children].filter((line) => line.textContent?.trim()).at(-1)
      if (!last) return
      const word = last.getBoundingClientRect()
      const box = surface.getBoundingClientRect()
      el.style.top = `${Math.round(word.bottom - box.top + surface.scrollTop + 4)}px`
      el.style.paddingLeft = `${Math.round(word.left - box.left)}px`
      el.style.visibility = ''
      // Room kept after the writing for as much of it as hangs below, so the surface holds it whole.
      if (room.current) room.current.style.height = `${Math.max(0, Math.round(el.getBoundingClientRect().bottom + 40 - prose.getBoundingClientRect().bottom))}px`
    }
    place()
    let frame = 0
    const later = (): void => (cancelAnimationFrame(frame), void (frame = requestAnimationFrame(place)))
    const watch = new ResizeObserver(later)
    watch.observe(prose)
    watch.observe(surface)
    return () => (watch.disconnect(), cancelAnimationFrame(frame))
  })
  if (!definition || definition.state === 'quiet') return null
  if (definition.state === 'none' && !picked) return null
  if (definition.state === 'looking' && !late) return null
  // Inside the writing's own surface, lined up with its words. Hidden until
  // placed, so it is never seen anywhere but under the word.
  const LINE = 'absolute inset-x-0 pr-[4.75rem]'
  const hold = { visibility: 'hidden' } as const
  if (definition.state === 'looking') {
    return (
      <div ref={box} style={hold} data-define="looking" aria-label={`Looking up ${definition.word}`} className={LINE}>
        <div className="mf-define-wait w-[min(22rem,70%)]"><span className="w-[85%]" /><span className="w-[55%]" /></div>
      </div>
    )
  }
  if (definition.state === 'none') {
    return (
      <div ref={box} style={hold} data-define="none" className={`${LINE} mf-define-arrive pt-1.5 text-control text-muted-foreground`}>
        Not in the dictionary.
      </div>
    )
  }
  if (definition.state === 'fix' && definition.fix) {
    return (
      <><div ref={room} aria-hidden />
      <div ref={box} style={hold} data-define="fix" className={`${LINE} mf-define-arrive flex items-center gap-1.5 pt-1.5 text-control text-muted-foreground`}>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onFix(definition.fix!)}
          className="inline-flex cursor-pointer items-center rounded-full border border-foreground/10 px-2.5 py-0.5 text-foreground/80 transition-colors hover:border-foreground/20 hover:bg-accent">
          Did you mean&nbsp;<span className="font-medium text-foreground">{definition.fix}</span>?
        </button>
      </div></>
    )
  }
  if (definition.state !== 'found' || !definition.found) return null
  const { found, kept } = definition
  const mac = found.source === 'mac'
  const items = [
    { label: kept ? 'Leave the meaning out' : 'Save the meaning', hint: 'With the word', keys: 'Tab', run: () => (onKeep(), backToWriting()) },
    { label: 'Copy the meaning', run: () => void navigator.clipboard.writeText(`${found.word}: ${found.definition}`).then(() => (chime('copy'), backToWriting())) },
    mac && { label: 'Open in Dictionary', run: () => void window.api.vigil('define:open', found.word) },
    'separator' as const,
    { label: 'Hide for this word', keys: 'Esc', run: () => (onHide(), backToWriting()) },
    { label: 'Stop looking words up', run: () => (stopLookingUp(mode), backToWriting()) }
  ]
  return (
    <><div ref={room} aria-hidden />
    <div ref={box} style={hold} data-define={kept ? 'kept' : 'ghost'} data-source={found.source ?? 'web'} className={`${LINE} mf-define-arrive pt-1 pb-3`}>
    {/* Its right-click menu marks the meaning itself, snug round its lines, not the width of the box. */}
    <RowMenu items={items}>
      <div data-meaning className="-mx-2 flex w-fit max-w-[calc(100%+1rem)] min-w-0 flex-col gap-1 px-2 py-0.5">
        {/* How it sounds and what it is: the line Look Up starts with. */}
        <div className="flex min-w-0 items-center gap-1.5 text-control text-muted-foreground">
          {found.part && <span className="italic">{found.part}</span>}
          {found.part && found.phonetic && <span aria-hidden className="opacity-50">·</span>}
          {found.phonetic && <span className="truncate">/{found.phonetic.replace(/^\/|\/$/g, '')}/</span>}
          <button type="button" aria-label={`Say ${found.word}`} onMouseDown={(event) => event.preventDefault()} onClick={() => void say(found)}
            className="-my-0.5 flex size-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <Volume2 className="size-3.5" />
          </button>
          {/* Where it came from, as Look Up says it. */}
          <span className="ml-1.5 shrink-0 text-muted-foreground/75">{mac ? 'Dictionary' : 'Free Dictionary'}</span>
        </div>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onKeep}
          className={`min-w-0 cursor-pointer text-left text-body leading-snug text-pretty transition-colors duration-200 ${kept ? 'text-foreground' : 'text-foreground/65 hover:text-foreground/85'}`}>
          {found.definition}
        </button>
        {found.example && <p className="text-control leading-snug text-muted-foreground italic">“{found.example}”</p>}
        {found.also && <p className="text-control leading-snug text-muted-foreground"><span className="font-medium">Also:</span> {found.also}</p>}
        {/* What Create will keep, said plainly, and where the meaning came from. */}
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-control">
          <span data-define-keep className={`inline-flex items-center gap-1.5 ${kept ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
            {kept
              ? <><Check className="size-3.5 text-[var(--tt-color-text-green)]" />Saved with the word <span className="font-normal text-muted-foreground">· <Kbd>Tab</Kbd> to leave out</span></>
              : <><Kbd>Tab</Kbd> to save it with the word</>}
          </span>
        </div>
      </div>
    </RowMenu>
    </div></>
  )
}
