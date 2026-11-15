import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { changedSpan } from "@/lib/text-edit"
import { haligtree, type Task } from "@/lib/haligtree"
import { boxKind, boxList, linkedItems, makeLineTasks } from "@/lib/line-tasks"
import { toast } from "@/components/haligtree/ui"
import { tasksSaid } from "../../../main/day-lines"
import { num } from '../../../main/dates'

/**
 * A to-do in a note that is a task too: it carries the task's id, and the
 * two are kept as one. Ticking the line ticks the task; the task ticked
 * anywhere else (Today, the box, a sticky) ticks the line, in an open note as
 * it happens and in a closed one when it next opens. A pasted list is
 * offered nothing: the selection menu makes lines tasks when asked.
 */

const KEY = new PluginKey("linkedTasks")

/**
 * Did a change write over a linked to-do? Only the stretch it changed is looked at (a block whose attributes alone
 * changed, a tick, counts as changed), so a key typed in a long note costs a few blocks, not the whole note. Found
 * by comparing the note before and after: each step's stretch carried through every step after it cost the square
 * of the steps (a whole long note pasted back brought 898).
 */
function touchesLinked(before: ProseMirrorNode, doc: ProseMirrorNode): boolean {
  const changed = changedSpan(before, doc)
  if (!changed) return false
  let found = false
  const size = doc.content.size
  doc.nodesBetween(Math.max(0, Math.min(changed.from, size)), Math.max(0, Math.min(changed.newTo, size)), (node) => {
    if (found) return false
    if (node.type.name === "taskItem" && node.attrs.taskId) found = true
    return !found
  })
  return found
}

export const LinkedTasks = Extension.create<{ origin: () => string | null; box: () => boolean }, { offered: boolean; pasted: number }>({
  name: "linkedTasks",

  addOptions() {
    return { origin: () => null, box: () => false }
  },

  addStorage() {
    return { offered: false, pasted: 0 }
  },

  // In quick capture, a list typed out to its third line is offered as tasks, once.
  onUpdate() {
    // Emptied (sent, or cleared), the next list is offered again.
    if (this.editor.isEmpty) this.storage.offered = false
    // A paste has its own offer.
    // Already a Todo: what Create will make is said under the box.
    if (!this.options.box() || boxKind.todo || this.storage.offered || !this.editor.isEditable || Date.now() - this.storage.pasted < 500) return
    const { $from } = this.editor.state.selection
    for (let depth = $from.depth; depth > 0; depth--) {
      const list = $from.node(depth)
      if (!["bulletList", "orderedList", "taskList"].includes(list.type.name)) continue
      const items: string[] = []
      list.forEach((item) => void (item.textContent.trim() && items.push(item.textContent.trim())))
      if (items.length < 3) return
      this.storage.offered = true
      const editor = this.editor
      const [from, to] = [$from.before(depth), $from.after(depth)]
      // Taken up, the box becomes a Todo, and Create makes a task a line, its indented lines their steps.
      const said = tasksSaid(boxList(editor)?.list ?? [])
      toast(`A list of ${num(items.length)}`, undefined, "info", { label: `Make ${said}`, key: "T", run: () => (boxKind.pick ? boxKind.pick() : void makeLineTasks(editor, from, Math.min(to, editor.state.doc.content.size), null)) })
      return
    }
  },

  addGlobalAttributes() {
    return [{
      types: ["taskItem"],
      attributes: {
        taskId: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-task-id"),
          renderHTML: (attributes) => (attributes.taskId ? { "data-task-id": attributes.taskId, title: "A task too: ticking one ticks the other" } : {}),
        },
      },
    }]
  },

  onCreate() {
    const editor = this.editor
    let waiting: ReturnType<typeof setTimeout> | undefined
    // The line ticked as the task is, whenever anything is written anywhere.
    const sync = async (): Promise<void> => {
      if (editor.isDestroyed || !editor.isEditable) return
      if (!linkedItems(editor.state.doc).size) return
      const tasks = await haligtree.tasks().catch(() => [] as Task[])
      if (editor.isDestroyed) return
      const byId = new Map(tasks.map((task) => [task.id, task]))
      const tr = editor.state.tr
      for (const [id, item] of linkedItems(editor.state.doc)) {
        const task = byId.get(id)
        if (!task || task.status === "dropped") continue
        const done = task.status === "done"
        if (done !== item.checked) tr.setNodeMarkup(item.pos, undefined, { ...editor.state.doc.nodeAt(item.pos)!.attrs, checked: done })
      }
      if (tr.docChanged) editor.view.dispatch(tr.setMeta(KEY, true).setMeta("addToHistory", false))
    }
    const later = (): void => {
      clearTimeout(waiting)
      waiting = setTimeout(() => void sync(), 250)
    }
    void sync()
    const off = window.api.captures.onChange(later)
    editor.on("destroy", () => (off(), clearTimeout(waiting)))
  },

  onTransaction({ transaction }) {
    // Ticked by hand in the note: the task follows. Never for the sync's own change.
    if (!transaction.docChanged || transaction.getMeta(KEY) || !this.editor.isEditable) return
    if (transaction.getMeta("addToHistory") === false) return
    if (!touchesLinked(transaction.before, transaction.doc)) return
    const before = linkedItems(transaction.before)
    if (!before.size) return
    for (const [id, item] of linkedItems(transaction.doc)) {
      const was = before.get(id)
      if (!was || was.checked === item.checked) continue
      if (item.checked) void haligtree.doneTask(id)
      else void haligtree.task(id).then((task) => task && task.status === "done" && haligtree.undoneTask(id, { dueAt: task.dueAt, doneAt: task.completedAt ?? new Date().toISOString(), notifiedAt: new Date().toISOString(), deadlineAt: task.deadline }))
    }
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    return [new Plugin({
      key: KEY,
      // A line split off a linked one (Enter at its end) or a copy pasted in
      // takes the attributes with it: only the first keeps the link.
      appendTransaction: (transactions, old, state) => {
        if (!transactions.some((one) => one.docChanged)) return null
        if (!touchesLinked(old.doc, state.doc)) return null
        const seen = new Set<string>()
        let tr: ReturnType<typeof state.tr.setNodeMarkup> | null = null
        state.doc.descendants((node, pos) => {
          if (node.type.name !== "taskItem" || !node.attrs.taskId) return
          if (!seen.has(node.attrs.taskId)) return void seen.add(node.attrs.taskId)
          tr = (tr ?? state.tr).setNodeMarkup(pos, undefined, { ...node.attrs, taskId: null })
        })
        return tr
      },
      props: {
        // A pasted list is offered nothing: the user, "if i want that ill do it via the selection menu" ("3 tasks" on
        // the lines picked, components/haligtree/selection-actions.tsx). Stamped, so the typed-list offer above does not
        // take a pasted list for one typed out.
        handlePaste: () => {
          ;(editor.storage as unknown as Record<string, { pasted: number }>).linkedTasks.pasted = Date.now()
          return false
        },
      },
    })]
  },
})
