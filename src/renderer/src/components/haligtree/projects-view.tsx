import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, FolderPlus, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { EASING } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { newProjectHere, projectPath, projects, ungroupTasks, useProjects } from '@/lib/projects'
import type { Task } from '@/lib/haligtree'
import { GroupIcon, IconChoice } from './kept-groups'
import { NameInPlace } from './name-in-place'
import { RowMenu, openFromGrip } from './row-menu'
import { ProjectsTree, projectMenu } from './side-projects'
import { TasksTabs, TasksView } from './tasks-view'
import { Empty, Page, Rolling, Tip, sayNow, typing } from './ui'
import { num } from '../../../../main/dates'

/**
 * Tasks' "Projects" tab: every project as a tree, the rows the sidebar draws at the list's size, the archived ones in a
 * fold of their own under them, and "New project" in the head. A project opens on its own page (`ProjectView`).
 */
export function ProjectsView({ onOpen }: { onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const all = useProjects()
  const [archivedOpen, setArchivedOpen] = useState(false)
  const live = all.filter((one) => !one.archived)
  const archived = all.length - live.length
  const open = (id: string): void => onOpen('project', id)
  return (
    <Page title="projects" lead={<TasksTabs mode="projects" onOpen={onOpen} />} count={live.length} unit={['project', 'projects']}
      actions={live.length > 0 && <Button variant="ghost" size="sm" data-projects-new="" onClick={() => void newProjectHere(null)}><FolderPlus className="size-3.5" />New project</Button>}>
      <div data-projects-page="" className="list-edge mt-8 mb-6 flex flex-col">
        {/* Nothing yet: the app's own empty page and the one thing to do. */}
        {!live.length && (
          <Empty title="No projects yet" art={<GroupIcon icon={null} color={null} className="size-11" />}
            action={<Button size="sm" data-projects-first="" onClick={() => void newProjectHere(null)}><FolderPlus className="size-3.5" />New project</Button>}>
            A project keeps the tasks of one goal together: a course, a move, a paper.
          </Empty>
        )}
        <ProjectsTree page onOpen={open} />
        {archived > 0 && (
          <>
            <h2 className="list-ink mt-6 mb-1 border-b pb-1.5 text-meta font-medium text-muted-foreground">
              <button type="button" data-projects-archived="" aria-expanded={archivedOpen} onClick={() => (chime(archivedOpen ? 'fold' : 'slide'), setArchivedOpen(!archivedOpen))} className="flex w-full cursor-pointer items-center gap-1 text-left">
                Archived <span className="font-normal"><Rolling text={archived} /></span>
                <ChevronRight className={`size-3.5 transition-transform duration-150 motion-reduce:transition-none ${archivedOpen ? 'rotate-90' : ''}`} style={{ transitionTimingFunction: EASING }} />
              </button>
            </h2>
            {archivedOpen && <ProjectsTree page archived onOpen={open} />}
          </>
        )}
      </div>
    </Page>
  )
}

/**
 * One project's page: its tasks as every Tasks list has them (the same rows, keys, menus, drag and sections by day),
 * new ones landing in it, its groups heading the list. Over the list, the project itself, apart: its path, its icon and
 * its name large (renamed in place), its menu, and the projects inside it.
 */
export function ProjectView({ id, focus, onOpen }: { id: string; focus?: string; onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const all = useProjects()
  const project = all.find((one) => one.id === id)
  const keep = useCallback((task: Task) => task.projectId === id, [id])
  if (!project) return <Page title="project" lead={<TasksTabs mode="projects" onOpen={onOpen} />}><Empty title="This project is gone">It was deleted. Its tasks stayed in Tasks.</Empty></Page>
  return <TasksView key={id} mode="alltasks" project={id} keep={keep} focus={focus} onOpen={onOpen} lead={<TasksTabs mode="projects" onOpen={onOpen} />} said={<ProjectHead id={id} onOpen={onOpen} />} />
}

function ProjectHead({ id, onOpen }: { id: string; onOpen: (type: string, id: string) => void }): React.JSX.Element | null {
  const all = useProjects()
  const project = all.find((one) => one.id === id)
  const [naming, setNaming] = useState(false)
  const [picking, setPicking] = useState(false)
  // F2 renames the project you are on, as Finder renames what is picked.
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'F2' || event.metaKey || event.ctrlKey || event.altKey || typing() || document.querySelector('[data-cursor]')) return
      event.preventDefault()
      setNaming(true)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  if (!project) return null
  const path = projectPath(all, project.parent)
  const name = (words: string | null): void => {
    setNaming(false)
    const next = words?.trim()
    if (!next || next === project.name) return
    chime('tap')
    sayNow(projects.set(id, { name: next }), `Renamed ${project.name} to ${next}`, () => void projects.set(id, { name: project.name }))
  }
  const pick = (icon: string | null): void => {
    setPicking(false)
    if (icon === project.icon) return
    chime('tap')
    sayNow(projects.set(id, { icon }), `Changed ${project.name}’s icon`, () => void projects.set(id, { icon: project.icon }))
  }
  const menu = (): ReturnType<typeof projectMenu> => projectMenu(project, all, { onOpen: () => undefined, onRename: () => setNaming(true), onIcon: () => setPicking(true) })
  return (
    <div data-project-head={id} className="flex flex-col gap-1">
      {/* Where it sits, each step a way back up; "Projects" first, every project. */}
      <nav aria-label="Where this project is" className="flex min-w-0 flex-wrap items-center gap-1 text-control text-muted-foreground">
        <button type="button" onClick={() => (chime('page'), onOpen('view', 'projects'))} className="cursor-pointer rounded px-1 hover:bg-accent hover:text-foreground">Projects</button>
        {path.map((up) => (
          <span key={up.id} className="flex items-center gap-1">
            <ChevronRight aria-hidden className="size-3" />
            <button type="button" onClick={() => (chime('page'), onOpen('project', up.id))} className="cursor-pointer rounded px-1 hover:bg-accent hover:text-foreground">{up.name}</button>
          </span>
        ))}
      </nav>
      {/* The project itself, apart from its list and larger: its icon (a press changes it), its name (a press renames it). */}
      <Popover open={picking} onOpenChange={setPicking}>
        <RowMenu items={menu}>
          <div className="group/head flex min-w-0 items-center gap-2">
            <PopoverAnchor asChild>
              <button type="button" aria-label="Change its icon" onClick={() => (chime('open'), setPicking(true))} className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-accent">
                <GroupIcon icon={project.icon} color={project.color} className="size-5" />
              </button>
            </PopoverAnchor>
            {naming ? (
              <NameInPlace initial={project.name} data-project-title-name="" label="Project name" placeholder="Name the project" onDone={name}
                className="min-w-0 flex-1 rounded-md bg-accent/60 px-1 text-title font-semibold text-foreground outline-none ring-1 ring-ring/40" />
            ) : (
              <h1 data-project-title="" className="min-w-0 truncate text-title font-semibold text-foreground">
                <button type="button" onClick={() => setNaming(true)} className="max-w-full cursor-pointer truncate rounded-md px-1 text-left hover:bg-accent/60">{project.name}</button>
              </h1>
            )}
            {project.archived ? <span className="shrink-0 rounded-md bg-accent px-1.5 py-0.5 text-control font-medium text-foreground">Archived</span> : null}
            <Tip label="More">
              <button type="button" data-project-head-more="" aria-label={`${project.name} menu`} onClick={openFromGrip} className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                <MoreHorizontal className="size-4" />
              </button>
            </Tip>
          </div>
        </RowMenu>
        <PopoverContent align="start" className="w-auto gap-0 overflow-hidden p-0" onFocusOutside={(event) => event.preventDefault()}>
          <IconChoice group={project} onPick={pick} />
        </PopoverContent>
      </Popover>
      {/* The projects inside it, as rows the sidebar draws, before its own tasks. */}
      <SubProjects id={id} onOpen={(one) => onOpen('project', one)} />
    </div>
  )
}

function SubProjects({ id, onOpen }: { id: string; onOpen: (id: string) => void }): React.JSX.Element | null {
  const all = useProjects()
  if (!all.some((one) => one.parent === id && !one.archived)) return null
  return <div data-sub-projects="" className="mt-2"><ProjectsTree page under={id} onOpen={onOpen} /></div>
}

/**
 * A group's heading in a project's list: a press folds it (kept on the group), F2 or its menu renames it in place, and
 * its menu lets its tasks out of it (⇧⌘G).
 */
export function GroupHeading({ id, name, count, folded, naming, members, onNaming }: { id: string; name: string; count: number; folded: boolean; naming: boolean; members: string[]; onNaming: (on: boolean) => void }): React.JSX.Element {
  const rename = (words: string | null): void => {
    onNaming(false)
    const next = words?.trim()
    if (!next || next === name) return
    chime('tap')
    sayNow(projects.set(id, { name: next }), `Renamed the group ${next}`, () => void projects.set(id, { name }))
  }
  return (
    <RowMenu items={() => [
      { label: folded ? 'Unfold' : 'Fold', run: () => (chime(folded ? 'slide' : 'fold'), void projects.set(id, { folded: !folded })) },
      { label: 'Rename…', keys: 'F2', run: () => onNaming(true) },
      'separator',
      { label: `Take ${count === 1 ? 'its task' : `its ${num(count)} tasks`} out of the group`, hint: 'They stay in the project; the group goes', keys: '⇧⌘G', run: () => void ungroupTasks(members) }
    ]}>
      <h2 data-task-group={id} className="list-ink mt-6 mb-1 border-b pb-1.5 text-meta font-medium text-muted-foreground">
        {naming ? (
          <NameInPlace initial={name} data-task-group-name={id} label="Group name" placeholder="Name the group" onDone={rename}
            className="w-full rounded-md bg-accent/60 px-1 text-meta font-medium text-foreground outline-none ring-1 ring-ring/40" />
        ) : (
          <button type="button" data-task-group-fold={id} aria-expanded={!folded} onClick={() => (chime(folded ? 'slide' : 'fold'), void projects.set(id, { folded: !folded }))}
            onKeyDown={(event) => event.key === 'F2' && (event.preventDefault(), onNaming(true))}
            className="mf-hit relative flex w-full cursor-pointer items-center gap-1 text-left">
            {name} <span className="font-normal"><Rolling text={count} /></span>
            <ChevronRight className={`size-3.5 transition-transform duration-150 motion-reduce:transition-none ${folded ? '' : 'rotate-90'}`} style={{ transitionTimingFunction: EASING }} />
          </button>
        )}
      </h2>
    </RowMenu>
  )
}
