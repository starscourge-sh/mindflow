import { chime } from './sound'
import { vigil } from './vigil'
import { refuse, toast } from '@/components/vigil/ui'
import { num } from '../../../main/dates'

/**
 * One way to the Bin for every kind of thing, from every list: picked rows
 * and ⌫, a right-click, a button. Said the same way each time: how many went,
 * that they are in the Bin, an Undo (⌘Z too), and the Bin one key away.
 *
 * A capture goes from wherever it is (open, resolved, saved as a gem) and
 * comes back there; a gem it was saved as stays in Gems. A task is closed
 * without doing; a gem, writing, question or goal is put in the Bin.
 */
export type BinRef = { type: string; id: string; status?: string }

/** What a pane can hold open beside a list, asked the same way. */
export type BinKind = 'task' | 'capture' | 'item'

/** Whether one is in the Bin now (or gone for good). */
export async function inBin(kind: BinKind, id: string): Promise<boolean> {
  if (kind === 'task') {
    const task = await vigil.task(id)
    return !task || task.status === 'dropped'
  }
  if (kind === 'capture') {
    const capture = await window.api.captures.get(id)
    return !capture || capture.status === 'discarded'
  }
  const item = await vigil.item(id)
  return !item || !!(item as { binnedAt?: string | null }).binnedAt
}

/** The page every “Move to the Bin” points to, in one key. */
export const seeTheBin = { label: 'Open the Bin', key: 'B', run: () => window.api.openInHome('view', 'discarded') }

const saidOf = (n: number): string => (n === 1 ? 'Moved to the Bin' : `Moved ${num(n)} to the Bin`)

/** Move each one to the Bin, at once, with one notice and one undo for the lot. Gives back how many went. */
export async function moveToBin(refs: BinRef[], onUndo?: () => void): Promise<number> {
  // A capture already in the Bin, or a task already closed without doing, is there already.
  const going = refs.filter((one) => !(one.type === 'capture' && one.status === 'discarded') && !(one.type === 'task' && one.status === 'dropped'))
  if (!going.length) {
    refuse(refs.length === 1 ? 'It is in the Bin already' : 'They are in the Bin already')
    return 0
  }
  const undos = await Promise.all(going.map(async (one): Promise<() => Promise<unknown>> => {
    if (one.type === 'capture') {
      const result = await window.api.captures.save(one.id, { status: 'discarded', bin: true })
      const was = (result?.was ?? 'open') as 'open'
      return () => window.api.captures.save(one.id, { status: was, bin: true })
    }
    if (one.type === 'task') {
      const was = one.status && one.status !== 'dropped' ? one.status : 'open'
      await vigil.saveTask(one.id, { status: 'dropped' })
      return () => vigil.saveTask(one.id, { status: was })
    }
    await vigil.toBin(one.id)
    return () => vigil.restore(one.type, one.id)
  }))
  chime('away')
  const gems = going.filter((one) => one.type === 'capture' && one.status === 'promoted').length
  const already = refs.length - going.length
  const extra = [
    gems ? `${gems === 1 ? 'its gem stays' : 'their gems stay'} in Gems` : '',
    already ? `${num(already)} ${already === 1 ? 'was' : 'were'} in the Bin already` : ''
  ].filter(Boolean).join('; ')
  const undo = (): void => {
    if (last?.undo === undo) last = null
    void Promise.all(undos.map((one) => one())).then(() => onUndo?.())
  }
  last = { ids: going.map((one) => one.id), undo, at: Date.now(), page: pageInFront() }
  toast(`${saidOf(going.length)}${extra ? `: ${extra}` : ''}`, undo, 'success', seeTheBin)
  return going.length
}

/** The last move to the Bin, for a page it emptied to offer its Undo. Taken back, it is gone. */
let last: { ids: string[]; undo: () => void; at: number; page: string | null } | null = null
export const lastBinned = (): { ids: string[]; undo: () => void } | null => last
/** The page the keys were on (home.tsx marks each with data-page). */
const pageInFront = (): string | null => (document.activeElement?.closest('[data-page]') ?? document.querySelector('[data-page]'))?.getAttribute('data-page') ?? null
/** The move to the Bin that emptied this page a moment ago, if one did: its example waits, so nothing looks as if it stayed. */
export const justEmptied = (page: string | null): { ids: string[]; undo: () => void } | null => (last && last.page === page && Date.now() - last.at < 4000 ? last : null)

/** A right-click line for the lot: “Move 12 to the Bin”, its keys shown. */
export const binItem = (refs: BinRef[], after?: () => void): { label: string; keys: string; danger: true; run: () => void } => ({
  label: refs.length === 1 ? 'Move to the Bin' : `Move ${num(refs.length)} to the Bin`,
  keys: '⌫',
  danger: true,
  run: () => void moveToBin(refs).then((n) => n && after?.())
})
