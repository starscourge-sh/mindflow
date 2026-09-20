import type { Editor } from "@tiptap/core"

export type ExportFormat = "markdown" | "json" | "html" | "pdf"

/** What each format is called and what it is saved as. */
export const EXPORTS: Array<{ format: ExportFormat; label: string; extension: string }> = [
  { format: "markdown", label: "Markdown", extension: "md" },
  { format: "pdf", label: "PDF", extension: "pdf" },
  { format: "json", label: "JSON", extension: "json" },
  { format: "html", label: "HTML", extension: "html" },
]

/** A filename that will not upset a file manager. */
const safe = (name: string): string =>
  (name.trim() || "Untitled").replace(/[\\/:*?"<>|]/g, "-").slice(0, 80)

/**
 * Save the document, in whatever shape the caller wants it.
 *
 * Three of the four are produced here and written by the main process, which
 * only ever puts bytes on disk. PDF is the exception: the renderer hands over
 * HTML and Chromium lays it out, because nothing in here can paginate.
 *
 * Resolves false when the save dialog was dismissed, which is not an error.
 */
export async function exportDocument(
  editor: Editor,
  format: ExportFormat,
  title = "Untitled"
): Promise<boolean> {
  const { extension } = EXPORTS.find((one) => one.format === format) ?? {
    extension: "txt",
  }
  const name = `${safe(title)}.${extension}`

  if (format === "pdf") return window.api.exportPdf(name, editor.getHTML())

  const text =
    format === "json"
      ? JSON.stringify(editor.getJSON(), null, 2)
      : format === "html"
        ? editor.getHTML()
        // Through the manager: `getMarkdown` is a command on the editor, but
        // the serializer is what turns a document into text.
        : editor.storage.markdown.manager.serialize(editor.getJSON())

  return window.api.exportText(name, text)
}
