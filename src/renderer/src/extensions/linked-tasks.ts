import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { haligtree, type Task } from "@/lib/haligtree"
import { boxKind, boxList, linkedItems, makeLineTasks } from "@/lib/line-tasks"
import { openSort } from "@/lib/sort-out"
import { toast } from "@/components/haligtree/ui"
import { isList, readLines, tasksOf, tasksSaid, worthSorting } from "../../../main/day-lines"
import { APP_NAME } from '../../../main/name'

/**
 * A to-do in a note that is a task too: it carries the task's id, and the
 * two are kept as one. Ticking the line ticks the task; the task ticked
 * anywhere else (Today, the box, a sticky) ticks the line, in an open note as
 * it happens and in a closed one when it next opens. A pasted list is
 * offered as tasks, and a long mixed page as "Sort this out", in a notice
 * that never gets in the way of the paste itself.
 */

const KEY = new PluginKey("linkedTasks")

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
      toast(`A list of ${items.length}`, undefined, "info", { label: `Make ${said}`, key: "T", run: () => (boxKind.pick ? boxKind.pick() : void makeLineTasks(editor, from, Math.min(to, editor.state.doc.content.size), null)) })
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
    const origin = this.options.origin
    const inBox = this.options.box
    return [new Plugin({
      key: KEY,
      // A line split off a linked one (Enter at its end) or a copy pasted in
      // takes the attributes with it: only the first keeps the link.
      appendTransaction: (transactions, _old, state) => {
        if (!transactions.some((one) => one.docChanged)) return null
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
        handlePaste: (view, event) => {
          const text = event.clipboardData?.getData("text/plain") ?? ""
          // In quick capture made a Todo, what Create will make is said under the box instead.
          if (!editor.isEditable || !isList(text) || (inBox() && boxKind.todo)) return false
          ;(editor.storage as unknown as Record<string, { pasted: number }>).linkedTasks.pasted = Date.now()
          const from = view.state.selection.from
          // After the paste has landed: offered, never done for you.
          setTimeout(() => {
            if (editor.isDestroyed) return
            const to = editor.state.selection.to
            if (worthSorting(text)) return toast(`A page of mixed lines. ${APP_NAME} can sort it into tasks, links, words and sayings`, undefined, "info", { label: "Sort this out", key: "S", run: () => openSort(text, origin()) })
            // Read as Today's page reads lines: indented ones are steps of the line above.
            // In quick capture, taken up, the box becomes a Todo: Create makes the tasks, said under the box.
            const box = inBox() && boxKind.pick
            const said = tasksSaid(box ? boxList(editor)?.list ?? [] : tasksOf(readLines(text)))
            toast(`A list of ${readLines(text).length} lines`, undefined, "info", { label: `Make ${said === "a task" ? "it a task" : said}`, key: "T", run: () => (box ? box() : void makeLineTasks(editor, from, to, origin())) })
          }, 0)
          return false
        },
      },
    })]
  },
})
