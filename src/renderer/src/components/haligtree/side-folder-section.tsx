import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CalendarDays, Check, ChevronRight, CircleCheck, FileText, HelpCircle, MoreHorizontal, Plus, StickyNote } from 'lucide-react'
import type { Places } from './carry'
import { Gem } from '@/components/ui/icons'
import { openItems } from '@/lib/split'
import { Branches } from './branches'
import { NameInPlace } from './name-in-place'
import { GroupIcon, GroupTile, IconChoice } from './kept-groups'
import { ROW_PAD, ROW_SHAPE } from './row-shape'
import { cn } from '@/lib/cn'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Unfold, Weighted } from './glide'
import { useTreeFolds } from '@/lib/side-folds'
import { RowMenu, copyLinkItem, openFromGrip, type RowItem } from './row-menu'
import { Count, Tip, quietly, refuse, sayNow, toast, typing } from './ui'
import { GROUP_COLORS, tintOf } from '@/lib/groups'
import { SortableList, SortableRow, type NestCheck } from './sortable'
import { age, num, plural } from '../../../../main/dates'
import { call, haligtree, useLive } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { FOLDER_DEPTH, askFolder, askFolderFor, folders, writeFrom, keepIn, pathOf, useFolders, type Folder, type FolderItem, type FolderKind } from '@/lib/folders'
import { calendarInk, calendarsNow, events, type Calendar } from '@/lib/events'

/** Folders shown under Writing in the sidebar before the rest fold behind "Show all". */
const SHOWN = 12

/** Where the sidebar sends a press: a folder's page, or Writing's own top level (null). */
export type FolderPlace = string | null

/**
 * A new folder (in `parent`, or at Writing's top), named in place where it appears, as Finder names one: on Writing's
 * page when the page shows that level (FolderRows takes it), else in Writing's tree in the sidebar (WritingFolders).
 */
export const newFolderHere = (parent: string | null = null): void => void folders.make('New folder', parent).then((id) => {
  chime('promote')
  quietly(() => void folders.remove(id))
  const detail = { id, parent }
  if (window.dispatchEvent(new CustomEvent('haligtree:folder-made', { cancelable: true, detail }))) window.dispatchEvent(new CustomEvent('haligtree:folder-name-side', { detail }))
})

/** What one folder holds, its folders' too, in Writing's kinds (pages, notes, gems; tasks stay in Tasks), in sight. */
export const deepCount = (all: Folder[], id: string): number =>
  all.reduce((sum, one) => sum + (one.id === id ? one.pages + one.gems + one.notes : one.parent === id ? deepCount(all, one.id) : 0), 0)

/** The kinds a folder holds in Writing, writing first. */
const KINDS_SAID = [['pages', 'page'], ['notes', 'note'], ['gems', 'gem']] as const
/**
 * What one folder holds, its folders' too, in words by kind, as Writing's folder rows said "4 pages": "41 notes",
 * "4 pages, 2 gems". Nothing for an empty folder (a "0" reads as something to see to).
 */
export const heldSaid = (all: Folder[], id: string): string => {
  const deep = (at: string, kind: (typeof KINDS_SAID)[number][0]): number => all.reduce((sum, one) => sum + (one.id === at ? one[kind] : one.parent === at ? deep(one.id, kind) : 0), 0)
  return KINDS_SAID.map(([kind, one]) => [deep(id, kind), one] as const).filter(([n]) => n > 0).map(([n, one]) => plural(n, one)).join(', ')
}

/** Whether `inner` is `outer` or sits anywhere inside it. */
const within = (all: Folder[], inner: string | null, outer: string): boolean => {
  for (let at = inner, steps = 0; at && steps < 16; at = all.find((one) => one.id === at)?.parent ?? null, steps++) if (at === outer) return true
  return false
}

/** Where a folder is carried to besides its neighbours: Writing's own row or the path's "Writing" (the top), or a folder named in a path. */
export const TOP_DROP = 'folders-top'
export const folderDrop = (id: string): string => `folder:${id}`

/**
 * Every move of a folder by the app's one drag (sortable.tsx), the same in Writing's sidebar tree and on its page:
 * beside another (its edge) reorders, rested on another's middle goes inside it, let go on Writing (its sidebar row,
 * or the path over the page) goes to the top, on a folder in the path goes in there. Never into itself or a folder
 * inside it: refused in words with the nope sound. Each move said with Undo.
 */
export function useFolderMoves(of?: { /** Another tree moved the same way: projects (side-projects.tsx). */ all: { id: string; name: string; parent: string | null }[]; api: { place: typeof folders.place; arrange: typeof folders.arrange; nest: typeof folders.nest }; word: string; top: string }):
  { epoch: number; place: (id: string, target: string, after: boolean) => void; nest: (id: string, target: string | null) => void; nests: NestCheck; places: Places; nestSays: (title: string) => string } {
  const folderAll = useFolders()
  const all = (of?.all ?? folderAll) as Folder[]
  const api = of?.api ?? folders
  const word = of?.word ?? 'folder'
  const inItself = `A ${word} can’t go inside itself or a ${word} inside it`
  // The list holds a dropped order until the saved one is read back (sortable.tsx `useHeld`); a drop refused here
  // changes nothing to read back, so the list starts afresh.
  const [epoch, setEpoch] = useState(0)
  const afresh = (): void => setEpoch((n) => n + 1)
  const named = (id: string | null): string => (id ? `“${all.find((one) => one.id === id)?.name ?? `the ${word}`}”` : of?.top ?? 'the top of Writing')
  const place = (id: string, target: string, after: boolean): void => {
    void api.place(id, target, after).then((was) => {
      if (!was) return (afresh(), refuse(inItself))
      chime('gather')
      toast(`Moved ${named(id)} ${after ? 'after' : 'before'} ${named(target)}`, () => void api.arrange(id, was).then(() => chime('undo')))
    })
  }
  const nest = (id: string, target: string | null): void => {
    const was = all.find((one) => one.id === id)
    if (!was) return
    if ((was.parent ?? null) === target) return (afresh(), refuse(target ? `Already in ${named(target)}` : `Already at ${named(null)}`))
    if (target && within(all, target, id)) return (afresh(), refuse(inItself))
    void api.nest(id, target).then((done) => {
      if (done !== true) return (afresh(), refuse(done))
      chime('gather')
      toast(`Moved ${named(id)} ${target ? 'into' : 'to'} ${named(target)}`, () => void api.nest(id, was.parent ?? null).then(() => chime('undo')))
    })
  }
  const nests: NestCheck = (carried, target) => (within(all, target, carried) ? { refused: inItself } : true)
  const places: Places = {
    drop: (id, spot) => nest(id, spot === TOP_DROP ? null : spot.slice('folder:'.length)),
    said: (spot, id) => {
      const me = all.find((one) => one.id === id)
      // Only a folder is carried here: a page's row says nothing over these.
      if (!me) return null
      if (spot === TOP_DROP) return me.parent ? 'Move to the top of Writing' : null
      if (!spot.startsWith('folder:')) return null
      const to = spot.slice('folder:'.length)
      return to === me.parent || within(all, to, id) ? null : `Move into ${named(to)}`
    }
  }
  return { epoch, place, nest, nests, places, nestSays: (title) => `Move into “${title}”` }
}

/**
 * Writing's folders in the sidebar, hung under its row as Finder's sidebar hangs a disk's: every folder at the top,
 * each with the folders inside it under it on a trunk, then (unfolded) what it holds. A row takes anything dropped on
 * it (split-drop.tsx `keepDrop`); carried, a folder reorders, goes inside another, or out onto Writing (useFolderMoves).
 */
export function WritingFolders({ open: unfoldedHere, here, counted, onOpen, onOpenItem, lit: litItem, onUnfold, noteIn, noteRow, noteKey }: { /** Writing's fold in the sidebar: always mounted, so a new folder can be named in it, drawn only while open. */ open: boolean
  here: FolderPlace | undefined; counted: boolean; onOpen: (place: FolderPlace) => void
  /** A page, note or gem in a folder unfolded here: opened in that folder (`folder`), so ↓↑ step through what it
   *  holds, as a press on its row in the folder's own list does. */
  onOpenItem: (type: string, id: string, folder?: string) => void
  /** The thing open now, lit where it shows under its folder. */
  lit?: string
  /** Opens Writing's fold, for a folder named in place or a note in one come to the front. */
  onUnfold: () => void
  /** The folder the note in front lives in, with its one lit row to hang under that folder, and which note it is. */
  noteIn?: string; noteRow?: React.ReactNode; noteKey?: string }): React.JSX.Element | null {
  const all = useFolders()
  // Folded by hand, it stays folded until focus next comes to something in a folder: then it opens on it.
  useEffect(() => void (noteKey && noteIn && onUnfold()), [noteKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const [naming, setNaming] = useState<string | null>(null)
  // Folders unfolded in the tree, Notion's way: what each holds hangs under it. Kept across launches.
  const [unfolded, setUnfolded] = useTreeFolds()
  const unfoldedRef = useRef(unfolded)
  unfoldedRef.current = unfolded
  const foldOne = (id: string): void => {
    const next = new Set(unfolded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    chime(next.has(id) ? 'slide' : 'fold')
    setUnfolded(next)
  }
  useEffect(() => {
    // A new folder Writing's page does not show (newFolderHere): named here, Writing's fold (and the folder it goes in) opened on it first.
    const make = (event: Event): void => {
      const { id, parent } = (event as CustomEvent<{ id: string; parent: string | null }>).detail
      onUnfold()
      if (parent && !unfoldedRef.current.has(parent)) setUnfolded(new Set([...unfoldedRef.current, parent]))
      setNaming(id)
    }
    // ⌃⌘N anywhere a list has not taken it for its picked rows (items-view.tsx): a new, empty folder.
    const key = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey && event.metaKey && !event.altKey && !event.shiftKey && event.code === 'KeyN') || typing()) return
      event.preventDefault()
      newFolderHere(null)
    }
    window.addEventListener('haligtree:folder-name-side', make)
    window.addEventListener('keydown', key)
    return () => (window.removeEventListener('haligtree:folder-name-side', make), window.removeEventListener('keydown', key))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const live = all.filter((one) => !one.archived)
  const ids = new Set(live.map((one) => one.id))
  // The way down to the folder you are in, or to the one holding the note in front: shown open to it.
  const at = typeof here === 'string' ? here : noteIn
  const path = at ? pathOf(live, at).map((one) => one.id) : []
  const inside = (id: string): Folder[] => live.filter((one) => one.parent === id)
  const moves = useFolderMoves()
  // One level of folders, carried by the app's one drag: beside each other, into each other, or out onto Writing.
  const level = (rows: Folder[], depth: number): React.JSX.Element => (
    <SortableList key={moves.epoch} items={rows} keyOf={(one) => one.id} onMove={moves.place} onNest={(id, target) => moves.nest(id, target)} nests={moves.nests} nestSays={moves.nestSays} places={moves.places}>{(items) => items.map((one) => (
      <SortableRow key={one.id} id={one.id} glide={`side-folder-${one.id}`}><div className="flex flex-col gap-px">{row(one, depth)}</div></SortableRow>
    ))}</SortableList>
  )
  const row = (one: Folder, depth: number): React.JSX.Element[] => {
    // Unfolded, a folder shows what it holds: its folders, then its pages and notes (Notion's way). Folded, only the
    // way down to the folder you are in. Holding nothing and no folder: nothing to fold open.
    const holds = deepCount(live, one.id) > 0 || inside(one.id).length > 0
    const open = holds && unfolded.has(one.id)
    const kids = open ? inside(one.id) : inside(one.id).filter((kid) => path.includes(kid.id))
    return [
      // One light: a note of its own open under it (noteRow) is the lit one, the folder kept beside it is not lit too.
      <FolderRow key={one.id} folder={one} all={live} here={here === one.id && !(noteRow && noteIn === one.id)} n={counted ? deepCount(live, one.id) : null} naming={naming === one.id} onNamed={() => setNaming(null)} onRename={() => setNaming(one.id)} onOpen={() => onOpen(one.id)}
        open={open} onFold={holds ? () => foldOne(one.id) : undefined} onAdd={() => void addPageIn(one, onOpenItem)} />,
      // Its own presses (lib/own-press.ts): a page carried from under it is that page, never the folder above it.
      ...(kids.length || open ? [<div key={`${one.id}:in`} data-no-twig="" data-own-press="">
        <Branches className="ml-5 flex flex-col gap-px">
          {kids.length > 0 && level(kids, depth + 1)}
          {open && <FolderThings key={`${one.id}:things`} folder={one} lit={litItem} onOpen={(type, id) => onOpenItem(type, id, one.id)} onAll={() => onOpen(one.id)} />}
        </Branches>
      </div>] : []),
      // The note in front, under the folder it lives in, while the folder is folded: only that one row, lit.
      ...(noteRow && one.id === noteIn && !open ? [<div key={`${one.id}:note`} data-no-twig=""><Branches className="ml-5 flex flex-col gap-px">{noteRow}</Branches></div>] : [])
    ]
  }
  // Many folders: the first 12, and the one you are in, the rest a press away, so they never push the sidebar long.
  const [every, setEvery] = useState(false)
  const tops = live.filter((one) => !one.parent || !ids.has(one.parent))
  const rows = every || tops.length <= SHOWN ? tops : tops.filter((one, n) => n < SHOWN || one.id === here || path.includes(one.id))
  // F2 renames the folder whose row has the keys, or the one you are in, in place (Finder's way).
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'F2' || event.metaKey || event.ctrlKey || event.altKey) return
      const row = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-side-folder]')
      const id = row?.dataset.sideFolder ?? (!typing() && typeof here === 'string' && ids.has(here) ? here : null)
      if (!id) return
      event.preventDefault()
      setNaming(id)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })
  if (!rows.length) return null
  return (
    <Unfold open={unfoldedHere} className="contents">
      {/* Hung off Writing's trunk, as its groups and loose pages under them are (children look like children). */}
      <div data-side-folders-section="" className="contents"><Branches rows=":scope > *" className="ml-5 flex flex-col gap-px">
        {level(rows, 0)}
        {tops.length > SHOWN && (
          <button type="button" data-side-row data-folders-more={tops.length} onClick={() => (chime(every ? 'fold' : 'slide'), setEvery(!every))}
            className="flex w-full min-w-0 cursor-pointer items-baseline gap-2 rounded-md py-1 pr-2 pl-2 text-muted-foreground hover:text-foreground">
            <span className="size-4 shrink-0" />
            <span className="flex-1 text-left">{every ? 'Show fewer folders' : `Show all ${num(tops.length)} folders`}</span>
          </button>
        )}
      </Branches></div>
    </Unfold>
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
    // Its colour first, a row of swatches at the menu's top, as Arc's group menu has them (the user, 24 Nov): one press,
    // the one in use pressed again takes it off.
    { swatches: GROUP_COLORS.map((color) => ({ color: tintOf(color)!, label: color[0].toUpperCase() + color.slice(1), on: folder.color === color, run: () => {
      const was = folder.color ?? null
      const next = folder.color === color ? null : color
      chime('tap')
      void folders.set(folder.id, { color: next }).then(() => quietly(() => void folders.set(folder.id, { color: was })))
    } })) },
    'separator',
    // As Notion's: its name and place, then opening it, then the foot. Every folder shows under Writing in the sidebar.
    copyLinkItem(`folder:${folder.id}`, folder.name),
    // Put away by Start fresh: back at the top of Writing, everything in it with it (start-fresh.ts `bringBack`).
    !!folder.away && { label: 'Bring back', hint: 'To the top of Writing, with all it holds', run: () => void call('fresh:back', 'folder', folder.id).then(() => (chime('unshelve'), toast(`Brought back to Writing: ${folder.name}`, () => void call('fresh:unback', 'folder', folder.id).then(() => chime('shelve'))))) },
    { label: 'Rename…', run: onRename },
    // Into another folder, found in the one folder picker (folder-picker.tsx), as things are kept in one.
    { label: 'Move to…', run: () => askFolderFor(folder) },
    // A page in Writing with the folder's gems and highlights beside it; the folder stays a folder.
    { label: 'Write from this folder', run: () => void writeFrom(folder) },
    level < FOLDER_DEPTH && { label: 'New folder inside', run: () => newFolderHere(folder.id) },
    folder.parent ? { label: 'Move to the top of Writing', run: () => void folders.nest(folder.id, null).then(() => (chime('gather'), toast(`Moved “${folder.name}” to the top of Writing`, () => void folders.nest(folder.id, folder.parent).then(() => chime('undo'))))) } : null,
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

/**
 * What makes a tree's row a folder's or a project's (side-projects.tsx): the one row below draws both. Left out, a
 * folder's: its store, its menu (with "Change icon…"), what it holds in words, its drop and its "+" for a page.
 */
export type TreeKind = {
  set: (id: string, patch: { name?: string; icon?: string | null }) => Promise<unknown>
  /** Its whole menu, "Change icon…" in it. */
  menu: (onIcon: () => void) => RowItem[]
  /** On a page's row: what it holds, in words, on the right. */
  held: string
  /** Its row's marks: what it is (`data-project-row`) and what it takes dropped on it (`data-project-drop`). */
  marks: Record<`data-${string}`, string>
  /** The "+" at its right, or none. */
  add: { label: string; run: () => void } | null
  /** Folded, with rows inside: a carried thing rested on it opens it. */
  spring?: () => void
}

/** How long a carried thing rests on a folded row before it springs open, as Finder's folders do. */
const SPRING_MS = 600

export function FolderRow({ folder, all, here, n, naming, open, onNamed, onRename, onOpen, onFold, onAdd, page = false, picked = false, onPick, many, kind }: { folder: Folder; all: Folder[]; here: boolean; n: number | null; naming: boolean; open: boolean; onNamed: () => void; onRename: () => void; onOpen: () => void; onFold?: () => void; onAdd: () => void; /** On a folder's page, at the list's row size, as its list's first rows (FolderRows). */ page?: boolean
  /** Picked with others (⌘-click, ⇧-click, ⌘A), and what a press with ⌘ or ⇧ does: true when it picked rather than opened. */
  picked?: boolean; onPick?: (event: React.MouseEvent) => boolean
  /** Right-clicked while picked with others: the menu for all of them. */
  many?: () => RowItem[]
  /** Another kind of thing in a tree drawn the same way: a project (side-projects.tsx). */
  kind?: TreeKind }): React.JSX.Element {
  const [picking, setPicking] = useState(false)
  const spring = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(spring.current), [])
  const store = kind ?? folders
  const name = (words: string | null): void => {
    onNamed()
    const next = words?.trim()
    if (!next || next === folder.name) return
    const was = folder.name
    void store.set(folder.id, { name: next }).then(() => quietly(() => void store.set(folder.id, { name: was })))
  }
  if (naming)
    return (
      <div className={page ? cn(ROW_SHAPE, ROW_PAD) : 'flex w-full min-w-0 items-center gap-2 py-1 pr-2 pl-2'}>
        {page ? <GroupTile group={folder} empty={!n} /> :<span className="flex size-4 shrink-0 items-center justify-center"><GroupIcon icon={folder.icon} color={folder.color} className="size-3.5" /></span>}
        <NameInPlace initial={folder.name} data-folder-name={folder.id} label="Folder name" placeholder="Name the folder" onDone={name}
          // As Finder names a new folder: a field as wide as the name, a fine ring round it, never a bar across the row (23 Nov).
          className={cn('min-w-[5rem] max-w-full rounded-[4px] bg-background px-1 text-foreground outline-none ring-2 ring-ring/45 [field-sizing:content]', page && 'text-control font-medium')} />
      </div>
    )
  // The app's one chooser for its icon (emoji, icons, a picture of your own), from its menu: pointed at, the icon
  // gives way to the fold, as Notion's does, so the icon is no longer the button that changes it (02ddf7144).
  const pick = (icon: string | null): void => {
    setPicking(false)
    const was = folder.icon
    if (icon === was) return
    chime('tap')
    void store.set(folder.id, { icon }).then(() => toast(`Changed ${folder.name}’s icon`, () => void store.set(folder.id, { icon: was })))
  }
  const menu = (): RowItem[] => { if (kind) return kind.menu(() => setPicking(true)); const all_ = folderMenu(folder, all, onOpen, onRename); const at = all_.findIndex((one) => !!one && typeof one === 'object' && 'label' in one && one.label === 'Rename…'); return [...all_.slice(0, at + 1), { label: 'Change icon…', run: () => setPicking(true) }, ...all_.slice(at + 1)] }
  // Writing's own row in the sidebar, copied (home.tsx): the icon gives way to its fold on pointing, and its "…" and
  // "+" take the count's place at the right; while anything is carried, the icon and count stay.
  return (
    <Popover open={picking} onOpenChange={setPicking}>
      <PopoverAnchor asChild>
        <div>
    <RowMenu items={many ?? menu}>
      <div className="group/fold relative flex flex-col"
        onPointerEnter={() => kind?.spring && document.documentElement.dataset.dragging !== undefined && (spring.current = setTimeout(kind.spring, SPRING_MS))}
        onPointerLeave={() => clearTimeout(spring.current)}>
        <button type="button" data-side-row={page ? undefined : ''} data-side-folder={page || kind ? undefined : folder.id} data-folder-open={page && !kind ? folder.id : undefined} data-keep-drop={kind ? undefined : folder.id} {...kind?.marks} data-folder-name={folder.name} title={folder.name} aria-label={folder.name} aria-current={here ? 'page' : undefined}
          data-folder-picked={picked ? '' : undefined} aria-selected={onPick ? picked : undefined}
          onClick={(event) => onPick?.(event) || (chime('page'), onOpen())}
          className={page
            ? cn(ROW_SHAPE, ROW_PAD, 'cursor-pointer hover:bg-accent/60 data-[folder-picked]:bg-accent data-[queue-hot]:bg-[color-mix(in_oklab,var(--tt-color-text-blue)_16%,transparent)] data-[queue-hot]:ring-1 data-[queue-hot]:ring-[color-mix(in_oklab,var(--tt-color-text-blue)_45%,transparent)]')
            : `flex w-full min-w-0 items-baseline gap-2 rounded-md pr-2 pl-2 py-1 ${here ? 'text-foreground' : 'text-(--mf-muted-strong)'} data-[queue-hot]:bg-[color-mix(in_oklab,var(--tt-color-text-blue)_16%,transparent)] data-[queue-hot]:text-foreground data-[queue-hot]:ring-1 data-[queue-hot]:ring-[color-mix(in_oklab,var(--tt-color-text-blue)_45%,transparent)]`}>
          {page ? (
            // On a folder's page, Writing's folder row from before Folders (kept-groups.tsx `GroupTile`): the drawn folder
            // with its icon in a page thumbnail's box, the name on the titles' line, what it holds in words on the right.
            <>
              {/* Finder's list view: the fold's chevron hangs in the margin left of the drawing (below), so every folder's
                  drawing stands on the page's one left edge, as a page's thumbnail does. */}
              <GroupTile group={folder} empty={!n} />
              <span data-folder-row-name="" data-title="" className="min-w-0 flex-1 truncate text-control font-medium text-foreground">{folder.name}</span>
              {/* Pointed at, the count gives its place to the row's "…" and "+". */}
              {!!n && <span data-folder-held="" className="shrink-0 text-meta text-muted-foreground tabular-nums transition-opacity duration-80 group-hover/fold:opacity-0 [:root[data-dragging]_&]:!opacity-100">{kind ? kind.held : heldSaid(all, folder.id)}</span>}
            </>
          ) : (
            <>
              <span className="flex h-[1lh] w-4 shrink-0 items-center justify-center transition-opacity duration-80 group-hover/fold:opacity-0 [:root[data-dragging]_&]:!opacity-100"><GroupIcon icon={folder.icon} color={folder.color} className="size-3.5" /></span>
              {/* Its name is what its carried card says (carry.tsx `titleOf`), never its emoji. */}
              <span data-title="" className="flex min-w-0 flex-1"><Weighted on={here} className="flex-1 text-left truncate">{folder.name}</Weighted></span>
              {/* An empty folder shows no count: a "0" reads as something to see to. */}
              {!!n && <span className="transition-opacity duration-80 group-hover/fold:opacity-0 [:root[data-dragging]_&]:!opacity-100"><Count n={n} className="text-xs text-muted-foreground" /></span>}
            </>
          )}
        </button>
        {onFold && !page && <button type="button" data-folder-fold={folder.id} aria-label={open ? `Fold ${folder.name} away` : `Show what ${folder.name} holds`} aria-expanded={open} onClick={onFold}
          className={`absolute ${page ? 'top-1/2 left-2 size-9 -translate-y-1/2' : 'top-[0.1875rem] left-1.5 size-5'} flex cursor-pointer items-center justify-center rounded text-muted-foreground opacity-0 transition-[opacity,background-color] duration-80 group-hover/fold:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 [:root[data-dragging]_&]:!opacity-0`}>
          <ChevronRight className={`size-3.5 transition-transform duration-80 ${open ? 'rotate-90' : ''}`} />
        </button>}
        {/* On a page, Finder's disclosure: always there on a folder that holds something, opening what it holds in place
            under it on the tree's lines. A press on the row itself still opens the folder's page. */}
        {onFold && page && <button type="button" data-folder-page-fold={folder.id} aria-label={open ? `Fold ${folder.name} away` : `Show what ${folder.name} holds`} aria-expanded={open} onClick={onFold}
          className="absolute top-1/2 -left-5 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors duration-80 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45">
          <ChevronRight className={cn('size-3.5 transition-transform duration-150 ease-out motion-reduce:transition-none', open && 'rotate-90')} />
        </button>}
        <span className={`absolute ${page ? 'top-1/2 right-2 -translate-y-1/2' : 'top-[0.1875rem] right-1.5'} flex items-center gap-0.5 opacity-0 transition-opacity duration-80 group-hover/fold:opacity-100 focus-within:opacity-100 [:root[data-dragging]_&]:!opacity-0`}>
          <Tip label="More">
            <button type="button" data-folder-more={folder.id} aria-label={`${folder.name} menu`} onClick={openFromGrip}
              className="mf-hit relative flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <MoreHorizontal className="size-3.5" />
            </button>
          </Tip>
          {(kind ? kind.add : { label: 'Add a page inside', run: onAdd }) && (
            <Tip label={kind?.add?.label ?? 'Add a page inside'}>
              <button type="button" data-folder-add={folder.id} aria-label={`${kind?.add?.label ?? 'Add a page inside'} ${folder.name}`} onClick={kind?.add?.run ?? onAdd}
                className="mf-hit relative flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                <Plus className="size-3.5" />
              </button>
            </Tip>
          )}
        </span>
      </div>
    </RowMenu>
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-auto gap-0 overflow-hidden p-0" onFocusOutside={(event) => event.preventDefault()}>
        <IconChoice group={folder} onPick={pick} onColor={(color) => { const was = folder.color ?? null; void store.set(folder.id, { color }).then(() => quietly(() => void store.set(folder.id, { color: was }))) }} />
      </PopoverContent>
    </Popover>
  )
}

/**
 * The folders at one level of Writing's page (the top, or inside a folder), as the first rows of its list: the
 * sidebar tree's own rows (icon, name, count, the fold over the icon, the menu and + at the right), at the list's row
 * size; unfolded, what each holds hangs under it on a trunk, as in the sidebar. Carried by the app's one drag, as in
 * the sidebar (useFolderMoves). Never a card of their own (the user, 20 Nov: "Renaissance ... 3" in one wide island).
 */
export function FolderRows({ parent, onPlace, onOpenItem }: { parent: string | null; onPlace: (id: string) => void; onOpenItem: (type: string, id: string, folder?: string) => void }): React.JSX.Element | null {
  const all = useFolders()
  const live = all.filter((one) => !one.archived)
  const [naming, setNaming] = useState<string | null>(null)
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set())
  const moves = useFolderMoves()
  // Folders picked together (⌘-click, ⇧-click, ⌘A), as a list's rows are: ⌫ deletes them, keeping what they hold, with one Undo.
  const [picked, setPicked] = useState<string[]>([])
  const last = useRef<string | null>(null)
  // A folder made at this level ("New folder" over the page, ⌃⌘N at the top) is named here, where it appears, not in the sidebar.
  useEffect(() => {
    const made = (event: Event): void => {
      const detail = (event as CustomEvent<{ id: string; parent: string | null }>).detail
      if (detail.parent !== parent) return
      event.preventDefault()
      setNaming(detail.id)
    }
    window.addEventListener('haligtree:folder-made', made)
    return () => window.removeEventListener('haligtree:folder-made', made)
  }, [parent])
  const fold = (id: string): void => setUnfolded((was) => {
    const next = new Set(was)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    chime(next.has(id) ? 'slide' : 'fold')
    return next
  })
  const rows = (one: Folder, top: boolean): React.JSX.Element[] => {
    const n = deepCount(live, one.id)
    // Nothing in it and no folder under it: nothing to fold open (the user, 22 Nov: "then don't be collapsible"), its
    // icon stays put and no "Nothing in it yet" hangs under it.
    const holds = n > 0 || live.some((sub) => sub.parent === one.id)
    const open = holds && unfolded.has(one.id)
    const kids = live.filter((kid) => kid.parent === one.id)
    return [
      // Every level at the page's row size, as Finder's list view draws a folder's folders under it.
      <FolderRow key={one.id} page folder={one} all={live} here={false} n={n || null} naming={naming === one.id} onNamed={() => setNaming(null)} onRename={() => setNaming(one.id)}
        onOpen={() => onPlace(one.id)} open={open} onFold={holds ? () => fold(one.id) : undefined} onAdd={() => void addPageIn(one, onOpenItem)}
        picked={top && picked.includes(one.id)} onPick={top ? (event) => pick(one.id, event) : undefined} many={top ? many(one.id) : undefined} />,
      // Unfolded, what it holds hangs under it on the tree's lines: its folders (carried as these are), then its pages
      // and notes. Its own presses (lib/own-press.ts): a folder carried from in here is that one, never the one above.
      ...(open ? [<div key={`${one.id}:in`} data-no-twig="" data-own-press="" data-folder-page-in={one.id}>
        <Branches className="ml-5 flex flex-col gap-px">
          {kids.length > 0 && level(kids, false)}
          <FolderThings key={`${one.id}:things`} folder={one} onOpen={(type, id) => onOpenItem(type, id, one.id)} onAll={() => onPlace(one.id)} />
        </Branches>
      </div>] : [])
    ]
  }
  // One level of folders, carried by the app's one drag (sortable.tsx) with the sidebar's moves (useFolderMoves): by
  // another's edge before or after it, rested on its middle inside it, onto the path's "Writing" or a folder in it.
  const level = (list: Folder[], top: boolean): React.JSX.Element => (
    <SortableList key={moves.epoch} items={list} keyOf={(one) => one.id} onMove={moves.place} onNest={(id, target) => moves.nest(id, target)} nests={moves.nests} nestSays={moves.nestSays} places={moves.places}>{(items) => items.map((one) => (
      <SortableRow key={one.id} id={one.id} glide={`page-folder-${one.id}`}><div className="flex flex-col">{rows(one, top)}</div></SortableRow>
    ))}</SortableList>
  )
  const here = live.filter((one) => (one.parent ?? null) === parent)
  const pick = (id: string, event: React.MouseEvent): boolean => {
    if (!event.metaKey && !event.shiftKey) return (setPicked([]), false)
    chime('tick')
    if (event.shiftKey && last.current) {
      const [a, b] = [here.findIndex((one) => one.id === last.current), here.findIndex((one) => one.id === id)].sort((x, y) => x - y)
      setPicked([...new Set([...picked, ...here.slice(Math.max(0, a), b + 1).map((one) => one.id)])])
    } else setPicked(picked.includes(id) ? picked.filter((one) => one !== id) : [...picked, id])
    last.current = id
    return true
  }
  // Deleted together, what each held moving up a level, said once with one Undo for all (the folder menu's own delete).
  const removeAll = (ids: string[]): void => {
    if (!ids.length) return
    setPicked([])
    void Promise.all(ids.map((id) => folders.remove(id))).then((done) => {
      const was = done.filter((one): one is NonNullable<typeof one> => !!one)
      if (!was.length) return
      chime('separate')
      const one = live.find((f) => f.id === ids[0])
      toast(was.length === 1 ? `Deleted “${one?.name ?? 'the folder'}”: what it held stays` : `Deleted ${num(was.length)} folders: what they held stays`, () => void Promise.all(was.map((row) => folders.restore(row))).then(() => chime('undo')))
    })
  }
  const many = (id: string): (() => RowItem[]) | undefined => (picked.length > 1 && picked.includes(id) ? () => [
    { label: `Delete ${num(picked.length)} folders, keep what’s in them`, hint: 'What they hold moves up a level', danger: true, run: () => removeAll(picked) },
    { label: `Archive ${num(picked.length)} folders`, hint: 'Kept, out of sight', run: () => { const ids = picked; setPicked([]); chime('tuck'); void Promise.all(ids.map((one) => folders.set(one, { archived: true }))).then(() => toast(`Archived ${num(ids.length)} folders: kept, out of sight`, () => void Promise.all(ids.map((one) => folders.set(one, { archived: false }))).then(() => chime('undo')))) } }
  ] : undefined)
  // Keys on the rows, as on every list: ⌘A picks them all, ⌫ deletes what is picked (or the row with the keys), Esc lets go.
  const keys = (event: React.KeyboardEvent): void => {
    if (typing()) return
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-folder-open]')?.dataset.folderOpen
    if (event.metaKey && event.key.toLowerCase() === 'a') return (event.preventDefault(), event.stopPropagation(), chime('tick'), setPicked(here.map((one) => one.id)))
    if ((event.key === 'Backspace' || event.key === 'Delete') && (picked.length || row)) return (event.preventDefault(), event.stopPropagation(), removeAll(picked.length ? picked : [row!]))
    if (event.key === 'Escape' && picked.length) return (event.preventDefault(), event.stopPropagation(), chime('off'), setPicked([]))
  }
  if (!here.length) return null
  return (
    <div data-folder-rows="" onKeyDown={keys} className="-mx-2 mb-2 flex flex-col">
      {level(here, true)}
    </div>
  )
}

/** A new page in Writing, kept in this folder, opened: the folder's "+" (Notion's "Add a page inside"). */
async function addPageIn(folder: Folder, open: (type: string, id: string, folder?: string) => void): Promise<void> {
  const id = await haligtree.newArticle()
  const was = await folders.file([{ type: 'article', id }], folder.id)
  chime('promote')
  // Opened in the folder's own page, where it is listed (Writing's top lists only the pages in no folder).
  open('article', id, folder.id)
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
  // Writing's kinds: a task kept in a folder stays in Tasks, not here.
  // Put away by Start fresh is still kept here (out of the Feed, Home and Review, never out of its folder), and a folder
  // with nothing in it shows nothing under it: a bare "Nothing in it yet" with no icon read as one more thing (24 Nov).
  const shown = things.filter((one) => one.type !== 'task')
  if (!shown.length) return null
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
      !!from && { label: `Take out of ${from}`, hint: one.type === 'capture' ? 'Back to the Inbox' : one.type === 'task' ? 'Stays in Tasks' : 'Back to the top of Writing', run: () => void keepIn([{ type: one.type, id: one.id }], null) }
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
      className="group/more flex w-full min-w-0 items-center gap-2 rounded-md py-1 pr-2 pl-2 text-muted-foreground hover:text-foreground">
      {/* Its own sign where the rows above have theirs, so it never reads as a row with its icon missing. */}
      <span className="flex w-4 shrink-0 items-center justify-center"><ArrowRight aria-hidden className="size-3.5 text-muted-foreground transition-transform duration-150 group-hover/more:translate-x-0.5" /></span>
      <span className="flex-1 text-left">{children}</span>
    </button>
  )
}
