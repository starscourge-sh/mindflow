import { createElement } from "react"
import type { NodeViewRendererProps } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import type { NodeView } from "@tiptap/pm/view"
import { ReactNodeViewRenderer } from "@tiptap/react"

import { CodeControls, DiagramView } from "@/components/code/code-block-view"
import { lazyRoot } from "@/lib/lazy-root"
import { stopLikeTiptap } from "@/lib/plain-node-view"

const isDiagram = (node: PMNode): boolean => node.attrs.language === "mermaid"

/**
 * A code block, drawn as plain elements rather than a React node view: a
 * React one per block cost the most of opening a note with many of them
 * ("Git Deep Dive" has 153). The language picker and copy button, which show
 * only on hover, are drawn by React once the pointer first comes over the
 * block. A ```mermaid block is a diagram, still drawn by React; changing a
 * block's language to or from mermaid draws it afresh as the other kind.
 *
 * The elements are the ones the React view made, classes and all, so every
 * rule written for it still holds: `.react-renderer.node-codeBlock` around
 * `.tiptap-code-block`, and the code inside a `<pre><code>`.
 */
export function codeBlockNodeView(props: NodeViewRendererProps): NodeView {
  if (isDiagram(props.node)) {
    return ReactNodeViewRenderer(DiagramView, {
      update: ({ newNode, updateProps }) => {
        if (!isDiagram(newNode)) return false
        updateProps()
        return true
      },
    })(props) as NodeView
  }

  const { editor, getPos } = props
  let node = props.node

  const dom = document.createElement("div")
  dom.className = "react-renderer node-codeBlock"
  const wrapper = document.createElement("div")
  wrapper.className = "tiptap-code-block"
  wrapper.setAttribute("data-node-view-wrapper", "")
  // Esc with the caret in the code picks the block (extensions/block-controls.ts), a Tab from its buttons:
  // the note's own Escape (let go of the note) waits for the next one (lib/menu-keys.ts caretTakesEscape).
  wrapper.setAttribute("data-takes-escape", "")
  wrapper.style.whiteSpace = "normal"
  const controls = document.createElement("div")
  controls.className = "tiptap-code-controls"
  controls.contentEditable = "false"
  // Code, codes and tables of names are not prose: no spelling squiggles under them.
  const pre = document.createElement("pre")
  pre.spellcheck = false
  const code = document.createElement("code")
  code.setAttribute("data-node-view-content", "")
  code.style.whiteSpace = "pre-wrap"
  const contentDOM = document.createElement("div")
  contentDOM.setAttribute("data-node-view-content-react", "")
  contentDOM.style.whiteSpace = "inherit"
  code.append(contentDOM)
  pre.append(code)
  wrapper.append(controls, pre)
  dom.append(wrapper)

  // The colour attributes are carried by hand: a node view builds its own
  // elements, so the ones the schema renders onto every other block never
  // reach this one, and colouring a code block did nothing.
  const paint = (): void => {
    for (const [name, attr] of [["data-background", "backgroundColor"], ["data-color", "textColor"]] as const) {
      const value = node.attrs[attr]
      if (value == null) pre.removeAttribute(name)
      else pre.setAttribute(name, String(value))
    }
  }
  paint()

  const setLanguage = (language: string | null): void => {
    const at = getPos()
    if (typeof at !== "number") return
    editor.chain().command(({ tr }) => {
      tr.setNodeMarkup(at, undefined, { ...node.attrs, language })
      return true
    }).run()
  }
  const drawn = lazyRoot(controls, wrapper, () => createElement(CodeControls, { language: node.attrs.language ?? "", code: node.textContent, setLanguage }))

  return {
    dom,
    contentDOM,
    update(next) {
      if (next.type !== node.type || isDiagram(next)) return false
      const changed = next.attrs !== node.attrs || !next.content.eq(node.content)
      node = next
      if (changed) {
        paint()
        drawn.redraw()
      }
      return true
    },
    // The controls own their clicks and keys; the code is ProseMirror's.
    stopEvent: (event) => stopLikeTiptap(event, dom, contentDOM, node),
    ignoreMutation(mutation) {
      if (mutation.type === "selection") return false
      if (mutation.target === contentDOM && mutation.type === "attributes") return true
      return !contentDOM.contains(mutation.target)
    },
    destroy: () => drawn.destroy(),
  }
}
