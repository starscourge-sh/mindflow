import { Extension } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { createElement } from "react"
import { createRoot, type Root } from "react-dom/client"

import { haligtree, type Task } from "@/lib/haligtree"
import { TooltipProvider } from "@/components/ui/tooltip"
import { PriorityMark } from "@/components/haligtree/task-input"

/**
 * A task in a note carries its priority as it does on every list: a linked
 * to-do at the end of its words, a task link just after the link. Read from
 * the task itself, so a priority set anywhere shows here as it happens.
 */

const KEY = new PluginKey<{ levels: Map<string, number>; marks: DecorationSet }>("taskMarks")

/** The task a node points at: a linked to-do's task, or a task link's. */
export const taskOf = (node: PMNode): string | null =>
  node.type.name === "taskItem" && node.attrs.taskId ? String(node.attrs.taskId)
  : node.type.name === "noteLink" && String(node.attrs.id ?? "").startsWith("task:") ? String(node.attrs.id).slice(5)
  : null

const hasTasks = (doc: PMNode): boolean => {
  let found = false
  doc.descendants((node) => (found ? false : void (found = !!taskOf(node))))
  return found
}

const roots = new WeakMap<HTMLElement, Root>()

const mark = (level: number) => (): HTMLElement => {
  const dom = document.createElement("span")
  dom.className = "tiptap-task-priority"
  dom.contentEditable = "false"
  dom.dataset.taskPriority = String(level)
  const root = createRoot(dom)
  root.render(createElement(TooltipProvider, { delayDuration: 600, children: createElement(PriorityMark, { level, className: "size-3 shrink-0" }) }))
  roots.set(dom, root)
  return dom
}

function marksOf(doc: PMNode, levels: Map<string, number>): DecorationSet {
  if (!levels.size) return DecorationSet.empty
  const found: Decoration[] = []
  doc.descendants((node, pos) => {
    const id = taskOf(node)
    const level = id ? levels.get(id) : 0
    if (!id || !level) return
    const spec = { key: `${id}:${level}`, ignoreSelection: true, destroy: (dom: Node) => {
      const root = roots.get(dom as HTMLElement)
      // Not while the editor is drawing: React would warn of an unmount mid-render.
      if (root) setTimeout(() => root.unmount())
    } }
    // A to-do: after its first line's words, staying there as more are typed.
    const first = node.type.name === "taskItem" ? node.firstChild : null
    if (first?.isTextblock) found.push(Decoration.widget(pos + first.nodeSize, mark(level), { ...spec, side: 1 }))
    // A link: just after it, before whatever is typed next.
    else if (node.type.name === "noteLink") found.push(Decoration.widget(pos + node.nodeSize, mark(level), { ...spec, side: -1 }))
  })
  return DecorationSet.create(doc, found)
}

export const TaskMarks = Extension.create({
  name: "taskMarks",

  onCreate() {
    const editor = this.editor
    let waiting: ReturnType<typeof setTimeout> | undefined
    let last = ""
    const load = async (): Promise<void> => {
      if (editor.isDestroyed || !hasTasks(editor.state.doc)) return
      const tasks = await haligtree.tasks().catch(() => [] as Task[])
      if (editor.isDestroyed) return
      const levels = new Map(tasks.filter((task) => task.priority && task.status === "open").map((task) => [task.id, task.priority]))
      const said = JSON.stringify([...levels])
      if (said === last) return
      last = said
      editor.view.dispatch(editor.state.tr.setMeta(KEY, levels).setMeta("addToHistory", false))
    }
    const later = (): void => {
      clearTimeout(waiting)
      waiting = setTimeout(() => void load(), 250)
    }
    void load()
    const off = window.api.captures.onChange(later)
    editor.on("destroy", () => (off(), clearTimeout(waiting)))
  },

  addProseMirrorPlugins() {
    return [new Plugin({
      key: KEY,
      state: {
        init: () => ({ levels: new Map<string, number>(), marks: DecorationSet.empty }),
        apply: (tr, was) => {
          const levels = tr.getMeta(KEY) as Map<string, number> | undefined
          if (levels) return { levels, marks: marksOf(tr.doc, levels) }
          // A line or link added or taken away: drawn again from what is known.
          return tr.docChanged ? { levels: was.levels, marks: marksOf(tr.doc, was.levels) } : was
        },
      },
      props: { decorations: (state) => KEY.getState(state)?.marks },
    })]
  },
})
