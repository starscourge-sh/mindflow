import { useEffect, useState } from 'react'
import { Branches } from './branches'
import { FolderRow, useFolderMoves, type TreeKind } from './side-folder-section'
import { plural } from '../../../../main/dates'
import { copyLinkItem, type RowItem } from './row-menu'
import { sayNow, toast, typing } from './ui'
import { SortableList, SortableRow } from './sortable'
import { cn } from '@/lib/cn'
import { chime } from '@/lib/sound'
import { openItems } from '@/lib/split'
import { GROUP_COLORS } from '@/lib/groups'
import { PROJECT_DEPTH, asFolders, askProjectFor, newProjectHere, openIn, projectPath, projects, useProjects, type Project } from '@/lib/projects'

/**
 * Projects, where tasks live, as a tree: under Tasks in the sidebar (the starred ones, and the way down to the one you
 * are in), and whole on Tasks' "Projects" tab. The same tree as Writing's folders: its rows are `FolderRow` (the icon
 * giving way to its fold, the count, "…" and "+"), its moves `useFolderMoves` (by another's edge before or after it,
 * on its middle inside it, each said with Undo), both from side-folder-section.tsx; only what makes it a project is
 * here (`kindOf`). A task carried onto a row moves into that project (split-drop.tsx `data-project-drop`), and a
 * folded one springs open under it.
 */

export function ProjectsTree({ here, onOpen, page = false, archived = false, under }: { here?: string; onOpen: (id: string) => void
  /** On a project's page: the projects inside it. */
  under?: string
  /** On Tasks' "Projects" tab: every project, at the list's row size. */
  page?: boolean
  /** The archived ones only (the "Projects" tab's fold of them). */
  archived?: boolean }): React.JSX.Element | null {
  const all = useProjects()
  const [naming, setNaming] = useState<string | null>(null)
  useEffect(() => {
    if (archived) return
    // A new project, named where it appears: on the page when a page shows projects, else in the sidebar.
    const name = (event: Event): void => void ((page || !document.querySelector('[data-projects-page], [data-sub-projects]')) && setNaming((event as CustomEvent<{ id: string }>).detail.id))
    window.addEventListener('haligtree:project-name', name)
    return () => window.removeEventListener('haligtree:project-name', name)
  }, [page, archived])
  // F2 renames the project whose row has the keys.
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'F2' || event.metaKey || event.ctrlKey || event.altKey || typing()) return
      const id = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-project-row]')?.dataset.projectRow
      if (!id) return
      event.preventDefault()
      setNaming(id)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  const shown = all.filter((one) => !!one.archived === archived)
  const moves = useFolderMoves({ all: shown, api: projects, word: 'project', top: 'the top of Projects' })
  const path = here ? projectPath(shown, here).map((one) => one.id) : []
  const starredAbove = (one: Project): boolean => projectPath(shown, one.parent).some((up) => up.starred)
  // The sidebar: starred ones, and the way down to the one you are in. The page: every top-level one.
  const tops = under ? shown.filter((one) => one.parent === under) : page ? shown.filter((one) => !one.parent || !shown.some((up) => up.id === one.parent))
    : shown.filter((one) => (one.starred && !starredAbove(one)) || (one.id === path[0] && !one.starred))
  const inside = (id: string): Project[] => shown.filter((one) => one.parent === id)
  const fold = (one: Project): void => (chime(one.folded ? 'slide' : 'fold'), void projects.set(one.id, { folded: !one.folded }))
  const asRows = asFolders(shown)
  const rows = (list: Project[]): React.JSX.Element => (
    <SortableList key={moves.epoch} items={list} keyOf={(one) => one.id} onMove={moves.place} onNest={(id, target) => (moves.nest(id, target), void projects.set(target, { folded: false }))} nests={moves.nests} nestSays={moves.nestSays}>{(items) => items.map((one) => {
      const kids = inside(one.id)
      // Folded, only the way down to the one you are in shows; a fold only where something folds.
      const open = kids.length > 0 && !one.folded
      const hung = open ? kids : kids.filter((kid) => path.includes(kid.id))
      const n = openIn(shown, one.id)
      return (
        <SortableRow key={one.id} id={one.id} glide={`project-${one.id}`}>
          <div className="flex flex-col gap-px">
            <FolderRow folder={asRows.find((row) => row.id === one.id)!} all={asRows} page={page} here={here === one.id} n={n || null} naming={naming === one.id}
              onNamed={() => setNaming(null)} onRename={() => setNaming(one.id)} onOpen={() => onOpen(one.id)} onAdd={() => undefined}
              open={open} onFold={kids.length ? () => fold(one) : undefined} kind={kindOf(one, shown, n, { onOpen: () => onOpen(one.id), onRename: () => setNaming(one.id) })} />
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

/** What makes the shared tree row (side-folder-section.tsx `FolderRow`) a project's. */
const kindOf = (project: Project, all: Project[], n: number, { onOpen, onRename }: { onOpen: () => void; onRename: () => void }): TreeKind => ({
  set: projects.set,
  menu: (onIcon) => projectMenu(project, all, { onOpen, onRename, onIcon }),
  held: plural(n, 'open task'),
  marks: { 'data-project-row': project.id, 'data-project-drop': project.id },
  add: projectPath(all, project.id).length < PROJECT_DEPTH ? { label: 'New project inside', run: () => void newProjectHere(project.id) } : null,
  spring: project.folded ? () => void projects.set(project.id, { folded: false }) : undefined
})

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
