import { AnimatePresence, motion } from 'motion/react'
import { EASE, byKeys, shift } from '@/lib/motion'
import { alive } from '@/components/ui/alive-icon'
import XIcon from '@/components/ui/x-icon'
import { Switch } from '@/components/ui/switch'

import { chime } from '@/lib/sound'
import { everOpened, forget, split, touch, useOpenToday, type OpenFor, type OpenNote } from '@/lib/open-today'
import { useLive, vigil, type Settings, type Task } from '@/lib/vigil'
import { taskMenu, useTaskNow, type TaskNow } from './tasks-view'
import { RowMenu, copy, type RowItem } from './row-menu'
import type { PaneName } from './split-pairs'
import { Pressed, Tip, ask, pin, refuse, toast, quietly } from './ui'
import { asideItem } from '@/lib/split'
import { openWindow } from '@/lib/notes'
import { exit, noteLinkText } from '@/lib/capture-links'
import { makeTask } from '@/lib/tasks'

const X = alive(XIcon)

/** How many notes Recent shows in the sidebar; the rest are in the Recent panel, a "Show all" away. */
export const SHOWN = 5
/** The sidebar section's name. */
export const RECENT = 'Recent'
const ABOUT = 'The last notes you opened, today’s first, to get back to them.'

const keyOf = (one: { type: string; id: string }): string => `${one.type}:${one.id}`

/** Pinned or a note's table, for pinning one from here. */
const tableOf = (type: string): 'captures' | 'nuggets' => (type === 'capture' ? 'captures' : 'nuggets')

/** Off the sidebar's Recent, said, with the way back. */
const takeOff = (type: string, id: string, openFor: OpenFor): void => {
  chime('away')
  forget(type, id)
  toast('Off the sidebar. Opening it again brings it back', () => touch(type, id, openFor))
}

/**
 * What a right click on a note in the sidebar offers, the same under Pinned
 * and Recent: open it (here, to the side, in a window), what its kind can do
 * next, pin it, copy a link, and the Bin. `place` adds Recent's own line.
 */
export function sideMenu(type: string, id: string, title: string, { onOpen, pinned, kind, status, place, openFor = 'day', task, now }: {
  onOpen: (type: string, id: string) => void
  /** A task: the menu it has on Today, with the sidebar's own moves after it. */
  task?: Task
  now?: TaskNow
  pinned: boolean
  /** A capture's kind and where it stands, for "Mark done" and "Make it a task". */
  kind?: string
  status?: string
  /** A row of the sidebar's Recent: it can be taken off. */
  place?: 'open'
  openFor?: OpenFor
}): RowItem[] {
  const capture = type === 'capture'
  const waiting = capture && (status ?? 'open') === 'open'
  if (type === 'task' && task)
    return [
      ...taskMenu(task, { open: () => onOpen(type, id), now }),
      'separator',
      place && { label: 'Remove from the sidebar', run: () => takeOff(type, id, openFor) }
    ]
  return [
    { label: 'Open', run: () => onOpen(type, id) },
    asideItem(type, id),
    { label: 'Open in a new window', run: () => openWindow(type, id) },
    'separator',
    waiting && kind === 'todo' && { label: 'Mark it done', run: () => void exit(id, 'resolved') },
    waiting && kind !== 'todo' && { label: 'Make it a task', run: () => void makeTask({ capture: id }) },
    !capture && {
      label: 'Rename…',
      run: () => void ask('A new name', title, undefined, title).then((name) => {
        const next = name?.trim()
        if (!next || next === title) return
        void vigil.saveItem(id, { title: next }).then(() => (chime('noted'), quietly(() => void vigil.saveItem(id, { title }))))
      })
    },
    { label: 'Copy link', hint: 'Paste it into any note to link here', run: () => copy(noteLinkText(capture ? id : `${type}:${id}`, title), 'Copied a link: paste it into any note') },
    'separator',
    pinned
      ? { label: 'Unpin', run: () => pin(tableOf(type), id, false) }
      : { label: 'Pin to the sidebar', run: () => void pinFromSide(type, id) },
    place && { label: 'Remove from the sidebar', run: () => takeOff(type, id, openFor) },
    'separator',
    capture
      ? waiting && { label: 'Move to the Bin', danger: true, run: () => void exit(id, 'discarded') }
      : { label: 'Move to the Bin', danger: true, run: () => void vigil.toBin(id).then(() => (chime('away'), toast('In the Bin', () => void vigil.restore(type, id)))) }
  ]
}

/**
 * ⌫ or Delete on a sidebar row: the menu line named `label` runs, as Finder's
 * ⌫ does what its File menu says. Nothing else hears the key.
 */
export function onRemoveKey(event: React.KeyboardEvent, items: RowItem[], label: string): void {
  if ((event.key !== 'Backspace' && event.key !== 'Delete') || event.altKey || event.ctrlKey || event.shiftKey) return
  const line = items.find((one) => !!one && one !== 'separator' && 'run' in one && one.label === label)
  if (!line || line === 'separator' || !('run' in line)) return
  event.preventDefault()
  event.stopPropagation()
  line.run()
}

/** Pin a note from the sidebar: three at most, as everywhere. Unpinned again, it is back under Recent. */
export async function pinFromSide(type: string, id: string): Promise<boolean> {
  const done = await vigil.pin(tableOf(type), id, true)
  if (!done) {
    refuse('Three notes are pinned already. Unpin one first')
    return false
  }
  // It leaves Recent by being shown under Pinned; in quiet hours, when an
  // untidied capture is not shown pinned, it stays here instead of vanishing.
  chime('pin')
  return true
}

/** Recent shown in the sidebar or not, said with a way back. */
export async function showRecent(on: boolean): Promise<void> {
  chime(on ? 'on' : 'off')
  await vigil.setSettings({ sidebarRecent: on })
  toast(on ? `“${RECENT}” shows in the sidebar now` : `“${RECENT}” hidden. ⇧⌘Y still opens Recent`, () => void vigil.setSettings({ sidebarRecent: !on }).then(() => chime(on ? 'off' : 'on')))
}

/** Recent's switch, in Customize and in Settings: a row like the places' own. */
export function RecentShowRow(): React.JSX.Element {
  const settings = useLive(vigil.settings, null as Settings | null)
  const on = settings?.sidebarRecent !== false
  return (
    <RowMenu items={[{ label: on ? 'Hide from the sidebar' : 'Show in the sidebar', run: () => void showRecent(!on) }]}>
      <label data-show-row="recent"
        className={`group flex cursor-default items-center gap-2.5 rounded-md px-2 py-1.5 text-control text-foreground/80 hover:bg-accent/60 [&>:not(:last-child)]:transition-opacity ${on ? '' : '[&>:not(:last-child)]:opacity-45'}`}>
        <span className={`flex-1 truncate transition-colors ${on ? '' : 'text-muted-foreground'}`}>{RECENT}<span className="text-muted-foreground">: the last {SHOWN} notes you opened</span></span>
        <Switch checked={on} onCheckedChange={(next) => void showRecent(next)} aria-label={`Show ${RECENT}`} />
      </label>
    </RowMenu>
  )
}

/**
 * Recent, under Pinned in the sidebar, Arc's way but short: the last few
 * notes you opened, today's first, then the ones before. Never longer than
 * five rows; "Show all" opens the Recent panel (⇧⌘Y) beside the page instead
 * of growing the sidebar. Pinned ones are never here: Pinned never ages.
 * Hidden from Customize or its heading's right click, nothing else changes.
 */
export function OpenToday({ narrow, resolve, onOpen, pinned, about, onShowAll, onCustomize }: {
  narrow: boolean
  /** A note's name and look, or null for one that is gone (binned, archived, deleted). */
  resolve: (type: string, id: string) => PaneName | null
  onOpen: (type: string, id: string) => void
  /** The pinned notes, `type:id`, left out here. */
  pinned: string[]
  /** A capture's kind and where it stands, or a task as it is, for its menu. */
  about?: (type: string, id: string) => { kind?: string; status?: string; task?: Task }
  /** The Recent panel beside the page. */
  onShowAll: () => void
  onCustomize: () => void
}): React.JSX.Element | null {
  const settings = useLive(vigil.settings, null as Settings | null)
  const taskNow = useTaskNow()
  const openFor: OpenFor = settings?.sidebarOpenFor ?? 'day'
  const { list, now } = useOpenToday()
  if (!settings || settings.sidebarRecent === false) return null
  const live = list.filter((one) => !pinned.includes(keyOf(one)) && resolve(one.type, one.id))
  const parts = split(live, openFor, now)
  const all = [...parts.open, ...parts.earlier]
  const visible = all.slice(0, SHOWN)
  const today = new Set(parts.open.map(keyOf))
  // The notes' names are read in a moment after the window opens: until then, nothing is said.
  const ready = !list.length || live.length > 0

  const row = (one: OpenNote): React.JSX.Element | null => {
    const name = resolve(one.type, one.id)
    if (!name) return null
    const Icon = name.icon
    const items = sideMenu(one.type, one.id, name.title, { onOpen, pinned: false, ...about?.(one.type, one.id), now: taskNow, place: 'open', openFor })
    const before = !today.has(keyOf(one))
    return (
      <motion.div key={keyOf(one)} layout="position" data-open-row={before ? 'earlier' : 'open'}
        // Opened or closed by a key (⌘K, ⌘W), the row is simply there or gone;
        // by the pointer it grows in, and leaves quicker than it came.
        initial={byKeys() ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
        variants={{ gone: () => (byKeys() ? { opacity: 0, height: 0, transition: { duration: 0 } } : { opacity: 0, height: 0, transform: shift('translateY(6px)'), transition: { duration: 0.15, ease: EASE } }) }}
        exit="gone"
        transition={{ duration: 0.22, ease: EASE }} className="overflow-hidden">
        <RowMenu items={items}>
          <span className="group/open relative flex min-w-0">
            <Tip label={narrow ? name.title || 'Untitled' : ''}>
              <button
                type="button"
                data-side-row
                data-private={name.private ? '' : undefined}
                data-drag-open={keyOf(one)}
                onClick={() => (chime('tap'), onOpen(one.type, one.id))}
                // ⌫ on the row does what its menu's remove line says: off the sidebar, with Undo.
                onKeyDown={(event) => onRemoveKey(event, items, 'Remove from the sidebar')}
                className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-1.5 ${before ? 'text-foreground/70' : 'text-foreground/80'} ${narrow ? 'justify-center px-0' : 'pr-7 pl-2'}`}
              >
                <Icon className="size-4 shrink-0" style={name.tint ? { color: name.tint } : undefined} />
                {!narrow && <span className="private-text min-w-0 flex-1 truncate text-left">{name.title || 'Untitled'}</span>}
              </button>
            </Tip>
            {!narrow && (
              <Tip label="Take it off the sidebar  ⌫">
                <button type="button" data-no-split aria-label="Remove from the sidebar"
                  onClick={() => takeOff(one.type, one.id, openFor)}
                  className="after:absolute after:-inset-0.5 after:rounded-full absolute top-1/2 right-1 z-10 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground opacity-0 transition-opacity group-hover/open:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100">
                  <X className="size-3" />
                </button>
              </Tip>
            )}
          </span>
        </RowMenu>
      </motion.div>
    )
  }

  const headingMenu: RowItem[] = [
    { label: 'Show all', hint: 'The Recent panel, beside the page', keys: '⇧⌘Y', run: onShowAll },
    'separator',
    { label: 'Hide from the sidebar', run: () => void showRecent(false) },
    { label: 'Customize the sidebar…', run: () => void setTimeout(onCustomize, 120) }
  ]

  return (
    // A place to drop onto as well, to bring a pinned note back here.
    <div data-side-drop="open" data-open-today className="rounded-md transition-colors data-[queue-hot]:bg-[color-mix(in_oklab,var(--primary)_12%,transparent)] data-[queue-hot]:ring-1 data-[queue-hot]:ring-[color-mix(in_oklab,var(--primary)_40%,transparent)]">
      {narrow ? <div className="mt-3" /> : (
        <RowMenu items={headingMenu}>
          <div className="mt-3 mb-0.5 flex">
            <Tip label={ABOUT}>
              <div data-open-heading className="flex w-fit items-center gap-1 px-2 py-0.5 text-meta text-muted-foreground">{RECENT}</div>
            </Tip>
          </div>
        </RowMenu>
      )}
      <AnimatePresence initial={false}>
        {visible.map((one) => row(one))}
      </AnimatePresence>
      {/* More than fits: the whole of it opens beside the page, never down the sidebar. */}
      {!narrow && all.length > SHOWN && (
        <Tip label="Everything from lately, in the Recent panel beside the page">
          <button type="button" data-side-row data-recent-all onClick={() => (chime('slide'), onShowAll())}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-control text-muted-foreground hover:text-foreground">
            <span className="flex-1">Show all</span>
            <Pressed keys="⇧⌘Y" />
          </button>
        </Tip>
      )}
      {/* Only once the names are read: never "Nothing opened" while they load. */}
      {!narrow && ready && !all.length && (
        <p data-open-empty className="px-2 pt-0.5 pb-1 text-control text-muted-foreground">
          {!everOpened() ? 'Each note you open is listed here, so you can get back to it.' : 'Nothing opened lately.'}
        </p>
      )}
    </div>
  )
}
