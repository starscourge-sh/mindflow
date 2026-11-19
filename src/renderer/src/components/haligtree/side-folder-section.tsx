import { useEffect, useState } from 'react'
import { ArrowRight, ChevronRight, Plus } from 'lucide-react'
import { Branches } from './branches'
import { NameInPlace } from './name-in-place'
import { GroupIcon } from './kept-groups'
import { Unfold, Weighted } from './glide'
import { RowMenu, type RowItem } from './row-menu'
import { Count, Tip, quietly, refuse, sayNow, toast, typing } from './ui'
import { SortableList, SortableRow } from './sortable'
import { num } from '../../../../main/dates'
import { chime } from '@/lib/sound'
import { FOLDER_DEPTH, folders, heldIn, pathOf, useFolders, type Folder } from '@/lib/folders'

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
 * "All folders…", the page with every folder. A row takes anything dropped on it (split-drop.tsx `keepDrop`).
 */
export function FoldersSection({ here, counted, unfiled, onOpen, style }: { here: FolderPlace | undefined; counted: boolean; /** How many pages and gems are in no folder: read by the sidebar, which waits for it. */ unfiled: number; onOpen: (place: FolderPlace) => void; style?: React.CSSProperties }): React.JSX.Element {
  const all = useFolders()
  const [open, setOpen] = useState(() => localStorage.getItem('sidebar:folders') !== 'shut')
  const fold = (next: boolean): void => (chime(next ? 'slide' : 'fold'), setOpen(next), localStorage.setItem('sidebar:folders', next ? 'open' : 'shut'))
  const [naming, setNaming] = useState<string | null>(null)
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
  const path = typeof here === 'string' && here !== 'unfiled' ? pathOf(live, here).map((one) => one.id) : []
  const starredAbove = (one: Folder): boolean => pathOf(live, one.parent).some((up) => up.starred)
  const tops = live.filter((one) => (one.starred && !starredAbove(one)) || (one.id === here && !one.starred && !path.slice(0, -1).some((up) => live.find((f) => f.id === up)?.starred)))
  const inside = (id: string): Folder[] => live.filter((one) => one.parent === id)
  const lit = (list: Folder[]): number => list.findIndex((one) => one.id === here || path.includes(one.id))
  const row = (one: Folder, depth: number): React.JSX.Element[] => {
    // A starred folder shows the folders right inside it (and the way down to the one you are in), never deeper.
    const kids = depth === 0 ? inside(one.id) : inside(one.id).filter((kid) => path.includes(kid.id))
    return [
      <FolderRow key={one.id} folder={one} all={live} here={here === one.id} n={counted ? deepCount(live, one.id) : null} naming={naming === one.id} onNamed={() => setNaming(null)} onRename={() => setNaming(one.id)} onOpen={() => onOpen(one.id)} />,
      ...(kids.length ? [<div key={`${one.id}:in`} data-no-twig=""><Branches current={lit(kids)} className="ml-5 flex flex-col gap-px">{kids.flatMap((kid) => row(kid, depth + 1))}</Branches></div>] : [])
    ]
  }
  // Many starred: the first 12, and the one you are in, the rest a press away, so they never push the sidebar long.
  const [every, setEvery] = useState(false)
  const starred = tops.filter((one) => ids.has(one.id))
  const rows = every || starred.length <= SHOWN ? starred : starred.filter((one, at) => at < SHOWN || one.id === here || path.includes(one.id))
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
          <button type="button" data-side-row data-side-section-handle="folders" aria-expanded={open} onClick={() => fold(!open)}
            className={`absolute inset-0 flex items-center gap-1 rounded-md px-2 text-left transition-colors duration-80 group-hover/head:text-foreground ${here === null ? 'text-foreground' : 'text-muted-foreground'}`}>
            Folders
            <ChevronRight className={`size-3 transition-transform duration-80 ${open ? 'rotate-90' : ''}`} />
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
        <Branches rows=":scope > *" current={here === 'unfiled' ? rows.length + (starred.length > SHOWN ? 1 : 0) : here === null ? rows.length + 1 + (starred.length > SHOWN ? 1 : 0) : lit(rows)} className="ml-5 flex flex-col gap-px">
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
          <button type="button" data-side-row data-side-unfiled="" aria-current={here === 'unfiled' ? 'page' : undefined} onClick={() => (chime('page'), onOpen('unfiled'))}
            className={`flex w-full min-w-0 items-baseline gap-2 rounded-md py-1 pr-2 pl-2 ${here === 'unfiled' ? 'text-foreground' : 'text-muted-foreground'}`}>
            <span className="size-4 shrink-0" />
            <Weighted on={here === 'unfiled'} className="flex-1 text-left">Not in a folder</Weighted>
            {counted && <Count n={unfiled} className="text-xs text-muted-foreground" />}
          </button>
          <button type="button" data-side-row data-side-all-folders="" aria-current={here === null ? 'page' : undefined} onClick={() => (chime('page'), onOpen(null))}
            className={`flex w-full min-w-0 items-baseline gap-2 rounded-md py-1 pr-2 pl-2 ${here === null ? 'text-foreground' : 'text-muted-foreground'}`}>
            <span className="size-4 shrink-0" />
            <Weighted on={here === null} className="flex-1 text-left">All folders…</Weighted>
            {counted && live.length > 0 && <Count n={live.length} className="text-xs text-muted-foreground" />}
          </button>
        </Branches>
      </Unfold>
    </div>
  )
}

/** One folder's lines in a menu, the same in the sidebar and on the All folders page. */
export function folderMenu(folder: Folder, all: Folder[], onOpen: () => void, onRename: () => void): RowItem[] {
  const level = pathOf(all, folder.id).length
  return [
    { label: 'Open', run: onOpen },
    level < FOLDER_DEPTH && { label: 'New folder inside', run: () => newFolderHere(folder.id) },
    'separator',
    { label: 'Rename…', run: onRename },
    { label: folder.starred ? 'Remove from the sidebar' : 'Show in the sidebar', hint: folder.starred ? 'Unstar it' : 'Star it', run: () => (chime(folder.starred ? 'off' : 'on'), sayNow(folders.set(folder.id, { starred: !folder.starred }), folder.starred ? `Took ${folder.name} off the sidebar` : `Starred ${folder.name}`, () => void folders.set(folder.id, { starred: !!folder.starred }))) },
    folder.parent ? { label: 'Move to the top', run: () => void folders.nest(folder.id, null).then(() => (chime('gather'), toast(`Moved ${folder.name} to the top`, () => void folders.nest(folder.id, folder.parent)))) } : null,
    'separator',
    { label: folder.archived ? 'Unarchive folder' : 'Archive folder', hint: folder.archived ? undefined : 'Kept, out of sight', run: () => (chime('tuck'), sayNow(folders.set(folder.id, { archived: !folder.archived }), folder.archived ? `Unarchived ${folder.name}` : `Archived ${folder.name}: kept, out of sight`, () => void folders.set(folder.id, { archived: !!folder.archived }))) },
    { label: 'Delete folder, keep what’s in it', hint: 'It moves up a level', danger: true, run: () => void folders.remove(folder.id).then((was) => was && (chime('separate'), toast(`Deleted ${folder.name}: what it held stays`, () => void folders.restore(was)))) }
  ]
}

function FolderRow({ folder, all, here, n, naming, onNamed, onRename, onOpen }: { folder: Folder; all: Folder[]; here: boolean; n: number | null; naming: boolean; onNamed: () => void; onRename: () => void; onOpen: () => void }): React.JSX.Element {
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
  return (
    <RowMenu items={() => folderMenu(folder, all, onOpen, onRename)}>
      <button type="button" data-side-row data-side-folder={folder.id} data-keep-drop={folder.id} data-folder-name={folder.name} title={folder.name} aria-current={here ? 'page' : undefined}
        onClick={() => (chime('page'), onOpen())}
        className={`flex w-full min-w-0 items-baseline gap-2 rounded-md py-1 pr-2 pl-2 ${here ? 'text-foreground' : 'text-(--mf-muted-strong)'} data-[queue-hot]:bg-[color-mix(in_oklab,var(--tt-color-text-blue)_16%,transparent)] data-[queue-hot]:text-foreground data-[queue-hot]:ring-1 data-[queue-hot]:ring-[color-mix(in_oklab,var(--tt-color-text-blue)_45%,transparent)]`}>
        <span className="flex h-[1lh] w-4 shrink-0 items-center justify-center"><GroupIcon icon={folder.icon} color={folder.color} className="size-3.5" /></span>
        <Weighted on={here} className="flex-1 text-left *:line-clamp-2 *:!whitespace-normal *:[overflow-wrap:anywhere]">{folder.name}</Weighted>
        {n !== null && <Count n={n} className="text-xs text-muted-foreground" />}
      </button>
    </RowMenu>
  )
}
