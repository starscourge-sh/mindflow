import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/react'
import { HaligtreeEditor } from './haligtree-editor'
import { saveImage } from '@/extensions/image-drop'
import { quietly, sayNow } from './ui'
import { ChevronRight, FolderPlus, ImagePlus, PenLine, Text } from 'lucide-react'
import { FolderGems } from './folder-gems'
import { Empty, FoldItem, MenuRows, Island, Page } from './ui'
import { ItemsView } from './items-view'
import { CapturesView } from './captures-view'
import { TasksView } from './tasks-view'
import { TabChips } from './tab-chips'
import { Button } from '@/components/ui/button'
import { FolderMark, GroupIcon, GroupTile } from './kept-groups'
import { ROW_PAD, ROW_SHAPE } from './row-shape'
import { cn } from '@/lib/cn'
import { RowMenu } from './row-menu'
import { Branches } from './branches'
import { ListSearch } from './note-list'
import { chime } from '@/lib/sound'
import { useLive } from '@/lib/haligtree'
import { folders, pathOf, useFolders, writeFrom, type Folder, type FolderItem, type FolderKind } from '@/lib/folders'
import { FolderRows, folderMenu, heldSaid, newFolderHere } from './side-folder-section'
import { calendarInk, events, useCalendars } from '@/lib/events'
import { clock } from '@/lib/clock'
import { dayjs, num, plural } from '../../../../main/dates'


/**
 * Folders as a page: every folder (`focus` empty), one folder's contents (its id), or the pages and gems in no folder
 * ('unfiled'). A folder shows only what is inside it (folders isolate): the folders in it first, then one island per
 * kind, writing first. What is archived stays in its folder, under "Show archived (N)".
 */
export function FoldersView({ focus, note, tab, onTab, onOpen, onPlace }: { focus?: string; /** The page open beside the folder's list (the step's focus, as Writing keeps it). */ note?: string; tab?: string; onTab: (tab: string) => void; /** With `folder`: opened in that folder's page (a subfolder's own row unfolded here). */ onOpen: (type: string, id: string, folder?: string) => void; onPlace: (id: string | null) => void }): React.JSX.Element {
  const all = useFolders()
  if (!focus || focus === 'all') return <AllFolders all={all} onPlace={onPlace} />
  return <OneFolder key={focus} id={focus} note={note} all={all} tab={tab} onTab={onTab} onOpen={onOpen} onPlace={onPlace} />
}

/** A folder's kinds, writing first (order-implies-purpose): each drawn by the list that kind has everywhere else. */
type KindTab = 'pages' | 'gems' | 'questions' | 'notes' | 'tasks'
const KIND_TABS: { id: KindTab; label: string; types: FolderKind[] }[] = [
  { id: 'pages', label: 'Pages', types: ['article'] },
  { id: 'notes', label: 'Notes', types: ['capture'] },
  { id: 'gems', label: 'Gems', types: ['nugget'] },
  { id: 'questions', label: 'Questions', types: ['question'] },
  { id: 'tasks', label: 'Tasks', types: ['task'] }
]
/** The tab of a folder's page that holds a kind of thing ('article' is under Pages): for opening one there. */
export const tabOfKind = (type: string): KindTab | undefined => KIND_TABS.find((kind) => kind.types.includes(type as FolderKind))?.id

/**
 * One folder's page (or "Not in a folder"): Writing's own list, Gems', the Inbox's or Tasks', each the same component
 * with its rows, pictures, groups, sort, display, keys, picking and the note opened beside it, holding only what this
 * folder keeps. A switch at the line's left picks the kind (one shown at a time, as Tasks' tabs are); over the list,
 * where the folder is, its one fact and the folders inside it. Never a list of its own (the user, 19 Nov: "what a
 * downgrade", beside Writing).
 */
function OneFolder({ id, note, all, tab, onTab, onOpen, onPlace }: { id: string; note?: string; all: Folder[]; tab?: string; onTab: (tab: string) => void; onOpen: (type: string, id: string, folder?: string) => void; onPlace: (id: string | null) => void }): React.JSX.Element {
  const items = useLive(() => folders.items(id), null as FolderItem[] | null, [id], undefined, `folders:items:${id}`)
  const ofCaptures = useLive(() => folders.of('captures'), {} as Record<string, string>, [], undefined, 'folders:of:captures')
  const ofTasks = useLive(() => folders.of('tasks'), {} as Record<string, string>, [], undefined, 'folders:of:tasks')
  useCalendars()
  const coming = useLive(() => (id === 'unfiled' ? Promise.resolve(null) : events.ofFolder(id)), null as Awaited<ReturnType<typeof events.ofFolder>> | null, [id])
  const unfiled = id === 'unfiled'
  const folder = all.find((one) => one.id === id)
  const path = unfiled ? [] : pathOf(all, id)
  const inside = unfiled ? [] : all.filter((one) => one.parent === id && !one.archived)
  const name = unfiled ? 'Not in a folder' : folder?.name ?? 'Folder'
  const shown = (items ?? []).filter((one) => !one.archived)
  const counted = KIND_TABS.map((kind) => ({ ...kind, n: shown.filter((one) => kind.types.includes(one.type)).length }))
  // Only the kinds it holds are tabs ("Pages 0" offered nothing); holding nothing, its list is Pages', where "New page" is.
  const islands = counted.filter((one) => one.n)
  const tabs = islands.length ? islands : counted.filter((one) => one.id === 'pages')
  // The note open beside it says which kind is on show, when no tab was asked for: a gem opened here is among the gems.
  const noteKind = tabOfKind(shown.find((one) => one.id === note)?.type ?? '')
  const on = (tabs.find((one) => one.id === tab) ?? tabs.find((one) => one.id === noteKind) ?? tabs[0]).id
  // The one fact, on its own line: what it holds, every kind counted, the total said only when it adds kinds up.
  const kindsSaid = islands.map((one) => plural(one.n, one.label.toLowerCase().replace(/s$/, ''), one.label.toLowerCase())).join(', ')
  const folderSaid = inside.length ? plural(inside.length, 'folder') : ''
  const fact = unfiled
    ? `${plural(shown.length, 'page or gem', 'pages and gems')} in no folder.`
    : !shown.length && !inside.length ? `Nothing in ${name} yet.`
    : islands.length > 1 ? `${name} holds ${num(shown.length)}: ${kindsSaid}${folderSaid ? `, and ${folderSaid}` : ''}.`
    : `${name} holds ${[kindsSaid, folderSaid].filter(Boolean).join(' and ')}.`
  const kinds = tabs.length > 1 ? (
    <div data-list-tabs data-folder-kinds="" className="flex shrink-0" style={{ marginLeft: 'calc(var(--list-edge) - var(--list-ink) - 3px)' }}>
      <TabChips name="folder-kinds" tabs={tabs.map((one) => ({ value: one.id, label: one.label, count: one.n }))} value={on} onChange={(next) => onTab(next)} />
    </div>
  ) : undefined
  const said = (
    <div data-folder-head="" className="mb-3">
      {/* Over its name, its cover, as a Notion page's. */}
      {folder && <FolderFront key={`${folder.id}:cover`} folder={folder} part="cover" />}
      <nav aria-label="Where this folder is" data-folder-path="" className="-ml-1.5 flex min-w-0 flex-wrap items-center gap-1 text-control text-muted-foreground">
        <button type="button" onClick={() => onPlace(null)} className="cursor-pointer rounded-md px-1.5 py-0.5 hover:bg-accent hover:text-foreground">Folders</button>
        {path.slice(0, -1).map((one) => (
          <span key={one.id} className="flex min-w-0 items-center gap-1"><ChevronRight className="size-3 shrink-0" /><button type="button" onClick={() => onPlace(one.id)} className="cursor-pointer truncate rounded-md px-1.5 py-0.5 hover:bg-accent hover:text-foreground">{one.name}</button></span>
        ))}
        <ChevronRight className="size-3 shrink-0" />
        <h1 data-folder-title="" className="flex min-w-0 items-center gap-1.5 truncate px-1 text-control font-medium text-foreground">
          {folder && <GroupIcon icon={folder.icon} color={folder.color} className="size-3.5" />}{name}
        </h1>
        {/* A page in Writing with what this folder keeps beside it to quote from; the folder stays a folder. */}
        {folder && (
          <button type="button" data-folder-write-from="" onClick={() => void writeFrom(folder)} className="ml-auto flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-accent hover:text-foreground"><PenLine className="size-3.5" />Write from this folder</button>
        )}
        {!unfiled && path.length < 6 && (
          <button type="button" data-folder-new-inside="" onClick={() => newFolderHere(id)} className={`${folder ? '' : 'ml-auto '}flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-accent hover:text-foreground`}><FolderPlus className="size-3.5" />New folder</button>
        )}
      </nav>
      {/* Under its name, its words and link cards, as a Notion page's sit under its title. */}
      {folder && <FolderFront key={`${folder.id}:words`} folder={folder} part="words" />}
      {/* Only when there is nothing yet: a folder that holds things says so in its list header ("2 pages") and its tabs;
          a sentence repeating it read as slapped on (the user, 21 Nov). */}
      {!shown.length && !inside.length && !unfiled && <p data-folder-fact="" className="mt-2 text-control text-muted-foreground">{fact}</p>}
      {/* Lines in its notes that could be gems: one quiet line, once (folder-gems.tsx). */}
      {folder && <FolderGems key={folder.id} folder={folder} />}
      {!unfiled && !shown.length && !inside.length && <p className="mt-1 text-body text-muted-foreground">Drag anything onto {name} in the sidebar, or choose “Keep in folder…” on a note.</p>}
      {/* The calendars that keep their notes here: their next four weeks, each opening on the Calendar. */}
      {!!coming?.calendars.length && (
        <Island title={`Coming up on ${coming.calendars.map((one) => one.name).join(', ')} · ${num(coming.events.length)}`}>
          {coming.events.length ? coming.events.map((one) => (
            <button key={one.key} type="button" data-folder-event={one.key} onClick={() => (chime('open'), onOpen('event', one.key))}
              className="flex w-full min-w-0 cursor-pointer items-center gap-2.5 px-3 py-2 text-left hover:bg-accent/60">
              <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: calendarInk(coming.calendars.find((cal) => cal.id === one.calendarId)) }} />
              <span className="min-w-0 flex-1 truncate">{one.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{dayjs(one.start).format('ddd D MMM')}{one.allDay ? '' : ` ${clock(one.start)}`}</span>
            </button>
          )) : <p className="px-3 py-2 text-body text-muted-foreground">Nothing on {coming.calendars.length === 1 ? 'it' : 'them'} in the next four weeks.</p>}
        </Island>
      )}
      {/* The folders inside it, as the first rows of its list: the sidebar tree's own rows, at the list's size. */}
      {!unfiled && <div className="mt-3"><FolderRows parent={id} onPlace={(one) => onPlace(one)} onOpenItem={onOpen} /></div>}
    </div>
  )
  const box = { id, name }
  // Keyed by folder and kind: each its own list, its cursor and its open note, as switching Writing to Gems is.
  if (on === 'notes') return <CapturesView key={`${id}:notes`} title={name} keep={(one) => ofCaptures[one.id] === id && one.status !== 'discarded'} focus={note} lead={kinds} said={said} onOpen={onOpen} />
  if (on === 'tasks') return <TasksView key={`${id}:tasks`} mode="alltasks" keep={(one) => ofTasks[one.id] === id} focus={note} lead={kinds} said={said} onOpen={onOpen} />
  return <ItemsView key={`${id}:${on}`} tier={on === 'gems' ? 'nugget' : 'article'} only={on === 'questions' ? 'questions' : undefined} inFolder={box} focus={note} lead={kinds} said={said} onOpen={onOpen} />
}

/**
 * A folder's front, as the top of a Notion page: a cover picture and a few words with link cards, both optional,
 * nothing at all until asked for, and then only a quiet "Add a cover · Add words" while pointed at. The words are a
 * page's own editor (link cards, pictures, every way a page is written), kept with the folder as it is left.
 */
function FolderFront({ folder, part }: { folder: Folder; /** The cover goes over the folder's name, its words under it (Notion's page). */ part: 'cover' | 'words' }): React.JSX.Element {
  const [writing, setWriting] = useState(false)
  const doc = useMemo(() => { try { return folder.front ? (JSON.parse(folder.front) as JSONContent) : null } catch { return null } }, [folder.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const latest = useRef<JSONContent | null>(doc)
  // Read off the editor itself as it is left: a change it has not yet told (a dev build's slower editor) is kept too.
  const editor = useRef<{ state: { doc: { toJSON: () => JSONContent } } } | null>(null)
  const save = (): void => {
    // The words' own part only: the cover's part never holds them (it would put back what it read at first).
    if (part !== 'words') return
    const next = editor.current ? editor.current.state.doc.toJSON() : latest.current
    const words = next ? JSON.stringify(next) : null
    if (words === (folder.front ?? null)) return
    const was = folder.front
    void folders.set(folder.id, { front: words }).then(() => quietly(() => void folders.set(folder.id, { front: was })))
  }
  // Kept as it is left: the words leaving the field, or the page left with them in it.
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => () => saveRef.current(), [])
  const cover = (src: string | null): void => {
    const was = folder.cover
    chime(src ? 'promote' : 'separate')
    sayNow(folders.set(folder.id, { cover: src }), src ? `${folder.name} has a cover` : `Took ${folder.name}'s cover away`, () => void folders.set(folder.id, { cover: was }))
  }
  const words = !!doc || writing
  const upload = (label: string): React.JSX.Element => (
    // The folder icon's own upload (kept-groups.tsx `IconChoice`): the Mac's file sheet, the picture kept as a page's is.
    <label data-folder-cover-add="" className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-accent hover:text-foreground">
      <ImagePlus aria-hidden className="size-3.5" />{label}
      <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif" className="sr-only"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) void saveImage(file).then((src) => src && cover(src), () => chime('nope'))
        }} />
    </label>
  )
  return (
    <div data-folder-front={part} className="group/front">
      {part === 'cover' && folder.cover && (
        <div className="relative mb-3">
          <img data-folder-cover="" src={folder.cover} alt="" draggable={false} className="h-36 w-full rounded-xl object-cover" />
          <span className="absolute right-2 bottom-2 flex gap-1 rounded-lg bg-popover p-0.5 text-control text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover/front:opacity-100 focus-within:opacity-100">
            {upload('Change cover')}
            <button type="button" onClick={() => cover(null)} className="cursor-pointer rounded-md px-1.5 py-0.5 hover:bg-accent hover:text-foreground">Remove</button>
          </span>
        </div>
      )}
      {((part === 'cover' && !folder.cover) || (part === 'words' && !words)) && (
        <div className="-ml-1.5 flex h-6 items-center gap-1 text-control text-muted-foreground opacity-0 transition-opacity group-hover/front:opacity-100 focus-within:opacity-100">
          {part === 'cover' && upload('Add a cover')}
          {part === 'words' && <button type="button" data-folder-words-add="" onClick={() => (chime('tap'), setWriting(true))} className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-accent hover:text-foreground"><Text aria-hidden className="size-3.5" />Add words</button>}
        </div>
      )}
      {part === 'words' && words && (
        <div data-folder-words="" onBlur={save} style={{ '--mf-padding': '0.25rem 0' } as React.CSSProperties}>
          <HaligtreeEditor defaultContent={doc ?? ''} toolbar={false} outline={false} search={false} lineNumbers={false} handles={false} autofocus={doc ? false : 'end'} placeholder="A few words about this folder, and links to keep with it"
            // Asked for by "Add words": the caret in it at once, as a new page's is (once ready, StrictMode's second editor too).
            onReady={(ready) => void ((editor.current = ready), !doc && ready.commands.focus('end'))}
            onChange={(next) => void (latest.current = next)} />
        </div>
      )}
    </div>
  )
}

/** Every folder, as a tree that folds, or found by its name as you type: 1,000 of them read as fast as 10. */
function AllFolders({ all, onPlace }: { all: Folder[]; onPlace: (id: string | null) => void }): React.JSX.Element {
  const [typed, setTyped] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [showArchived, setShowArchived] = useState(false)
  // What has no folder, counted, as the folders' own last row (the sidebar shows only folders, as Tags shows only tags).
  const unfiled = useLive(folders.unfiled, null as number | null, [], undefined, 'folders:unfiled')
  const live = all.filter((one) => showArchived || !one.archived)
  const archivedN = all.filter((one) => one.archived).length
  const words = typed.trim().toLowerCase()
  const found = words ? live.filter((one) => one.name.toLowerCase().includes(words)).slice(0, 200) : []
  // Writing's folder rows from before Folders (kept-groups.tsx `GroupTile`): the drawn folder with its icon in a page
  // thumbnail's box, the name on the titles' line, what it holds in words on the right ("41 notes", "4 pages, 2 gems").
  const line = (one: Folder, path?: string): React.JSX.Element => {
    const kids = live.filter((kid) => kid.parent === one.id)
    const unfolded = open.has(one.id)
    const folds = !path && kids.length > 0
    const said = heldSaid(all, one.id)
    return (
      <RowMenu key={one.id} items={() => folderMenu(one, all, () => onPlace(one.id), () => onPlace(one.id))}>
        <div className="group/fold relative">
          <button type="button" data-all-folder={one.id} data-keep-drop={one.id} data-folder-name={one.name} onClick={() => (chime('page'), onPlace(one.id))}
            className={cn(ROW_SHAPE, ROW_PAD, 'cursor-pointer hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent/60')}>
            {/* Pointed at, a folder that holds folders gives its picture's place to its fold, as the sidebar's rows do. */}
            <GroupTile group={one} empty={!said} className={folds ? 'transition-opacity duration-80 group-hover/fold:opacity-0' : undefined} />
            <span data-folder-row-name="" className={cn('min-w-0 truncate text-control font-medium', !path && 'flex-1', one.archived ? 'text-muted-foreground' : 'text-foreground')}>{one.name}</span>
            {path && <span className="min-w-0 flex-1 truncate text-meta text-muted-foreground">{path}</span>}
            {one.starred ? <span className="sr-only">starred</span> : null}
            {said && <span data-folder-held="" className="shrink-0 text-meta text-muted-foreground tabular-nums">{said}</span>}
          </button>
          {folds && (
            <button type="button" aria-label={unfolded ? `Fold ${one.name}` : `Unfold ${one.name}`} aria-expanded={unfolded} onClick={() => (chime(unfolded ? 'fold' : 'slide'), setOpen((was) => { const next = new Set(was); if (unfolded) next.delete(one.id); else next.add(one.id); return next }))}
              className="absolute top-1/2 left-[calc(var(--list-ink)-var(--list-edge))] flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[opacity,background-color] duration-80 group-hover/fold:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100">
              <ChevronRight className={`size-4 transition-transform duration-80 ${unfolded ? 'rotate-90' : ''}`} />
            </button>
          )}
        </div>
      </RowMenu>
    )
  }
  // Each level hung off a trunk under its folder, as the sidebar's are (children look like children).
  const tree = (parent: string | null): React.JSX.Element[] =>
    live.filter((one) => (one.parent ?? null) === parent).flatMap((one) => [line(one), ...(open.has(one.id) ? [<div key={`${one.id}:in`} data-no-twig=""><Branches className="ml-6 flex flex-col">{tree(one.id)}</Branches></div>] : [])])
  return (
    <Page title="Folders" count={live.length} unit={['folder', 'folders']}
      // The lists' own search field (note-list.tsx `ListSearch`); ↵ opens the first folder found.
      search={all.length ? <span data-find-folder="" className="contents"><ListSearch value={typed} onChange={setTyped} onDone={() => found[0] && onPlace(found[0].id)} placeholder="Find a folder" /></span> : undefined}
      actions={<><Button variant="ghost" data-folders-new-page="" onClick={() => newFolderHere(null)}><FolderPlus className="size-3.5" /> New folder</Button><MenuRows><FoldItem icon={FolderPlus} label="New folder" keys="⌃⌘N" onSelect={() => newFolderHere(null)} /></MenuRows></>}>
      {!all.length ? (
        // No folders yet: the app's own empty page, a folder drawn hollow over it, and the one thing to do.
        <Empty title="No folders yet" art={<FolderMark icon={null} color={null} empty className="h-11 w-14" />}
          action={<Button size="sm" data-folders-first="" onClick={() => newFolderHere(null)}><FolderPlus className="size-3.5" /> New folder</Button>}>
          A folder keeps pages, notes, gems and tasks together, whatever their kind. ⌃⌘N makes one anywhere.
        </Empty>
      ) : words ? (
        <div data-all-folders="" className="list-edge my-2 flex flex-col">
          {found.length ? found.map((one) => line(one, pathOf(all, one.parent).map((up) => up.name).join(' / '))) : <p className="list-ink py-2 text-body text-muted-foreground">No folder is named like “{typed.trim()}”.</p>}
        </div>
      ) : (
        <div data-all-folders="" className="list-edge my-2 flex flex-col">
          {tree(null)}
          {/* What has no folder, last, in the folders' own shape: a folder drawn hollow, with no icon on it. */}
          <button type="button" data-all-unfiled="" onClick={() => (chime('page'), onPlace('unfiled'))}
            className={cn(ROW_SHAPE, ROW_PAD, 'mt-1 cursor-pointer hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}>
            <GroupTile group={{ icon: null, color: null }} empty />
            <span data-folder-row-name="" className="min-w-0 flex-1 truncate text-control font-medium text-foreground">Not in a folder</span>
            {!!unfiled && <span data-folder-held="" className="shrink-0 text-meta text-muted-foreground tabular-nums">{plural(unfiled, 'page or gem', 'pages and gems')}</span>}
          </button>
        </div>
      )}
      {archivedN > 0 && (
        <button type="button" onClick={() => (chime(showArchived ? 'fold' : 'slide'), setShowArchived(!showArchived))} className="mt-4 flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-control text-muted-foreground hover:text-foreground">
          <ChevronRight className={`size-3 transition-transform duration-80 ${showArchived ? 'rotate-90' : ''}`} />{showArchived ? 'Hide archived folders' : `Show archived (${num(archivedN)})`}
        </button>
      )}
    </Page>
  )
}
