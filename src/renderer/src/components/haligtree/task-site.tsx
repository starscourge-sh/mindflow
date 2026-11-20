import { Link2 } from 'lucide-react'
import { chime } from '@/lib/sound'
import { Tip } from './ui'
import { linkName, linkShown } from '../../../../main/task-links'

type Linked = { link?: string | null; linkIcon?: string | null }

/**
 * A task named by a link shows as a bookmark (main/task-links.ts): the site's icon before its name, which opens the
 * page; the same on every surface that lists tasks. It sits inside rows that are themselves buttons, so it is a link
 * by role, and keeps the row's press to itself.
 */
export function TaskSite({ task, className = 'size-3.5', tip = true }: { task: Linked; className?: string; /** Off inside a row that has a tip of its own: one hover, one surface. */ tip?: boolean }): React.JSX.Element | null {
  const href = task.link
  if (!href) return null
  const open = (event: React.SyntheticEvent): void => {
    event.stopPropagation()
    event.preventDefault()
    chime('tap')
    window.open(href, '_blank', 'noopener')
  }
  const mark = (
    <span role="link" data-task-site={href} aria-label={`Open ${linkShown(href)}`} onClick={open} onPointerDown={(event) => event.stopPropagation()}
      className="-m-0.5 inline-grid shrink-0 cursor-pointer place-items-center rounded-sm p-0.5 transition-colors hover:bg-foreground/10">
      {task.linkIcon
        ? <img src={task.linkIcon} alt="" draggable={false} className={`${className} rounded-[3px] object-contain`} />
        : <Link2 aria-hidden className={`${className} text-muted-foreground`} />}
    </span>
  )
  return tip ? <Tip label={`Open ${linkShown(href)}`}>{mark}</Tip> : mark
}

/** The address a bookmark task keeps, said quietly under its name: the site and path, never the query. Not while the name is the site and path itself (its title still coming): said once, not twice. */
export function TaskAddress({ task, className = '' }: { task: Linked & { title?: string }; className?: string }): React.JSX.Element | null {
  return task.link && task.title !== linkName(task.link) ? <span data-task-address dir="ltr" className={`min-w-0 truncate ${className}`}>{linkShown(task.link)}</span> : null
}
