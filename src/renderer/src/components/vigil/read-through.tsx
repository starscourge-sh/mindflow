import { useEffect, useRef, useState } from 'react'
import { chime } from '@/lib/sound'
import type { Editor, JSONContent } from '@tiptap/core'
import { toMarkdown } from '@/lib/export'
import { AnimatePresence, motion } from 'motion/react'
import { EASE, TURN, byKeys, shift } from '@/lib/motion'

import { MindflowEditor } from '../mindflow'
import { vigil, when } from '@/lib/vigil'
import { cn } from '@/lib/cn'
import { CAPTURE_TYPES } from '@/components/capture-kinds/capture-kind-picker'
import { makeTask } from '@/lib/tasks'
import { Kbd, Rolling, Pressed, Tip } from './ui'
import { alive } from '@/components/ui/alive-icon'
import ArrowNarrowDownIcon from '@/components/ui/arrow-narrow-down-icon'
import ArrowNarrowUpIcon from '@/components/ui/arrow-narrow-up-icon'
import { exit } from '@/lib/capture-links'
import { Scenery } from './scenery'
import { GlossComposer, openGloss } from './gloss-line'

// itshover drawings in lucide's place, moving when their control is pointed at.
const ArrowDown = alive(ArrowNarrowDownIcon)
const ArrowUp = alive(ArrowNarrowUpIcon)

/** `body`: words read as they are, never changed here, like a question's clues. */
export type Readable = { type: string; id: string; body?: string; title?: string }

type Page = { id: string; title?: string; body: JSONContent | string | null; meta?: string[]; private?: boolean }

/** What it is, when it came, and where from: the quiet line under the words. */
const metaOf = (kind: string | undefined, at: string | null | undefined, from: (string | null | undefined)[]): string[] => {
  const name = kind && (CAPTURE_TYPES.find((one) => one.id === kind)?.label ?? kind[0].toUpperCase() + kind.slice(1))
  const source = from.find((one) => one && one.trim())
  return [name, at ? when(at) : '', source ? source.split('/').pop()! : ''].filter((one): one is string => !!one)
}

/** The first line, when it is short and there is no title: it reads as one. */
const leads = (page: Page): boolean => {
  if (page.title) return false
  if (typeof page.body === 'string') return page.body.length <= 120 && !page.body.includes('\n')
  const first = page.body?.content?.[0]
  if (first?.type !== 'paragraph') return false
  const text = (first.content ?? []).map((one) => one.text ?? '').join('')
  return text.length > 0 && text.length <= 120
}

/** Every key Read through answers to, shown when asked for. */
const KEYS: { keys: string[]; label: string; when?: 'own' | 'capture' }[] = [
  { keys: ['↓', 'J'], label: 'Next' },
  { keys: ['↑', 'K'], label: 'Back' },
  { keys: ['E'], label: 'Write in it', when: 'own' },
  { keys: [';'], label: 'Add a thought', when: 'own' },
  { keys: ['P', 'R', 'D'], label: 'Promote, resolve, discard', when: 'capture' },
  { keys: ['T'], label: 'Make it a task', when: 'capture' },
  { keys: ['Esc'], label: 'Close' },
]

/**
 * Reading, and nothing else: the notes of the list you were on, one at a
 * time, in a quiet column over the whole window. No lists, no panels, no
 * buttons. j and k (or the arrows) turn the page, e opens the one in front of
 * you to change it, Escape goes back to where you were.
 */
export function ReadThrough({ items, start = 0, onClose }: {
  items: Readable[]
  start?: number
  onClose: () => void
  /** No longer used: a note is changed in place, here. */
  onEdit?: (type: string, id: string) => void
}): React.JSX.Element | null {
  const [at, setAt] = useState(Math.min(Math.max(0, start), Math.max(0, items.length - 1)))
  // Which note the page is: a load that comes back after the page has turned
  // is thrown away, so one note's words are never shown, or saved, as another's.
  const [page, setPage] = useState<Page | null>(null)
  const [keysOpen, setKeysOpen] = useState(false)
  const item = items[at]
  // Writing in place: the same page, the same quiet, the words now editable.
  // E, Enter or a click starts it; Escape puts the keys back to reading.
  const [writing, setWriting] = useState(false)
  useEffect(() => setWriting(false), [item?.id])
  // The save waiting to happen, kept with the note it belongs to, and made at
  // once when the page turns rather than dropped by the next page's typing.
  const saving = useRef<{ timer: ReturnType<typeof setTimeout>; run: () => void } | null>(null)
  const flush = (): void => {
    if (!saving.current) return
    clearTimeout(saving.current.timer)
    saving.current.run()
    saving.current = null
  }
  const save = (target: Readable, doc: JSONContent, editor: Editor): void => {
    if (saving.current) clearTimeout(saving.current.timer)
    const run = (): void => void (target.type === 'capture'
      // The Markdown copy too, where this editor can write one.
      ? window.api.captures.save(target.id, { body: doc, markdown: (editor.storage as { markdown?: unknown }).markdown ? toMarkdown(editor) : undefined })
      : vigil.saveItem(target.id, { body: doc }))
    saving.current = { run, timer: setTimeout(() => ((saving.current = null), run()), 400) }
  }
  useEffect(() => flush, [item?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!item) return
    setPage(null)
    if (item.body !== undefined) return setPage({ id: item.id, title: item.title, body: item.body })
    const load: Promise<Omit<Page, 'id'> | null> = item.type === 'capture'
      ? window.api.captures.get(item.id).then((found) => found && { body: found.body as JSONContent, private: !!found.private, meta: metaOf(found.kind, found.capturedAt, [found.attribution, found.medium, found.source]) })
      : vigil.item(item.id).then((found) => found && { title: found.tier === 'article' ? found.title : undefined, body: found.body as JSONContent, private: !!found.private, meta: metaOf(found.kind, found.createdAt, [found.attribution, found.context]) })
    let current = true
    void load.then((next) => current && setPage({ id: item.id, ...(next ?? { body: null }) }))
    return () => void (current = false)
  }, [item?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // Writing: every key is the note's, but Escape, which stops writing.
      if (writing) {
        if (event.key === 'Escape' && !document.querySelector('.tiptap-suggestion-popup, [role="menu"]')) {
          event.preventDefault()
          event.stopPropagation()
          ;(document.activeElement as HTMLElement | null)?.blur()
          chime('off')
          setWriting(false)
        }
        return
      }
      // A thought being written on the page has the keys, Escape too.
      if (document.activeElement?.closest('[data-gloss]')) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      // A question asked over the page (who said it?) has the keys.
      if (document.querySelector('[role="dialog"]:not([aria-label="Reading"])')) return
      if (event.key === '?') {
        event.preventDefault()
        event.stopPropagation()
        return setKeysOpen((open) => !open)
      }
      if (event.key === 'Escape' && keysOpen) {
        event.preventDefault()
        event.stopPropagation()
        return setKeysOpen(false)
      }
      const next = event.key === 'j' || event.key === 'ArrowDown' || event.key === 'ArrowRight' || event.key === ' '
      const back = event.key === 'k' || event.key === 'ArrowUp' || event.key === 'ArrowLeft'
      // Every plain key is Read's while it is open: none reaches the list
      // or the note underneath, where a stray letter would act or type.
      if (event.key.length === 1 || next || back || event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
      }
      // A page turned sounds like one; at either end there is no page to turn.
      if ((next && at < items.length - 1) || (back && at > 0)) chime('page')
      if (next) setAt((n) => Math.min(items.length - 1, n + 1))
      else if (back) setAt((n) => Math.max(0, n - 1))
      else if (event.key === 'Escape') onClose()
      // ; a thought on the page in front of you, kept beside it, dated.
      else if (event.key === ';' && item && item.body === undefined) openGloss(item.id)
      else if ((event.key === 'e' || event.key === 'Enter') && item && item.body === undefined) {
        event.preventDefault()
        chime('on')
        setWriting(true)
      }
      // Deal with it while it is in front of you: an exit or a task, then the
      // next page. ⌘Z still takes it back.
      else if (item?.type === 'capture' && 'prdth'.includes(event.key)) {
        const next = (): void => setAt((n) => Math.min(items.length - 1, n + 1))
        // Undone, it is back where you left it: the page you took it from.
        const here = at
        const back = (): void => setAt(here)
        if (event.key === 't') void makeTask({ capture: item.id }, 'Now a task', { onUndo: back }).then((made) => made && next())
        else void exit(item.id, { p: 'promoted', r: 'resolved', d: 'discarded', h: 'question' }[event.key as 'p' | 'r' | 'd' | 'h'], back).then(next)
      }
    }
    // Taken first, so the lists and the editor underneath never see the keys.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [items.length, item, at, onClose, writing, keysOpen])

  // The focus comes here while reading, and goes back where it was after.
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const was = document.activeElement as HTMLElement | null
    box.current?.focus()
    // Reading opens out and folds away, like a panel.
    chime('read')
    return () => {
      chime('unread')
      was?.focus?.()
    }
  }, [])

  if (!item) return null
  // Its own words can be written in, and thought about; a clue is read only.
  const own = item.body === undefined
  const shown = page && page.id === item.id ? page : null
  // Private words blur like everywhere else, clear where you point or write.
  const hidden = shown?.private ? '' : undefined
  const write = (): void => void (!writing && own && (chime('on'), setWriting(true)))
  return (
    <div ref={box} tabIndex={-1} className="fixed inset-0 z-[55] isolate flex flex-col bg-background outline-none" role="dialog" aria-label="Reading">
      <Scenery place="focus" seed={`read:${new Date().toDateString()}`} text="middle" className="absolute inset-0 -z-10" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* j and k turn the page hundreds of times: by key the next one is
            simply there; by the arrows it rises in. */}
        <AnimatePresence mode="wait" initial={false} custom={byKeys()}>
          <motion.article
            key={item.id}
            custom={byKeys()}
            variants={TURN}
            initial={byKeys() ? false : 'from'}
            animate="here"
            exit="gone"
            transition={{ duration: 0.16, ease: EASE }}
            // A reading column: a short note sits in the upper third, not lost
            // in the middle of an empty page.
            className="mx-auto flex w-full max-w-[40rem] flex-col px-6 pt-[clamp(2.5rem,12vh,7rem)] pb-16 sm:px-8"
          >
            {shown?.title && <h1 data-private={hidden} className={cn('private-text text-3xl font-semibold tracking-tight text-balance', shown.meta?.length ? 'mb-1.5' : 'mb-5')}>{shown.title}</h1>}
            {/* What it is, when, and from where: under the title, never after the last paragraph. */}
            {shown?.title && !!shown.meta?.length && <p className="mb-5 truncate text-meta text-muted-foreground">{shown.meta.join(' · ')}</p>}
            {shown && (
              <div data-private={hidden} className="group/body">
                {/* The words, at reading size, a step up from writing. Pointed at,
                    the area shows it can be written in; writing, it looks like a field. */}
                <div
                  onClick={write}
                  // With no title, the first line is the title: the meta line goes right under it.
                  style={!shown.title && !writing && shown.meta?.length ? ({ '--meta': JSON.stringify(shown.meta.join(' · ')) } as React.CSSProperties) : undefined}
                  className={cn(
                    !shown.title && !writing && !!shown.meta?.length && '[&_.tiptap.ProseMirror>:first-child]:after:mt-1.5 [&_.tiptap.ProseMirror>:first-child]:after:mb-1 [&_.tiptap.ProseMirror>:first-child]:after:block [&_.tiptap.ProseMirror>:first-child]:after:text-meta [&_.tiptap.ProseMirror>:first-child]:after:font-normal [&_.tiptap.ProseMirror>:first-child]:after:tracking-normal [&_.tiptap.ProseMirror>:first-child]:after:text-muted-foreground [&_.tiptap.ProseMirror>:first-child]:after:content-[var(--meta)]',
                    'private-text -mx-4 rounded-xl px-4 py-3 ring-1 ring-transparent transition-[background-color,box-shadow] duration-150',
                    // The column sets the margins, not the editor's own gutter.
                    '[--mf-padding:0] [&_.mindflow-editor-content]:p-0 [&_.tiptap.ProseMirror]:text-[1.125rem] [&_.tiptap.ProseMirror]:leading-[1.7] [&_.ProseMirror>p:last-child:has(>br:only-child)]:hidden',
                    // Room between paragraphs, as a page of reading has.
                    '[&_.tiptap.ProseMirror>:first-child]:mt-0! [&_.tiptap.ProseMirror>p+p]:mt-[0.75em]!',
                    leads(shown) && '[&_.tiptap.ProseMirror>p:first-child]:text-[1.375rem]! [&_.tiptap.ProseMirror>p:first-child]:leading-snug! [&_.tiptap.ProseMirror>p:first-child]:font-medium! [&_.tiptap.ProseMirror>p:first-child]:tracking-tight',
                    writing ? 'bg-card shadow-sm ring-foreground/25' : own && 'cursor-text hover:bg-accent/40 hover:ring-border'
                  )}
                >
                  <MindflowEditor
                    key={`${item.id}-${writing}`}
                    // The note's own files, so its pictures load.
                    host={window.api}
                    shape="document"
                    readOnly={!writing}
                    autofocus={writing ? 'end' : false}
                    defaultContent={shown.body ?? ''}
                    onChange={(doc, editor) => {
                      setPage((now) => (now && now.id === item.id ? { ...now, body: doc } : now))
                      save(item, doc, editor)
                    }}
                    // Writing keeps the selection bar, so a highlight or a link is a
                    // selection away; reading has nothing on the page but the words.
                    toolbar={writing ? { fixed: false } : false}
                    handles={false}
                    slash={writing}
                    outline={false}
                    vim={false}
                    search={false}
                  />
                </div>
                {/* How to write in it. */}
                <div className="mt-2 flex min-h-5 items-center justify-end gap-3 text-meta text-muted-foreground">
                  {writing ? (
                    <span className="flex shrink-0 items-center gap-1.5"><span><span className="text-foreground">Writing</span>, saved as you go ·</span><Kbd>Esc</Kbd><span>done</span></span>
                  ) : own && (
                    <span className="flex shrink-0 items-center gap-1.5 opacity-0 transition-opacity duration-150 group-hover/body:opacity-100"><span>Click or press</span><Pressed keys="E" /><span>to write</span></span>
                  )}
                </div>
              </div>
            )}
            {shown && own && <div data-private={hidden} className="mt-8 border-t border-border/60 pt-6"><GlossComposer id={item.id} /></div>}
          </motion.article>
        </AnimatePresence>
      </div>
      {/* The only furniture: where you are, how to move, and the rest of the keys when asked. */}
      <footer className="relative flex shrink-0 items-center justify-center gap-4 pt-2 pb-3 text-meta text-muted-foreground">
        {/* Asked for with ?, so there at once; from its button it grows up out of the footer. */}
        <AnimatePresence custom={byKeys()}>
          {keysOpen && (
            <motion.div
              custom={byKeys()}
              variants={{
                from: () => ({ opacity: 0, transform: shift('translateY(4px) scale(0.98)') }),
                here: () => ({ opacity: 1, transform: shift('translateY(0px) scale(1)') }),
                gone: (keyed: boolean) => (keyed ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transform: shift('translateY(4px) scale(0.98)'), transition: { duration: 0.1, ease: EASE } })
              }}
              initial={byKeys() ? false : 'from'}
              animate="here"
              exit="gone"
              transition={{ duration: 0.14, ease: EASE }}
              className="absolute bottom-full mb-1 flex w-72 origin-bottom flex-col gap-0.5 rounded-xl border bg-popover p-2 text-control text-popover-foreground shadow-xl"
              role="list"
              aria-label="Keys"
            >
              {KEYS.filter((one) => !one.when || (one.when === 'own' ? own : own && item.type === 'capture')).map((one) => (
                <div key={one.label} role="listitem" className="flex items-center justify-between gap-3 rounded-md px-2 py-1">
                  <span>{one.label}</span>
                  <span className="flex gap-1">{one.keys.map((key) => <Kbd key={key}>{key}</Kbd>)}</span>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <span className="flex items-center gap-1 tabular-nums">
          <span className="text-foreground"><Rolling text={at + 1} /></span> / {items.length}
          <Tip label={<span className="flex items-center gap-2">Next<Kbd>↓</Kbd></span>}><button type="button" aria-label="Next" disabled={at >= items.length - 1} onClick={() => (chime('page'), setAt(at + 1))} className="ml-1 flex size-6 items-center justify-center rounded-md hover:bg-accent hover:text-foreground disabled:opacity-35"><ArrowDown className="size-3.5" /></button></Tip>
          <Tip label={<span className="flex items-center gap-2">Back<Kbd>↑</Kbd></span>}><button type="button" aria-label="Previous" disabled={at <= 0} onClick={() => (chime('page'), setAt(at - 1))} className="flex size-6 items-center justify-center rounded-md hover:bg-accent hover:text-foreground disabled:opacity-35"><ArrowUp className="size-3.5" /></button></Tip>
        </span>
        {!writing && <span className="flex items-center gap-1.5"><Kbd>Esc</Kbd> close</span>}
        <button type="button" aria-expanded={keysOpen} onClick={() => (chime('tap'), setKeysOpen(!keysOpen))} className={cn('flex h-6 items-center gap-1.5 rounded-md px-1.5 hover:bg-accent hover:text-foreground', keysOpen && 'bg-accent text-foreground')}>
          <Kbd>?</Kbd> Keys
        </button>
      </footer>
    </div>
  )
}
