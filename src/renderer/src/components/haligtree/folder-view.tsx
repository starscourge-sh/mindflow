import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/react'
import { HaligtreeEditor } from './haligtree-editor'
import { saveImage } from '@/extensions/image-drop'
import { quietly, sayNow } from './ui'
import { ChevronRight, FileText, FolderPlus, ImagePlus, PenLine, Text } from 'lucide-react'
import { Gem } from '@/components/ui/icons'
import { FolderGems, FolderGemsOffer } from './folder-gems'
import { Empty, Grows, Island, Page, Tip } from './ui'
import { ItemsView } from './items-view'
import { CapturesView } from './captures-view'
import { TabChips } from './tab-chips'
import { GroupIcon, SectionHead } from './kept-groups'
import { ROW_PAD, ROW_SHAPE } from './row-shape'
import { cn } from '@/lib/cn'
import { RowMenu } from './row-menu'
import { openItems } from '@/lib/split'
import { chime } from '@/lib/sound'
import { useLive } from '@/lib/haligtree'
import { askFolder, folders, pathOf, useFolders, writeFrom, type Folder, type FolderItem, type FolderKind, type RecentItem } from '@/lib/folders'
import { FolderRows, TOP_DROP, folderDrop, newFolderHere } from './side-folder-section'
import { calendarInk, events, useCalendars } from '@/lib/events'
import { clock } from '@/lib/clock'
import { age, dayjs, num } from '../../../../main/dates'


/**
 * Writing, one place for what you write and keep, as Apple Notes and Finder have it: at its top level (`focus` empty)
 * the folders first, then the pages and gems in no folder, loose; a folder opens to its own page with the same look,
 * the folders inside it first. Recent, a tab at the top, is every page and gem, newest first. A folder shows only
 * what is inside it (folders isolate). What is archived stays in its folder, under "Show archived (N)".
 */
export function FoldersView({ focus, note, tab, onTab, onOpen, onPlace, group, onGroup }: { focus?: string; /** The page open beside the folder's list (the step's focus, as Writing keeps it). */ note?: string; tab?: string; onTab: (tab: string) => void; /** With `folder`: opened in that folder's page (a subfolder's own row unfolded here). */ onOpen: (type: string, id: string, folder?: string) => void; onPlace: (id: string | null) => void
  /** At the top level: one of Writing's groups opened from the sidebar (⌘G's groups, not folders), and the way back out. */
  group?: string; onGroup?: (id: string | null, reveal?: boolean) => void }): React.JSX.Element {
  const all = useFolders()
  const top = !focus || focus === 'all' || focus === 'unfiled'
  return <OneFolder key={top ? TOP : focus} id={top ? TOP : focus} note={note} all={all} tab={tab} onTab={onTab} onOpen={onOpen} onPlace={onPlace} group={top ? group : undefined} onGroup={top ? onGroup : undefined} />
}

/** Writing's top level: what is in no folder (folders.ts `folderItems`), never a folder of its own. */
const TOP = 'unfiled'

/** A folder's kinds, writing first (order-implies-purpose): each drawn by the list that kind has everywhere else. Tasks stay in Tasks. */
type KindTab = 'pages' | 'gems' | 'questions' | 'notes' | 'recent'
const KIND_TABS: { id: KindTab; label: string; types: FolderKind[] }[] = [
  { id: 'pages', label: 'Pages', types: ['article'] },
  { id: 'notes', label: 'Notes', types: ['capture'] },
  { id: 'gems', label: 'Gems', types: ['nugget'] },
  { id: 'questions', label: 'Questions', types: ['question'] }
]
/** The tab of a folder's page that holds a kind of thing ('article' is under Pages): for opening one there. */
export const tabOfKind = (type: string): KindTab | undefined => KIND_TABS.find((kind) => kind.types.includes(type as FolderKind))?.id

/**
 * One folder's page (or Writing's top level): Writing's own list, Gems' or the Inbox's, each the same component with
 * its rows, pictures, groups, sort, display, keys, picking and the note opened beside it, holding only what this
 * folder keeps. A switch at the line's left picks the kind (one shown at a time, as Tasks' tabs are); over the list,
 * where the folder is, its one fact and the folders inside it. Never a list of its own (the user, 19 Nov: "what a
 * downgrade", beside Writing).
 */
function OneFolder({ id, note, all, tab, onTab, onOpen, onPlace, group, onGroup }: { id: string; note?: string; all: Folder[]; tab?: string; onTab: (tab: string) => void; onOpen: (type: string, id: string, folder?: string) => void; onPlace: (id: string | null) => void; group?: string; onGroup?: (id: string | null, reveal?: boolean) => void }): React.JSX.Element {
  const items = useLive(() => folders.items(id), null as FolderItem[] | null, [id], undefined, `folders:items:${id}`)
  // "Add words" asked for from the head's actions: the words' editor opens under the path, the caret in it.
  const [writing, setWriting] = useState(false)
  // The lines its gem offer opened ("See them"), under the head.
  const [gemsOpen, setGemsOpen] = useState(false)
  const ofCaptures = useLive(() => folders.of('captures'), {} as Record<string, string>, [], undefined, 'folders:of:captures')
  useCalendars()
  const top = id === TOP
  const coming = useLive(() => (top ? Promise.resolve(null) : events.ofFolder(id)), null as Awaited<ReturnType<typeof events.ofFolder>> | null, [id])
  const folder = all.find((one) => one.id === id)
  const path = top ? [] : pathOf(all, id)
  const inside = all.filter((one) => (one.parent ?? null) === (top ? null : id) && !one.archived)
  const name = top ? 'Writing' : folder?.name ?? 'Folder'
  const shown = (items ?? []).filter((one) => !one.archived && one.type !== 'task')
  const counted = KIND_TABS.map((kind) => ({ ...kind, n: shown.filter((one) => kind.types.includes(one.type)).length }))
  // Only the kinds it holds are tabs ("Pages 0" offered nothing); holding nothing, its list is Pages', where "New page"
  // is. Writing's top level always has Recent last: every page and gem, wherever it is kept.
  const islands = counted.filter((one) => one.n)
  const tabs = [...(islands.length ? islands : counted.filter((one) => one.id === 'pages')), ...(top ? [{ id: 'recent' as const, label: 'Recent', types: [] as FolderKind[], n: undefined }] : [])]
  // The note open beside it says which kind is on show, when no tab was asked for: a gem opened here is among the gems.
  const noteKind = tabOfKind(shown.find((one) => one.id === note)?.type ?? '')
  const on = (tabs.find((one) => one.id === tab) ?? tabs.find((one) => one.id === noteKind) ?? tabs[0]).id
  const kinds = tabs.length > 1 ? (
    <div data-list-tabs data-folder-kinds="" className="flex shrink-0" style={{ marginLeft: 'calc(var(--list-edge) - var(--list-ink) - 3px)' }}>
      <TabChips name="folder-kinds" tabs={tabs.map((one) => ({ value: one.id, label: one.label, count: one.n }))} value={on} onChange={(next) => onTab(next)} />
    </div>
  ) : undefined
  // Asked for, never offered as chips: quiet icons in the head's actions, seen while the head is pointed at (the user,
  // 21 Nov: "Add a cover" over the path and "Add words" under it read as bolted on). Their room is kept, so nothing moves.
  const quiet = 'flex size-6 cursor-pointer items-center justify-center rounded-md opacity-0 transition-opacity duration-150 group-hover/head:opacity-100 focus-within:opacity-100 focus-visible:opacity-100 hover:bg-accent hover:text-foreground'
  const said = (
    <div data-folder-head="" className="group/head">
      {/* Over its name, its cover, as a Notion page's. */}
      {folder?.cover && <FolderFront key={`${folder.id}:cover`} folder={folder} part="cover" />}
      <FolderPath trail={top ? null : path.slice(0, -1)} onPlace={onPlace} here={<>{folder && <GroupIcon icon={folder.icon} color={folder.color} className="size-3.5" />}{name}</>}>
        {/* Lines in its notes that could be gems: offered once, here on the head's own line, so it moves nothing in. */}
        {folder && <FolderGemsOffer key={`${folder.id}:offer`} folder={folder} onSee={() => setGemsOpen(true)} />}
        {folder && !folder.cover && (
          <Tip label="Add a cover"><CoverPick folder={folder} data-folder-cover-add="" aria-label="Add a cover" className={quiet}><ImagePlus aria-hidden className="size-3.5" /></CoverPick></Tip>
        )}
        {folder && !folder.front && !writing && (
          <Tip label="Add words"><button type="button" data-folder-words-add="" aria-label="Add words" onClick={() => (chime('tap'), setWriting(true))} className={quiet}><Text aria-hidden className="size-3.5" /></button></Tip>
        )}
        {/* A page in Writing with what this folder keeps beside it to quote from; the folder stays a folder. */}
        {folder && (
          <button type="button" data-folder-write-from="" onClick={() => void writeFrom(folder)} className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-accent hover:text-foreground"><PenLine className="size-3.5" />Write from this folder</button>
        )}
        {path.length < 6 && (
          <button type="button" data-folder-new-inside={top ? undefined : ''} data-folders-new-page={top ? '' : undefined} onClick={() => newFolderHere(top ? null : id)} className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-accent hover:text-foreground"><FolderPlus className="size-3.5" />New folder</button>
        )}
      </FolderPath>
      {/* Under its name, its words and link cards, as a Notion page's sit under its title. */}
      {/* Its words glide open under the name and away again, never popped in (smooth-not-jump). Already there as the
          folder opens, they are simply there. */}
      <AnimatePresence initial={false}>
        {folder && (!!folder.front || writing) && (
          <motion.div key={`${folder.id}:words`} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }} className="overflow-hidden">
            <FolderFront folder={folder} part="words" onLeave={() => setWriting(false)} />
          </motion.div>
        )}
      </AnimatePresence>
      {/* The lines it offered, opened with "See them" (folder-gems.tsx). */}
      {folder && <FolderGems key={folder.id} folder={folder} open={gemsOpen} onClose={() => setGemsOpen(false)} />}
      {/* Empty: one line saying how something gets in. "Nothing in it yet" over an empty page said what the page shows. */}
      {!top && items && !shown.length && !inside.length && <p data-folder-fact="" className="mt-4 text-control text-muted-foreground">Drag a page, note or gem onto {name} in the sidebar, or choose “Keep in folder…” on it.</p>}
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
      {/* The folders here, as the first rows of its list: the sidebar tree's own rows, at the list's size. Recent is
          every page and gem by date, so no folders over it. */}
      {/* 16px under the path: in and out, nothing moves. Only with folders in it: an empty wrapper's margin pushed a
          folder of pages alone 16px lower. */}
      {/* Always there (a folder made here is named in its row, FolderRows), its height gliding as folders come and go. */}
      {on !== 'recent' && (
        <Grows className="-mx-2 px-2" inner={inside.length ? 'pt-4' : undefined}><FolderRows parent={top ? null : id} onPlace={(one) => onPlace(one)} onOpenItem={onOpen} /></Grows>
      )}
    </div>
  )
  const box = { id, name }
  // Keyed by folder and kind: each its own list, its cursor and its open note, as switching Writing to Gems is.
  if (on === 'recent') return <RecentList key="recent" lead={kinds} said={said} onOpen={onOpen} />
  if (on === 'notes') return <CapturesView key={`${id}:notes`} title={name} keep={(one) => ofCaptures[one.id] === id && one.status !== 'discarded'} focus={note} lead={kinds} said={said} onOpen={onOpen} />
  return <ItemsView key={`${id}:${on}`} tier={on === 'gems' ? 'nugget' : 'article'} only={on === 'questions' ? 'questions' : undefined} inFolder={box} focus={note} lead={kinds} said={said} onOpen={onOpen}
    folder={top && on === 'pages' ? group : undefined} onFolder={top && on === 'pages' ? onGroup : undefined} />
}

/** Recent's parts, newest first: what is said over each. */
const recentPart = (at: string): string => {
  const day = dayjs(at).startOf('day')
  const today = dayjs().startOf('day')
  if (!day.isBefore(today)) return 'Today'
  if (!day.isBefore(today.subtract(1, 'day'))) return 'Yesterday'
  if (!day.isBefore(today.subtract(6, 'day'))) return 'This week'
  return 'Earlier'
}

/**
 * Writing's Recent: every page and gem, wherever it is kept, newest first, under Today, Yesterday, This week and
 * Earlier, in the list's own rows and section heads. Each row says where it lives; its right click opens it or moves it.
 */
function RecentList({ lead, said, onOpen }: { lead?: React.ReactNode; said: React.ReactNode; onOpen: (type: string, id: string, folder?: string) => void }): React.JSX.Element {
  const recent = useLive(folders.recent, null as RecentItem[] | null, [], ['item'], 'folders:recent')
  const all = useFolders()
  const byId = useMemo(() => new Map(all.map((one) => [one.id, one])), [all])
  const parts = useMemo(() => {
    const out: [string, RecentItem[]][] = []
    for (const one of recent ?? []) {
      const part = recentPart(one.at)
      if (out.at(-1)?.[0] !== part) out.push([part, []])
      out.at(-1)![1].push(one)
    }
    return out
  }, [recent])
  return (
    <Page title="Writing" lead={lead} count={recent?.length} unit={['page or gem', 'pages and gems']} waiting={!recent}>
      <div data-kind-chips className="list-words pt-4 pb-2">{said}</div>
      {recent && !recent.length ? (
        <Empty title="Nothing written yet" art={<FileText className="size-8 text-muted-foreground" />}>A page you write or a gem you keep shows here first.</Empty>
      ) : (
        <div data-recent="" className="list-edge my-2 flex flex-col">
          {parts.map(([part, rows], at) => (
            <div key={part} data-recent-part={part} className="flex flex-col">
              <SectionHead head={[part, rows.length]} first={at === 0} />
              {rows.map((one) => {
                const Icon = one.type === 'article' ? FileText : Gem
                const home = one.folder ? byId.get(one.folder) : undefined
                return (
                  <RowMenu key={one.id} items={() => [{ label: 'Open', run: () => onOpen(one.type, one.id, one.folder ?? undefined) }, ...openItems(one.type, one.id), 'separator', { label: 'Keep in folder…', run: () => askFolder([{ type: one.type, id: one.id }]) }]}>
                    <button type="button" data-recent-row={one.id} data-type={one.type} data-drag-open={`${one.type}:${one.id}`} data-drag-kind={one.type} title={one.title}
                      onClick={() => (chime('page'), onOpen(one.type, one.id, one.folder ?? undefined))}
                      className={cn(ROW_SHAPE, ROW_PAD, 'cursor-pointer hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent/60')}>
                      <span className="flex size-9 shrink-0 items-center justify-center"><Icon aria-hidden className="size-4 text-muted-foreground" /></span>
                      <span className="private-text min-w-0 flex-1 truncate text-control font-medium text-foreground">{one.title.trim() || (one.type === 'article' ? 'Untitled' : 'New note')}</span>
                      {home && <span data-recent-folder="" className="flex min-w-0 shrink items-center gap-1 truncate text-meta text-muted-foreground"><GroupIcon icon={home.icon} color={home.color} className="size-3" />{home.name}</span>}
                      <span className="shrink-0 text-meta text-muted-foreground tabular-nums">{part === 'Today' || part === 'Yesterday' ? clock(one.at) : age(one.at) === 'now' ? 'just now' : `${age(one.at)} ago`}</span>
                    </button>
                  </RowMenu>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </Page>
  )
}

/**
 * The one head of Writing and of each folder's page: where you are on the left ("Writing" alone, or "Writing › 🎬
 * Films and books"), what to do here on the right, drawn alike at the same place on both, so going in and out moves
 * nothing (the user, 21 Nov: the page "kinda moves between pages"; qa/folder-head.mjs measures it). Each step of the
 * way back takes a folder carried onto it (into that folder; "Writing": to the top) and a page, note or gem (kept there).
 */
function FolderPath({ trail, here, onPlace, children }: { /** The folders above this one; null on Writing's top level itself. */ trail: Folder[] | null; here: React.ReactNode; onPlace: (id: string | null) => void; children?: React.ReactNode }): React.JSX.Element {
  const step = 'cursor-pointer rounded-md px-1.5 py-0.5 hover:bg-accent hover:text-foreground data-[drop-hot]:bg-accent data-[drop-hot]:text-foreground data-[queue-hot]:bg-accent data-[queue-hot]:text-foreground'
  return (
    <nav aria-label={trail ? 'Where this folder is' : 'Writing'} data-folder-path="" className="-ml-1.5 flex h-7 min-w-0 items-center gap-1 text-control text-muted-foreground">
      {trail && <button type="button" data-path-top="" data-row-drop={TOP_DROP} data-keep-drop="none" onClick={() => (chime('page'), onPlace(null))} className={step}>Writing</button>}
      {trail?.map((one) => (
        <span key={one.id} className="flex min-w-0 items-center gap-1"><ChevronRight className="size-3 shrink-0" /><button type="button" data-row-drop={folderDrop(one.id)} data-keep-drop={one.id} data-folder-name={one.name} onClick={() => (chime('page'), onPlace(one.id))} className={cn(step, 'truncate')}>{one.name}</button></span>
      ))}
      {trail && <ChevronRight className="size-3 shrink-0" />}
      {/* On Writing's top level its word sits where the way back to it sits on a folder's (the same 6px in). */}
      <h1 {...(trail ? { 'data-folder-title': '' } : { 'data-folders-title': '' })} className={cn('flex min-w-0 items-center gap-1.5 truncate text-control font-medium text-foreground', trail ? 'px-1' : 'px-1.5')}>{here}</h1>
      <span data-folder-actions="" className="ml-auto flex shrink-0 items-center gap-1">{children}</span>
    </nav>
  )
}

/** A folder's cover, set or taken away, said with Undo. */
function setCover(folder: Folder, src: string | null): void {
  const was = folder.cover
  chime(src ? 'promote' : 'separate')
  sayNow(folders.set(folder.id, { cover: src }), src ? `${folder.name} has a cover` : `Took ${folder.name}'s cover away`, () => void folders.set(folder.id, { cover: was }))
}

/** The folder icon's own upload (kept-groups.tsx `IconChoice`): the Mac's file sheet, the picture kept as a page's is. */
function CoverPick({ folder, children, 'aria-label': named, ...rest }: { folder: Folder; children: React.ReactNode } & React.LabelHTMLAttributes<HTMLLabelElement> & { ref?: React.Ref<HTMLLabelElement> } & Record<`data-${string}`, string>): React.JSX.Element {
  return (
    <label {...rest}>
      {children}
      <input type="file" aria-label={named} accept="image/png,image/jpeg,image/gif,image/webp,image/avif" className="sr-only"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) void saveImage(file).then((src) => src && setCover(folder, src), () => chime('nope'))
        }} />
    </label>
  )
}

/**
 * A folder's front, as the top of a Notion page: a cover picture and a few words with link cards, both optional,
 * nothing at all until asked for from the head's actions (FolderPath). The words are a page's own editor (link cards,
 * pictures, every way a page is written), kept with the folder as it is left.
 */
function FolderFront({ folder, part, onLeave }: { folder: Folder; /** The cover goes over the folder's name, its words under it (Notion's page). */ part: 'cover' | 'words'; /** Left empty: the words go away again, as they came (the user, 22 Nov: "how do I get out of this"). */ onLeave?: () => void }): React.JSX.Element {
  const doc = useMemo(() => { try { return folder.front ? (JSON.parse(folder.front) as JSONContent) : null } catch { return null } }, [folder.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const latest = useRef<JSONContent | null>(doc)
  // Read off the editor itself as it is left: a change it has not yet told (a dev build's slower editor) is kept too.
  const editor = useRef<{ state: { doc: { toJSON: () => JSONContent } } } | null>(null)
  const save = (left = false): void => {
    // The words' own part only: the cover's part never holds them (it would put back what it read at first).
    if (part !== 'words') return
    const next = editor.current ? editor.current.state.doc.toJSON() : latest.current
    // Nothing written: no words kept, and the field goes, back to the head's "Add words".
    const empty = !editor.current || !(editor.current as unknown as { state: { doc: { textContent: string; childCount: number; firstChild: { type: { name: string } } | null } } }).state.doc.textContent.trim()
    const words = next && !empty ? JSON.stringify(next) : null
    // Only a person leaving it (Esc, a click away) closes it: an unmount's save (StrictMode's first editor in the
    // dev build) closed it the moment "Add words" opened it (the user, 22 Nov: "not doing anything").
    if (!words && left) onLeave?.()
    if (words === (folder.front ?? null)) return
    const was = folder.front
    void folders.set(folder.id, { front: words }).then(() => quietly(() => void folders.set(folder.id, { front: was })))
  }
  // Kept as it is left: the words leaving the field, or the page left with them in it.
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => () => saveRef.current(), [])
  return (
    <div data-folder-front={part} className="group/front">
      {part === 'cover' && folder.cover && (
        <div className="relative mb-3">
          <img data-folder-cover="" src={folder.cover} alt="" draggable={false} className="h-36 w-full rounded-xl object-cover" />
          <span className="absolute right-2 bottom-2 flex gap-1 rounded-lg bg-popover p-0.5 text-control text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover/front:opacity-100 focus-within:opacity-100">
            <CoverPick folder={folder} className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-accent hover:text-foreground"><ImagePlus aria-hidden className="size-3.5" />Change cover</CoverPick>
            <button type="button" onClick={() => setCover(folder, null)} className="cursor-pointer rounded-md px-1.5 py-0.5 hover:bg-accent hover:text-foreground">Remove</button>
          </span>
        </div>
      )}
      {part === 'words' && (
        <div data-folder-words="" onBlur={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && save(true)}
          // Esc leaves the words (after Vim's own Esc to Normal): out of the field, and gone if empty.
          onKeyDown={(event) => event.key === 'Escape' && !event.defaultPrevented && (event.currentTarget.querySelector<HTMLElement>('[contenteditable]')?.getAttribute('data-vim-mode') ?? 'normal') === 'normal' && (event.currentTarget.querySelector<HTMLElement>('[contenteditable]')?.blur())} style={{ '--mf-padding': '0.25rem 0' } as React.CSSProperties}>
          <HaligtreeEditor defaultContent={doc ?? ''} toolbar={false} outline={false} search={false} lineNumbers={false} handles={false} autofocus={doc ? false : 'end'} placeholder="A few words about this folder, and links to keep with it"
            // Asked for by "Add words": the caret in it at once, as a new page's is (once ready, StrictMode's second editor too).
            onReady={(ready) => void ((editor.current = ready), !doc && ready.commands.focus('end'))}
            onChange={(next) => void (latest.current = next)}
            // A few words, not a page: no count or Vim mode under them (the "Insert" chip that sat under them).
            foot={() => null} />
        </div>
      )}
    </div>
  )
}
