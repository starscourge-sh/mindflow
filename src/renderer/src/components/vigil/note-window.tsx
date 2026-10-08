import { useEffect, useState, type CSSProperties } from 'react'
import type { Editor, JSONContent } from '@tiptap/core'

import { MindflowEditor, TAGS } from '../mindflow'
import { useCaptures } from '../capture-list'
import { CaptureProps, captureDots } from './captures-view'
import { ItemDetail } from './items-view'
import { NotePreview } from './note-preview'
import { Mentions } from './mentions'
import { selectionActions } from './selection-actions'
import { Toaster, pin } from './ui'
import { NoteHeader } from './note-extras'
import { Board, useBoard } from './board-view'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Search } from '../search'
import { SECTIONS } from './places'
import { ShortcutSheet } from './shortcut-sheet'
import { WordNotes } from './term'
import { foldEverything } from '@/extensions/heading-fold'
import { themeActions } from '@/lib/theme'
import { chime } from '@/lib/sound'
import { toast, typing } from './ui'
import { EXITS, exit } from '@/lib/capture-links'
import { captureKey, findCaptures, findHeadings, follow, headingIn } from '@/lib/capture-links'
import { toMarkdown } from '@/lib/export'
import { useSameWords } from '@/lib/same-words'
import { useAppearance, vigil, type ItemFull } from '@/lib/vigil'

type Capture = NonNullable<Awaited<ReturnType<typeof window.api.captures.get>>>

/** Anything a link in here leads to opens in the main window, beside everything else. */
const elsewhere = (type: string, id: string, heading?: string): void => window.api.openInHome(type, id, heading)

/**
 * One note in a window of its own, opened with ⌘-click from any list: its
 * words and its properties, the same as beside the list, and nothing else.
 */
export function NoteWindow({ link }: { link: string }): React.JSX.Element {
  useAppearance()
  const [type, id] = link.split(':')
  // ⌘K: notes and actions; ⌘P: notes only, the same palette as the other windows.
  const [searching, setSearching] = useState<false | 'all' | 'notes'>(false)
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || event.altKey || event.ctrlKey || event.shiftKey || (event.code !== 'KeyK' && event.code !== 'KeyP')) return
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      event.preventDefault()
      event.stopPropagation()
      setSearching(event.code === 'KeyK' ? 'all' : 'notes')
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  return (
    <TooltipProvider delayDuration={600}>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <Toaster />
        <ShortcutSheet />
        <WordNotes />
        {searching && (
          <Search
            // What finds a note opens it in the main window, beside everything else.
            actions={searching === 'notes' ? [] : [
              { label: 'New capture', run: () => window.api.showPrompt() },
              ...SECTIONS.map((section) => ({ label: `Go to ${section.label}`, run: () => window.api.openInHome('view', section.id) })),
              { label: 'Fold every heading', cue: null, run: () => void (foldEverything(true) || chime('nope')) },
              { label: 'Unfold every heading', cue: null, run: () => void (foldEverything(false) || chime('nope')) },
              { label: 'Keyboard shortcuts', keys: '?', run: () => window.dispatchEvent(new CustomEvent('vigil:shortcuts')) },
              ...themeActions((text) => toast(text)),
              { label: 'Settings', keys: '⌘,', run: () => window.api.openInHome('view', 'settings') },
              { label: 'Close this window', cue: null, run: () => window.close() }
            ]}
            onClose={() => setSearching(false)}
            onOpen={(to, at) => {
              setSearching(false)
              // This note is already here.
              if (at !== id) elsewhere(to, at)
            }}
          />
        )}
        <NotePreview />
        {/* Room for the traffic lights, and somewhere to hold the window by. */}
        <div className="h-10 shrink-0" style={{ WebkitAppRegion: 'drag' } as CSSProperties} />
        <div className="@container/page flex min-h-0 flex-1 overflow-hidden">
          {type === 'capture' ? <CaptureWindow id={id} /> : <ItemWindow id={id} />}
        </div>
      </div>
    </TooltipProvider>
  )
}

function CaptureWindow({ id }: { id: string }): React.JSX.Element | null {
  const [capture, setCapture] = useState<Capture | null>(null)
  const meta = useCaptures(true).find((one) => one.id === id)
  // An earlier version shown in place of the words, and a new key once one is restored.
  const [past, setPast] = useState<{ body: unknown; key: string } | null>(null)
  const [rev, setRev] = useState(0)
  useEffect(() => void window.api.captures.get(id).then(setCapture), [id])
  // Saved only over the words it was opened on: another window's never lost.
  const words = useSameWords('captures', capture?.id, capture?.body, (at, body, base, editor) =>
    window.api.captures.save(at, { body, base, ...(editor ? { markdown: toMarkdown(editor) } : {}) }))
  const [editor, setEditor] = useState<Editor | null>(null)
  const board = useBoard('captures', capture?.id, editor)
  const boardShown = board.on && !past && !!editor && !editor.isDestroyed
  // A board takes the room its properties had, until asked for them.
  const [propsOut, setPropsOut] = useState(false)
  const [tools, setTools] = useState<HTMLElement | null>(null)
  useEffect(() => setPropsOut(false), [boardShown])
  // P, R, D and H take that exit here too, as the menu says, when no field has the keys.
  const open = meta?.status === 'open'
  useEffect(() => {
    if (!open || boardShown) return
    let afterG = false
    const onKey = (event: KeyboardEvent): void => {
      if (typing() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      // G then a letter is a place to go, not an exit.
      const g = afterG
      afterG = event.key === 'g'
      const one = !g && EXITS.find((e) => e.key === event.key)
      if (!one) return
      event.preventDefault()
      void exit(id, one.status)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, open, boardShown])
  // A private note's words never become its window's name: titles show in a screen share.
  useEffect(() => void (document.title = (!meta?.private && meta?.label) || 'Note'), [meta?.label, meta?.private])
  if (!capture || !meta) return null
  return (
    <div className="note-pane flex min-w-0 flex-1 flex-col overflow-y-auto [--mf-padding:1rem_3.25rem] @[40rem]/page:flex-row @[40rem]/page:overflow-visible @[40rem]/page:[--mf-padding:1rem_4.75rem]">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <NoteHeader table="captures" id={id} onShow={(body, key) => setPast(body === null ? null : { body, key: key ?? '' })} onRestored={() => void window.api.captures.get(id).then((found) => {
            setCapture(found)
            setRev((n) => n + 1)
          })}
          edited={meta.editedAt} captured={meta.capturedAt} pinned={!!meta.pinnedAt} onPin={() => pin('captures', id, !meta.pinnedAt)}
          copyKey={captureKey(meta.number)} board={board.fits || board.on ? board : undefined} details={!boardShown}
          menu={[...(boardShown ? [{ label: propsOut ? 'Hide properties' : 'Show properties', run: () => setPropsOut(!propsOut) }, 'separator' as const] : []), ...captureDots(meta).filter((item) => !item || item === 'separator' || item.label !== 'Open in a new window')]}
          tools={boardShown ? <span ref={setTools} className="contents" /> : undefined} />
        {past ? (
          <MindflowEditor key={`past-${past.key}`} defaultContent={(past.body as JSONContent | string | null) ?? ''} readOnly toolbar={false} handles={false} slash={false} outline={false} search={false} autofocus={false} />
        ) : (
        <div className={boardShown ? 'hidden' : 'contents'}>
        <MindflowEditor
          key={`${id}-${rev}`}
          host={window.api}
          typewriter
          tokens={TAGS}
          onTokenClick={(token) => token.name === 'tag' && elsewhere('tag', token.value)}
          toolbar={{ fixed: false, selectionExtra: selectionActions({ captureId: id, from: id }) }}
          documentId={`capture-${id}`}
          defaultContent={(capture.body as JSONContent | string | null) ?? ''}
          findNotes={findCaptures}
          findHeadings={findHeadings}
          onOpenNote={(to, heading) => (to === id && heading ? headingIn('capture', id, heading) : follow(to, (type, at) => elsewhere(type, at, heading)))}
          after={<Mentions id={id} onOpen={elsewhere} />}
          onReady={(ready) => (words.ready(ready), setEditor(ready))}
          onChange={words.save}
        />
        </div>
        )}
        {boardShown && <Board key={`${id}-${rev}`} editor={editor} id={id} tools={tools} />}
      </div>
      {(!boardShown || propsOut) && <CaptureProps capture={meta} onOpen={elsewhere} fold={!boardShown} />}
    </div>
  )
}

function ItemWindow({ id }: { id: string }): React.JSX.Element | null {
  const [item, setItem] = useState<ItemFull | null>(null)
  // Read again on any change, so a gloss or a question added shows here too.
  useEffect(() => {
    const load = (): void => void vigil.item(id).then(setItem)
    load()
    return window.api.captures.onChange(load)
  }, [id])
  useEffect(() => void (document.title = (!item?.private && item?.title) || 'Note'), [item?.title, item?.private])
  return item ? <ItemDetail key={id} item={item} onOpen={elsewhere} /> : null
}
