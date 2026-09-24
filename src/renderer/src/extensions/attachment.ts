import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { AttachmentView } from "@/components/attachment/attachment-view"

export interface AttachmentAttributes {
  /** A `mindflow://` URL into the asset store. */
  src: string
  /** The name it was dropped under. The store addresses by hash, not by name. */
  name: string
  /** Bytes, kept as a number so the card can format it however it likes. */
  size: number
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    attachment: {
      setAttachment: (attributes: AttachmentAttributes) => ReturnType
    }
  }
}

/**
 * A file the note carries: a card with its name and size, which opens on click.
 *
 * The bytes live in the same store as images, addressed by their hash, so the
 * same document dropped twice costs one copy. That store has no room for the
 * filename, which is why the name and size ride on the node instead.
 */
export const Attachment = Node.create({
  name: "attachment",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      // `rendered: false` on all three: the tag below writes them itself, and
      // without this the default renderer emits each one a second time under
      // its bare name, so a copied card carried `name=` beside `data-name=`.
      src: {
        default: "",
        rendered: false,
        parseHTML: (element) => element.getAttribute("href") ?? "",
      },
      // Read back as a string on purpose: the default parser runs values
      // through `fromString`, so a file called `2024.pdf` would come back a
      // number and ProseMirror throws on a numeric text child.
      name: {
        default: "",
        rendered: false,
        parseHTML: (element) => element.getAttribute("data-name") ?? "",
      },
      size: {
        default: 0,
        rendered: false,
        parseHTML: (element) => Number(element.getAttribute("data-size")) || 0,
      },
    }
  },

  parseHTML() {
    // Link's `a[href]` rule would otherwise win and the card would paste back
    // as an ordinary link: marks are tried before nodes at equal priority.
    return [{ tag: "a[data-attachment]", priority: 100 }]
  },

  renderHTML({ HTMLAttributes, node }) {
    // Not the UI. This is what lands on the clipboard and in exported HTML;
    // the node view below is what you actually see.
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        "data-attachment": "",
        "data-name": node.attrs.name,
        "data-size": String(node.attrs.size),
        href: node.attrs.src,
      }),
      node.attrs.name,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(AttachmentView)
  },

  /** A link to the stored file, under the name it arrived with. */
  renderMarkdown(node): string {
    const { name, src } = (node.attrs ?? {}) as Partial<AttachmentAttributes>
    return `[${name || "Attachment"}](${src})`
  },

  addCommands() {
    return {
      setAttachment:
        (attributes) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: attributes }),
    }
  },
})
