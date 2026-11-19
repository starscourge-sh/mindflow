import { useState } from 'react'
import { ChevronRight, CircleCheck, FileText, FolderPlus, Gem, HelpCircle, StickyNote } from 'lucide-react'
import { Island, Page } from './ui'
import { Button } from '@/components/ui/button'
import { GroupIcon } from './kept-groups'
import { RowMenu } from './row-menu'
import { Branches } from './branches'
import { ListSearch } from './note-list'
import { chime } from '@/lib/sound'
import { useLive } from '@/lib/haligtree'
import { askFolder, folders, keepIn, pathOf, useFolders, type Folder, type FolderItem, type FolderKind } from '@/lib/folders'
import { deepCount, folderMenu, newFolderHere } from './side-folder-section'
import { age, num, plural } from '../../../../main/dates'

/** Each kind in a folder, writing first (order-implies-purpose): its island's name and its icon. */
const KINDS: { types: FolderKind[]; one: string; many: string; icon: typeof FileText }[] = [
  { types: ['article'], one: 'page', many: 'pages', icon: FileText },
  { types: ['capture'], one: 'note', many: 'notes', icon: StickyNote },
  { types: ['nugget', 'question'], one: 'gem', many: 'gems', icon: Gem },
  { types: ['task'], one: 'task', many: 'tasks', icon: CircleCheck }
]
const iconOf = (type: FolderKind): typeof FileText => (type === 'question' ? HelpCircle : KINDS.find((one) => one.types.includes(type))?.icon ?? FileText)

/**
 * Folders as a page: every folder (`focus` empty), one folder's contents (its id), or the pages and gems in no folder
 * ('unfiled'). A folder shows only what is inside it (folders isolate): the folders in it first, then one island per
 * kind, writing first. What is archived stays in its folder, under "Show archived (N)".
 */
export function FoldersView({ focus, onOpen, onPlace }: { focus?: string; onOpen: (type: string, id: string) => void; onPlace: (id: string | null) => void }): React.JSX.Element {
  const all = useFolders()
  if (!focus || focus === 'all') return <AllFolders all={all} onPlace={onPlace} />
  return <OneFolder key={focus} id={focus} all={all} onOpen={onOpen} onPlace={onPlace} />
}

function OneFolder({ id, all, onOpen, onPlace }: { id: string; all: Folder[]; onOpen: (type: string, id: string) => void; onPlace: (id: string | null) => void }): React.JSX.Element {
  const items = useLive(() => folders.items(id), null as FolderItem[] | null, [id], undefined, `folders:items:${id}`)
  const [archived, setArchived] = useState(false)
  const unfiled = id === 'unfiled'
  const folder = all.find((one) => one.id === id)
  const path = unfiled ? [] : pathOf(all, id)
  const inside = unfiled ? [] : all.filter((one) => one.parent === id && !one.archived)
  const name = unfiled ? 'Not in a folder' : folder?.name ?? 'Folder'
  const shown = (items ?? []).filter((one) => !one.archived)
  const hidden = (items ?? []).filter((one) => one.archived)
  const islands = KINDS.map((kind) => ({ kind, rows: shown.filter((one) => kind.types.includes(one.type)) })).filter((one) => one.rows.length)
  // The one fact, on its own line: what it holds, every kind counted.
  const fact = unfiled
    ? `${plural(shown.length, 'page or gem', 'pages and gems')} in no folder.`
    : !shown.length && !inside.length ? `Nothing in ${name} yet.`
    : `${name} holds ${num(shown.length)}${islands.length ? `: ${islands.map(({ kind, rows }) => plural(rows.length, kind.one, kind.many)).join(', ')}` : ''}${inside.length ? `${shown.length ? ', and' : ' things, and'} ${num(inside.length)} ${inside.length === 1 ? 'folder' : 'folders'}` : ''}.`
  const row = (one: FolderItem): React.JSX.Element => {
    const Icon = iconOf(one.type)
    return (
      <RowMenu key={one.id} items={[
        { label: 'Open', run: () => onOpen(one.type, one.id) },
        { label: 'Keep in folder…', keys: '⇧⌘M', run: () => askFolder([{ type: one.type, id: one.id }]) },
        !unfiled && { label: `Take out of ${name}`, hint: one.type === 'capture' ? 'Back to the Inbox' : one.type === 'task' ? 'Stays in Tasks' : one.type === 'article' ? 'Stays in Writing' : 'Stays in Gems', run: () => void keepIn([{ type: one.type, id: one.id }], null) }
      ]}>
        <button type="button" data-folder-item={one.id} data-type={one.type} onClick={() => onOpen(one.type, one.id)}
          className="flex w-full min-w-0 cursor-pointer items-center gap-2.5 px-3 py-2 text-left hover:bg-accent/60">
          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="private-text min-w-0 flex-1 truncate">{one.title.trim() || (one.type === 'article' ? 'Untitled' : 'New note')}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{age(one.at)}</span>
        </button>
      </RowMenu>
    )
  }
  return (
    <Page title={name} waiting={items === null}
      lead={
        <nav aria-label="Where this folder is" data-folder-path="" className="flex min-w-0 items-center gap-1 text-control text-muted-foreground">
          <button type="button" onClick={() => onPlace(null)} className="cursor-pointer rounded-md px-1.5 py-0.5 hover:bg-accent hover:text-foreground">Folders</button>
          {path.slice(0, -1).map((one) => (
            <span key={one.id} className="flex min-w-0 items-center gap-1"><ChevronRight className="size-3 shrink-0" /><button type="button" onClick={() => onPlace(one.id)} className="cursor-pointer truncate rounded-md px-1.5 py-0.5 hover:bg-accent hover:text-foreground">{one.name}</button></span>
          ))}
        </nav>
      }
      actions={!unfiled && (path.length < 6) ? (
        <Button variant="ghost" data-folder-new-inside="" onClick={() => newFolderHere(id)}><FolderPlus className="size-3.5" /> New folder</Button>
      ) : undefined}>
      <p data-folder-fact="" className="mt-1 mb-4 px-1 text-[1.0625rem] leading-snug text-foreground">{fact}</p>
      {!unfiled && !shown.length && !inside.length && (
        <p className="px-1 text-body text-muted-foreground">Drag anything onto {name} in the sidebar, or choose “Keep in folder…” on a note.</p>
      )}
      {inside.length > 0 && (
        <Island title={`Folders · ${num(inside.length)}`}>
          {inside.map((one) => (
            <RowMenu key={one.id} items={() => folderMenu(one, all, () => onPlace(one.id), () => onPlace(one.id))}>
              <button type="button" data-folder-open={one.id} data-keep-drop={one.id} data-folder-name={one.name} onClick={() => (chime('page'), onPlace(one.id))}
                className="flex w-full min-w-0 cursor-pointer items-center gap-2.5 px-3 py-2 text-left hover:bg-accent/60">
                <GroupIcon icon={one.icon} color={one.color} className="size-3.5" />
                <span className="min-w-0 flex-1 truncate">{one.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{num(deepCount(all, one.id))}</span>
              </button>
            </RowMenu>
          ))}
        </Island>
      )}
      {islands.map(({ kind, rows }) => (
        <Island key={kind.many} title={`${kind.many[0].toUpperCase()}${kind.many.slice(1)} · ${num(rows.length)}`}>{rows.slice(0, 500).map(row)}</Island>
      ))}
      {hidden.length > 0 && (
        <div className="mt-6">
          <button type="button" data-folder-archived="" aria-expanded={archived} onClick={() => (chime(archived ? 'fold' : 'slide'), setArchived(!archived))}
            className="flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-control text-muted-foreground hover:text-foreground">
            <ChevronRight className={`size-3 transition-transform duration-80 ${archived ? 'rotate-90' : ''}`} />
            {archived ? 'Hide archived' : `Show archived (${num(hidden.length)})`}
          </button>
          {archived && <Island>{hidden.map(row)}</Island>}
        </div>
      )}
    </Page>
  )
}

/** Every folder, as a tree that folds, or found by its name as you type: 1,000 of them read as fast as 10. */
function AllFolders({ all, onPlace }: { all: Folder[]; onPlace: (id: string | null) => void }): React.JSX.Element {
  const [typed, setTyped] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [showArchived, setShowArchived] = useState(false)
  const live = all.filter((one) => showArchived || !one.archived)
  const archivedN = all.filter((one) => one.archived).length
  const words = typed.trim().toLowerCase()
  const found = words ? live.filter((one) => one.name.toLowerCase().includes(words)).slice(0, 200) : []
  const line = (one: Folder, _depth: number, path?: string): React.JSX.Element => {
    const kids = live.filter((kid) => kid.parent === one.id)
    const unfolded = open.has(one.id)
    return (
      <RowMenu key={one.id} items={() => folderMenu(one, all, () => onPlace(one.id), () => onPlace(one.id))}>
        <div className="flex items-center">
          {!path && kids.length > 0 ? (
            <button type="button" aria-label={unfolded ? `Fold ${one.name}` : `Unfold ${one.name}`} aria-expanded={unfolded} onClick={() => (chime(unfolded ? 'fold' : 'slide'), setOpen((was) => { const next = new Set(was); if (unfolded) next.delete(one.id); else next.add(one.id); return next }))}
              className="ml-1 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
              <ChevronRight className={`size-3.5 transition-transform duration-80 ${unfolded ? 'rotate-90' : ''}`} />
            </button>
          ) : <span className="ml-1 size-5 shrink-0" />}
          <button type="button" data-all-folder={one.id} data-keep-drop={one.id} data-folder-name={one.name} onClick={() => (chime('page'), onPlace(one.id))}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-accent/60">
            <GroupIcon icon={one.icon} color={one.color} className="size-3.5" />
            <span className={`min-w-0 truncate ${one.archived ? 'text-muted-foreground' : ''}`}>{one.name}</span>
            {path && <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{path}</span>}
            {one.starred ? <span className="sr-only">starred</span> : null}
            <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{num(deepCount(all, one.id))}</span>
          </button>
        </div>
      </RowMenu>
    )
  }
  // Each level hung off a trunk under its folder, as the sidebar's are (children look like children).
  const tree = (parent: string | null): React.JSX.Element[] =>
    live.filter((one) => (one.parent ?? null) === parent).flatMap((one) => [line(one, 0), ...(open.has(one.id) ? [<div key={`${one.id}:in`} data-no-twig=""><Branches current={-1} className="ml-6 flex flex-col">{tree(one.id)}</Branches></div>] : [])])
  return (
    <Page title="Folders" count={live.length} unit={['folder', 'folders']}
      // The lists' own search field (note-list.tsx `ListSearch`); ↵ opens the first folder found.
      search={<span data-find-folder="" className="contents"><ListSearch value={typed} onChange={setTyped} onDone={() => found[0] && onPlace(found[0].id)} placeholder="Find a folder" /></span>}
      actions={<Button variant="ghost" data-folders-new-page="" onClick={() => newFolderHere(null)}><FolderPlus className="size-3.5" /> New folder</Button>}>
      <p className="mt-1 mb-4 px-1 text-[1.0625rem] leading-snug text-foreground">
        {all.length ? 'Where things live. A folder holds any kind: pages, notes, gems and tasks.' : 'Folders hold anything you keep. ⌃⌘N makes one.'}
      </p>
      {all.length > 0 && (
        <Island>
          {words ? (found.length ? found.map((one) => line(one, 0, pathOf(all, one.parent).map((up) => up.name).join(' / '))) : <p className="px-3 py-2 text-body text-muted-foreground">No folder is named like “{typed.trim()}”.</p>) : <div className="flex flex-col py-1">{tree(null)}</div>}
        </Island>
      )}
      {archivedN > 0 && (
        <button type="button" onClick={() => (chime(showArchived ? 'fold' : 'slide'), setShowArchived(!showArchived))} className="mt-4 flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-control text-muted-foreground hover:text-foreground">
          <ChevronRight className={`size-3 transition-transform duration-80 ${showArchived ? 'rotate-90' : ''}`} />{showArchived ? 'Hide archived folders' : `Show archived (${num(archivedN)})`}
        </button>
      )}
    </Page>
  )
}
