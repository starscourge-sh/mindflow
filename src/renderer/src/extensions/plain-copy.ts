import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"

/**
 * What a copy puts on the clipboard as plain text, for apps that take only
 * plain text (WhatsApp, Messages, a terminal): the selection as Markdown, so a
 * bullet keeps its "- ", a number its "1.", a checkbox its "[ ]", and a nested
 * line its indent. ProseMirror's own plain text dropped every marker and put a
 * blank line between every item, so a pasted list arrived flat and spread out.
 * Rich apps still read the HTML copy beside it, as before.
 */
export const PlainCopy = Extension.create({
  name: "plainCopy",
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: new PluginKey("plainCopy"),
        props: {
          clipboardTextSerializer: (slice) => {
            const manager = editor.storage.markdown?.manager
            if (!manager) return slice.content.textBetween(0, slice.content.size, "\n\n")
            try {
              const doc = editor.schema.topNodeType.createAndFill(null, slice.content)
              const text: string = doc ? manager.serialize(doc.toJSON()) : ""
              return text.replace(/\n{3,}/g, "\n\n").trim()
            } catch {
              return slice.content.textBetween(0, slice.content.size, "\n\n")
            }
          },
        },
      }),
    ]
  },
})
