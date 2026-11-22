import { useEffect, useRef, useState } from 'react'
import { ChevronRight, MoreHorizontal, Plus } from 'lucide-react'
import { Branches } from './branches'
import { NameInPlace } from './name-in-place'
import { GroupIcon, GroupTile, IconChoice } from './kept-groups'
import { plural } from '../../../../main/dates'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Weighted } from './glide'
import { RowMenu, copyLinkItem, openFromGrip, type RowItem } from './row-menu'
import { Count, Tip, refuse, sayNow, toast, typing } from './ui'
import { SortableList, SortableRow } from './sortable'
import { ROW_PAD, ROW_SHAPE } from './row-shape'
import { cn } from '@/lib/cn'
import { chime } from '@/lib/sound'
import { openItems } from '@/lib/split'
import { GROUP_COLORS } from '@/lib/groups'
import { PROJECT_DEPTH, askProjectFor, newProjectHere, openIn, projectPath, projects, useProjects, type Project } from '@/lib/projects'

/**
 * Projects, where tasks live, as a tree: under Tasks in the sidebar (the starred ones, and the way down to the one you
 * are in), and whole on Tasks' "Projects" tab. Drawn as Folders' tree is (side-folder-section.tsx `FolderRow`): the
 * icon gives way to its fold on pointing, a count of open tasks (none for 0), "…" and "+" at the right; carried by the
 * app's one drag (sortable.tsx), by another's edge before or after it, on its middle inside it. A task carried onto a
 * row moves into that project (split-drop.tsx `data-project-drop`), and a folded one springs open under it.
 */

/** How long a carried task rests on a folded project before it springs open, as Finder's folders do. */
const SPRING_MS = 600

export function ProjectsTree({ here, onOpen, page = false, archived = false, under }: { here?: string; onOpen: (id: string) => void
  /** On a project's page: the projects inside it. */
  under?: string
  /** On Tasks' "Projects" tab: every project, at the list's row size. */
  page?: boolean
  /** The archived ones only (the "Projects" tab's fold of them). */
  archived?: boolean }): React.JSX.Element | null {
  const all = useProjects()
  const [naming, setNamingRaw] = useState<string | null>(null)
  // Named as it is made: its first name is part of making it, one ⌘Z for both (as Finder's new folder).
  const [fresh, setFresh] = useState(false)
  const setNaming = (id: string | null, made = false): void => (setNamingRaw(id), setFresh(made))
  const [picking, setPicking] = useState<string | null>(null)
  useEffect(() => {
    if (archived) return
    // A new project, named where it appears: on the page when a page shows projects, else in the sidebar.
    const name = (event: Event): void => void ((page || !document.querySelector('[data-projects-page], [data-sub-projects]')) && setNaming((event as CustomEvent<{ id: string }>).detail.id, true))
    window.addEventListener('haligtree:project-name', name)
    return () => window.removeEventListener('haligtree:project-name', name)
  }, [page, archived])
  // F2 renames the project whose row has the keys, or the one you are in.
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'F2' || event.metaKey || event.ctrlKey || event.altKey) return
      const id = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-project-row]')?.dataset.projectRow ?? (!typing() && page ? here : undefined)
      if (!id || !all.some((one) => one.id === id)) return
      event.preventDefault()
      setNaming(id)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })
  const shown = all.filter((one) => !!one.archived === archived)
  const path = here ? projectPath(shown, here).map((one) => one.id) : []
  const starredAbove = (one: Project): boolean => projectPath(shown, one.parent).some((up) => up.starred)
  // The sidebar: starred ones, and the way down to the one you are in. The page: every top-level one.
  const tops = under ? shown.filter((one) => one.parent === under) : page ? shown.filter((one) => !one.parent || !shown.some((up) => up.id === one.parent))
    : shown.filter((one) => (one.starred && !starredAbove(one)) || (one.id === path[0] && !one.starred))
  const inside = (id: string): Project[] => shown.filter((one) => one.parent === id)
  // The list holds a dropped order until the saved one is read back; a refused drop starts it afresh.
  const [epoch, setEpoch] = useState(0)
  const afresh = (): void => setEpoch((n) => n + 1)
  const name = (id: string): string => all.find((one) => one.id === id)?.name ?? 'the project'
  const place = (id: string, target: string, after: boolean): void =>
    void projects.place(id, target, after).then((was) => {
      if (!was) return (afresh(), refuse('A project can’t go inside itself'))
      chime('gather')
      toast(`Moved ${name(id)} ${after ? 'after' : 'before'} ${name(target)}`, () => void projects.arrange(id, was))
    })
  const nest = (id: string, target: string): void => {
    const was = all.find((one) => one.id === id)
    void projects.nest(id, target).then((done) => {
      if (done !== true) return (afresh(), refuse(done))
      chime('gather')
      void projects.set(target, { folded: false })
      toast(`Moved ${was?.name ?? 'the project'} into ${name(target)}`, () => void projects.nest(id, was?.parent ?? null))
    })
  }
  const fold = (one: Project): void => (chime(one.folded ? 'slide' : 'fold'), void projects.set(one.id, { folded: !one.folded }))
  const rows = (list: Project[]): React.JSX.Element => (
    <SortableList key={epoch} items={list} keyOf={(one) => one.id} onMove={place} onNest={nest}>{(items) => items.map((one) => {
      const kids = inside(one.id)
      // Folded, only the way down to the one you are in shows; a fold only where something folds.
      const open = kids.length > 0 && !one.folded
      const hung = open ? kids : kids.filter((kid) => path.includes(kid.id))
      return (
        <SortableRow key={one.id} id={one.id} glide={`project-${one.id}`}>
          <div className="flex flex-col gap-px">
            <ProjectRow project={one} all={shown} page={page} here={here === one.id} n={openIn(shown, one.id)} naming={naming === one.id} fresh={fresh} picking={picking === one.id}
              onPicking={(on) => setPicking(on ? one.id : null)} onNamed={() => setNaming(null)} onRename={() => setNaming(one.id)} onOpen={() => onOpen(one.id)}
              open={open} onFold={kids.length ? () => fold(one) : undefined} onSpring={kids.length && one.folded ? () => void projects.set(one.id, { folded: false }) : undefined} />
            {hung.length > 0 && <div data-no-twig="" data-own-press=""><Branches className={cn(page ? 'ml-6' : 'ml-5', 'flex flex-col gap-px')}>{rows(hung)}</Branches></div>}
          </div>
        </SortableRow>
      )
    })}</SortableList>
  )
  if (!tops.length) return null
  return page
    // On the Projects tab the rows sit on the list's own edges (ROW_SHAPE); inside a project's head, on its words' edge.
    ? <div data-projects-tree="" data-archived={archived ? '' : undefined} className={cn('flex flex-col', under && '-mx-2')}>{rows(tops)}</div>
    : <div data-projects-tree=""><Branches rows=":scope > *" className="ml-5 flex flex-col gap-px">{rows(tops)}</Branches></div>
}

/** One project's lines in a menu: the same in the sidebar, on the Projects tab and on its own page. */
export function projectMenu(project: Project, all: Project[], { onOpen, onRename, onIcon }: { onOpen: () => void; onRename: () => void; onIcon: () => void }): RowItem[] {
  const level = projectPath(all, project.id).length
  const parent = all.find((one) => one.id === project.parent)
  const set = (patch: Parameters<typeof projects.set>[1], was: Parameters<typeof projects.set>[1], said: string, cue: Parameters<typeof chime>[0]): void =>
    (chime(cue), sayNow(projects.set(project.id, patch), said, () => void projects.set(project.id, was)))
  return [
    // A favorite, in the words Folders' menu uses for the same star (side-folder-section.tsx `folderMenu`).
    { label: project.starred ? 'Remove from the sidebar' : 'Show in the sidebar', hint: project.starred ? 'Unstar it' : 'Star it',
      run: () => set({ starred: !project.starred }, { starred: !!project.starred }, project.starred ? `Took ${project.name} off the sidebar` : `Starred ${project.name}`, project.starred ? 'off' : 'on') },
    'separator',
    { label: 'Open', keys: '↵', run: onOpen },
    ...openItems('project', project.id),
    copyLinkItem(`project:${project.id}`, project.name),
    'separator',
    { label: 'Rename…', keys: 'F2', run: onRename },
    { label: 'Change icon…', run: onIcon },
    // Colours inline, under their heading: never a submenu of one row.
    { heading: 'Colour' },
    { swatches: GROUP_COLORS.map((color) => ({ color, label: color, on: project.color === color, run: () => set({ color: project.color === color ? null : color }, { color: project.color }, `Changed ${project.name}’s colour`, 'tap') })) },
    'separator',
    level < PROJECT_DEPTH && { label: 'New project inside', run: () => void newProjectHere(project.id) },
    { label: 'Move to…', run: () => askProjectFor(project) },
    !!parent && { label: `Move out of ${parent.name}`, run: () => void projects.nest(project.id, parent.parent).then((done) => done === true && (chime('gather'), toast(`Moved ${project.name} out of ${parent.name}`, () => void projects.nest(project.id, parent.id)))) },
    { label: project.archived ? 'Bring back from the archive' : 'Archive project', hint: project.archived ? undefined : 'Kept with its tasks, out of sight',
      run: () => set({ archived: !project.archived }, { archived: !!project.archived }, project.archived ? `Brought back ${project.name}` : `Archived ${project.name}: kept, out of sight`, 'tuck') },
    { label: 'Delete project, keep its tasks', hint: parent ? `They move to ${parent.name}` : 'They stay in Tasks', danger: true,
      run: () => void projects.remove(project.id).then((was) => was && (chime('separate'), toast(`Deleted ${project.name}: its tasks stay`, () => void projects.restore(was)))) }
  ]
}

/** One project's row: the sidebar's size, or the list's (`page`). Renamed in place, its icon chosen beside it. */
export function ProjectRow({ project, all, here, n, naming, fresh = false, picking, open, page = false, onPicking, onNamed, onRename, onOpen, onFold, onSpring }: { project: Project; all: Project[]; here: boolean; n: number; naming: boolean; /** Just made: named without a step of its own to undo. */ fresh?: boolean; picking: boolean; open: boolean; page?: boolean
  onPicking: (on: boolean) => void; onNamed: () => void; onRename: () => void; onOpen: () => void; onFold?: () => void
  /** Folded, with projects inside: a carried task rested on it opens it. */
  onSpring?: () => void }): React.JSX.Element {
  const spring = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(spring.current), [])
  const name = (words: string | null): void => {
    onNamed()
    const next = words?.trim()
    if (!next || next === project.name) return
    const was = project.name
    chime('tap')
    if (fresh) return void projects.set(project.id, { name: next })
    sayNow(projects.set(project.id, { name: next }), `Renamed ${was} to ${next}`, () => void projects.set(project.id, { name: was }))
  }
  const pick = (icon: string | null): void => {
    onPicking(false)
    const was = project.icon
    if (icon === was) return
    chime('tap')
    sayNow(projects.set(project.id, { icon }), `Changed ${project.name}’s icon`, () => void projects.set(project.id, { icon: was }))
  }
  const icon = <GroupIcon icon={project.icon} color={project.color} className="size-3.5" />
  const body = naming ? (
    <div className={page ? cn(ROW_SHAPE, ROW_PAD) : 'flex w-full min-w-0 items-center gap-2 py-1 pr-2 pl-2'}>
      {page ? <GroupTile group={project} empty={!n} /> : <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span>}
      <NameInPlace initial={project.name} data-project-name={project.id} label="Project name" placeholder="Name the project" onDone={name}
        className={cn('min-w-0 flex-1 rounded-md bg-accent/60 px-1 text-foreground outline-none ring-1 ring-ring/40', page && 'text-control font-medium')} />
    </div>
  ) : (
    <RowMenu items={() => projectMenu(project, all, { onOpen, onRename, onIcon: () => onPicking(true) })}>
      <div className="group/fold relative flex flex-col"
        // A task carried here and held: a folded project opens on what it holds.
        onPointerEnter={() => onSpring && document.documentElement.dataset.dragging !== undefined && (spring.current = setTimeout(onSpring, SPRING_MS))}
        onPointerLeave={() => clearTimeout(spring.current)}>
        <button type="button" data-side-row={page ? undefined : ''} data-project-row={project.id} data-project-drop={project.id} data-folder-name={project.name} title={project.name} aria-label={project.name} aria-current={here ? 'page' : undefined}
          onClick={() => (chime('page'), onOpen())}
          className={page
            ? cn(ROW_SHAPE, ROW_PAD, 'cursor-pointer hover:bg-accent/60 data-[queue-hot]:bg-[color-mix(in_oklab,var(--tt-color-text-blue)_16%,transparent)] data-[queue-hot]:ring-1 data-[queue-hot]:ring-[color-mix(in_oklab,var(--tt-color-text-blue)_45%,transparent)]')
            : `flex w-full min-w-0 cursor-pointer items-baseline gap-2 rounded-md py-1 pr-2 pl-2 ${here ? 'text-foreground' : 'text-(--mf-muted-strong)'} data-[queue-hot]:bg-[color-mix(in_oklab,var(--tt-color-text-blue)_16%,transparent)] data-[queue-hot]:text-foreground data-[queue-hot]:ring-1 data-[queue-hot]:ring-[color-mix(in_oklab,var(--tt-color-text-blue)_45%,transparent)]`}>
          {page
            // Writing's folder row on a page (kept-groups.tsx `GroupTile`): the drawn tile with its icon, giving way to the fold.
            ? <GroupTile group={project} empty={!n} className={cn(onFold && 'transition-opacity duration-80 group-hover/fold:opacity-0 [:root[data-dragging]_&]:!opacity-100')} />
            : <span className={cn('flex h-[1lh] w-4 shrink-0 items-center justify-center', onFold && 'transition-opacity duration-80 group-hover/fold:opacity-0 [:root[data-dragging]_&]:!opacity-100')}>{icon}</span>}
          {page ? <span className="min-w-0 flex-1 truncate text-left text-control font-medium text-foreground">{project.name}</span> : <Weighted on={here} className="flex-1 truncate text-left">{project.name}</Weighted>}
          {/* Open tasks, its projects' too; none shown for 0 (a "0" reads as something to see to). */}
          {n > 0 && (page
            ? <span data-project-count={n} className="shrink-0 text-meta text-muted-foreground tabular-nums transition-opacity duration-80 group-hover/fold:opacity-0 [:root[data-dragging]_&]:!opacity-100">{plural(n, 'open task')}</span>
            : <span data-project-count={n} className="transition-opacity duration-80 group-hover/fold:opacity-0 [:root[data-dragging]_&]:!opacity-100"><Count n={n} className="text-xs text-muted-foreground" /></span>)}
        </button>
        {onFold && <button type="button" data-project-fold={project.id} aria-label={open ? `Fold ${project.name} away` : `Show the projects in ${project.name}`} aria-expanded={open} onClick={onFold}
          className={`absolute ${page ? 'top-1/2 left-[calc(var(--list-ink)-var(--list-edge))] size-9 -translate-y-1/2' : 'top-[0.1875rem] left-1.5 size-5'} flex cursor-pointer items-center justify-center rounded text-muted-foreground opacity-0 transition-[opacity,background-color] duration-80 group-hover/fold:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 [:root[data-dragging]_&]:!opacity-0`}>
          <ChevronRight className={`size-3.5 transition-transform duration-80 ${open ? 'rotate-90' : ''}`} />
        </button>}
        <span className={`absolute ${page ? 'top-1/2 right-2 -translate-y-1/2' : 'top-[0.1875rem] right-1.5'} flex items-center gap-0.5 opacity-0 transition-opacity duration-80 group-hover/fold:opacity-100 focus-within:opacity-100 [:root[data-dragging]_&]:!opacity-0`}>
          <Tip label="More">
            <button type="button" data-project-more={project.id} aria-label={`${project.name} menu`} onClick={openFromGrip}
              className="mf-hit relative flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <MoreHorizontal className="size-3.5" />
            </button>
          </Tip>
          {projectPath(all, project.id).length < PROJECT_DEPTH && (
            <Tip label="New project inside">
              <button type="button" data-project-add={project.id} aria-label={`New project inside ${project.name}`} onClick={() => void newProjectHere(project.id)}
                className="mf-hit relative flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                <Plus className="size-3.5" />
              </button>
            </Tip>
          )}
        </span>
      </div>
    </RowMenu>
  )
  return (
    <Popover open={picking} onOpenChange={onPicking}>
      <PopoverAnchor asChild><div>{body}</div></PopoverAnchor>
      <PopoverContent align="start" className="w-auto gap-0 overflow-hidden p-0" onFocusOutside={(event) => event.preventDefault()}>
        <IconChoice group={project} onPick={pick} />
      </PopoverContent>
    </Popover>
  )
}
