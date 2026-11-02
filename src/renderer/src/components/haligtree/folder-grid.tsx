// The motion idea (a folder whose notes float out of it on hover) is after React Bits' Folder Float
// (reactbits.dev, MIT + Commons Clause). Drawn here from scratch in Haligtree's own look: no code copied.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { groups, type NoteGroup } from '@/lib/groups'
import { chime } from '@/lib/sound'
import { still } from '@/lib/motion'
import { cn } from '@/lib/cn'
import type { Item } from '@/lib/haligtree'
import { GroupIcon, GroupMenu, IconChoice, change, type GroupView } from './kept-groups'
import { refuse, toast } from './ui'
import { num, plural } from '../../../../main/dates'

/** A folder at this level of the list: its notes (its subfolders' too) and its own subfolders. */
export type Shelved = { group: NoteGroup; items: Item[]; subs: NoteGroup[] }

/** Folders shown before "Show all": two rows at most widths, so the loose notes are never pushed far down. */
const FIRST = 12
/** At a phone's width (3 columns), two rows are 6. */
const FIRST_NARROW = 6
/** Titles that float out of a folder pointed at; past these, "and N more". */
const FLOAT = 4

const view = (one: Shelved): GroupView => ({ id: one.group.id, name: one.group.name, icon: one.group.icon, color: one.group.color, open: false, members: one.items.map((item) => item.id) })

/**
 * Writing's and Gems' folders as a grid of folders, Finder's way, over the list's loose notes: each a
 * folder drawn in the theme's ink (its own colour where it has one), its icon on the front, its name
 * and what it holds under it. Pointed at, the titles of its first four notes (its subfolders first)
 * float up out of it, the one preview it has; an empty one says so on its front and floats nothing.
 * A click opens it (its subfolders then show the same way inside); a note carried onto it goes in;
 * its right-click menu is the folder's own.
 */
export function FolderGrid({ list, folders, renaming, born, onRenaming, onOpen, onNewNote }: {
  list: 'article' | 'nugget'
  folders: Shelved[]
  renaming: string | null
  born: string | null
  onRenaming: (id: string | null) => void
  onOpen: (id: string) => void
  onNewNote: (id: string) => void
}): React.JSX.Element {
  const [all, setAll] = useState(false)
  // While the pointer is down (a note carried toward a folder), the grid keeps the columns it had: the page making room
  // as a drag begins narrowed it from 6 columns to 5, and the folder being aimed at jumped away from the pointer.
  const box = useRef<HTMLDivElement>(null)
  const [held, setHeld] = useState<number | null>(null)
  useEffect(() => {
    const down = (): void => { const grid = box.current; if (grid) setHeld(getComputedStyle(grid).gridTemplateColumns.split(' ').length) }
    const up = (): void => setHeld(null)
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    return () => (window.removeEventListener('pointerdown', down, true), window.removeEventListener('pointerup', up, true), window.removeEventListener('pointercancel', up, true))
  }, [])
  // The one being named stays in sight, however far down it is.
  const shown = all ? folders : folders.filter((one, at) => at < FIRST || one.group.id === renaming)
  return (
    <section data-folder-grid={list} aria-label="Folders" className="list-edge mt-4 mb-1">
      <div ref={box} className="grid gap-x-2 gap-y-3" style={{ gridTemplateColumns: held ? `repeat(${held}, minmax(0, 1fr))` : 'repeat(auto-fill, minmax(7.5rem, 1fr))' }}>
        {shown.map((one, at) => (
          <Folder key={one.group.id} narrowHidden={!all && at >= FIRST_NARROW && one.group.id !== renaming} one={one} list={list} renaming={renaming === one.group.id} born={born === one.group.id} onRenaming={(on) => onRenaming(on ? one.group.id : null)} onOpen={() => onOpen(one.group.id)} onNewNote={onNewNote} />
        ))}
      </div>
      {folders.length > FIRST_NARROW && (
        <button type="button" data-folders-more onClick={() => (chime(all ? 'fold' : 'slide'), setAll(!all))}
          className={cn('mt-1 cursor-pointer rounded-md px-2 py-1 text-control text-foreground/80 hover:bg-accent hover:text-foreground', folders.length <= FIRST && !all && 'sm:hidden')}>
          {all ? 'Show fewer folders' : `Show all ${num(folders.length)} folders`}
        </button>
      )}
    </section>
  )
}

function Folder({ one, list, renaming, born, onRenaming, onOpen, onNewNote, narrowHidden = false }: {
  one: Shelved
  /** Past the first two rows at a phone's width, until "Show all". */
  narrowHidden?: boolean
  list: 'article' | 'nugget'
  renaming: boolean
  born: boolean
  onRenaming: (on: boolean) => void
  onOpen: () => void
  onNewNote: (id: string) => void
}): React.JSX.Element {
  const { group, items, subs } = one
  const [picking, setPicking] = useState(false)
  const [gone, setGone] = useState(false)
  const notes = items.filter((item) => !item.archivedAt)
  const empty = !notes.length && !subs.length
  // What floats out: its subfolders first (drawn as folders), then its notes' titles.
  const floats = [...subs.map((sub) => ({ id: sub.id, title: sub.name, folder: true })), ...notes.map((item) => ({ id: item.id, title: item.title || 'Untitled', folder: false }))]
  const more = floats.length - FLOAT
  const ink = group.color ? `var(--tt-color-text-${group.color})` : 'var(--foreground)'
  const held = [subs.length ? plural(subs.length, 'folder') : '', notes.length || !subs.length ? plural(notes.length, list === 'nugget' ? 'gem' : 'page') : ''].filter(Boolean).join(' · ')
  const rename = (next: string): void => {
    onRenaming(false)
    if (next.trim() && next.trim() !== group.name) change(view(one), { name: next.trim() })
  }
  const separate = (): void => {
    chime('separate')
    setGone(true)
    void groups.separate(group.id).then((was) => {
      if (!was) return (setGone(false), refuse('That folder is already gone'))
      toast(`Deleted ${group.name}: ${notes.length === 1 ? 'its note moved up' : notes.length ? `its ${num(notes.length)} notes moved up` : 'it was empty'}`, () => void groups.restore(was).then(() => chime('gather')))
    })
  }
  const style = { '--ink': ink } as CSSProperties
  return (
    <Popover open={picking} onOpenChange={setPicking}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div data-folder-tile={group.id} className={cn('group/folder relative flex min-w-0 flex-col items-center hover:z-10 focus-within:z-10', narrowHidden && 'max-sm:hidden', gone && 'opacity-0 transition-opacity duration-150', born && !still() && 'animate-in fade-in zoom-in-95 duration-200')} style={style}>
            <PopoverAnchor asChild>
              <button type="button" data-folder-tile-open={group.id} data-folder-drop={group.id} data-folder-list={list} aria-label={`Open ${group.name}, ${held}`}
                onClick={() => (chime('open'), onOpen())}
                className="relative block h-[5.25rem] w-[6.75rem] cursor-pointer rounded-md outline-none transition-transform duration-150 ease-[var(--mf-ease)] focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] data-[queue-hot]:scale-[1.04] data-[folder-no]:cursor-not-allowed data-[folder-no]:opacity-50">
                {/* The back, with its tab. */}
                <svg viewBox="0 0 108 84" aria-hidden className="absolute inset-0 size-full overflow-visible">
                  <path d="M4 8a5 5 0 0 1 5-5h26a5 5 0 0 1 3.5 1.5l5 5h55.5a5 5 0 0 1 5 5V78a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z"
                    style={{ fill: 'color-mix(in oklab, var(--ink) 26%, var(--background))', stroke: 'color-mix(in oklab, var(--ink) 30%, transparent)', strokeWidth: 1 }} />
                </svg>
                {/* What floats out: out of sight at rest, fanned over the folder's own face when pointed at, inside its tile, so
                    nothing reaches up into the row above or the toolbar. */}
                {!empty && floats.slice(0, FLOAT).map((float, at) => (
                  <span key={float.id} data-folder-float={float.id} aria-hidden
                    className="pointer-events-none absolute left-1/2 top-4 flex h-[1.125rem] w-[9.5rem] items-center gap-1 truncate rounded-[4px] bg-background px-2 text-left text-[0.6875rem] leading-none text-foreground opacity-0 shadow-[0_1px_2px_rgb(0_0_0/0.10),0_2px_6px_rgb(0_0_0/0.08),0_0_0_1px_color-mix(in_oklab,var(--foreground)_10%,transparent)] [transform:translate(-50%,var(--rest))] transition-[transform,opacity] duration-200 ease-[var(--mf-ease)] motion-reduce:transition-opacity motion-reduce:duration-150 [@media(hover:hover)]:group-hover/folder:opacity-100 group-focus-within/folder:opacity-100 [@media(hover:hover)]:group-hover/folder:[transform:var(--out)] group-focus-within/folder:[transform:var(--out)] motion-reduce:![transform:translate(-50%,var(--rest))]"
                    style={{ transitionDelay: `${at * 30}ms`, '--rest': '0.5rem', '--out': `translate(-50%, ${at * 1.25 - 1.75}rem)`, zIndex: FLOAT + 2 + at } as CSSProperties}>
                    {float.folder && <GroupIcon icon={null} color={group.color} className="size-3 shrink-0" />}
                    <span className="min-w-0 truncate">{float.title}</span>
                  </span>
                ))}
                {/* The front, its icon on it; an empty folder says so. */}
                <span aria-hidden className="absolute inset-x-[3.5%] bottom-[1%] top-[24%] flex flex-col items-center justify-center gap-0.5 rounded-[5px] shadow-[inset_0_1px_0_color-mix(in_oklab,white_45%,transparent),0_-1px_2px_rgb(0_0_0/0.06)]"
                  style={{ background: 'color-mix(in oklab, var(--ink) 15%, var(--background))', border: '1px solid color-mix(in oklab, var(--ink) 24%, transparent)', zIndex: FLOAT + 1 }}>
                  <span className="flex size-7 items-center justify-center text-[1.4rem] leading-none [&_svg]:size-5"><GroupIcon icon={group.icon} color={group.color} className="size-5" /></span>
                  {empty && <span data-folder-empty className="text-meta text-muted-foreground">Empty</span>}
                </span>
                {more > 0 && (
                  <span aria-hidden data-folder-more-float className="pointer-events-none absolute left-1/2 bottom-0 -translate-x-1/2 whitespace-nowrap rounded-full bg-background px-1.5 text-[0.625rem] text-foreground/80 opacity-0 shadow-[0_1px_2px_rgb(0_0_0/0.10),0_0_0_1px_color-mix(in_oklab,var(--foreground)_10%,transparent)] transition-opacity duration-200 [@media(hover:hover)]:group-hover/folder:opacity-100 group-focus-within/folder:opacity-100"
                    style={{ transitionDelay: `${FLOAT * 30}ms`, zIndex: FLOAT * 2 + 3 }}>
                    and {num(more)} more
                  </span>
                )}
              </button>
            </PopoverAnchor>
            {renaming ? (
              <input autoFocus defaultValue={group.name} aria-label="Folder name" placeholder="Name the folder"
                onFocus={(event) => event.target.select()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') rename(event.currentTarget.value)
                  if (event.key === 'Escape') (event.preventDefault(), event.stopPropagation(), onRenaming(false))
                }}
                onBlur={(event) => rename(event.target.value)}
                className="mt-1.5 w-full min-w-0 rounded-sm bg-accent/60 px-1 text-center text-control font-semibold text-foreground outline-none ring-1 ring-ring/40" />
            ) : (
              <span data-folder-tile-name className="mt-1.5 w-full truncate text-center text-control font-semibold text-foreground">{group.name}</span>
            )}
            <span data-folder-held className="w-full truncate text-center text-meta text-muted-foreground">{held}</span>
          </div>
        </ContextMenuTrigger>
        <GroupMenu group={view(one)} members={one.items.map((item) => item.id)} onOpenFolder={() => (chime('open'), onOpen())} onSeparate={separate}
          onRename={() => onRenaming(true)} onIcon={() => setPicking(true)} onNewNote={onNewNote} />
      </ContextMenu>
      <PopoverContent align="start" className="w-auto gap-0 overflow-hidden p-0" onFocusOutside={(event) => event.preventDefault()}>
        <IconChoice group={group} onPick={(icon) => (change(view(one), { icon }), chime('tap'), setPicking(false))} />
      </PopoverContent>
    </Popover>
  )
}
