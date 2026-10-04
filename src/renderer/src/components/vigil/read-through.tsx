import { useEffect, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { AnimatePresence, motion } from 'motion/react'

import { MindflowEditor } from '../mindflow'
import { vigil } from '@/lib/vigil'
import { Kbd } from './ui'

export type Readable = { type: string; id: string }

/**
 * Reading, and nothing else: the notes of the list you were on, one at a
 * time, in a quiet column over the whole window. No lists, no panels, no
 * buttons. j and k (or the arrows) turn the page, e opens the one in front of
 * you to change it, Escape goes back to where you were.
 */
export function ReadThrough({ items, start = 0, onClose, onEdit }: {
  items: Readable[]
  start?: number
  onClose: () => void
  onEdit: (type: string, id: string) => void
}): React.JSX.Element | null {
  const [at, setAt] = useState(Math.min(Math.max(0, start), Math.max(0, items.length - 1)))
  const [page, setPage] = useState<{ title?: string; body: JSONContent | string | null } | null>(null)
  const item = items[at]

  useEffect(() => {
    if (!item) return
    setPage(null)
    const load = item.type === 'capture'
      ? window.api.captures.get(item.id).then((found) => found && { body: found.body as JSONContent })
      : vigil.item(item.id).then((found) => found && { title: found.tier === 'article' ? found.title : undefined, body: found.body as JSONContent })
    void load.then((next) => setPage(next ?? { body: null }))
  }, [item?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const next = event.key === 'j' || event.key === 'ArrowDown' || event.key === 'ArrowRight' || event.key === ' '
      const back = event.key === 'k' || event.key === 'ArrowUp' || event.key === 'ArrowLeft'
      // Every plain key is Read's while it is open: none reaches the list
      // or the note underneath, where a stray letter would act or type.
      if (event.key.length === 1 || next || back || event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
      }
      if (next) setAt((n) => Math.min(items.length - 1, n + 1))
      else if (back) setAt((n) => Math.max(0, n - 1))
      else if (event.key === 'Escape') onClose()
      else if (event.key === 'e' && item) onEdit(item.type, item.id)
    }
    // Taken first, so the lists and the editor underneath never see the keys.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [items.length, item, onClose, onEdit])

  // The focus comes here while reading, and goes back where it was after.
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const was = document.activeElement as HTMLElement | null
    box.current?.focus()
    return () => was?.focus?.()
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
          {page && (
            <MindflowEditor
              key={item.id}
              // The note's own files, so its pictures load.
              host={window.api}
              shape="document"
              readOnly
              defaultContent={page.body ?? ''}
              toolbar={false}
              handles={false}
              slash={false}
              outline={false}
              vim={false}
            />
          )}
        </motion.article>
      </AnimatePresence>
      {/* The only furniture: where you are, and how to move. */}
      <footer className="flex shrink-0 items-center justify-center gap-4 pb-4 text-xs text-muted-foreground">
        <span className="tabular-nums">{at + 1} of {items.length}</span>
        <span><Kbd>J</Kbd> next <Kbd>K</Kbd> back</span>
        <span><Kbd>E</Kbd> change it</span>
        <span><Kbd>Esc</Kbd> close</span>
      </footer>
    </div>
  )
}
