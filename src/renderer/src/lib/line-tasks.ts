import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { chime } from './sound'
import { vigil } from './vigil'
import { num } from '../../../main/dates'
import { refuse, toast } from '@/components/vigil/ui'

/**
 * Lines in a note made tasks, one a line, each linked to its line: the line
 * becomes a to-do that carries the task's id (`taskId` on the taskItem, see
 * extensions/linked-tasks.ts), so ticking either one ticks the other. Bullets,
 * a checklist or plain lines all work; a line already linked is left as it is.
 */

/** The lines between two places: each block of words, in order, with where it starts. */
export function linesIn(editor: Editor, from: number, to: number): { text: string; pos: number; linked: string | null; item: boolean }[] {
  const out: { text: string; pos: number; linked: string | null; item: boolean }[] = []
  editor.state.doc.nodesBetween(from, to, (node, pos, parent) => {
    if (node.type.name === 'codeBlock') return false
    if (!node.isTextblock) return true
    const text = node.textContent.trim()
    const item = parent?.type.name === 'taskItem'
    if (text) out.push({ text, pos, item, linked: item ? (parent!.attrs.taskId as string | null) ?? null : null })
    return false
  })
  return out
}

/** Every to-do in the doc linked to a task, by task id, with where it is and whether it is ticked. */
export function linkedItems(doc: PMNode): Map<string, { pos: number; checked: boolean }> {
  const out = new Map<string, { pos: number; checked: boolean }>()
  doc.descendants((node, pos) => {
    if (node.type.name === 'taskItem' && node.attrs.taskId) out.set(node.attrs.taskId, { pos, checked: !!node.attrs.checked })
  })
  return out
}

/**
 * Make the lines from `from` to `to` tasks. They turn into a checklist if
 * they are not one, in one step of the note's own undo; the notice's Undo
 * takes back the tasks and, while nothing has been written since, the
 * checklist too. `origin`: the note, so each task says where it came from.
 */
export async function makeLineTasks(editor: Editor, from: number, to: number, origin?: string | null): Promise<number> {
  const lines = linesIn(editor, from, to)
  const todo = lines.filter((line) => !line.linked)
  if (!todo.length) {
    refuse(lines.length ? (lines.length === 1 ? 'That line is a task already' : 'Those lines are tasks already') : 'No lines there to make tasks of')
    return 0
  }
  const made: { id: string; existed: boolean; text: string }[] = []
  for (const line of todo) {
    const one = await vigil.addTask(line.text, origin ?? undefined)
    made.push({ id: one.id, existed: one.existed, text: line.text })
  }
  // A checklist where there was none, and each line given its task: one step.
  const whole = lines.every((line) => line.item)
  const chain = editor.chain().setTextSelection({ from, to })
  if (!whole) chain.toggleTaskList()
  chain.command(({ tr }) => {
    let at = 0
    tr.doc.nodesBetween(tr.mapping.map(from, -1), tr.mapping.map(to, 1), (node, pos) => {
      if (node.type.name !== 'taskItem' || node.attrs.taskId) return true
      const text = node.firstChild?.textContent.trim()
      const match = made[at]
      if (match && text === match.text) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, taskId: match.id })
        at += 1
      }
      return true
    })
    // The caret after the last line, not the lines left selected.
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(tr.mapping.map(to, -1), tr.doc.content.size)), -1))
    return true
  }).run()
  const after = editor.state.doc
  // Lines ticked already are tasks done already.
  for (const [id, item] of linkedItems(after)) if (item.checked && made.some((one) => one.id === id && !one.existed)) await vigil.doneTask(id)
  const joined = made.filter((one) => one.existed).length
  chime(made.length === 1 ? 'noted' : 'promote')
  // Counts only, so a private note's words never show in the notice.
  toast(`${made.length === 1 ? 'A task, linked to its line' : `${num(made.length)} tasks, linked to their lines`}${joined ? `. ${num(joined)} joined ${joined === 1 ? 'a task' : 'tasks'} already there` : ''}`, () => {
    void Promise.all(made.map((one) => vigil.unmakeTask(one.id, one.existed, origin ? [origin] : [], [])))
    // Nothing written since: the note goes back exactly. Otherwise the lines keep their words and lose their links.
    if (editor.isDestroyed) return
    if (editor.state.doc.eq(after)) editor.commands.undo()
    else editor.commands.command(({ tr }) => {
      for (const [id, item] of linkedItems(tr.doc)) if (made.some((one) => one.id === id)) tr.setNodeMarkup(item.pos, undefined, { ...tr.doc.nodeAt(item.pos)!.attrs, taskId: null })
      return true
    })
  }, 'success', made.length === 1 ? { label: 'Open', key: 'O', run: () => window.api.openInHome('task', made[0].id) } : undefined)
  return made.length
}
