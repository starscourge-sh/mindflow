import { useEffect, useState } from 'react'
import { ArrowRight, CalendarDays, Check, ChevronRight, CircleCheck, FileText, HelpCircle, MoreHorizontal, Plus, StickyNote } from 'lucide-react'
import { Gem } from '@/components/ui/icons'
import { openItems } from '@/lib/split'
import { Branches } from './branches'
import { NameInPlace } from './name-in-place'
import { GroupIcon, IconChoice } from './kept-groups'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Unfold, Weighted } from './glide'
import { useFold, useTreeFolds } from '@/lib/side-folds'
import { RowMenu, copyLinkItem, openFromGrip, type RowItem } from './row-menu'
import { Count, Tip, quietly, refuse, sayNow, toast, typing } from './ui'
import { SortableList, SortableRow } from './sortable'
import { age, num } from '../../../../main/dates'
import { haligtree, useLive } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { FOLDER_DEPTH, askFolder, askFolderFor, folders, writeFrom, heldIn, keepIn, pathOf, useFolders, type Folder, type FolderItem, type FolderKind } from '@/lib/folders'
import { calendarInk, calendarsNow, events, type Calendar } from '@/lib/events'

/** Starred folders shown before the rest fold behind "Show all". */
const SHOWN = 12

/** Where the sidebar sends a press: a folder's page, "Not in a folder", or every folder (null). */
export type FolderPlace = string | 'unfiled' | null

/** Asks the Folders section for a new folder (in `parent`), named in place as Finder names one. */
export const newFolderHere = (parent: string | null = null): void => void window.dispatchEvent(new CustomEvent('haligtree:folders-new', { detail: { parent } }))

/** What one folder holds, its folders' too, every kind, in sight. */
export const deepCount = (all: Folder[], id: string): number =>
  all.reduce((sum, one) => sum + (one.id === id ? heldIn(one) : one.parent === id ? deepCount(all, one.id) : 0), 0)

/**
 * The sidebar's Folders, under its places, as Tags keeps your favourite tags: only the folders you starred (and the
 * one you are in, while you are there), each with the folders right inside it hung under it, so "Imports" shows one
 * line per import, not every source's whole tree. Then "Not in a folder N", the pages and gems with no folder, and
 every folder's page from the heading (its arrow, its right-click). A row takes anything dropped on it (split-drop.tsx `keepDrop`).
 */
export function FoldersSection({ here, counted, onOpen, onOpenItem, lit: litItem, style, noteIn, noteRow, noteKey }: { here: FolderPlace | undefined; counted: boolean; onOpen: (place: FolderPlace) => void
  /** A page, note, gem or task in a folder unfolded here: opened in that folder (`folder`), so ↓↑ step through what it
   *  holds, as a press on its row in the folder's own list does; a new page made inside one (no folder) as anywhere. */
  onOpenItem: (type: string, id: string, folder?: string) => void
  /** The thing open now, lit where it shows under its folder. */
  lit?: string
  style?: React.CSSProperties
  /** The folder the note in front lives in, with its one lit row to hang under that folder, and which note it is. */
  noteIn?: string; noteRow?: React.ReactNode; noteKey?: string }): React.JSX.Element {
  const all = useFolders()
  // Its fold and its tree's, in the sidebar's one store, so the button beside the search folds them too (lib/side-folds.ts).
  const [open, setOpen] = useFold('sidebar:folders')
  const fold = (next: boolean): void => (chime(next ? 'slide' : 'fold'), setOpen(next))
  // Folded by hand, it stays folded until focus next comes to something in a folder: then it opens on it, as Writing's did.
  useEffect(() => void (noteKey && noteIn && setOpen(true)), [noteKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const [naming, setNaming] = useState<string | null>(null)
  // Folders unfolded in the tree, Notion's way: what each holds hangs under it. Kept across launches.
  const [unfolded, setUnfolded] = useTreeFolds()
  const foldOne = (id: string): void => {
    const next = new Set(unfolded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    chime(next.has(id) ? 'slide' : 'fold')
    setUnfolded(next)
  }
  useEffect(() => {
    const make = (event: Event): void => {
      const { parent } = (event as CustomEvent<{ parent: string | null }>).detail
      setOpen(true)
      void folders.make('New folder', parent).then((id) => (chime('promote'), setNaming(id), quietly(() => void folders.remove(id))))
    }
    // ⌃⌘N anywhere a list has not taken it for its picked rows (items-view.tsx): a new, empty folder.
    const key = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey && event.metaKey && !event.altKey && !event.shiftKey && event.code === 'KeyN') || typing()) return
      event.preventDefault()
      newFolderHere(null)
    }
    window.addEventListener('haligtree:folders-new', make)
    window.addEventListener('keydown', key)
    return () => (window.removeEventListener('haligtree:folders-new', make), window.removeEventListener('keydown', key))
  }, [])
  const live = all.filter((one) => !one.archived)
  const ids = new Set(live.map((one) => one.id))
  // Starred, and the way down to the one you are in: shown at the top level unless a starred folder above holds it.
  // The way down to the folder you are in, or to the one holding the note in front.
  const at = typeof here === 'string' && here !== 'unfiled' ? here : noteIn
  const path = at ? pathOf(live, at).map((one) => one.id) : []
  const starredAbove = (one: Folder): boolean => pathOf(live, one.parent).some((up) => up.starred)
  const tops = live.filter((one) => (one.starred && !starredAbove(one)) || (one.id === path[0] && !one.starred && !path.slice(0, -1).some((up) => live.find((f) => f.id === up)?.starred)))
  const inside = (id: string): Folder[] => live.filter((one) => one.parent === id)
  const row = (one: Folder, depth: number): React.JSX.Element[] => {
    // Unfolded, a folder shows what it holds: its folders, then its pages and notes (Notion's way). Folded, only the
    // way down to the folder you are in.
    const open = unfolded.has(one.id)
    const kids = open ? inside(one.id) : inside(one.id).filter((kid) => path.includes(kid.id))
    return [
      // One light: a note of its own open under it (noteRow) is the lit one, the folder kept beside it is not lit too.
      <FolderRow key={one.id} folder={one} all={live} here={here === one.id && !(noteRow && noteIn === one.id)} n={counted ? deepCount(live, one.id) : null} naming={naming === one.id} onNamed={() => setNaming(null)} onRename={() => setNaming(one.id)} onOpen={() => onOpen(one.id)}
        open={open} onFold={() => foldOne(one.id)} onAdd={() => void addPageIn(one, onOpenItem)} />,
      // Its own presses (lib/own-press.ts): a page carried from under it is that page, never the folder above it.
      ...(kids.length || open ? [<div key={`${one.id}:in`} data-no-twig="" data-own-press="">
        <Branches className="ml-5 flex flex-col gap-px">
          {kids.flatMap((kid) => row(kid, depth + 1))}
          {open && <FolderThings key={`${one.id}:things`} folder={one} lit={litItem} onOpen={(type, id) => onOpenItem(type, id, one.id)} onAll={() => onOpen(one.id)} />}
        </Branches>
      </div>] : []),
      // The note in front, under the folder it lives in, while the folder is folded: only that one row, lit. Unfolded,
      // the folder's own list shows it, lit there (FolderThings).
      ...(noteRow && one.id === noteIn && !open ? [<div key={`${one.id}:note`} data-no-twig=""><Branches className="ml-5 flex flex-col gap-px">{noteRow}</Branches></div>] : [])
    ]
  }
  // Many starred: the first 12, and the one you are in, the rest a press away, so they never push the sidebar long.
  const [every, setEvery] = useState(false)
  const starred = tops.filter((one) => ids.has(one.id))
  const rows = every || starred.length <= SHOWN ? starred : starred.filter((one, n) => n < SHOWN || one.id === here || path.includes(one.id))
  // F2 renames the folder whose row has the keys, or the one you are in, in place (Finder's way).
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'F2' || event.metaKey || event.ctrlKey || event.altKey) return
      const row = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-side-folder]')
      const id = row?.dataset.sideFolder ?? (!typing() && typeof here === 'string' && here !== 'unfiled' && ids.has(here) ? here : null)
      if (!id) return
      event.preventDefault()
      setNaming(id)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })
  // Carried by its row, the app's one drag (sortable.tsx, as Tags' rows are): by another's edge it goes before or
  // after it, beside it; rested on another's middle it goes inside. Each said with Undo; refusals say why.
  // The list holds a dropped order until the saved one is read back (sortable.tsx `useHeld`); Undo lets go of it
  // there (`useLetGoOnUndo`). A drop refused here changes nothing to read back, so the list starts afresh.
  const [epoch, setEpoch] = useState(0)
  const afresh = (): void => setEpoch((n) => n + 1)
  const place = (id: string, target: string, after: boolean): void => {
    const name = live.find((one) => one.id === id)?.name ?? 'the folder'
    void folders.place(id, target, after).then((was) => {
      if (!was) return (afresh(), refuse('A folder can’t go inside itself'))
      chime('gather')
      toast(`Moved ${name} ${after ? 'after' : 'before'} ${live.find((one) => one.id === target)?.name ?? 'it'}`, () => void folders.arrange(id, was))
    })
  }
  const nest = (id: string, target: string): void => {
    const was = live.find((one) => one.id === id)
    void folders.nest(id, target).then((done) => {
      if (done !== true) return (afresh(), refuse(done))
      chime('gather')
      toast(`Moved ${was?.name ?? 'the folder'} into ${live.find((one) => one.id === target)?.name ?? 'it'}`, () => void folders.nest(id, was?.parent ?? null))
    })
  }
  return (
    <div data-side-section="folders" data-side-folders-section="" style={style} className="flex flex-col">
      <RowMenu items={[{ label: 'New folder', keys: '⌃⌘N', run: () => newFolderHere(null) }, { label: 'All folders…', run: () => onOpen(null) }]}>
        <div className="group/head relative mt-2.5 mb-0.5 flex min-h-6 items-center gap-1 px-2 py-0.5 text-meta">
          {/* Folded with the note in front inside it: the heading holds the light, so there is always one. A page or note
              carried onto it leaves its folder (split-drop.tsx `keepDrop` "none"): Folders lists folders only (63dc63cb7). */}
          <button type="button" data-side-row data-side-section-handle="folders" data-keep-drop="none" aria-expanded={rows.length ? open : undefined} aria-current={!open && noteRow && noteIn ? 'page' : undefined} onClick={() => (rows.length ? fold(!open) : onOpen(null))}
            className={`absolute inset-0 flex items-center gap-1 rounded-md px-2 text-left transition-colors duration-80 group-hover/head:text-foreground ${here === null ? 'text-foreground' : 'text-muted-foreground'}`}>
            Folders
            {/* A fold only with something to fold: with no folder in the sidebar the heading opens every folder. */}
            {rows.length > 0 && <ChevronRight className={`size-3 transition-transform duration-80 ${open ? 'rotate-90' : ''}`} />}
          </button>
          <span aria-hidden className="invisible">Folders</span>
          <span className="relative ml-auto flex items-center gap-0.5 opacity-0 transition-opacity duration-80 group-hover/head:opacity-100 focus-within:opacity-100">
            <Tip label="New folder  ⌃⌘N">
              <button type="button" aria-label="New folder" data-folders-new="" onClick={() => newFolderHere(null)} className="flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
                <Plus className="size-3" />
              </button>
            </Tip>
            <Tip label="All folders">
              <button type="button" aria-label="Open all folders" data-folders-all="" onClick={() => onOpen(null)} className="flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
                <ArrowRight className="size-3" />
              </button>
            </Tip>
          </span>
        </div>
      </RowMenu>
      <Unfold open={open}>
        <Branches rows=":scope > *" className="ml-5 flex flex-col gap-px">
          <SortableList key={epoch} items={rows} keyOf={(one) => one.id} onMove={place} onNest={nest}>{(items) => items.map((one) => (
            <SortableRow key={one.id} id={one.id} glide={`side-folder-${one.id}`}><div className="flex flex-col gap-px">{row(one, 0)}</div></SortableRow>
          ))}</SortableList>
          {starred.length > SHOWN && (
            <button type="button" data-side-row data-folders-more={starred.length} onClick={() => (chime(every ? 'fold' : 'slide'), setEvery(!every))}
              className="flex w-full min-w-0 items-baseline gap-2 rounded-md py-1 pr-2 pl-2 text-muted-foreground hover:text-foreground">
              <span className="size-4 shrink-0" />
              <span className="flex-1 text-left">{every ? 'Show fewer folders' : `Show all ${num(starred.length)} folders`}</span>
            </button>
          )}
        </Branches>
      </Unfold>
    </div>
  )
}

/** One folder's lines in a menu, the same in the sidebar and on the All folders page. */
export function folderMenu(folder: Folder, all: Folder[], onOpen: () => void, onRename: () => void, cals: Calendar[] = calendarsNow()): RowItem[] {
  const level = pathOf(all, folder.id).length
  const tied = cals.filter((one) => one.folder === folder.id)
  // A calendar's event notes kept here, and its events on this folder's page: the calendar's own menu ties it too.
  const tie = (cal: Calendar, to: string | null, said: string): void =>
    void events.setCalendar({ id: cal.id, folder: to }).then((done) => done && (chime('tap'), toast(said, () => void events.setCalendar({ id: cal.id, folder: done.was?.folder ?? null }).then(() => chime('undo')))))
  return [
    // As Notion's: first what it is to you (in the sidebar), then its name and place, then opening it, then the foot.
    { label: folder.starred ? 'Remove from the sidebar' : 'Show in the sidebar', hint: folder.starred ? 'Unstar it' : 'Star it', run: () => (chime(folder.starred ? 'off' : 'on'), sayNow(folders.set(folder.id, { starred: !folder.starred }), folder.starred ? `Took ${folder.name} off the sidebar` : `Starred ${folder.name}`, () => void folders.set(folder.id, { starred: !!folder.starred }))) },
    'separator',
    copyLinkItem(`folder:${folder.id}`, folder.name),
    { label: 'Rename…', run: onRename },
    // Into another folder, found in the one folder picker (folder-picker.tsx), as things are kept in one.
    { label: 'Move to…', run: () => askFolderFor(folder) },
    // A page in Writing with the folder's gems and highlights beside it; the folder stays a folder.
    { label: 'Write from this folder', run: () => void writeFrom(folder) },
    level < FOLDER_DEPTH && { label: 'New folder inside', run: () => newFolderHere(folder.id) },
    folder.parent ? { label: 'Move to the top', run: () => void folders.nest(folder.id, null).then(() => (chime('gather'), toast(`Moved ${folder.name} to the top`, () => void folders.nest(folder.id, folder.parent)))) } : null,
    { label: folder.archived ? 'Unarchive folder' : 'Archive folder', hint: folder.archived ? undefined : 'Kept, out of sight', run: () => (chime('tuck'), sayNow(folders.set(folder.id, { archived: !folder.archived }), folder.archived ? `Unarchived ${folder.name}` : `Archived ${folder.name}: kept, out of sight`, () => void folders.set(folder.id, { archived: !!folder.archived }))) },
    { label: 'Delete folder, keep what’s in it', hint: 'It moves up a level', danger: true, run: () => void folders.remove(folder.id).then((was) => was && (chime('separate'), toast(`Deleted ${folder.name}: what it held stays`, () => void folders.restore(was)))) },
    // A calendar whose event notes are kept here, its events on this folder's page (the calendar's own menu ties it too).
    cals.length > 0 && { label: tied.length ? `Notes of ${tied.map((one) => one.name).join(', ')}` : 'Keep a calendar’s notes here', icon: <CalendarDays />, items: cals.map((cal) => ({
      label: cal.name, icon: <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: calendarInk(cal) }} />, trail: cal.folder === folder.id ? <Check className="ml-auto size-3.5" /> : undefined,
      run: () => cal.folder === folder.id ? tie(cal, null, `Notes for ${cal.name}'s events stay in the Inbox`) : tie(cal, folder.id, `A note for an event on ${cal.name} now goes to ${folder.name}, and ${folder.name} shows its events`)
    })) },
    'separator',
    { label: 'Open', run: onOpen },
    ...openItems('folder', `folders:${folder.id}`),
    folder.edited ? { heading: age(folder.edited) === 'now' ? 'Edited just now' : `Edited ${age(folder.edited)} ago` } : null
  ]
}

function FolderRow({ folder, all, here, n, naming, open, onNamed, onRename, onOpen, onFold, onAdd, page = false }: { folder: Folder; all: Folder[]; here: boolean; n: number | null; naming: boolean; open: boolean; onNamed: () => void; onRename: () => void; onOpen: () => void; onFold: () => void; onAdd: () => void; /** On a folder's page, at the list's row size, as its list's first rows (FolderRows). */ page?: boolean }): React.JSX.Element {
  const [picking, setPicking] = useState(false)
  const name = (words: string | null): void => {
    onNamed()
    const next = words?.trim()
    if (!next || next === folder.name) return
    const was = folder.name
    void folders.set(folder.id, { name: next }).then(() => quietly(() => void folders.set(folder.id, { name: was })))
  }
  if (naming)
    return (
      <div className="flex w-full min-w-0 items-center gap-2 py-1 pr-2 pl-2">
        <span className="flex size-4 shrink-0 items-center justify-center"><GroupIcon icon={folder.icon} color={folder.color} className="size-3.5" /></span>
        <NameInPlace initial={folder.name} data-folder-name={folder.id} label="Folder name" placeholder="Name the folder" onDone={name}
          className="min-w-0 flex-1 rounded-md bg-accent/60 px-1 text-foreground outline-none ring-1 ring-ring/40" />
      </div>
    )
  // The app's one chooser for its icon (emoji, icons, a picture of your own), from its menu: pointed at, the icon
  // gives way to the fold, as Notion's does, so the icon is no longer the button that changes it (02ddf7144).
  const pick = (icon: string | null): void => {
    setPicking(false)
    const was = folder.icon
    if (icon === was) return
    chime('tap')
    void folders.set(folder.id, { icon }).then(() => toast(`Changed ${folder.name}’s icon`, () => void folders.set(folder.id, { icon: was })))
  }
  const menu = (): RowItem[] => { const all_ = folderMenu(folder, all, onOpen, onRename); const at = all_.findIndex((one) => !!one && typeof one === 'object' && 'label' in one && one.label === 'Rename…'); return [...all_.slice(0, at + 1), { label: 'Change icon…', run: () => setPicking(true) }, ...all_.slice(at + 1)] }
  // Writing's own row in the sidebar, copied (home.tsx): the icon gives way to its fold on pointing, and its "…" and
  // "+" take the count's place at the right; while anything is carried, the icon and count stay.
  return (
    <Popover open={picking} onOpenChange={setPicking}>
      <PopoverAnchor asChild>
        <div>
    <RowMenu items={menu}>
      <div className="group/fold relative flex flex-col">
        <button type="button" data-side-row={page ? undefined : ''} data-side-folder={page ? undefined : folder.id} data-folder-open={page ? folder.id : undefined} data-keep-drop={folder.id} data-folder-name={folder.name} title={folder.name} aria-label={folder.name} aria-current={here ? 'page' : undefined}
          onClick={() => (chime('page'), onOpen())}
          className={`flex w-full min-w-0 items-baseline gap-2 rounded-md pr-2 pl-2 ${page ? 'cursor-pointer py-2 text-body hover:bg-accent/60' : 'py-1'} ${here ? 'text-foreground' : 'text-(--mf-muted-strong)'} data-[queue-hot]:bg-[color-mix(in_oklab,var(--tt-color-text-blue)_16%,transparent)] data-[queue-hot]:text-foreground data-[queue-hot]:ring-1 data-[queue-hot]:ring-[color-mix(in_oklab,var(--tt-color-text-blue)_45%,transparent)]`}>
          <span className="flex h-[1lh] w-4 shrink-0 items-center justify-center transition-opacity duration-80 group-hover/fold:opacity-0 [:root[data-dragging]_&]:!opacity-100"><GroupIcon icon={folder.icon} color={folder.color} className="size-3.5" /></span>
          <Weighted on={here} className="flex-1 text-left truncate">{folder.name}</Weighted>
          {/* An empty folder shows no count: a "0" reads as something to see to. */}
          {!!n && <span className="transition-opacity duration-80 group-hover/fold:opacity-0 [:root[data-dragging]_&]:!opacity-100"><Count n={n} className="text-xs text-muted-foreground" /></span>}
        </button>
        <button type="button" data-folder-fold={folder.id} aria-label={open ? `Fold ${folder.name} away` : `Show what ${folder.name} holds`} aria-expanded={open} onClick={onFold}
          className={`absolute ${page ? 'top-[0.5625rem]' : 'top-[0.1875rem]'} left-1.5 flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground opacity-0 transition-[opacity,background-color] duration-80 group-hover/fold:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 [:root[data-dragging]_&]:!opacity-0`}>
          <ChevronRight className={`size-3.5 transition-transform duration-80 ${open ? 'rotate-90' : ''}`} />
        </button>
        <span className={`absolute ${page ? 'top-[0.5625rem]' : 'top-[0.1875rem]'} right-1.5 flex items-center gap-0.5 opacity-0 transition-opacity duration-80 group-hover/fold:opacity-100 focus-within:opacity-100 [:root[data-dragging]_&]:!opacity-0`}>
          <Tip label="More">
            <button type="button" data-folder-more={folder.id} aria-label={`${folder.name} menu`} onClick={openFromGrip}
              className="mf-hit relative flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <MoreHorizontal className="size-3.5" />
            </button>
          </Tip>
          <Tip label="Add a page inside">
            <button type="button" data-folder-add={folder.id} aria-label={`Add a page inside ${folder.name}`} onClick={onAdd}
              className="mf-hit relative flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <Plus className="size-3.5" />
            </button>
          </Tip>
        </span>
      </div>
    </RowMenu>
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-auto gap-0 overflow-hidden p-0" onFocusOutside={(event) => event.preventDefault()}>
        <IconChoice group={folder} onPick={pick} />
      </PopoverContent>
    </Popover>
  )
}

/**
 * A folder page's subfolders, as the first rows of its list: the sidebar tree's own rows (icon, name, count, the fold
 * over the icon, the menu and + at the right), at the list's row size; unfolded, what each holds hangs under it on a
 * trunk, as in the sidebar. Never a card of their own (the user, 20 Nov: "Renaissance ... 3" in one wide island).
 */
export function FolderRows({ parent, onPlace, onOpenItem }: { parent: string; onPlace: (id: string) => void; onOpenItem: (type: string, id: string, folder?: string) => void }): React.JSX.Element | null {
  const all = useFolders()
  const live = all.filter((one) => !one.archived)
  const [naming, setNaming] = useState<string | null>(null)
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set())
  const fold = (id: string): void => setUnfolded((was) => {
    const next = new Set(was)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    chime(next.has(id) ? 'slide' : 'fold')
    return next
  })
  const rows = (under: string, top: boolean): React.JSX.Element[] => live.filter((one) => one.parent === under).flatMap((one) => {
    const open = unfolded.has(one.id)
    const n = deepCount(live, one.id)
    return [
      <FolderRow key={one.id} page={top} folder={one} all={live} here={false} n={n || null} naming={naming === one.id} onNamed={() => setNaming(null)} onRename={() => setNaming(one.id)}
        onOpen={() => onPlace(one.id)} open={open} onFold={() => fold(one.id)} onAdd={() => void addPageIn(one, onOpenItem)} />,
      ...(open ? [<div key={`${one.id}:in`} data-no-twig="" data-own-press="">
        <Branches className="ml-5 flex flex-col gap-px">
          {rows(one.id, false)}
          <FolderThings key={`${one.id}:things`} folder={one} onOpen={(type, id) => onOpenItem(type, id, one.id)} onAll={() => onPlace(one.id)} />
        </Branches>
      </div>] : [])
    ]
  })
  const shown = rows(parent, true)
  return shown.length ? <div data-folder-rows="" className="-mx-2 mb-2 flex flex-col">{shown}</div> : null
}

/** A new page in Writing, kept in this folder, opened: the folder's "+" (Notion's "Add a page inside"). */
async function addPageIn(folder: Folder, open: (type: string, id: string) => void): Promise<void> {
  const id = await haligtree.newArticle()
  const was = await folders.file([{ type: 'article', id }], folder.id)
  chime('promote')
  open('article', id)
  quietly(() => void folders.unfile(was))
}

/** Each kind's own sign, as its rows show it elsewhere. */
const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = { article: FileText, capture: StickyNote, nugget: Gem, question: HelpCircle, task: CircleCheck }
/** How many things any fold in the sidebar shows (a folder's, Writing's): four, then "See all". */
export const TREE_SHOWN = 4
/** Of a list in order, the first few, the open one always among them: past them, it takes the last place, the gap implied. */
export const pagesShown = <T extends { id: string }>(all: T[], lit: string | undefined, n = TREE_SHOWN): T[] => {
  const at = lit ? all.findIndex((one) => one.id === lit) : -1
  return at < n ? all.slice(0, n) : [...all.slice(0, n - 1), all[at]]
}

/**
 * What an unfolded folder holds, under its folders on the same trunk: its pages, notes, gems and tasks, each with its
 * own sign, newest first, the first four (the open one always among them) and then "See all", the folder's page.
 */
function FolderThings({ folder, lit, onOpen, onAll }: { folder: Folder; lit?: string; onOpen: (type: string, id: string) => void; onAll: () => void }): React.JSX.Element | null {
  const things = useLive(() => folders.items(folder.id), null as FolderItem[] | null, [folder.id], undefined, `folders:items:${folder.id}`)
  if (!things) return null
  const shown = things.filter((one) => !one.archived)
  if (!shown.length) return <p data-folder-empty-row="" className="py-1 pr-2 pl-8 text-control text-muted-foreground">Nothing in it yet</p>
  return (
    <>
      {pagesShown(shown, lit).map((one) => <ThingRow key={one.id} thing={one} lit={lit === one.id} onOpen={onOpen} from={folder.name} />)}
      {shown.length > TREE_SHOWN && <MoreRow data-folder-show-more={folder.id} onClick={onAll}>See all</MoreRow>}
    </>
  )
}

/**
 * One thing under a fold in the sidebar, with its own sign: a folder's page, note, gem or task, or one of Writing's
 * pages (side-writing.tsx). Lit while it is the one open; its right click opens it, keeps it in a folder, or (`from`,
 * the folder it is in) takes it out.
 */
export function ThingRow({ thing: one, lit: here, onOpen, from }: { thing: { type: FolderKind; id: string; title: string }; lit: boolean; onOpen: (type: string, id: string) => void; from?: string }): React.JSX.Element {
  const Icon = KIND_ICON[one.type] ?? FileText
  return (
    <RowMenu items={() => [
      { label: 'Open', run: () => onOpen(one.type, one.id) },
      ...openItems(one.type, one.id),
      'separator',
      { label: 'Keep in folder…', run: () => askFolder([{ type: one.type, id: one.id }]) },
      !!from && { label: `Take out of ${from}`, hint: one.type === 'capture' ? 'Back to the Inbox' : one.type === 'task' ? 'Stays in Tasks' : one.type === 'article' ? 'Stays in Writing' : 'Stays in Gems', run: () => void keepIn([{ type: one.type, id: one.id }], null) }
    ]}>
      {/* Carried as a pin is (split-drop.tsx `data-drag-open`): onto another folder, into the page beside, the one card. */}
      <button type="button" data-side-row data-side-thing={one.id} data-type={one.type} data-drag-open={`${one.type}:${one.id}`} data-drag-kind={one.type} aria-current={here ? 'page' : undefined} title={one.title}
        onClick={() => (chime('page'), onOpen(one.type, one.id))}
        className={`flex w-full min-w-0 items-center gap-2 rounded-md py-1 pr-2 pl-2 ${here ? 'text-foreground' : 'text-(--mf-muted-strong)'}`}>
        <span className="flex w-4 shrink-0 items-center justify-center"><Icon className="size-3.5 text-muted-foreground" /></span>
        <span className="private-text min-w-0 flex-1 truncate text-left">{one.title.trim() || (one.type === 'article' ? 'Untitled' : 'New note')}</span>
      </button>
    </RowMenu>
  )
}

/** The last row under a fold, after the first few: the rest, on their own page. */
export function MoreRow({ onClick, children, ...data }: { onClick: () => void; children: React.ReactNode } & Record<`data-${string}`, string>): React.JSX.Element {
  return (
    <button type="button" data-side-row {...data} onClick={() => (chime('page'), onClick())}
      className="flex w-full min-w-0 items-center gap-2 rounded-md py-1 pr-2 pl-2 text-muted-foreground hover:text-foreground">
      <span className="w-4 shrink-0" />
      <span className="flex-1 text-left">{children}</span>
    </button>
  )
}
