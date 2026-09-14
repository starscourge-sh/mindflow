import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { ImagePlaceholderView } from "@/components/image/image-placeholder-view"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    imagePlaceholder: {
      /** Insert an empty image block, with its panel already open. */
      insertImagePlaceholder: () => ReturnType
    }
  }
}

/**
 * An image block with no image in it yet.
 *
 * It holds a spot in the document while you go and find the picture, which is
 * what makes "insert an image" one gesture instead of two: the block is already
 * where you wanted it, so nothing has to be moved afterwards.
 *
 * It carries no attributes worth saving. Filling it in replaces it with a real
 * `image` node, so a stored document only ever holds images that exist.
 */
export const ImagePlaceholder = Node.create({
  name: "imagePlaceholder",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    // Not rendered: reopening a document should not pop every unfilled panel
    // open at once. Only the block you just inserted starts open.
    return { open: { default: false, rendered: false } }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="image-placeholder"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "image-placeholder" }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImagePlaceholderView)
  },

  addCommands() {
    return {
      insertImagePlaceholder:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { open: true } }),
    }
  },
})
