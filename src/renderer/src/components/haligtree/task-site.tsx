import { Link2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { EASE } from '@/lib/motion'
import { taskName } from '@/lib/tasks'
import { chime } from '@/lib/sound'
import { haligtree, type Task } from '@/lib/haligtree'
import { looksLikeAddress, hrefFor } from '@/extensions/link-tidy'
import { isReadable, openArticle } from '@/components/pdf/pdf-reader'
import { canSplit } from '@/lib/split'
import { RowMenu, type RowItem } from './row-menu'
import { Tip, refuse, toast } from './ui'
import { linkShown } from '../../../../main/task-links'

type Linked = { link?: string | null; linkIcon?: string | null; linkTitle?: string | null; title?: string }

/** A linked page's name on its chip: its own title once asked, else the site's name; never the raw address. */
export const siteName = (href: string): string => URL.parse(href)?.hostname.replace(/^www\./, '') || href
const same = (a: string): string => a.toLowerCase().replace(/\s+/g, ' ').trim()
/** Where the task is named by the page's own title, the chip says the site instead: "Harry Potter" never twice in a row. */
export const pageName = (task: Linked): string => {
  if (!task.link) return ''
  const title = task.linkTitle?.trim()
  return title && !(task.title && same(taskName(task.title).text) === same(title)) ? title : siteName(task.link)
}

/** A link opened as a click asks: in the reader when it can read the page, else the browser; ⌘ a new tab, ⌥ to the side. */
const follow = (href: string, event: { metaKey: boolean; altKey: boolean }, from?: Element | null): void => {
  chime('tap')
  openArticle(href, undefined, event.metaKey ? 'tab' : event.altKey ? 'aside' : undefined, from?.closest('[data-pane]')?.getAttribute('data-pane'))
}

/**
 * A linked page, as one chip everywhere it shows: the page's icon and its title in a quiet pill, as the add-a-task bar
 * draws a link pasted in before the task is made. A click opens it; `onRemove` gives it an × (`hover`: only while the
 * pointer is on it, its room kept so nothing moves). It sits inside rows that are themselves buttons, so it is a link
 * by role and keeps the row's press to itself.
 */
export function LinkChip({ href, title, icon, onRemove, hover = false, className = '' }: { href: string; title: string; icon?: string | null; onRemove?: () => void; hover?: boolean; className?: string }): React.JSX.Element {
  const stop = (event: React.SyntheticEvent): void => event.stopPropagation()
  return (
    <span role="link" tabIndex={0} data-task-link={href} aria-label={`Open ${title}`} title={linkShown(href)}
      onClick={(event) => (stop(event), event.preventDefault(), follow(href, event, event.currentTarget))}
      onKeyDown={(event) => event.key === 'Enter' && (stop(event), event.preventDefault(), follow(href, event, event.currentTarget))}
      onPointerDown={stop} onMouseDown={stop}
      className={`group/link inline-flex max-w-[12rem] min-w-0 shrink-0 cursor-pointer items-center gap-1 rounded-full border bg-background py-0.5 pr-1 pl-2 text-meta text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring ${className}`}>
      {icon ? <img src={icon} alt="" draggable={false} className="size-3.5 shrink-0 rounded-sm object-contain" /> : <Link2 aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />}
      <span data-link-title className="min-w-0 truncate">{title}</span>
      {onRemove ? (
        <span role="button" tabIndex={-1} data-link-remove aria-label={`Remove the link to ${title}`}
          onClick={(event) => (stop(event), event.preventDefault(), onRemove())}
          className={`grid size-4 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground transition-opacity hover:bg-foreground/10 hover:text-foreground ${hover ? 'opacity-0 group-hover/link:opacity-100 group-focus-visible/link:opacity-100' : ''}`}>
          <X className="size-3" />
        </span>
      ) : <span aria-hidden className="w-1" />}
    </span>
  )
}

/** A task's link taken off, heard, with Undo putting it back as it was (its title and icon too). */
export function unlinkTask(task: Pick<Task, 'id' | 'link' | 'linkTitle' | 'linkIcon'>): void {
  const was = { link: task.link ?? null, linkTitle: task.linkTitle ?? null, linkIcon: task.linkIcon ?? null }
  if (!was.link) return
  void haligtree.saveTask(task.id, { link: null }).then(() => {
    chime('off')
    toast('Link removed', () => void haligtree.saveTask(task.id, was))
  })
}

/** A task linked to another page: the old one comes back on Undo. A word that is not an address is said, not taken. */
export function relinkTask(task: Pick<Task, 'id' | 'link' | 'linkTitle' | 'linkIcon'>, text: string): void {
  const pasted = text.trim()
  if (!looksLikeAddress(pasted)) return refuse('The copied words are not a link')
  const href = hrefFor(pasted)
  if (href === task.link) return chime('nope')
  const was = { link: task.link ?? null, linkTitle: task.linkTitle ?? null, linkIcon: task.linkIcon ?? null }
  void haligtree.saveTask(task.id, { link: href }).then(() => {
    chime('settled')
    toast(was.link ? `Now linked to ${siteName(href)}` : `Linked to ${siteName(href)}`, () => void haligtree.saveTask(task.id, was))
  })
}

/** What a right-click on a task's link offers: open it each way, copy it, link another page, take it off. */
export const linkMenu = (task: Pick<Task, 'id' | 'link' | 'linkTitle' | 'linkIcon'>, from: () => Element | null): RowItem[] => {
  const href = task.link
  if (!href) return []
  const pane = (): string | null | undefined => from()?.closest('[data-pane]')?.getAttribute('data-pane')
  return [
    { label: isReadable(href) ? 'Open in the reader' : 'Open', run: () => follow(href, { metaKey: false, altKey: false }, from()) },
    { label: 'Open in the browser', can: () => isReadable(href), run: () => (chime('tap'), void window.open(href, '_blank', 'noopener')) },
    { label: 'Open in a new tab', can: () => isReadable(href) && canSplit(), run: () => (chime('tap'), openArticle(href, undefined, 'tab', pane())) },
    { label: 'Open to the side', can: () => isReadable(href) && canSplit(), run: () => (chime('tap'), openArticle(href, undefined, 'aside', pane())) },
    'separator',
    { label: 'Copy link', run: () => void navigator.clipboard.writeText(href).then(() => (chime('copy'), toast('Link copied', undefined, 'info')), () => refuse('Could not copy the link')) },
    { label: 'Paste a new link', hint: 'The link you copied, in place of this one', run: () => void navigator.clipboard.readText().then((text) => relinkTask(task, text), () => refuse('Could not read the copied link')) },
    { label: 'Remove link', danger: true, run: () => unlinkTask(task) }
  ]
}

/**
 * A task's linked page as its chip (`LinkChip`), wherever the task shows: × on hover takes the link off (Undo puts it
 * back), right-click opens it each way, copies it or links another page, and a link pasted on it while it has the
 * keys replaces it. `edit` off where the task is only read (a search preview): the chip alone.
 */
export function TaskLink({ task, edit = true, className = '' }: { task: Linked & Pick<Task, 'id'>; edit?: boolean; className?: string }): React.JSX.Element | null {
  const href = task.link
  const chip = href && <LinkChip href={href} title={pageName(task)} icon={task.linkIcon} hover className={className} onRemove={edit ? () => unlinkTask(task) : undefined} />
  // Taken off, it folds away (its width and the line's height gliding) rather than leaving at once.
  return (
    <AnimatePresence initial={false}>
      {href && (
        <motion.span key={href} data-task-link-wrap className="inline-flex min-w-0 overflow-hidden"
          initial={{ opacity: 0, width: 0, height: 0 }} animate={{ opacity: 1, width: 'auto', height: 'auto' }} exit={{ opacity: 0, width: 0, height: 0 }}
          transition={{ duration: 0.18, ease: EASE }}>
          {edit ? (
            <RowMenu items={() => linkMenu(task, () => document.querySelector(`[data-task-link="${CSS.escape(href)}"]`))}>
              <span className="contents" onContextMenu={(event) => event.stopPropagation()}
                onPaste={(event) => (event.preventDefault(), event.stopPropagation(), relinkTask(task, event.clipboardData.getData('text/plain')))}>
                {chip}
              </span>
            </RowMenu>
          ) : chip}
        </motion.span>
      )}
    </AnimatePresence>
  )
}

/**
 * A task named by a link, in a compact row with no room for its chip (a calendar block, the day's timeline, a
 * sticky): the site's icon before its name, which opens the page as the chip does.
 */
export function TaskSite({ task, className = 'size-3.5', tip = true }: { task: Linked; className?: string; /** Off inside a row that has a tip of its own: one hover, one surface. */ tip?: boolean }): React.JSX.Element | null {
  const href = task.link
  if (!href) return null
  const name = pageName(task)
  const mark = (
    <span role="link" data-task-site={href} aria-label={`Open ${name}`} onClick={(event) => (event.stopPropagation(), event.preventDefault(), follow(href, event, event.currentTarget))} onPointerDown={(event) => event.stopPropagation()}
      className="-m-0.5 inline-grid shrink-0 cursor-pointer place-items-center rounded-sm p-0.5 transition-colors hover:bg-foreground/10">
      {task.linkIcon
        ? <img src={task.linkIcon} alt="" draggable={false} className={`${className} rounded-[3px] object-contain`} />
        : <Link2 aria-hidden className={`${className} text-muted-foreground`} />}
    </span>
  )
  return tip ? <Tip label={`Open ${name}`}>{mark}</Tip> : mark
}
