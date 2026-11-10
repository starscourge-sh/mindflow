import { Extension } from "@tiptap/core"
import { NodeSelection, Plugin } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import { vimPluginKey } from "@/extensions/vim-mode"
import { WAKE } from "@/lib/lazy-root"

/** Blocks whose buttons (copy, open, the language picker) are drawn only when wanted (lib/lazy-root.ts). */
const WITH_CONTROLS = /^(codeBlock|bookmark)$/

/** The block with controls the selection is on or in, with its place. */
function blockAt(view: EditorView): { pos: number; dom: HTMLElement } | null {
  const { selection } = view.state
  let pos = -1
  if (selection instanceof NodeSelection && WITH_CONTROLS.test(selection.node.type.name)) pos = selection.from
  else {
    const { $head } = selection
    for (let depth = $head.depth; depth > 0; depth--) if (WITH_CONTROLS.test($head.node(depth).type.name)) { pos = $head.before(depth); break }
  }
  const dom = pos >= 0 ? (view.nodeDOM(pos) as HTMLElement | null) : null
  return dom ? { pos, dom } : null
}

/**
 * A link card's and a code block's buttons, by keys as by the pointer.
 *
 * They are drawn when the pointer first comes over the block, which left
 * them out of reach of the keys. Now they are drawn too when the block is
 * picked or the caret goes into it; Tab on a picked card or code block goes
 * to its first button (Tab and ⇧Tab move between them, Esc comes back to the
 * block); Esc in a code block picks the whole block, so its buttons are a Tab
 * away there too. They wear the app's focus ring.
 */
export const BlockControls = Extension.create({
  name: "blockControls",

  addKeyboardShortcuts() {
    const vim = (): boolean => !!vimPluginKey.getState(this.editor.state)?.enabled
    return {
      Escape: () => {
        if (vim()) return false
        const { selection, doc } = this.editor.state
        const { $head } = selection
        if (!selection.empty || $head.parent.type.name !== "codeBlock" || $head.parent.attrs.language === "mermaid") return false
        const at = $head.before()
        return this.editor.commands.command(({ tr }) => (tr.setSelection(NodeSelection.create(doc, at)), true))
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        view: (view) => {
          // Heard first, before the editor's own keys and the page's (which
          // sent Tab on to the fields above the note): Tab on a picked card or
          // code block goes to its first button; Esc on one of its buttons
          // comes back to the block, picked.
          const keys = (event: KeyboardEvent): void => {
            if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return
            const target = event.target as HTMLElement | null
            if (event.key === "Tab" && !event.shiftKey && target === view.dom) {
              const { selection } = view.state
              if (!(selection instanceof NodeSelection) || !WITH_CONTROLS.test(selection.node.type.name)) return
              const found = blockAt(view)
              found?.dom.querySelector("[data-node-view-wrapper]")?.dispatchEvent(new Event(WAKE))
              const first = found?.dom.querySelector<HTMLElement>(".tiptap-code-controls button, .tiptap-bookmark-copy")
              if (!first) return
              event.preventDefault()
              event.stopPropagation()
              first.focus()
              return
            }
            if (event.key !== "Escape" || !target || target === view.dom || target.isContentEditable) return
            const dom = target.closest<HTMLElement>(".react-renderer")
            if (!dom || !target.closest(".tiptap-code-controls, .tiptap-bookmark")) return
            const desc = (dom as unknown as { pmViewDesc?: { posBefore: number } }).pmViewDesc
            if (!desc) return
            event.preventDefault()
            event.stopPropagation()
            // Let go of the button first: one inside the editor counts as the editor having the focus.
            target.blur()
            view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, desc.posBefore)))
            view.focus()
          }
          view.dom.addEventListener("keydown", keys, true)
          return {
            update: (view, previous) => {
              if (previous && view.state.selection.eq(previous.selection) && view.state.doc === previous.doc) return
              blockAt(view)?.dom.querySelector("[data-node-view-wrapper]")?.dispatchEvent(new Event(WAKE))
            },
            destroy: () => view.dom.removeEventListener("keydown", keys, true),
          }
        },
      }),
    ]
  },
})
