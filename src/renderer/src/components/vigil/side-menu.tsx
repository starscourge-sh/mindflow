import { chime } from '@/lib/sound'
import { useLive, vigil, type Item, type Task } from '@/lib/vigil'
import { captureMenu, useCaptures } from '../capture-list'
import { gemMenu } from './items-view'
import { taskMenu, type TaskNow } from './tasks-view'
import { copy, type RowItem } from './row-menu'
import { ask, pin, refuse, quietly } from './ui'
import { asideItem } from '@/lib/split'
import { openApart } from '@/lib/apart'
import { exit, noteLinkText } from '@/lib/capture-links'
import { makeTask } from '@/lib/tasks'
import { moveToBin } from '@/lib/to-bin'

/**
 * A note's own full right-click menu, wherever its row or card shows (a tag
 * page, Home, search, the Recent panel, Pinned): a capture's as the Inbox has
 * it, a gem's or a piece of writing's as its page has it. Null for anything
 * else, which keeps the shorter `sideMenu`.
 */
export function useFullMenu(): (type: string, id: string, open: () => void) => RowItem[] | null {
  const captures = useCaptures(true)
  const gems = useLive(() => Promise.all([vigil.items('nugget'), vigil.items('article')]).then((both) => both.flat()), [] as Item[], [], ['item'], 'items:gems-and-writing')
  return (type, id, open) => {
    const capture = type === 'capture' ? captures.find((one) => one.id === id) : undefined
    if (capture) return captureMenu(capture, open)
    const gem = type === 'nugget' || type === 'article' ? gems.find((one) => one.id === id) : undefined
    return gem ? gemMenu(gem, open) : null
  }
}

/** Pinned or a note's table, for pinning one from here. */
const tableOf = (type: string): 'captures' | 'nuggets' => (type === 'capture' ? 'captures' : 'nuggets')

/**
 * What a right click on a note offers, the same under Pinned and in every list
 * that borrows it: open it (here, to the side, in a window), what its kind can
 * do next, pin it, copy a link, and the Bin.
 */
export function sideMenu(type: string, id: string, title: string, { onOpen, pinned, kind, status, task, now }: {
  onOpen: (type: string, id: string) => void
  /** A task: the menu it has on Today, with the sidebar's own moves after it. */
  task?: Task
  now?: TaskNow
  pinned: boolean
  /** A capture's kind and where it stands, for "Mark done" and "Make it a task". */
  kind?: string
  status?: string
}): RowItem[] {
  const capture = type === 'capture'
  const waiting = capture && (status ?? 'open') === 'open'
  if (type === 'task' && task)
    return taskMenu(task, { open: () => onOpen(type, id), now })
  return [
    { label: 'Open', run: () => onOpen(type, id) },
    asideItem(type, id),
    { label: 'Open in a new window', run: () => openApart(type, id) },
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
    'separator',
    capture
      ? waiting && { label: 'Move to the Bin', danger: true, run: () => void exit(id, 'discarded') }
      : { label: 'Move to the Bin', danger: true, run: () => void moveToBin([{ type, id }]) }
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

/** Pin a note from the sidebar: three at most, as everywhere. */
export async function pinFromSide(type: string, id: string): Promise<boolean> {
  const done = await vigil.pin(tableOf(type), id, true)
  if (!done) {
    refuse('Three notes are pinned already. Unpin one first')
    return false
  }
  chime('pin')
  return true
}
