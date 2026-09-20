import { Extension } from "@tiptap/core"
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

/** Store one file of any kind and get back the node that shows it. */
export async function saveAttachment(file: File): Promise<{
  src: string
  name: string
  size: number
}> {
  if (!file.size) throw new Error(`${file.name || "That file"} is empty`)

  const bytes = new Uint8Array(await file.arrayBuffer())
  const src = await window.api.saveFile(file.name, bytes)
  if (!src) throw new Error(`Cannot store ${file.name || "that file"}`)
  return { src, name: file.name, size: file.size }
}

/** Store one image and get back the URL that reads it again. */
export async function saveImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error(`${file.name || "That file"} is not an image`)
  }
  if (!file.size) throw new Error(`${file.name || "That file"} is empty`)

  const bytes = new Uint8Array(await file.arrayBuffer())
  const src = await window.api.saveImage(file.type, bytes)
  if (!src) throw new Error(`Cannot store ${file.type || "that file"}`)
  return src
}

/** Copy a linked image into the store so the note stops needing its host. */
export async function saveLinkedImage(href: string): Promise<string> {
  const found = await window.api.fetchImage(href)
  if (!found) throw new Error(`Could not read ${href}`)

  const src = await window.api.saveImage(found.mime, found.bytes)
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
  sources: Array<Promise<ProseMirrorNode>>,
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
  sources: Array<Promise<ProseMirrorNode>>,
  id: number,
  onError: ImageDropOptions["onError"]
): Promise<void> {
  const settled = await Promise.allSettled(sources)
  if (view.isDestroyed) return

  const problems = settled.flatMap((one) =>
    one.status === "rejected" ? [reason(one.reason)] : []
  )
  const nodes = settled.flatMap((one) =>
    one.status === "fulfilled" ? [one.value] : []
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
 * `mindflow://` URL. That is what the document stores, so it survives the app
 * moving and never carries a filesystem path.
 */
export const ImageDrop = Extension.create<ImageDropOptions>({
  name: "imageDrop",

  addOptions() {
    return {
      onError: (problems) => console.error(problems.join("\n")),
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
            hold(
              view,
              images.map((file) =>
                saveImage(file).then((src) => schema.nodes.image.create({ src }))
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
