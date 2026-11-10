import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNav, useStepped } from '@/lib/nav'
import { AudioLines, Check, Image as ImageIcon, Layers, LayoutGrid, Plus, Unlink } from 'lucide-react'
import { FileText } from '@/components/ui/icons'
import { call, haligtree, unloaded, useLive } from '@/lib/haligtree'
import { smallPicture } from '@/lib/notes'
import { headingIn } from '@/lib/capture-links'
import { usePdfCover } from '@/components/pdf/pdf-cover'
import { PdfLibrary } from '@/components/pdf/pdf-library'
import { openPdf } from '@/components/pdf/pdf-reader'
import { openLook } from '@/components/image/image-look'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { MenuGlyph } from '@/components/ui/menu-icon'
import { Search } from '@/components/search'
import { addDropped, addFromPicker, binFiles, binUnlinked, keepInFiles, putInNote, takeMediaFile, takeUnlinked } from '@/lib/media-files'
import { useSelectAll } from '@/lib/select-all'
import { usePicking } from '@/lib/pick-range'
import { useHere } from '@/lib/split'
import { menuOpen } from '@/lib/menu-keys'
import { GRACE } from '@/components/pdf/pdf-peek'
import { canSplit, openAside } from '@/lib/split'
import { chime } from '@/lib/sound'
import { pictureLines } from '@/lib/picture-actions'
import { Empty, Kbd, Page, refuse, toast, typing, useListKeys, VirtualList } from './ui'
import { readLibrary, type Book } from '@/components/pdf/book-head'
import { heroOpen } from '@/lib/hero'
import { AudioDays, BOOK, BOOK_GAP, letGoWhen, PICTURE, PICTURE_GAP, Pile, PictureMonths, pictureSpans, RecentRow, SHELVES, shelfOf, stepLine, UnlinkedDays, unlinkedOrder, unlinkedSpans, type Shelf } from './files-shelves'
import { Chip } from './display'
import { ListSearch, tileClass } from './note-list'
import { SoundPlayer, soundTitle } from './sound-player'
import { RowMenu, type RowItem } from './row-menu'
import { dayName, num } from '../../../../main/dates'
import type { Media, MediaKind, MediaUse } from '../../../../main/media'
import { quoted } from '../../../../main/clip'

/** The tabs over the page: every kind at once, then each shelf (a GIF sits with the pictures). */
const ICONS: Record<Shelf, React.ComponentType<{ className?: string }>> = { pdf: FileText, picture: ImageIcon, audio: AudioLines }
/** How many the Recent row holds. */
const RECENT = 10
/** A tile as wide as a note's in Gems' grid, with the same room between. */
const TILE = 184
const GAP = 12

const readMedia = (): Promise<Media[]> => call<Media[]>('media:list')

/** Any kind asked for, as one of the shelves or every kind: a GIF or an image is a picture, a word it does not know is everything, never an empty page. */
const asShelf = (kind: string | null | undefined): 'all' | Shelf => kind === 'gif' || kind === 'image' ? 'picture' : SHELVES.find((one) => one.id === kind)?.id ?? 'all'
let nextKind: 'all' | Shelf | null = null
const takeKind = (): 'all' | Shelf | null => ((kind) => ((nextKind = null), kind))(nextKind)
/** Media, opened (or already open) on one kind. */
export function showMediaKind(kind: MediaKind | string): void {
  nextKind = asShelf(kind)
  window.dispatchEvent(new CustomEvent('haligtree:media-kind', { detail: nextKind }))
}

const keyOf = (one: Media): string => `${one.deck ? 'deck:' : ''}${one.src}`

/** A file's name without its ending, as a person says it. */
const bare = (name: string): string => name.replace(/\.[^.]+$/, '') || name

/**
 * "Add": a box in the page, as "Cards from a picture" has one: the Mac's picker for one file or many, or drop them on
 * it, or paste with ⌘V. Whatever comes in is shown at once, and the box closes; Esc or "Add" again closes it.
 */
function AddBox({ onShow, onClose }: { onShow: (src: string) => void; onClose: () => void }): React.JSX.Element {
  const done = (src: string): void => (onShow(src), onClose())
  useEffect(() => {
    const paste = (event: ClipboardEvent): void => {
      const files = [...(event.clipboardData?.files ?? [])]
      if (!files.length) return
      event.preventDefault()
      void addDropped(files, done)
    }
    const key = (event: KeyboardEvent): void => void (event.key === 'Escape' && (event.preventDefault(), event.stopPropagation(), chime('fold'), onClose()))
    window.addEventListener('paste', paste)
    window.addEventListener('keydown', key, true)
    return () => (window.removeEventListener('paste', paste), window.removeEventListener('keydown', key, true))
  }) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div data-media-add-box
      onDragOver={(event) => event.dataTransfer.types.includes('Files') && event.preventDefault()}
      onDrop={(event) => { if (!event.dataTransfer.files.length) return; event.preventDefault(); event.stopPropagation(); void addDropped([...event.dataTransfer.files], done) }}
      className="mx-5 mt-4 mb-2 grid gap-1.5 rounded-[6px] border border-dashed border-foreground/20 px-4 py-4">
      <span className="flex flex-wrap items-center gap-3 text-control text-foreground/80">
        <Button size="sm" className="h-8 cursor-pointer gap-1.5 px-3" data-media-choose onClick={() => void addFromPicker(done)}><Plus className="size-4" />Choose files…</Button>
        <span>or drop them on this box, or paste with <Kbd>⌘V</Kbd></span>
      </span>
      <span className="text-xs text-muted-foreground">Pictures, GIFs, PDFs and audio. Pick as many as you like.</span>
    </div>
  )
}

/**
 * Every picture, screenshot, GIF, PDF and recording in the book, one tile a
 * file, newest first: what its notes hold, and what was added here with no
 * note. A tile says where it is used, each a way to that note; clicked, the
 * newest note opens on it (⌥-click: to the side), or, used nowhere, the file
 * itself opens. It picks and goes to the Bin as every list's rows do.
 */
export function MediaView({ onOpen }: { onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const all = useLive(readMedia, [] as Media[])
  const [query, setQuery] = useState('')
  // Opened on a kind ("Show all" under Continue reading opens it on the PDFs), or the one its step holds (Back, Forward, ⌘K on a file), else every kind.
  const nav = useNav()
  const stepKind = (): Shelf | undefined => (nav?.here.id === 'media' ? SHELVES.find((one) => one.id === nav.here.tab)?.id : undefined)
  const [kind, setKind] = useState<'all' | Shelf>(() => takeKind() ?? stepKind() ?? 'all')
  useEffect(() => {
    const on = (event: Event): void => setKind(asShelf((event as CustomEvent<string>).detail))
    window.addEventListener('haligtree:media-kind', on)
    return () => window.removeEventListener('haligtree:media-kind', on)
  }, [])
  useStepped(kind, (held: string) => setKind(asShelf(held)))
  // "Unlinked": attachments the last note let go of, newest let go first; a filter on whatever kind is open.
  const [unlinkedOnly, setUnlinkedOnly] = useState(takeUnlinked)
  useEffect(() => {
    const on = (): void => (takeUnlinked(), setUnlinkedOnly(true), setQuery(''))
    window.addEventListener('haligtree:media-unlinked', on)
    return () => window.removeEventListener('haligtree:media-unlinked', on)
  }, [])
  // A shared deck's pictures (hundreds of paintings) wait under their own chip, so the book's own stay in view.
  const [decks, setDecks] = useState(false)
  const anyDeck = all.some((one) => one.deck)
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const found = all.filter((one) => !!one.deck === decks && (kind === 'all' || shelfOf(one) === kind) && (!unlinkedOnly || isUnlinked(one)) &&
      words.every((word) => `${one.title} ${one.name} ${one.near}`.toLowerCase().includes(word)))
    // On Unlinked, by the day each was let go, newest first, and in a day pictures, recordings, books, as they are drawn.
    if (unlinkedOnly) return unlinkedOrder(found)
    // Newest first, so a month's or a day's files sit together under its heading.
    return found.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
  }, [all, query, kind, decks, unlinkedOnly])
  const unlinkedCount = useMemo(() => all.filter(isUnlinked).length, [all])
  // "All" shows a pile per kind and the Recent row; a search there lists what it found, any kind, as tiles.
  const piles = kind === 'all' && !query.trim() && !unlinkedOnly
  // Unlinked draws each kind as that kind's own view does, by the day it was let go (Books keeps its own shelf).
  const mixed = unlinkedOnly && kind !== 'pdf'

  // How many tiles fit across, worked out from the grid's own width.
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    setWidth(element.clientWidth)
    const watch = new ResizeObserver(() => setWidth(element.clientWidth))
    watch.observe(element)
    return () => watch.disconnect()
  }, [all.length > 0, kind])
  const booksAcross = Math.max(1, Math.floor((width + BOOK_GAP) / (BOOK + BOOK_GAP)))
  const across = kind === 'picture' || mixed ? Math.max(3, Math.floor((width + PICTURE_GAP) / (PICTURE + PICTURE_GAP))) : kind === 'audio' ? 1 : Math.max(1, Math.floor((width + GAP) / (TILE + GAP)))
  const lines = useMemo(() => {
    const out: { key: string; tiles: Media[] }[] = []
    for (let at = 0; at < shown.length; at += across) out.push({ key: keyOf(shown[at]), tiles: shown.slice(at, at + across) })
    return out
  }, [shown, across])

  const open = (one: Media): void => {
    if (one.uses.length) {
      onOpen(one.type, one.id)
      headingIn(one.type, one.id, one.src)
    } else openFile(one)
  }

  const [putting, setPutting] = useState<Media[] | null>(null)
  // Picking, as every list has it: click, ⌘-click, ⇧-click, ⌘A, ⌫, Esc, and the keys across the grid.
  const here = useHere()
  const library = all.length > 0 && kind === 'pdf'
  const order = useMemo(() => shown.map(keyOf), [shown])
  const [chosenAll, setChosen] = useState<string[]>([])
  const chosen = useMemo(() => chosenAll.filter((key) => order.includes(key)), [chosenAll, order])
  const srcOf = (key: string): string => key.replace(/^deck:/, '')
  const toBin = (keys: string[]): void => void binFiles(keys.map(srcOf), () => setChosen([]))
  const picking = usePicking(order, chosen, setChosen)
  // Pictures go by month, and a month's last line is often short: ↑ and ↓ go line to line, over the month's heading.
  const spans = useMemo(() => (mixed ? unlinkedSpans(shown, across, booksAcross) : kind === 'picture' ? pictureSpans(shown, across) : null), [mixed, kind, shown, across, booksAcross])
  const [cursor, setCursor] = useListKeys(shown.length, { across, upDown: spans ? (at, by) => stepLine(spans, at, by) : undefined, enabled: !library && !piles && !putting, onOpen: (at) => shown[at] && open(shown[at]), onExtend: (from, to) => shown[to] && picking.extend(shown[from] && keyOf(shown[from]), keyOf(shown[to])) })
  useSelectAll(() => order, chosen, setChosen, { enabled: !library && !piles && !putting, here, onDelete: toBin, current: () => (shown[cursor] ? keyOf(shown[cursor]) : null), titleOf: (key) => { const one = all.find((each) => keyOf(each) === key); return one ? bare(one.name || one.title) : undefined } })
  const clear = (): void => setChosen([])
  // Esc lets the picked ones go, before it does anything else.
  const pickedNow = useRef(0)
  pickedNow.current = chosen.length
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !pickedNow.current || !here() || typing() || menuOpen() || event.defaultPrevented) return
      event.preventDefault()
      event.stopPropagation()
      chime('off')
      setChosen([])
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [here])

  // A file asked for by name (⌘K), just added, or already here when added again: the keys on that tile, in view, whatever was narrowing the page.
  const [showing, setShowing] = useState<string | null>(takeMediaFile)
  useEffect(() => {
    const on = (event: Event): void => setShowing((event as CustomEvent<string>).detail)
    window.addEventListener('haligtree:media-file', on)
    return () => window.removeEventListener('haligtree:media-file', on)
  }, [])
  useEffect(() => {
    if (!showing || !all.some((one) => one.src === showing)) return
    const one = all.find((each) => each.src === showing)!
    // On its own kind, where it is drawn as a tile (All draws piles): Pictures, Audio or Books.
    const want = shelfOf(one)
    if (kind !== want || !shown.includes(one)) {
      setQuery('')
      setUnlinkedOnly(false)
      setDecks(!!one.deck)
      // The kind only through the step (useStepped follows it), never set here too: the two fought on a remount (React #185).
      if (kind !== want && nav?.here.tab !== want) nav ? nav.step({ tab: want }) : setKind(want)
      return
    }
    setShowing(null)
    takeMediaFile()
    setCursor(shown.indexOf(one))
  }, [showing, all, shown, kind, setCursor]) // eslint-disable-line react-hooks/exhaustive-deps

  // "Put in a note…": the picker over the page, for one file or everything picked. While it is up, the page's keys are its own.
  const pickedFiles = shown.filter((one) => chosen.includes(keyOf(one)))
  /** The right-click on a tile: for what is picked when it is among them, else for it alone. */
  const menuFor = (one: Media): RowItem[] => {
    const several = chosen.includes(keyOf(one)) && chosen.length > 1
    if (!several) return mediaMenu(one, () => open(one), () => setPutting([one]), () => toBin([keyOf(one)]))
    const free = pickedFiles.filter((each) => !each.uses.length).length
    return [
      { label: `Put ${num(chosen.length)} in a note…`, run: () => setPutting(pickedFiles) },
      'separator',
      free > 0 && { label: `Move ${num(free)} to the Bin`, keys: '⌫', danger: true, run: () => toBin(chosen) },
      'separator',
      { label: 'Clear the selection', about: 'list', keys: 'esc', run: clear }
    ]
  }
  // Clicked as Finder has it: ⌘ and ⇧ pick; plain opens.
  const clickTile = (one: Media, event: React.MouseEvent): void => {
    setCursor(shown.indexOf(one))
    if (picking.click(event, keyOf(one))) return
    if (event.altKey && !one.uses.length) return openFile(one, true)
    openFrom(one, event)
  }
  // A book, or a note holding the file, grows out of its tile (lib/hero.ts); a picture lifts into its own viewer, and a recording plays where it is.
  const openFrom = (one: Media, event: React.MouseEvent): void => (one.kind === 'pdf' || one.uses.length ? heroOpen(event, () => open(one)) : open(one))

  // Files carried over the page: the whole page takes them.
  const [carrying, setCarrying] = useState(false)
  const carriesFiles = (event: React.DragEvent): boolean => event.dataTransfer.types.includes('Files')
  const onShow = (src: string): void => setShowing(src)
  // The "Add" box, open in the page.
  const [adding, setAdding] = useState(false)

  // The tabs: All, then each shelf the book holds (a tab for something you have none of leads to nothing; one asked for by name still shows, to say so).
  const held = SHELVES.filter((one) => one.id === kind || all.some((item) => shelfOf(item) === one.id && !item.deck))
  const kinds = held.length + (anyDeck ? 1 : 0) + (unlinkedCount || unlinkedOnly ? 1 : 0) < 2 ? <div className="pt-4" /> : (
    <div data-media-kinds className="flex flex-wrap gap-1 pt-4 pb-3 text-xs">
      {/* "All" is lit only when nothing narrows the view: on Unlinked, "All" and "Unlinked" lit together read as two choices at once. */}
      <Chip on={kind === 'all' && !unlinkedOnly} onClick={() => (kind !== 'all' || unlinkedOnly) && (chime('tap'), setKind('all'), setUnlinkedOnly(false))} mark={<LayoutGrid className="size-3.5" />}>All</Chip>
      {held.map((one) => {
        const Icon = ICONS[one.id]
        return <Chip key={one.id} on={kind === one.id} onClick={() => kind !== one.id && (chime('tap'), setKind(one.id))} mark={<Icon className="size-3.5" />}>{one.label}</Chip>
      })}
      {anyDeck && (
        <span data-media-decks="" className="contents"><Chip on={decks} onClick={() => (chime(decks ? 'off' : 'on'), setDecks(!decks))} mark={<Layers className="size-3.5" />}>Deck pictures</Chip></span>
      )}
      {/* Attachments no note holds any more, with how many: a filter beside the kinds, shown once there is one. */}
      {(unlinkedCount > 0 || unlinkedOnly) && (
        <span data-media-unlinked="" className="contents"><Chip on={unlinkedOnly} onClick={() => (chime(unlinkedOnly ? 'off' : 'on'), setUnlinkedOnly(!unlinkedOnly))} mark={<Unlink className="size-3.5" />}>Unlinked <span className="tabular-nums text-foreground/80">{num(unlinkedCount)}</span></Chip></span>
      )}
      {/* What acts on the view sits at the end of the row, on its own: only on Unlinked, and only with something to move. */}
      {unlinkedOnly && unlinkedCount > 0 && (
        <Button variant="ghost" size="sm" data-media-bin-unlinked className="ml-auto h-7 cursor-pointer px-2.5 text-xs text-muted-foreground hover:text-foreground" onClick={() => void binUnlinked()}>Move all to the Bin</Button>
      )}
    </div>
  )
  // The last few added or opened, any kind: a book counts from when it was last read.
  const books = useLive(readLibrary, [] as Book[])
  const recent = useMemo(() => {
    if (!piles) return []
    const readAt = new Map(books.map((one) => [one.src, one.readAt ?? '']))
    const when = (one: Media): string => ((readAt.get(one.src) ?? '') > one.at ? readAt.get(one.src)! : one.at) ?? ''
    return [...shown].sort((a, b) => when(b).localeCompare(when(a))).slice(0, RECENT)
  }, [piles, shown, books])
  const pileList = useMemo(() => SHELVES.map((shelf) => ({ shelf, files: shown.filter((one) => shelfOf(one) === shelf.id) })).filter((one) => one.files.length), [shown])
  // What is true when nothing shows: said for the kind that is open.
  const shelf = SHELVES.find((one) => one.id === kind)
  const nothing = query.trim() ? <>Nothing here has {quoted(query.trim(), 80)} in its note, its name or the words around it.</>
    : unlinkedOnly ? <>Nothing unlinked{kind === 'all' ? '' : ` among the ${shelf?.many ?? 'files'}`}. A picture or file pasted into a note shows here once no note holds it, until you move it to the Bin.</>
    : <>No {shelf?.many ?? 'files'} here yet.</>
  return (
    // The page as a whole takes a drop: `contents`, so nothing about how it is laid out changes.
    <div className="contents" data-media-page
      onDragEnter={(event) => carriesFiles(event) && (event.preventDefault(), setCarrying(true))}
      onDragOver={(event) => carriesFiles(event) && (event.preventDefault(), (event.dataTransfer.dropEffect = 'copy'))}
      onDragLeave={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && setCarrying(false)}
      onDrop={(event) => {
        if (!carriesFiles(event)) return
        event.preventDefault()
        event.stopPropagation()
        setCarrying(false)
        void addDropped([...event.dataTransfer.files], onShow)
      }}>
    <Page title="Files" dock={library} waiting={unloaded(all)} count={unloaded(all) || !all.length ? undefined : chosen.length || shown.length} unit={chosen.length ? ['selected', 'selected'] : shelf ? [shelf.one, shelf.many] : ['file', 'files']}
      search={all.length > 0 && <div className="flex min-w-0 items-center gap-3"><ListSearch value={query} placeholder="Find by note, name or words" onChange={setQuery} onDone={() => shown[0] && open(shown[0])} /></div>}
      beside={() => carrying && (
        <div data-media-drop className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--tt-brand-color-500)_55%,transparent)] bg-[color-mix(in_srgb,var(--tt-brand-color-500)_8%,transparent)]">
          <span className="rounded-lg bg-popover px-3 py-2 text-heading font-semibold text-foreground shadow-(--mf-panel-shadow) ring-1 ring-foreground/10">Drop to add to Files</span>
        </div>
      )}
      // Only "Add" on the line, picked or not, so nothing on it moves: what acts on the picked is in their right-click and keys.
      actions={<Button variant="outline" size="sm" className="h-7 cursor-pointer px-3" data-media-add aria-pressed={adding} onClick={() => (chime(adding ? 'fold' : 'open'), setAdding(!adding))}><Plus className="size-3.5" />Add</Button>}>
      {adding && <AddBox onShow={onShow} onClose={() => setAdding(false)} />}
      {library ? (
        // PDFs as a library: a shelf of covers, each book once, the picked one's panel docked at the page's edge.
        <PdfLibrary query={query} top={kinds} files={all} only={unlinkedOnly ? shown.map((one) => one.src) : undefined} keys={!putting} onPut={(srcs) => setPutting(all.filter((one) => srcs.includes(one.src)))} />
      ) : all.length ? (
        <div ref={box} data-media-grid data-media-shelf={piles ? 'all' : kind} className={`mx-5 mb-4 ${mixed ? 'files-unlinked' : kind === 'audio' ? 'files-audio-list' : ''}`}>
          {kinds}
          {!shown.length ? (
            <p data-media-nothing className="my-4 text-control text-muted-foreground">{nothing}</p>
          ) : piles ? (
            <div className="flex flex-col gap-8 pt-2 pb-6">
              <div data-files-piles className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-x-6 gap-y-8">
                {pileList.map((one) => <Pile key={one.shelf.id} shelf={one.shelf} files={one.files} onOpen={() => setKind(one.shelf.id)} />)}
              </div>
              <RecentRow files={recent} onOpen={openFrom} menuFor={menuFor} />
            </div>
          ) : mixed ? (
            <UnlinkedDays files={shown} across={across} books={booksAcross} cursor={cursor} chosen={chosen} keyOf={keyOf} menuFor={menuFor} onClick={clickTile} onUse={(use, src) => openUse(use, src, onOpen)} />
          ) : kind === 'picture' ? (
            <PictureMonths files={shown} across={across} cursor={cursor} chosen={chosen} keyOf={keyOf} menuFor={menuFor} onClick={clickTile} />
          ) : kind === 'audio' ? (
            <AudioDays files={shown} cursor={cursor} chosen={chosen} keyOf={keyOf} menuFor={menuFor} onClick={clickTile} onUse={(use, src) => openUse(use, src, onOpen)} />
          ) : (
            <VirtualList items={lines} keyOf={(line) => line.key} holds={(line, key) => line.tiles.some((one) => keyOf(one) === key)} cursor={cursor >= 0 ? Math.floor(cursor / across) : undefined} estimate={TILE * 0.75 + 52 + GAP} rowClass="">
              {(line, row) => (
                <div className="grid" style={{ gridTemplateColumns: `repeat(${across}, minmax(0, 1fr))`, gap: GAP, paddingBottom: GAP }}>
                  {line.tiles.map((one, at) => <Tile key={keyOf(one)} one={one} at={row * across + at === cursor} picked={chosen.includes(keyOf(one))} menu={menuFor(one)} onClick={(event) => clickTile(one, event)} onUse={(use) => openUse(use, one.src, onOpen)} />)}
                </div>
              )}
            </VirtualList>
          )}
        </div>
      ) : unloaded(all) ? null : (
        <Empty title="No pictures or files yet" action={<Button size="sm" className="h-8 cursor-pointer px-3" data-media-add-empty onClick={() => (chime('open'), setAdding(true))}><Plus className="size-3.5" />Add</Button>}>
          Press “Add”, or drop pictures, GIFs, PDFs and audio anywhere on this page. Paste or drop one into a note and it shows up here too.
        </Empty>
      )}
    </Page>
    {putting && createPortal(
      <Search menus={false} placeholder={putting.length === 1 ? `Put ${quoted(bare(putting[0].name || putting[0].title), 80)} in which note?` : `Put ${num(putting.length)} files in which note?`}
        onClose={() => setPutting(null)}
        onOpen={(type, id) => {
          const files = putting
          setPutting(null)
          setChosen([])
          void noteTitle(type, id).then((title) => putInNote(files, type, id, title))
        }} />,
      document.body
    )}
    </div>
  )
}

/** Its name, to say where a file went. */
async function noteTitle(type: string, id: string): Promise<string> {
  if (type === 'day') return dayName(id)
  if (type === 'capture') return (await window.api.captures.get(id))?.label ?? ''
  return (await haligtree.item(id))?.title ?? ''
}

/** A file used by no note, opened as itself: a picture in the app's viewer, a PDF in the reader, a recording played where it sits. */
function openFile(one: Media, aside = false): void {
  if (one.gone) return refuse(`${one.name || 'That file'} is gone from the book's files. Add it again to bring it back`)
  chime('open')
  if (one.kind === 'pdf') return void openPdf(one.src, one.name, undefined, undefined, aside)
  const tile = document.querySelector(`[data-media][data-src="${CSS.escape(one.src)}"]`)
  if (one.kind === 'audio') return void tile?.querySelector<HTMLElement>('[data-sound-play]')?.click()
  void openLook(one.src, tile?.querySelector('img') ?? tile, bare(one.name))
}

/** One way to a note that holds a file: opened on it. */
function openUse(use: MediaUse, src: string, onOpen: (type: string, id: string) => void): void {
  chime('open')
  onOpen(use.type, use.id)
  headingIn(use.type, use.id, src)
}

/** An attachment no note holds any more: Unlinked, in Files' own words. */
const isUnlinked = (one: Media): boolean => !one.deck && !one.uses.length && one.how === 'attachment'

/** What a file's tile says it is, in place of a picture. */
const WORD: Record<MediaKind, string> = { picture: 'Picture', gif: 'GIF', pdf: 'PDF', audio: 'Recording' }

/** A picture's or a file's right-click menu, on its tile and in the "Recent pictures" row. */
export function mediaMenu(one: Media, onOpen: () => void, onPut: () => void, onBin: () => void): RowItem[] {
  const picture = one.kind === 'picture' || one.kind === 'gif'
  const used = one.uses.length > 0
  return [
    used
      ? { label: 'Open note', keys: '↵', run: onOpen }
      : { label: picture ? 'Look at it' : one.kind === 'pdf' ? 'Open in the reader' : 'Play it', keys: '↵', run: onOpen },
    used && canSplit() && { label: 'Open to the side', keys: '⌥-click', run: () => (openAside(one.type, one.id), headingIn(one.type, one.id, one.src)) },
    !used && one.kind === 'pdf' && canSplit() && { label: 'Open to the side', keys: '⌥-click', run: () => openFile(one, true) },
    one.uses.length > 1 && { label: 'Used in', items: one.uses.map((use) => ({ label: use.title || 'New note', icon: <FileText className="size-3.5" />, run: () => (window.api.openInHome(use.type, use.id), headingIn(use.type, use.id, one.src)) })) },
    { label: 'Put in a note…', run: onPut },
    'separator',
    { label: 'Copy link', hint: 'Paste it into any note to show it there too', run: () => void copyMedia(one) },
    picture && { label: 'Copy image', run: () => void window.api.copyImage(one.src).then((done) => (done ? (chime('copy'), toast('Copied the picture')) : refuse('Could not copy it', 'error'))) },
    // Its words' lines under one, as on a picture in a note.
    picture && pictureLines(one.src).length > 0 && { label: 'Text in it', items: pictureLines(one.src) },
    { label: 'Show in Finder', run: () => void window.api.showFile(one.src) },
    'separator',
    // On, it stays in Files when no note holds it; off, the last note to let it go leaves it under Unlinked.
    !one.gone && { label: 'Keep in Files', hint: one.how === 'library' ? 'On: stays here without a note' : 'Off: waits under Unlinked without a note', trail: one.how === 'library' ? <Check className="size-3.5" /> : undefined, run: () => void keepInFiles(one.src, one.how !== 'library') },
    // What a note holds stays with that note: only a file used nowhere goes.
    !used && { label: 'Move to the Bin', keys: '⌫', danger: true, run: onBin }
  ]
}

function Tile({ one, at, picked, menu, onClick, onUse }: { one: Media; at: boolean; picked: boolean; menu: RowItem[]; onClick: (event: React.MouseEvent) => void; onUse: (use: MediaUse) => void }): React.JSX.Element {
  // A PDF is named by the title it carries, as the reader names it, and shows its first page.
  const cover = usePdfCover(one.kind === 'pdf' && !one.gone ? one.src : null, one.name)
  // A recording by its name without ".wav", as its player names it.
  const label = cover?.title || (one.kind === 'audio' && one.name ? soundTitle(one.name, null) : one.name ? bare(one.name) : one.title) || (one.uses.length ? 'Untitled' : WORD[one.kind])
  const audio = one.kind === 'audio'
  const Press = (audio ? 'div' : 'button') as React.ElementType
  return (
    <RowMenu items={menu}>
      <div data-cursor={at || undefined} data-picked={picked || undefined} data-id={one.src} className={tileClass(at, false, picked)}>
        {/* A recording's face holds its player's own buttons, and a button cannot hold a button. */}
        <Press data-media={one.kind} data-src={one.src} data-note={one.uses.length ? `${one.type}:${one.id}` : undefined} data-pdf-peek={one.kind === 'pdf' && !one.gone ? one.src : undefined} data-pdf-peek-name={one.kind === 'pdf' ? one.name : undefined} onClick={onClick} {...(audio ? { role: 'button', tabIndex: 0, onKeyDown: (event: React.KeyboardEvent) => event.key === 'Enter' && event.target === event.currentTarget && onClick(event as unknown as React.MouseEvent) } : { type: 'button' })} className="flex min-w-0 cursor-pointer flex-col text-left">
          <Face one={one} cover={one.kind === 'pdf' ? (cover === undefined ? undefined : cover?.image ?? '') : undefined} />
          <span dir="auto" data-media-name className={`truncate px-2.5 pt-2 text-sm font-medium ${one.private ? 'private-text' : ''}`}>{label}</span>
        </Press>
        <Where one={one} label={label} onUse={onUse} />
      </div>
    </RowMenu>
  )
}

/**
 * Where a file is used, under its name: each note a way there. Used nowhere, it
 * says so. A tile named after its one note (a picture with no name of its own)
 * already says where, so it does not say it twice.
 */
function Where({ one, label, onUse }: { one: Media; label: string; onUse: (use: MediaUse) => void }): React.JSX.Element {
  const line = 'flex min-w-0 items-baseline gap-1 px-2.5 pt-0.5 pb-2.5 text-xs text-muted-foreground'
  if (one.gone) return <span data-media-where="gone" className={`${line} text-foreground`}>File gone from the book</span>
  if (!one.uses.length && one.how === 'attachment' && one.letGoAt) return <span data-media-where="unlinked" className={line}>Unlinked {letGoWhen(one.letGoAt)}</span>
  if (!one.uses.length) return <span data-media-where="none" className={line}>{one.added ? 'In no note yet' : 'In no note'}</span>
  const others = label === one.uses[0].title ? one.uses.slice(1) : one.uses
  if (!others.length) return <span data-media-where="own" className={line}>{WORD[one.kind]}</span>
  const way = 'cursor-pointer underline decoration-foreground/25 underline-offset-2 hover:text-foreground hover:decoration-foreground'
  return (
    <span data-media-where="used" className={line}>
      <span className="shrink-0">{others.length < one.uses.length ? 'Also in' : 'In'}</span>
      <button type="button" data-media-use className={`min-w-0 truncate ${way} ${others[0].private ? 'private-text' : ''}`} onClick={() => onUse(others[0])}>{others[0].title || 'New note'}</button>
      {others.length > 1 && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild><button type="button" data-media-more-uses className={`shrink-0 tabular-nums ${way}`}>+{num(others.length - 1)}</button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
            {others.slice(1).map((use) => <DropdownMenuItem key={`${use.type}:${use.id}`} onSelect={() => onUse(use)}><MenuGlyph label="Open note" small /><span className={`truncate ${use.private ? 'private-text' : ''}`}>{use.title || 'New note'}</span></DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </span>
  )
}

/** The tile's top: the picture made small, a PDF's first page, or a clean card for a file with none. */
function Face({ one, cover }: { one: Media; cover?: string }): React.JSX.Element {
  const [thumb, setSmall] = useState<string | null>(null)
  // A PDF's face is its cover, drawn by the reader's own renderer (Quick Look often draws none).
  const small = one.kind === 'pdf' ? cover ?? null : thumb
  const [moving, setMoving] = useState(false)
  const rest = useRef(0)
  useEffect(() => () => clearTimeout(rest.current), [])
  // Asked for only once the tile is drawn: a row of the grid out of sight never asks.
  useEffect(() => {
    if (one.kind === 'audio' || one.kind === 'pdf' || one.gone) return
    let live = true
    void smallPicture(one.src, true).then((made) => live && setSmall(made || ''))
    return () => void (live = false)
  }, [one.src, one.kind, one.gone])
  const frame = `relative aspect-[4/3] w-full overflow-hidden bg-accent ${one.private ? 'private-text' : ''}`
  if (one.gone) return <span className={`${frame} flex flex-col items-center justify-center gap-1.5 px-3 text-muted-foreground`}><FileText className="size-7" /><span className="text-xs font-medium text-foreground">{WORD[one.kind]}</span></span>
  if (one.kind === 'audio') return <span className={frame}><AudioFace one={one} /></span>
  if (small)
    return (
      // A GIF stands still until rested on (the same grace as a book's cover), then moves: a page of them never runs at once, and a sweep across sets none off.
      // A PDF's cover turns into its pages in place when rested on and slid across (pdf-peek.tsx).
      // A PDF's cover is a page: drawn on the same paper as the pages scrubbed over it (pdf.css), so the two never read as two looks.
      <span className={one.kind === 'pdf' ? `${frame.replace(' bg-accent', '')} pdf-face-cover` : frame} data-pdf-peek-scrub={one.kind === 'pdf' ? '' : undefined} onPointerEnter={() => one.kind === 'gif' && (clearTimeout(rest.current), (rest.current = window.setTimeout(() => setMoving(true), GRACE)))} onPointerLeave={() => (clearTimeout(rest.current), setMoving(false))}>
        <img src={moving ? one.src : small} alt="" draggable={false} decoding="async" className={`size-full ${one.kind === 'pdf' ? 'object-contain' : 'object-cover'} animate-in fade-in-0 duration-200`} />
        {one.kind !== 'picture' && <span className="absolute bottom-1.5 left-1.5 rounded bg-background px-1.5 py-px text-xs font-medium">{WORD[one.kind]}</span>}
      </span>
    )
  return (
    <span className={`${frame} flex flex-col items-center justify-center gap-1.5 px-3 text-muted-foreground`}>
      {small === '' && (
        <>
          <FileText className="size-7" />
          <span className="text-xs font-medium text-foreground">{WORD[one.kind]}</span>
        </>
      )}
    </span>
  )
}

/** A recording: plays where it sits, without opening its note, in the one sound player every recording wears. */
function AudioFace({ one }: { one: Media }): React.JSX.Element {
  return (
    // Played where it sits: a press anywhere on it is the player's, never the tile's (which opens the note).
    <span className="flex size-full items-center px-4" onClick={(event) => event.stopPropagation()}>
      <SoundPlayer src={one.src} className="w-full" />
    </span>
  )
}

/**
 * "Copy link": the picture or file itself, as copying it out of its note puts
 * it on the clipboard, so pasted into another note it shows there too. The
 * store keeps one copy of the file, which both notes point at.
 */
async function copyMedia(one: Media): Promise<void> {
  const quote = (text: string): string => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  const picture = one.kind === 'picture' || one.kind === 'gif'
  const html = picture
    ? `<img src="${quote(one.src)}">`
    : `<a data-attachment="" data-name="${quote(one.name)}" data-size="${one.size}" href="${quote(one.src)}">${quote(one.name)}</a>`
  const text = picture ? `![](${one.src})` : `[${one.name}](${one.src})`
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })])
    chime('copy')
    toast(picture ? 'Copied: paste it into any note to show the picture there' : 'Copied: paste it into any note to show the file there')
  } catch {
    refuse('Could not copy it', 'error')
  }
}
