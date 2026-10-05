import { useEffect, useRef, useState } from 'react'
import { chime } from '@/lib/sound'
import type { Editor, JSONContent } from '@tiptap/core'
import { toMarkdown } from '@/lib/export'
import { AnimatePresence, motion } from 'motion/react'

import { MindflowEditor } from '../mindflow'
import { vigil } from '@/lib/vigil'
import { makeTask } from '@/lib/tasks'
import { Kbd, Rolling } from './ui'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { exit } from '@/lib/capture-links'

export type Readable = { type: string; id: string }

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
  const [page, setPage] = useState<{ id: string; title?: string; body: JSONContent | string | null } | null>(null)
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
    const load = item.type === 'capture'
      ? window.api.captures.get(item.id).then((found) => found && { body: found.body as JSONContent })
      : vigil.item(item.id).then((found) => found && { title: found.tier === 'article' ? found.title : undefined, body: found.body as JSONContent })
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
      if (event.metaKey || event.ctrlKey || event.altKey) return
      // A question asked over the page (who said it?) has the keys.
      if (document.querySelector('[role="dialog"]:not([aria-label="Reading"])')) return
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
      else if ((event.key === 'e' || event.key === 'Enter') && item) {
        event.preventDefault()
        chime('on')
        setWriting(true)
      }
      // Deal with it while it is in front of you: an exit or a task, then the
      // next page. ⌘Z still takes it back.
      else if (item?.type === 'capture' && 'prdt'.includes(event.key)) {
        const next = (): void => setAt((n) => Math.min(items.length - 1, n + 1))
        // Undone, it is back where you left it: the page you took it from.
        const here = at
        const back = (): void => setAt(here)
        if (event.key === 't') void makeTask({ capture: item.id }, 'Now a task', { onUndo: back }).then((made) => made && next())
        else void exit(item.id, { p: 'promoted', r: 'resolved', d: 'discarded' }[event.key as 'p' | 'r' | 'd'], back).then(next)
      }
    }
    // Taken first, so the lists and the editor underneath never see the keys.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [items.length, item, at, onClose, writing])

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
  return (
    <div ref={box} tabIndex={-1} className="fixed inset-0 z-[55] flex flex-col bg-background outline-none" role="dialog" aria-label="Reading">
      <AnimatePresence mode="wait" initial={false}>
        <motion.article
          key={item.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          // Reading size: a step up from writing, with room between lines.
          className="mx-auto flex min-h-0 w-full max-w-[40rem] flex-1 flex-col overflow-y-auto px-8 pt-14 pb-8 [&_.tiptap.ProseMirror]:text-[1.15rem] [&_.tiptap.ProseMirror]:leading-[1.7]"
        >
          {page?.title && <h1 className="mb-4 text-3xl font-semibold text-balance">{page.title}</h1>}
          {page && page.id === item.id && (
            <div className={writing ? '' : 'cursor-text'} onClick={() => void (!writing && (chime('on'), setWriting(true)))}>
            <MindflowEditor
              key={`${item.id}-${writing}`}
              // The note's own files, so its pictures load.
              host={window.api}
              shape="document"
              readOnly={!writing}
              autofocus={writing ? 'end' : false}
              defaultContent={page.body ?? ''}
              onChange={(doc, editor) => {
                setPage((now) => (now && now.id === item.id ? { ...now, body: doc } : now))
                save(item, doc, editor)
              }}
              // Writing keeps the selection bar, so a highlight or a link is a
              // selection away; reading has nothing on the page but the words.
              toolbar={writing ? undefined : false}
              handles={false}
              slash={writing}
              outline={false}
              vim={false}
              search={false}
            />
            </div>
          )}
        </motion.article>
      </AnimatePresence>
      {/* The only furniture: where you are, and how to move. */}
      <footer className="flex shrink-0 items-center justify-center gap-4 pb-4 text-xs text-muted-foreground">
        {/* Where you are, and arrows to move, as Linear's issue view has them. */}
        <span className="flex items-center gap-1 tabular-nums">
          <span className="text-foreground"><Rolling text={at + 1} /></span> / {items.length}
          <button type="button" aria-label="Next" disabled={at >= items.length - 1} onClick={() => (chime('page'), setAt(at + 1))} className="ml-1 flex size-6 items-center justify-center rounded-md hover:bg-accent hover:text-foreground disabled:opacity-35"><ArrowDown className="size-3.5" /></button>
          <button type="button" aria-label="Previous" disabled={at <= 0} onClick={() => (chime('page'), setAt(at - 1))} className="flex size-6 items-center justify-center rounded-md hover:bg-accent hover:text-foreground disabled:opacity-35"><ArrowUp className="size-3.5" /></button>
        </span>
        {writing ? (
          <span><span className="text-foreground">Writing</span>, saved as you go · <Kbd>Esc</Kbd> back to reading</span>
        ) : (
          <>
            <span><Kbd>↓</Kbd> <Kbd>J</Kbd> next · <Kbd>↑</Kbd> <Kbd>K</Kbd> back</span>
            <span><Kbd>E</Kbd> write in it</span>
            {item.type === 'capture' && <span><Kbd>P</Kbd> <Kbd>R</Kbd> <Kbd>D</Kbd> exits · <Kbd>T</Kbd> task</span>}
            <span><Kbd>Esc</Kbd> close</span>
          </>
        )}
      </footer>
    </div>
  )
}
