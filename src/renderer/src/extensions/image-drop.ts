import { Extension } from "@tiptap/core"
import { host, said } from "@/lib/host"
import { Fragment, Slice } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { dropPoint } from "@tiptap/pm/transform"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { EditorView } from "@tiptap/pm/view"

export interface ImageDropOptions {
  /** Told about anything that could not be added, so nothing fails in silence. */
  onError: (problems: string[]) => void
}

/** A picture on its way in, and the spot being kept for it. */
interface Pending {
  id: number
  from: number
  to: number
}

/** Where the images go: a point to insert at, or a range to stand in for. */
type Target = Pick<Pending, "from" | "to">

const key = new PluginKey<Pending[]>("imageDrop")
let nextId = 0

const reason = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

/** The images on a drop or a paste, and whatever else came with them. */
function sort(data: DataTransfer | null): { images: File[]; rest: File[] } {
  const files = [...(data?.files ?? [])]
  const images = files.filter((file) => file.type.startsWith("image/"))
  return { images, rest: files.filter((file) => !images.includes(file)) }
}

/** An image dragged or copied from a web page arrives as a link, not a file. */
function linked(data: DataTransfer | null): string {
  const html = data?.getData("text/html") ?? ""
  const src =
    /<img\b[^>]*?\ssrc="([^"]*)"/i.exec(html)?.[1] ||
    data?.getData("text/uri-list") ||
    ""
  return /^https?:\/\//i.test(src) ? src : ""
}

/**
 * Said when a file on a drop or a paste is only a pointer that cannot be
 * followed: Apple Notes, Photos and Mail hand over a picture as a reference
 * into their own private folder, and reading it fails with the browser's long
 * "permission problems" message, which is no use to anyone.
 */
export class Unreadable extends Error {
  constructor(file: File) {
    super(`${file.name || "That file"} could not be read. Drag it in from Finder instead`)
  }
}

/** What a paste says when its picture could not be brought in by any route. */
export const PICTURE_LOST = "The picture could not be copied from the other app. Drag it in instead."

/** A file's bytes, or Unreadable: never the browser's own read error. */
export async function readBytes(file: File): Promise<Uint8Array> {
  try {
    return new Uint8Array(await file.arrayBuffer())
  } catch {
    throw new Unreadable(file)
  }
}

/** The picture on the system clipboard itself, stored, or null when there is none. */
export async function saveClipboardImage(): Promise<string | null> {
  try {
    const found = await host().clipboardImage?.()
    return found ? ((await host().saveImage?.(found.mime, found.bytes)) ?? null) : null
  } catch {
    return null
  }
}

/** Whether a pasted slice already holds a picture that will show: one with a link that loads. */
function sliceHasPicture(slice: Slice): boolean {
  let found = false
  slice.content.descendants((node) => {
    if (node.type.name === "image" && /^(https?|haligtree|data):/i.test(String(node.attrs.src ?? ""))) found = true
    return !found
  })
  return found
}

/** Store one file of any kind and get back the node that shows it. */
export async function saveAttachment(file: File): Promise<{
  src: string
  name: string
  size: number
}> {
  if (!file.size) throw new Error(`${file.name || "That file"} is empty`)

  const bytes = await readBytes(file)
  const src = await host().saveFile?.(file.name, bytes)
  if (!src) throw new Error(`Cannot store ${file.name || "that file"}`)
  return { src, name: file.name, size: file.size }
}

/** Store one image and get back the URL that reads it again. */
export async function saveImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error(`${file.name || "That file"} is not an image`)
  }
  if (!file.size) throw new Error(`${file.name || "That file"} is empty`)

  const bytes = await readBytes(file)
  const src = await host().saveImage?.(file.type, bytes)
  if (!src) throw new Error(`Cannot store ${file.type || "that file"}`)
  return src
}

/** Copy a linked image into the store so the note stops needing its host. */
export async function saveLinkedImage(href: string): Promise<string> {
  const found = await host().fetchImage?.(href)
  if (!found) throw new Error(`Could not read ${href}`)

  const src = await host().saveImage?.(found.mime, found.bytes)
  if (!src) throw new Error(`Cannot store ${found.mime}`)
  return src
}

/**
 * Keep the spot, then fill it once the bytes are stored.
 *
 * The position is held in plugin state rather than in a variable, so edits made
 * while the write is in flight carry it along. A position that is simply
 * remembered would be stale by the time it is used, and clamping a stale one
 * puts the picture at the end of the document, which is never what was meant.
 */
function hold(
  view: EditorView,
  sources: Array<Promise<ProseMirrorNode | null>>,
  target: Target,
  onError: ImageDropOptions["onError"]
): void {
  const id = nextId++
  // Not its own undo step: undo should take back the image, not a piece of
  // bookkeeping that was never visible.
  view.dispatch(
    view.state.tr
      .setMeta(key, { add: { id, ...target } })
      .setMeta("addToHistory", false)
  )
  void fill(view, sources, id, onError)
}

async function fill(
  view: EditorView,
  sources: Array<Promise<ProseMirrorNode | null>>,
  id: number,
  onError: ImageDropOptions["onError"]
): Promise<void> {
  const settled = await Promise.allSettled(sources)
  if (view.isDestroyed) return

  const problems = settled.flatMap((one) =>
    one.status === "rejected" ? [reason(one.reason)] : []
  )
  const nodes = settled.flatMap((one) =>
    one.status === "fulfilled" && one.value ? [one.value] : []
  )

  const spot = key.getState(view.state)?.find((one) => one.id === id)
  let tr = view.state.tr

  // No spot means what surrounded it was deleted while the write ran. Letting
  // the image go is right; putting it somewhere else is not.
  if (spot && nodes.length) {
    if (spot.to > spot.from) tr.deleteRange(spot.from, spot.to)

    // Snap to somewhere a block is actually allowed. The raw position can be
    // the middle of a paragraph or a code block, and inserting there cuts it
    // in half.
    const slice = new Slice(Fragment.from(nodes), 0, 0)
    const at = dropPoint(tr.doc, tr.mapping.map(spot.from), slice)

    if (at == null) {
      problems.push("There is nowhere to put an image here")
      tr = view.state.tr // Nothing was inserted, so nothing is deleted either.
    } else {
      tr.insert(at, nodes).scrollIntoView()
    }
  }

  view.dispatch(tr.setMeta(key, { drop: id }))
  if (problems.length) onError(problems)
}

/**
 * Drop or paste an image and keep it.
 *
 * A file dragged from Finder and an image put on the clipboard by "Copy Image"
 * both arrive as a `File`; the pasted one simply has no useful name, which is
 * why the store addresses images by the hash of their bytes instead. An image
 * dragged off a web page arrives as a link, and is fetched and stored too, so
 * the note holds a copy rather than a dependency on someone else's server.
 *
 * The bytes go to the main process, which writes them and returns a
 * `haligtree://` URL. That is what the document stores, so it survives the app
 * moving and never carries a filesystem path.
 */
export const ImageDrop = Extension.create<ImageDropOptions>({
  name: "imageDrop",

  addOptions() {
    return {
      // Said where you are looking, not only to the developer console: the picture did not just vanish.
      onError: (problems) => {
        console.error(problems.join("\n"))
        const first = problems[0] ?? "it could not be saved"
        // Already a whole sentence, and the words around it went in anyway.
        if (first === PICTURE_LOST) return said(PICTURE_LOST, false)
        said(`Not added: ${first[0].toLowerCase()}${first.slice(1)}${problems.length > 1 ? `, and ${problems.length - 1} more` : ""}`, false)
      },
    }
  },

  addProseMirrorPlugins() {
    // Captured, not read through `this`: plugin props are called detached.
    const { onError } = this.options

    return [
      new Plugin({
        key,

        state: {
          init: (): Pending[] => [],
          apply(tr, spots) {
            const change = tr.getMeta(key)
            // Bias 1: an edit exactly at the spot pushes it along rather than
            // swallowing it.
            const moved = spots.map((spot) => ({
              ...spot,
              from: tr.mapping.map(spot.from, 1),
              to: tr.mapping.map(spot.to, 1),
            }))

            if (change?.add) return [...moved, change.add]
            if (change?.drop != null)
              return moved.filter((spot) => spot.id !== change.drop)
            return moved
          },
        },

        props: {
          handleDrop(view, event) {
            // A block of this note being moved or copied (a picture dragged
            // out and back in included): ProseMirror's own drop, not a new file.
            if (view.dragging) return false
            const { images, rest } = sort(event.dataTransfer)
            const href = images.length ? "" : linked(event.dataTransfer)
            if (!images.length && !href && !rest.length) return false

            // Where it was dropped, not the end of the document.
            const found = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            })
            const at = found?.pos ?? view.state.selection.from

            // Dropping onto an empty image block fills it in. Landing beside it
            // would leave the empty one behind to be tidied up by hand.
            const inside = found?.inside ?? -1
            const empty = inside < 0 ? null : view.state.doc.nodeAt(inside)
            const target =
              empty?.type.name === "imagePlaceholder"
                ? { from: inside, to: inside + empty.nodeSize }
                : { from: at, to: at }

            const { schema } = view.state
            const picture = (src: string): ProseMirrorNode =>
              schema.nodes.image.create({ src })

            event.preventDefault()
            hold(
              view,
              [
                // Anything that is not a picture becomes a card rather than a
                // complaint: the store does not care what the bytes are.
                ...rest.map((file) =>
                  saveAttachment(file).then((attrs) =>
                    schema.nodes.attachment.create(attrs)
                  )
                ),
                ...(href
                  ? [saveLinkedImage(href).then(picture)]
                  : images.map((file) => saveImage(file).then(picture))),
              ],
              target,
              onError
            )
            return true
          },

          handlePaste(view, event, slice) {
            const { images } = sort(event.clipboardData)
            if (!images.length) return false
            event.preventDefault()

            // A clipboard can carry text and a picture at once. ProseMirror has
            // already parsed the text half by now, so taking the event without
            // applying it would throw that half away. A slice that is only the
            // image adds nothing the file does not.
            const rich =
              slice.content.size > 0 &&
              !(
                slice.content.childCount === 1 &&
                slice.content.firstChild?.type.name === "image"
              )
            if (rich) view.dispatch(view.state.tr.replaceSelection(slice))

            // Read after that dispatch, and collapsed if it happened: the text
            // has already taken the selection's place.
            const { from, to } = view.state.selection
            const { schema } = view.state

            // A picture whose file cannot be read (Apple Notes puts a pointer
            // into its own folder on the clipboard) is looked for elsewhere:
            // in the words already pasted, then the clipboard's own picture,
            // then a link to it in the HTML. Once, however many files failed,
            // so one picture never comes in twice.
            let tried = false
            const carried = rich && sliceHasPicture(slice)
            // Read now: the clipboard is shut once this handler returns.
            const href = linked(event.clipboardData)
            const instead = async (cause: unknown): Promise<ProseMirrorNode | null> => {
              if (!(cause instanceof Unreadable)) throw cause
              if (tried || carried) return null
              tried = true
              const src = (await saveClipboardImage()) ?? (href ? await saveLinkedImage(href).catch(() => null) : null)
              if (!src) throw new Error(PICTURE_LOST)
              return schema.nodes.image.create({ src })
            }
            hold(
              view,
              images.map((file) =>
                saveImage(file).then((src) => schema.nodes.image.create({ src }), instead)
              ),
              { from, to: rich ? from : to },
              onError
            )
            return true
          },
        },
      }),
    ]
  },
})
