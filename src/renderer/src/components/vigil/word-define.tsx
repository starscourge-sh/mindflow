import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { Volume2 } from 'lucide-react'

import type { Answer, Defined } from '../../../../main/define'
import { chime } from '@/lib/sound'
import { Kbd } from './ui'

/**
 * A Word's meaning, offered while you write it: looked up in the background
 * once the line is a single word, shown faint under it, and kept only when
 * you take it (Tab or a click). Never saved on its own. A word the
 * dictionary does not know is offered its nearest spelling, in one click.
 * Offline, nothing is said.
 */

/** The one word a line asks about: "serendipity", "define serendipity", "serendipity meaning". */
export const defineable = (text: string): string | null => {
  const line = text.trim()
  if (!line || line.includes('\n')) return null
  return /^(?:define\s+)?([a-z][a-z'-]{2,40})(?:\s+meaning)?$/i.exec(line)?.[1] ?? null
}

export type Definition = {
  word: string
  state: 'looking' | 'found' | 'fix' | 'quiet'
  found?: Defined
  fix?: string
  /** Taken with Tab or a click: saved with the note as its definition and example. */
  kept: boolean
}

export function useDefinition(word: string | null): { definition: Definition | null; keep: () => void } {
  const key = word?.toLowerCase() ?? null
  const [definition, setDefinition] = useState<Definition | null>(null)
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
        else setDefinition({ word: key, state: 'quiet', kept: false })
      }, () => live && setDefinition({ word: key, state: 'quiet', kept: false }))
    }, 450)
    return () => {
      live = false
      clearTimeout(wait)
    }
  }, [key])
  const shown = definition && definition.word === key ? definition : null
  const keep = (): void => {
    if (shown?.state !== 'found' || shown.kept) return
    chime('noted')
    setDefinition({ ...shown, kept: true })
  }
  return { definition: shown, keep }
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

/** Its sound, fetched by the app on a click and played once. */
const say = async (url: string): Promise<void> => {
  const bytes = (await window.api.vigil('define:audio', url).catch(() => null)) as Uint8Array | null
  if (!bytes) return chime('nope')
  const src = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'audio/mpeg' }))
  const audio = new Audio(src)
  audio.onended = audio.onerror = () => URL.revokeObjectURL(src)
  void audio.play().catch(() => URL.revokeObjectURL(src))
}

export function DefineGhost({ definition, onKeep, onFix }: { definition: Definition | null; onKeep: () => void; onFix: (fix: string) => void }): React.JSX.Element | null {
  // Tab takes it from the writing, before the editor's own Tab: only while it waits.
  const waiting = useRef(false)
  waiting.current = definition?.state === 'found' && !definition.kept
  const keepNow = useRef(onKeep)
  keepNow.current = onKeep
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!waiting.current || event.key !== 'Tab' || event.shiftKey || event.metaKey || event.altKey || event.ctrlKey) return
      if (!(event.target as HTMLElement | null)?.closest?.('.ProseMirror') || document.querySelector('.tiptap-suggestion-popup')) return
      event.preventDefault()
      event.stopPropagation()
      keepNow.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  // Up against the word and lined up with it: the editor keeps room under its
  // last line, and the ghost sits after all of it, so it is drawn back up.
  const box = useRef<HTMLDivElement>(null)
  const room = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = box.current
    const prose = el?.closest('.mf-faded')?.querySelector<HTMLElement>('.tiptap.ProseMirror')
    if (!el || !prose) return
    // Laid over the room the editor keeps below its last line, just under the
    // word: that room stretches to fill the surface, so the ghost is placed on
    // it rather than after it, and takes no room of its own.
    const surface = prose.parentElement!
    const place = (): void => {
      const last = [...prose.children].filter((line) => line.textContent?.trim()).at(-1)
      if (!last) return
      const word = last.getBoundingClientRect()
      const box = surface.getBoundingClientRect()
      el.style.top = `${Math.round(word.bottom - box.top + surface.scrollTop + 4)}px`
      el.style.paddingLeft = `${Math.round(word.left - box.left)}px`
      // Room kept after the writing for as much of the ghost as hangs below it, so the surface holds it whole.
      if (room.current) room.current.style.height = `${Math.max(0, Math.round(el.getBoundingClientRect().bottom + 40 - prose.getBoundingClientRect().bottom))}px`
    }
    place()
    // Again whenever the writing or its surface changes size.
    let frame = 0
    const later = (): void => (cancelAnimationFrame(frame), void (frame = requestAnimationFrame(place)))
    const watch = new ResizeObserver(later)
    watch.observe(prose)
    watch.observe(surface)
    return () => (watch.disconnect(), cancelAnimationFrame(frame))
  })
  if (!definition) return null
  // Inside the writing's own surface, lined up with its words (as the mentions under a kept note are).
  const LINE = 'absolute inset-x-0 pr-[4.75rem]'
  if (definition.state === 'fix' && definition.fix) {
    return (
      <><div ref={room} aria-hidden />
      <div ref={box} data-define="fix" className={`${LINE} flex items-center gap-1.5 pt-1 pb-2 text-xs text-muted-foreground animate-in fade-in-0 duration-200`}>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onFix(definition.fix!)}
          className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-foreground/10 px-2 py-0.5 text-foreground/80 transition-colors hover:border-foreground/20 hover:bg-accent">
          Did you mean <span className="font-medium text-foreground">{definition.fix}</span>?
        </button>
      </div></>
    )
  }
  if (definition.state !== 'found' || !definition.found) return null
  const { found, kept } = definition
  return (
    <><div ref={room} aria-hidden />
    <div ref={box} data-define={kept ? 'kept' : 'ghost'} className={`${LINE} flex min-w-0 flex-col gap-0.5 pt-0.5 pb-3 animate-in fade-in-0 duration-200`}>
      <div className="flex min-w-0 items-baseline gap-3">
        <button type="button" disabled={kept} onMouseDown={(event) => event.preventDefault()} onClick={onKeep}
          className={`min-w-0 flex-1 cursor-pointer text-left text-body leading-snug transition-colors disabled:cursor-default ${kept ? 'text-foreground' : 'italic text-muted-foreground/55 hover:text-muted-foreground'}`}>
          {found.definition}
        </button>
        <span className="shrink-0 text-xs text-muted-foreground/70">{kept ? 'Kept as its definition' : <span className="inline-flex items-center gap-1"><Kbd>Tab</Kbd> to keep</span>}</span>
      </div>
      {found.example && <p className={`text-control leading-snug ${kept ? 'text-muted-foreground' : 'italic text-muted-foreground/45'}`}>“{found.example}”</p>}
      <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground/80">
        {found.part && <span className="italic">{found.part}</span>}
        {found.phonetic && <span className="truncate font-mono text-[0.92em]">{found.phonetic}</span>}
        {found.audio && (
          <button type="button" aria-label={`Say ${found.word}`} onMouseDown={(event) => event.preventDefault()} onClick={() => void say(found.audio)}
            className="flex size-5 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <Volume2 className="size-3.5" />
          </button>
        )}
      </div>
    </div></>
  )
}
