import { createElement, useEffect, useRef, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { chime, tear } from './sound'
import { haligtree } from './haligtree'
import { refuse, toast, whyFailed } from '@/components/haligtree/ui'
import { num, plural } from '../../../main/dates'
import { binFlight, leaveRoom } from './fly-home'
import { expectBack, stays } from './room'

/**
 * One way to the Bin for every kind of thing, from every list: picked rows
 * and ⌫, a right-click, a button. Said the same way each time: how many went,
 * that they are in the Bin, an Undo (⌘Z too), and the Bin one key away.
 *
 * A capture goes from wherever it is (open, resolved, saved as a gem) and
 * comes back there; a gem it was saved as stays in Gems. A task is closed
 * without doing; a gem, writing, question or goal is put in the Bin.
 */
type BinRef = { type: string; id: string; status?: string }

/** What a pane can hold open beside a list, asked the same way. */
export type BinKind = 'task' | 'capture' | 'item'

/** Whether one is in the Bin now (or gone for good). */
export async function inBin(kind: BinKind, id: string): Promise<boolean> {
  if (kind === 'task') {
    const task = await haligtree.task(id)
    return !task || task.status === 'dropped'
  }
  if (kind === 'capture') {
    const capture = await window.api.captures.get(id)
    return !capture || capture.status === 'discarded'
  }
  const item = await haligtree.item(id)
  return !item || !!(item as { binnedAt?: string | null }).binnedAt
}

/** The page every “Move to the Bin” points to, in one key. */
export const seeTheBin = { label: 'Open the Bin', key: 'B', run: () => window.api.openInHome('view', 'discarded') }

const saidOf = (n: number): string => (n === 1 ? 'Moved to the Bin' : `Moved ${num(n)} to the Bin`)

/** Move each one to the Bin, at once, with one notice and one undo for the lot. Gives back how many went. */
export async function moveToBin(refs: BinRef[], onUndo?: () => void, said?: string): Promise<number> {
  // A capture already in the Bin, or a task already closed without doing, is there already.
  const going = refs.filter((one) => !(one.type === 'capture' && one.status === 'discarded') && !(one.type === 'task' && one.status === 'dropped'))
  if (!going.length) {
    refuse(refs.length === 1 ? 'It is in the Bin already' : 'They are in the Bin already')
    return 0
  }
  // Each row still on screen (the first four) crumples and flies to the Bin once it is there, wherever it was binned from
  // (a list, a menu, the box's tabs): its picture is taken now, while it is still there. By a key it simply goes.
  const flights = going.slice(0, 4).map((one) => binFlight(one.id))
  // The rest of what was picked and is on show leaves with them: every gap closes in the one move, as the paper lifts off.
  for (const one of going.slice(4, 60)) leaveRoom(one.id)
  // Captures, and gems, pages and the rest, each kind in one write with one change told, and back the same way:
  // one call a row made 95 rows take two seconds of every list reloading, going and coming back.
  const captures = going.filter((one) => one.type === 'capture')
  const others = going.filter((one) => one.type !== 'capture' && one.type !== 'task')
  const tasks = going.filter((one) => one.type === 'task')
  // Every write at once, each giving back how to take it back. Settled one by one, so a part
  // that fails leaves the rest moved and still undoable.
  const parts: { count: number; write: Promise<(() => Promise<unknown>)[]> }[] = [
    ...(captures.length ? [{ count: captures.length, write: window.api.captures.saveMany(captures.map((one) => ({ id: one.id, patch: { status: 'discarded', bin: true } })))
      .then((saved) => [() => window.api.captures.saveMany(captures.map((one, at) => ({ id: one.id, patch: { status: (saved[at]?.was ?? 'open') as 'open', bin: true } })))]) }] : []),
    ...(others.length ? [{ count: others.length, write: haligtree.toBinMany(others.map((one) => one.id)).then(() => [() => haligtree.restoreMany(others.map((one) => ({ type: one.type, id: one.id })))]) }] : []),
    // A task keeps its own way: a done one comes back done at the time it was done.
    ...tasks.map((one) => ({ count: 1, write: (async () => {
      const was = one.status && one.status !== 'dropped' ? one.status : 'open'
      const doneAt = was === 'done' ? ((await haligtree.task(one.id))?.completedAt ?? null) : null
      await haligtree.saveTask(one.id, { status: 'dropped' })
      return [() => haligtree.saveTask(one.id, { status: was, ...(doneAt ? { completedAt: doneAt } : {}) })]
    })() }))
  ]
  const settled = Promise.allSettled(parts.map((part) => part.write))
  const gems = going.filter((one) => one.type === 'capture' && one.status === 'promoted').length
  const already = refs.length - going.length
  const extra = [
    gems ? `${gems === 1 ? 'its gem stays' : 'their gems stay'} in Gems` : '',
    already ? `${plural(already, 'was', 'were')} in the Bin already` : ''
  ].filter(Boolean).join('; ')
  // Undo at any moment, even with writes still landing: it waits for them, then puts back every one that went.
  const undo = (): void => {
    if (last?.undo === undo) last = null
    // As they are drawn again, the rows part for them on the clock they closed on.
    expectBack(going.map((one) => one.id))
    void settled
      .then((all) => Promise.all(all.flatMap((one) => (one.status === 'fulfilled' ? one.value : [])).map((back) => back())))
      .then(() => (onUndo?.(), window.dispatchEvent(new CustomEvent('haligtree:came-back', { detail: going.map((one) => one.id) }))))
  }
  last = { ids: going.map((one) => one.id), undo, at: Date.now(), page: pageInFront() }
  // Said as the writes go out, before the first lands: the rows never leave ahead of the notice and its Undo.
  toast(said ?? `${saidOf(going.length)}${extra ? `: ${extra}` : ''}`, undo, 'success', said ? undefined : seeTheBin, { type: 'view', id: 'discarded', at: going.map((one) => one.id).join(',') })
  const all = await settled
  let count = going.length
  const failed = all.flatMap((one, at) => (one.status === 'rejected' ? [{ count: parts[at].count, why: one.reason }] : []))
  if (failed.length) {
    // Some did not go: the notice says so, with what did, and Undo still takes back what went.
    const stayed = failed.reduce((sum, one) => sum + one.count, 0)
    const moved = going.length - stayed
    chime('nope')
    toast(moved
      ? `${saidOf(moved)}; ${num(stayed)} could not be moved: ${whyFailed(failed[0].why)}.`
      : `Not moved to the Bin: ${whyFailed(failed[0].why)}.`, moved ? undo : undefined, 'error')
    // None went: each row is itself again under the pointer (lib/room.ts).
    if (!moved) return (stays(going.map((one) => one.id)), 0)
    count = moved
  }
  for (const land of flights) land?.()
  // Heard by each page with one open beside its list (lib/nav.ts useOpened): off it, onto the next.
  binned(going.map((one) => one.id))
  // The Bin's one sound, from every list and every kind.
  tear()
  return count
}

/** Said to every page once these are in the Bin, by any way there: what is open moves off them. False once a page has moved on. */
export const binned = (ids: string[]): boolean => window.dispatchEvent(new CustomEvent('haligtree:binned', { detail: ids, cancelable: true }))

/** The last move to the Bin, for a page it emptied to offer its Undo. Taken back, it is gone. */
let last: { ids: string[]; undo: () => void; at: number; page: string | null } | null = null
export const lastBinned = (): { ids: string[]; undo: () => void } | null => last
/** The page the keys were on (home.tsx marks each with data-page). */
const pageInFront = (): string | null => (document.activeElement?.closest('[data-page]') ?? document.querySelector('[data-page]'))?.getAttribute('data-page') ?? null
/** The move to the Bin that emptied this page a moment ago, if one did: its example waits, so nothing looks as if it stayed. */
export const justEmptied = (page: string | null): { ids: string[]; undo: () => void } | null => (last && last.page === page && Date.now() - last.at < 4000 ? last : null)

/** A right-click line for the lot: “Move 12 to the Bin”, its keys shown. */
export const binItem = (refs: BinRef[], after?: () => void): { id: string; label: string; keys: string; danger: true; icon: ReactNode; run: () => void } => ({
  id: 'bin',
  label: refs.length === 1 ? 'Move to the Bin' : `Move ${num(refs.length)} to the Bin`,
  keys: '⌫',
  danger: true,
  // The Feed's trash, on every menu that bins.
  icon: createElement(Trash2, { className: 'size-4' }),
  run: () => void moveToBin(refs).then((n) => n && after?.())
})

/**
 * Rows Undo took back out of the Bin, met as they come back into a list, as
 * Mail selects a message it undeleted: `land` is called once, with the first
 * of them that `ids` (the list, whole) holds again, within a few seconds.
 */
export function useCameBack(ids: string[], land: (id: string) => void): void {
  const waiting = useRef<{ ids: string[]; until: number } | null>(null)
  useEffect(() => {
    const heard = (event: Event): void => void (waiting.current = { ids: (event as CustomEvent<string[]>).detail, until: Date.now() + 4000 })
    window.addEventListener('haligtree:came-back', heard)
    return () => window.removeEventListener('haligtree:came-back', heard)
  }, [])
  useEffect(() => {
    const now = waiting.current
    if (!now) return
    if (Date.now() > now.until) return void (waiting.current = null)
    const back = now.ids.find((id) => ids.includes(id))
    if (back) (waiting.current = null, land(back))
  })
}
