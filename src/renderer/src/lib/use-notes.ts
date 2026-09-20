import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { assetsOf, type DocumentAsset } from "./document"

export type Note = Awaited<ReturnType<typeof window.api.notes.open>>
export type NoteMeta = Awaited<ReturnType<typeof window.api.notes.list>>[number]
export type NotePatch = Parameters<typeof window.api.notes.save>[1]

/** Long enough that a run of typing is one write, short enough to feel saved. */
const DEBOUNCE_MS = 400

/**
 * Every note, and the one being edited.
 *
 * The whole surface an app needs around the editors:
 *
 * ```tsx
 * const { note, notes, open, create, save } = useNotes()
 * <TitleEditor key={note.id} defaultContent={note.titleHtml} onChange={...} />
 * <MindflowEditor key={note.id} defaultContent={note.doc} onChange={(doc) => save({ doc })} />
 * ```
 *
 * `notes` is the list; today it holds one open note beside it, and a board or a
 * task list is the same list rendered differently. Nothing here knows where the
 * notes are kept, so swapping the store means changing `window.api.notes` and
 * nothing else.
 */
export function useNotes(): {
  /** Every note, metadata only. Pinned first, then most recently opened. */
  notes: NoteMeta[]
  /** The one being edited, or null until the first has loaded. */
  note: Note | null
  /** Every file the open note points at. The list to back up. */
  assets: DocumentAsset[]
  /** Open one. No id means the note last worked on, making one if there is none. */
  open: (id?: string) => void
  create: () => void
  remove: (id: string) => void
  /** Change the open note. Only the fields you pass are written. */
  save: (patch: NotePatch) => void
} {
  const [notes, setNotes] = useState<NoteMeta[]>([])
  const [note, setNote] = useState<Note | null>(null)

  // The note id travels with the patch: without it a save queued just before
  // switching would land on the note being switched to.
  const held = useRef<{ id: string; patch: NotePatch } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const refresh = useCallback(
    (): Promise<void> => window.api.notes.list().then(setNotes),
    []
  )

  const flush = useCallback((): void => {
    clearTimeout(timer.current)
    const pending = held.current
    held.current = null
    if (pending) void window.api.notes.save(pending.id, pending.patch).then(refresh)
  }, [refresh])

  const show = useCallback(
    async (next: Promise<Note>): Promise<void> => {
      // The note being left keeps its last edit, under its own id.
      flush()
      const opened = await next
      setNote(opened)
      await refresh()
    },
    [flush, refresh]
  )

  const save = useCallback(
    (patch: NotePatch): void => {
      const id = note?.id
      if (!id) return

      // A document arrives already debounced by the editor, so holding it again
      // would only add latency. A title reports every keystroke and does need it.
      if ("doc" in patch && Object.keys(patch).length === 1) {
        void window.api.notes.save(id, patch).then(refresh)
        return
      }

      if (held.current && held.current.id !== id) flush()
      held.current = { id, patch: { ...held.current?.patch, ...patch } }
      clearTimeout(timer.current)
      timer.current = setTimeout(flush, DEBOUNCE_MS)
    },
    [note?.id, flush, refresh]
  )

  useEffect(() => {
    void show(window.api.notes.open())
  }, [show])

  // Closing the window never unmounts React, so both hooks are needed for the
  // last few hundred milliseconds of typing to survive.
  useEffect(() => {
    window.addEventListener("pagehide", flush)
    return () => {
      window.removeEventListener("pagehide", flush)
      flush()
    }
  }, [flush])

  // Derived, never stored: the document is the only truth about what it
  // points at, so a stale copy is worse than no copy.
  const assets = useMemo(() => assetsOf(note?.doc), [note?.doc])

  return {
    notes,
    note,
    assets,
    open: useCallback((id) => void show(window.api.notes.open(id)), [show]),
    create: useCallback(() => void show(window.api.notes.create()), [show]),
    remove: useCallback(
      (id) => {
        void window.api.notes.remove(id).then(() => {
          // Deleting the open note leaves nowhere to type, so open another.
          if (id === note?.id) return show(window.api.notes.open())
          return refresh()
        })
      },
      [note?.id, refresh, show]
    ),
    save,
  }
}
