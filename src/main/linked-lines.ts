/**
 * A to-do in a note that is a task too carries the task's id (`taskId` on a
 * taskItem). Read here without an editor, for a sticky (which draws the note
 * itself) and for the tests: which task a to-do is, and how it shows.
 */

type Node = { type?: string; attrs?: Record<string, unknown>; content?: Node[] }
type TaskState = { id: string; status: string }

/** The task a to-do at `path` (child indexes from the doc down) is linked to, if any. */
export function taskAt(doc: Node, path: number[]): string | null {
  let node: Node | undefined = doc
  for (const step of path) node = node?.content?.[step]
  return node?.type === 'taskItem' && typeof node.attrs?.taskId === 'string' ? node.attrs.taskId : null
}

/** Each task by id, done or not; one closed without doing leaves its line as it is. */
export const doneById = (tasks: TaskState[]): Map<string, boolean> =>
  new Map(tasks.filter((task) => task.status !== 'dropped').map((task) => [task.id, task.status === 'done']))

/** Whether a to-do shows ticked: as its task is, when it has one we know; else as it was written. */
export function shownDone(attrs: Record<string, unknown> | undefined, done: Map<string, boolean>): boolean {
  const task = typeof attrs?.taskId === 'string' ? attrs.taskId : null
  return task && done.has(task) ? done.get(task)! : !!attrs?.checked
}

/** The doc with every linked to-do ticked as its task is, and whether anything changed. */
export function syncLinked(doc: Node, tasks: TaskState[]): { doc: Node; changed: boolean } {
  const done = doneById(tasks)
  let changed = false
  const walk = (node: Node): Node => {
    const own = node.type === 'taskItem' ? shownDone(node.attrs, done) : null
    const next = own !== null && own !== !!node.attrs?.checked ? ((changed = true), { ...node, attrs: { ...node.attrs, checked: own } }) : node
    return next.content ? { ...next, content: next.content.map(walk) } : next
  }
  const out = walk(doc)
  return { doc: changed ? out : doc, changed }
}
