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
  toast(`${saidOf(going.length)}${extra ? `: ${extra}` : ''}`, () => void Promise.all(undos.map((undo) => undo())).then(() => onUndo?.()), 'success', seeTheBin)
  return going.length
}

/** A right-click line for the lot: “Move 12 to the Bin”, its keys shown. */
export const binItem = (refs: BinRef[], after?: () => void): { label: string; keys: string; danger: true; run: () => void } => ({
  label: refs.length === 1 ? 'Move to the Bin' : `Move ${num(refs.length)} to the Bin`,
  keys: '⌫',
  danger: true,
  run: () => void moveToBin(refs).then((n) => n && after?.())
})
