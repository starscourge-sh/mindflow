import { warmBin } from '@/lib/fly-home'
import { useEffect, useState, type CSSProperties } from 'react'
import { ReadsIn } from '@/lib/reads-in'
import type { Editor, JSONContent } from '@tiptap/core'

import { HaligtreeEditor } from '../haligtree'
import { useCaptures } from '../capture-list'
import { CapturePlace, CaptureProps, captureDots } from './captures-view'
import { ItemDetail } from './items-view'
import { NotePreview } from './note-preview'
import { Mentions } from './mentions'
import { SourceFoot } from './source-page'
import { PageThoughts } from './gloss-line'
import { notePowers } from './note-powers'
import { Tip, Toaster, pin, useEscapeLeavesEditor } from './ui'
import { NoteHeader } from './note-extras'
import { NoteSize } from '@/components/count/note-size'
import { WordCount } from '@/components/count/word-count'
import { NoteWaiting } from './note-coming'
import { ThoughtDock } from './thought-bar'
import { Board, useBoard } from './board-view'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Search } from '../search'
import { SECTIONS } from './places'
import { pageSaid } from './page-hint'
import { ShortcutSheet } from './shortcut-sheet'
import { WordNotes } from './term'
import { foldEverything } from '@/extensions/heading-fold'
import { isCollecting, startCollect, stopCollect } from '@/extensions/collect'
import { themeActions } from '@/lib/theme'
import { chime } from '@/lib/sound'
import { toast, typing } from './ui'
import { EXITS, exit } from '@/lib/capture-links'
import { menuOpen } from '@/lib/menu-keys'
import { noteLinkText, follow, headingIn } from '@/lib/capture-links'
import { readAgain, useSameWords } from '@/lib/same-words'
import { useAppearance, haligtree, shownName, type ItemFull } from '@/lib/haligtree'
import { Apart, openInHaligtree, useCarriedHere } from '@/lib/apart'
import { AppWindowMacIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { APP_NAME } from '../../../../main/name'

type Capture = NonNullable<Awaited<ReturnType<typeof window.api.captures.get>>>

/** Anything a link in here leads to opens in the main window, beside everything else. */
const elsewhere = (type: string, id: string, heading?: string): void => window.api.openInHome(type, id, heading)

/**
 * One note in a window of its own, opened with ⌘-click from any list: its
 * words and its properties, the same as beside the list, and nothing else.
 */
/** Arc's Little Arc: this small window grows back into the main one, the same page, the caret where it was. With the note's own tools on the right, clear of the traffic lights. */
function OpenHere(): React.JSX.Element {
  return (
    <Tip label={`Open in ${APP_NAME}  ⌘O`}>
      <button type="button" aria-label={`Open in ${APP_NAME}`} data-open-in-haligtree onClick={() => void openInHaligtree()}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
        <AppWindowMacIcon className="size-4" strokeWidth={1.8} />
      </button>
    </Tip>
  )
}

export function NoteWindow({ link }: { link: string }): React.JSX.Element {
  useAppearance()
  useEscapeLeavesEditor()
  // The Bin's paper made ready while the app is idle (lib/fly-home.ts).
  useEffect(warmBin, [])
  const [type, id] = link.split(':')
  // The caret and the place it came with, and ⌘O back into the main window.
  useCarriedHere(link)
  // ⌘K: notes and actions; ⌘P: notes only, the same palette as the other windows.
  const [searching, setSearching] = useState<false | 'all' | 'notes'>(false)
  const gone = useGone(type, id)
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
      <div className="relative flex h-screen flex-col bg-background text-foreground">
        <div data-toast-lane className="contents"><Toaster /></div>
        <ShortcutSheet />
        <WordNotes />
        {searching && (
          <Search
            // What finds a note opens it in the main window, beside everything else.
            actions={searching === 'notes' ? [] : [
              { label: `Open in ${APP_NAME}`, hint: 'This note in the main window', keys: '⌘O', cue: null, run: () => void openInHaligtree() },
              { label: 'New capture', hint: 'A blank capture in quick capture: write, then it goes to the Inbox', run: () => window.api.showPrompt() },
              ...SECTIONS.map((section) => ({ label: `Go to ${section.label}`, hint: pageSaid(section.id), run: () => window.api.openInHome('view', section.id) })),
              { label: 'Fold every heading', hint: 'In the note in front: only its headings show', cue: null, run: () => void (foldEverything(true) || chime('nope')) },
              { label: 'Unfold every heading', hint: 'In the note in front: everything under its headings shows again', cue: null, run: () => void (foldEverything(false) || chime('nope')) },
              isCollecting()
                ? { label: 'Stop collecting what I copy', hint: 'What you copy stays on the clipboard only', keys: '⎋', cue: null, run: stopCollect }
                : { label: 'Collect what I copy', hint: 'Everything you copy on this Mac lands in this note', cue: null, run: () => void (startCollect() || chime('nope')) },
              { label: 'Keyboard shortcuts', hint: 'Every key, by what it does', keys: '?', run: () => window.dispatchEvent(new CustomEvent('haligtree:shortcuts')) },
              ...themeActions((text, undo) => toast(text, undo)),
              { label: 'Settings', hint: 'Look, sounds, keys, backups and your book', keys: '⌘,', run: () => window.api.openInHome('view', 'settings') },
              { label: 'Close this window', hint: 'The note stays kept, in its place', cue: null, run: () => window.close() }
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
        {/* Somewhere to hold the window by, behind the note's own header: one row of
            controls level with the traffic lights, not a strip of its own above it.
            The header's controls are kept pressable over it. */}
        <div data-drag-strip="" aria-hidden className="absolute inset-x-0 top-0 h-10" style={{ WebkitAppRegion: 'drag' } as CSSProperties} />
        <div className="@container/page relative flex min-h-0 flex-1 overflow-hidden pt-2 [&_[data-note-head]_:is(button,a,input,[role=button])]:[-webkit-app-region:no-drag]">
          {type === 'capture' ? <CaptureWindow id={id} /> : <ItemWindow id={id} />}
          {/* Moved to the Bin (or merged) from another window: said here, the words out of reach, with the way back. */}
          {gone && (
            <div data-note-gone role="status" className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-background px-8 text-center">
              <p className="text-body font-semibold text-foreground">{gone === 'bin' ? 'This note is in the Bin' : 'This note was deleted'}</p>
              <p className="max-w-sm text-control text-muted-foreground">{gone === 'bin' ? 'It was moved there from another window. Bring it back to keep writing in it.' : 'It is gone for good, so there is nothing to show here.'}</p>
              <div className="mt-1 flex items-center gap-2">
                {gone === 'bin' && <Button size="sm" onClick={() => void haligtree.restore(type === 'capture' ? 'capture' : type, id).then(() => chime('back'))}>Bring it back</Button>}
                <Button size="sm" variant="ghost" onClick={() => (chime('fold'), window.close())}>Close this window</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

/** Whether the note in this window has gone to the Bin, or for good, since it opened: read again on every change. */
function useGone(type: string, id: string): 'bin' | 'deleted' | null {
  const [gone, setGone] = useState<'bin' | 'deleted' | null>(null)
  useEffect(() => {
    const check = async (): Promise<void> => {
      if (type === 'capture') {
        const capture = await window.api.captures.get(id)
        return setGone(!capture ? 'deleted' : capture.status === 'discarded' ? 'bin' : null)
      }
      const item = (await haligtree.item(id)) as (ItemFull & { binnedAt?: string | null }) | null
      setGone(!item ? 'deleted' : item.binnedAt ? 'bin' : null)
    }
    void check()
    return window.api.captures.onChange(() => void check())
  }, [type, id])
  return gone
}

function CaptureWindow({ id }: { id: string }): React.JSX.Element | null {
  const [capture, setCapture] = useState<Capture | null>(null)
  const meta = useCaptures(true).find((one) => one.id === id)
  // An earlier version shown in place of the words, and a new key once one is restored.
  const [past, setPast] = useState<{ body: unknown; key: string } | null>(null)
  const [rev, setRev] = useState(0)
  useEffect(() => void window.api.captures.get(id).then(setCapture), [id])
  // Its words put in whole by the book (two notes joined, and that taken back): opened again from there, its name and
  // the one loader in their place meanwhile (note-coming.tsx).
  const [rereading, setRereading] = useState(false)
  const reread = (at: string): void => {
    setRereading(true)
    void readAgain(window.api.captures.get(at), (found) => (found && setCapture(found), setRev((n) => n + 1), setRereading(false)))
  }
  // Saved only over the words it was opened on: another window's never lost.
  const words = useSameWords('captures', capture?.id, capture?.body, (at, words, wordsBase, markdown) => window.api.captures.save(at, { words, wordsBase, markdown }), reread)
  const [editor, setEditor] = useState<Editor | null>(null)
  const board = useBoard('captures', capture?.id, editor, capture?.fields)
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
      // An open menu (“Where it goes”, the dots) takes the keys its own lines show: the window under it stands down.
      if (typing() || menuOpen() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      // G then a letter is a place to go, not an exit.
      const g = afterG
      afterG = event.key === 'g'
      // ⌫ is the Bin, as the menu says; D too.
      const one = !g && EXITS.find((e) => e.key === (event.key === 'Backspace' || event.key === 'Delete' ? 'd' : event.key))
      if (!one) return
      event.preventDefault()
      void exit(id, one.status)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, open, boardShown])
  // A private note's words never become its window's name: titles show in a screen share.
  useEffect(() => void (document.title = (!meta?.private && meta?.label && shownName(meta.label)) || 'Note'), [meta?.label, meta?.private])
  if (!capture || !meta) return null
  return (
    // Drawn once every part of it has read what it shows (lib/reads-in.tsx).
    <ReadsIn className="contents">
    {/* Taken by a small window (one note, one window): its place here says so, with its way there and back, as the
        main window's does; back, it is read afresh. */}
    <Apart type="capture" id={id} title={meta.label} hidden={!!meta.private} onBack={() => window.api.captures.get(id).then((found) => found && (setCapture(found), setRev((n) => n + 1)))}>
    <div className="note-pane flex min-w-0 flex-1 flex-col overflow-y-auto [--mf-padding:1rem_3.25rem] @[40rem]/page:flex-row @[40rem]/page:overflow-visible @[40rem]/page:[--mf-padding:1rem_4.75rem]">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <NoteHeader back={<OpenHere />} place={<CapturePlace capture={meta} />} table="captures" id={id} onShow={(body, key) => setPast(body === null ? null : { body, key: key ?? '' })} onRestored={() => void window.api.captures.get(id).then((found) => {
            setCapture(found)
            setRev((n) => n + 1)
          })}
          edited={meta.editedAt} captured={meta.capturedAt} pinned={!!meta.pinnedAt} onPin={() => pin('captures', id, !meta.pinnedAt)}
          copyKey={noteLinkText(meta.id, meta.label)} board={board} details={!boardShown}
          menu={[...(boardShown ? [{ label: propsOut ? 'Hide properties' : 'Show properties', run: () => setPropsOut(!propsOut) }, 'separator' as const] : []), ...captureDots(meta).filter((item) => !item || item === 'separator' || !['Open in a new window', 'Open in a small window'].includes(item.label))]}
          tools={boardShown ? <span ref={setTools} className="contents" /> : undefined} size={past ? undefined : <NoteSize editor={editor} />} />
        {past ? (
          <HaligtreeEditor key={`past-${past.key}`} defaultContent={(past.body as JSONContent | string | null) ?? ''} readOnly toolbar={false} handles={false} slash={false} outline={false} search={false} autofocus={false} />
        ) : rereading ? <NoteWaiting title={meta.label} /> : (
        <div className={boardShown ? 'hidden' : 'contents'}>
        <HaligtreeEditor
          key={`${id}-${rev}`}
          typewriter
          {...notePowers({ table: 'captures', id, kind: capture.kind, fields: capture.fields, text: capture.label, created: capture.capturedAt, updated: capture.editedAt, origin: { captureId: id, from: id }, cites: { who: capture.attribution, where: capture.medium }, onOpen: elsewhere })}
          defaultContent={(capture.body as JSONContent | string | null) ?? ''}
          onOpenNote={(to, heading) => (to === id && heading ? headingIn('capture', id, heading) : follow(to, (type, at) => elsewhere(type, at, heading)))}
          after={<><SourceFoot who={capture.attribution} where={capture.medium} quote={capture.kind === 'quote'} cite={{ table: 'captures', id, fields: capture.fields }} body={capture.body} /><PageThoughts id={id} /><Mentions id={id} onOpen={elsewhere} /></>}
          onReady={(ready) => (words.ready(ready), setEditor(ready))}
          onChange={words.save}
          foot={(ready) => <WordCount editor={ready} whole={false} />}
        />
        </div>
        )}
        {boardShown && <Board key={`${id}-${rev}`} editor={editor} id={id} tools={tools} />}
        <ThoughtDock id={id} hidden={boardShown} />
      </div>
      {(!boardShown || propsOut) && <CaptureProps capture={meta} onOpen={elsewhere} fold={!boardShown} />}
    </div>
    </Apart>
    </ReadsIn>
  )
}

function ItemWindow({ id }: { id: string }): React.JSX.Element | null {
  const [item, setItem] = useState<ItemFull | null>(null)
  // Read again on any change, so a gloss or a question added shows here too.
  useEffect(() => {
    const load = (): void => void haligtree.item(id).then(setItem)
    load()
    return window.api.captures.onChange(load)
  }, [id])
  useEffect(() => void (document.title = (!item?.private && item?.title && shownName(item.title)) || 'Note'), [item?.title, item?.private])
  return item ? <ItemDetail key={id} item={item} onOpen={elsewhere} back={<OpenHere />} /> : null
}
