import { host } from "@/lib/host"
import type { Editor, JSONContent } from "@tiptap/core"
import { cut } from "../../../main/clip"
import { withBlockMarks } from "../../../main/blocks"
import { currentTheme, isLight } from "@/lib/theme"

/** A document as Markdown, written by an editor's own serializer: its own document, or any other of the same kind
 * (a note whose editor is not open). Through the manager: `getMarkdown` is a command on the editor, but the
 * serializer is what turns a document into text. */
export const markdownOf = (editor: Editor, doc: JSONContent): string =>
  // A line a link lands on ends in its `^id`, as Obsidian writes one.
  editor.storage.markdown.manager.serialize(withBlockMarks(doc))

/** The editor's document as Markdown. */
export const toMarkdown = (editor: Editor): string => markdownOf(editor, editor.getJSON())

type ExportFormat = "markdown" | "json" | "html" | "pdf"

/** What each format is called and what it is saved as. */
export const EXPORTS: Array<{ format: ExportFormat; label: string; extension: string }> = [
  { format: "markdown", label: "Markdown", extension: "md" },
  { format: "pdf", label: "PDF", extension: "pdf" },
  { format: "json", label: "JSON", extension: "json" },
  { format: "html", label: "HTML", extension: "html" },
]

/**
 * The document's HTML with each graph and drawing as the picture you see, not the empty box their plain HTML is
 * (10 Nov: a graph exported to PDF or HTML was a blank space). A graph is its canvas, with its formulas under it; a
 * drawing is its picture. In the dark theme they are drawn light on dark, so they are turned for white paper.
 */
export function withPictures(editor: Editor): string {
  const page = document.createElement("template")
  page.innerHTML = editor.getHTML()
  const dark = !isLight(currentTheme())
  const turn = dark ? ' style="filter:invert(1) hue-rotate(180deg)"' : ""
  const shown = (selector: string): Element[] => [...editor.view.dom.querySelectorAll(selector)]
  const graphs = shown(".mf-graph-frame canvas") as HTMLCanvasElement[]
  page.content.querySelectorAll("div[data-graph]").forEach((box, at) => {
    const canvas = graphs[at]
    if (!canvas?.width) return
    const formulas = (() => { try { return (JSON.parse(box.getAttribute("data-expressions") ?? "[]") as Array<{ text?: string }>).map((one) => one.text ?? "").filter(Boolean) } catch { return [] } })()
    const figure = document.createElement("figure")
    figure.innerHTML = `<img alt="A graph of ${formulas.join(", ").replace(/"/g, "&quot;") || "formulas"}"${turn}>` + (formulas.length ? `<figcaption></figcaption>` : "")
    figure.querySelector("img")!.src = canvas.toDataURL("image/png")
    const caption = figure.querySelector("figcaption")
    if (caption) caption.textContent = formulas.join("   ")
    box.replaceWith(figure)
  })
  const drawings = shown(".tiptap-excalidraw-preview svg")
  page.content.querySelectorAll("div[data-excalidraw]").forEach((box, at) => {
    const svg = drawings[at]
    if (!svg) return
    const figure = document.createElement("figure")
    figure.innerHTML = `<img alt="A drawing"${turn}>`
    figure.querySelector("img")!.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML)}`
    box.replaceWith(figure)
  })
  return page.innerHTML
}

/** A filename that will not upset a file manager. */
const safe = (name: string): string =>
  cut((name.trim() || "New note").replace(/[\\/:*?"<>|]/g, "-"), 80)

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

  // A host with no PDF renderer simply has no PDF: the slash menu leaves the
  // entry out, and this is the other end of that.
  if (format === "pdf") return (await host().exportPdf?.(name, withPictures(editor))) ?? false

  const text =
    format === "json"
      ? JSON.stringify(editor.getJSON(), null, 2)
      : format === "html"
        ? withPictures(editor)
        : toMarkdown(editor)

  return (await host().exportText?.(name, text)) ?? false
}
