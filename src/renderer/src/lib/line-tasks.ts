import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { chime } from './sound'
import { vigil } from './vigil'
import { num } from '../../../main/dates'
import { docList, tasksSaid, type ListTask } from '../../../main/day-lines'
import { refuse, toast } from '@/components/vigil/ui'

/**
 * Lines in a note made tasks, one a line, each linked to its line: the line
 * becomes a to-do that carries the task's id (`taskId` on the taskItem, see
 * extensions/linked-tasks.ts), so ticking either one ticks the other. Bullets,
 * a checklist or plain lines all work; a line already linked is left as it is.
 */

type NoteLine = { text: string; pos: number; linked: string | null; item: boolean; /** How many lists deep it sits. */ depth: number; done: boolean }
const LISTS = new Set(['bulletList', 'orderedList', 'taskList'])

/** The lines between two places: each block of words, in order, with where it starts and how deep it is indented. */
export function linesIn(editor: Editor, from: number, to: number): NoteLine[] {
  const out: NoteLine[] = []
  const doc = editor.state.doc
  doc.nodesBetween(from, to, (node, pos, parent) => {
    if (node.type.name === 'codeBlock') return false
    if (!node.isTextblock) return true
    const text = node.textContent.trim()
    const item = parent?.type.name === 'taskItem'
    const $at = doc.resolve(pos)
    let depth = 0
    for (let d = $at.depth; d > 0; d--) if (LISTS.has($at.node(d).type.name)) depth++
    if (text) out.push({ text, pos, item, depth, done: item && !!parent!.attrs.checked, linked: item ? (parent!.attrs.taskId as string | null) ?? null : null })
    return false
  })
  return out
}

/**
 * The tasks some lines make, read as Today's page reads them: each line at the
 * top a task, each line indented under it a step of it, and a line ending in
 * a colon over its steps ("camping:") a task named without the colon.
 */
export function lineTasks(lines: NoteLine[]): { text: string; line: NoteLine; steps: { text: string; done: boolean }[] }[] {
  const least = Math.min(...lines.map((line) => line.depth))
  const out: { text: string; line: NoteLine; steps: { text: string; done: boolean }[] }[] = []
  for (const line of lines) {
    const parent = out[out.length - 1]
    if (line.depth > least && parent) parent.steps.push({ text: line.text, done: line.done })
    else out.push({ text: line.text, line, steps: [] })
  }
  return out.map((task) => (task.steps.length && /:$/.test(task.text) && task.text.length > 1 ? { ...task, text: task.text.replace(/\s*:$/, '') } : task))
}
/** "7 tasks, 5 steps", for the button and the notice. */
export const lineTasksSaid = (editor: Editor, from: number, to: number): { tasks: number; said: string } => {
  const tasks = lineTasks(linesIn(editor, from, to))
  return { tasks: tasks.length, said: tasksSaid(tasks) }
}

/**
 * Quick capture written as a list of to-dos: two lines or more, read as
 * Today's page reads them, so Create makes a task a line, its indented lines
 * its steps. Null for one line, or for a long page of mixed lines, which is
 * offered as "Sort this out" instead.
 */
export function boxList(editor: Editor | null): { list: ListTask[]; mixed: boolean; text: string } | null {
  if (!editor || editor.isDestroyed) return null
  // Read as "Make it a task" reads a note (main/day-lines.ts), so both make the same tasks.
  return docList(editor.getJSON(), true)
}
/** Quick capture's kind as the list offers read it: Todo already says what Create does, under the box. */
export const boxKind = { todo: false, pick: null as (() => void) | null }

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
  // Indented lines are steps of the line above, never tasks of their own.
  const todo = lineTasks(lines).filter((task) => !task.line.linked)
  if (!todo.length) {
    refuse(lines.length ? (lines.length === 1 ? 'That line is a task already' : 'Those lines are tasks already') : 'No lines there to make tasks of')
    return 0
  }
  const made: { id: string; existed: boolean; text: string }[] = []
  for (const task of todo) {
    const one = await vigil.addTask(task.text, origin ?? undefined)
    if (!one.existed && task.steps.length) await vigil.saveTask(one.id, { subtasks: task.steps })
    // Matched to its line by the line's own words, colon and all.
    made.push({ id: one.id, existed: one.existed, text: task.line.text })
  }
  const steps = todo.reduce((sum, task) => sum + task.steps.length, 0)
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
  toast(`${made.length === 1 ? 'A task, linked to its line' : `${num(made.length)} tasks, linked to their lines`}${steps ? `, with ${num(steps)} ${steps === 1 ? 'step' : 'steps'}` : ''}${joined ? `. ${num(joined)} joined ${joined === 1 ? 'a task' : 'tasks'} already there` : ''}`, () => {
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
