import { host } from "@/lib/host"

import type { MindflowHost } from "@/lib/host"
import type { JSONContent } from "@tiptap/core"

/**
 * Something a document points at that does not live in the document's text.
 *
 * `src` is where to find it: a URL for anything stored or remote, a `data:`
 * URL for the pictures Excalidraw keeps inside a drawing, and a note's id for
 * a link to another note.
 */
export interface Reference {
  src: string
  kind: ReferenceKind
  /** Attachments carry the name they arrived under; nothing else does. */
  name?: string
  /** Bytes, where that is known or can be worked out from a `data:` URL. */
  size?: number
}

export type ReferenceKind =
  /** A picture in the text. */
  | "image"
  /** A file clipped to the note. */
  | "attachment"
  /** A picture pasted into a drawing, which Excalidraw keeps as a data URL. */
  | "diagram-image"
  /** The preview picture on a link card, which is somebody else's server. */
  | "bookmark-image"
  /** The site's favicon on a link card, likewise. */
  | "bookmark-icon"
  /** Another note. Not a file: the edge of the graph this note sits in. */
  | "note"

/** The node attribute each simple kind hangs off. */
const FROM_ATTR: Record<string, { attr: string; kind: ReferenceKind }[]> = {
  image: [{ attr: "src", kind: "image" }],
  attachment: [{ attr: "src", kind: "attachment" }],
  bookmark: [
    { attr: "image", kind: "bookmark-image" },
    { attr: "icon", kind: "bookmark-icon" }
  ],
  noteLink: [{ attr: "id", kind: "note" }]
}

/**
 * The kinds that are a picture somewhere else, and so can be copied here.
 *
 * `attachment` is left out because it is already in the store by the time it
 * is in the document, and `note` because it is an id rather than a URL.
 */
const MOVABLE: ReferenceKind[] = ["image", "bookmark-image", "bookmark-icon"]

/** How many bytes a `data:...;base64,...` URL is actually carrying. */
function dataUrlSize(src: string): number | undefined {
  const base64 = src.split(",")[1]
  if (!src.startsWith("data:") || !base64) return undefined
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

/**
 * Everything a document points at, in the order it first appears.
 *
 * This is the question to ask before moving a note anywhere else: what has to
 * travel with it, what is somebody else's server and will rot, and what other
 * notes does it reach. It reads the stored JSON and nothing else - no editor,
 * no disk, no network - so a host that keeps notes in S3 and never touches a
 * filesystem can ask it exactly as this app does.
 *
 * Deduplicated by `src`, because the store addresses by hash: one picture used
 * three times is one file, and it stops being reachable only when the last
 * note drops it.
 *
 * Two kinds deserve a word. A `diagram-image` is a picture somebody pasted
 * into a drawing, and Excalidraw keeps those inside the scene as a data URL -
 * so it rides in the document itself rather than in the store, undeduplicated,
 * resent on every save. It is listed here so that is visible rather than a
 * surprise when a row will not fit. A `bookmark-image` is a preview picture
 * still pointing at the site it came from: nothing has copied it, so it will
 * eventually 404, and fetching it tells that site who is reading.
 */
export function referencesOf(doc: JSONContent | null | undefined): Reference[] {
  const found = new Map<string, Reference>()

  const add = (src: unknown, kind: ReferenceKind, extra: Partial<Reference> = {}): void => {
    if (typeof src !== "string" || !src || found.has(src)) return
    // Anything inline can be weighed, wherever it hangs - a picture dropped in
    // the text arrives as a data URL too, not just the ones inside a drawing.
    const size = extra.size ?? dataUrlSize(src)
    found.set(src, { src, kind, ...extra, ...(size === undefined ? {} : { size }) })
  }

  const walk = (node: JSONContent): void => {
    for (const { attr, kind } of FROM_ATTR[node.type ?? ""] ?? []) {
      add(node.attrs?.[attr], kind, {
        ...(typeof node.attrs?.name === "string" ? { name: node.attrs.name } : {}),
        ...(typeof node.attrs?.size === "number" ? { size: node.attrs.size } : {})
      })
    }

    // A drawing's own pictures, which live one level further in than an
    // attribute: the scene is an object on the node, and its `files` are
    // keyed by the id the shapes point at.
    if (node.type === "excalidraw") {
      const files = (node.attrs?.scene as { files?: Record<string, { dataURL?: string }> })?.files
      for (const file of Object.values(files ?? {})) {
        if (!file?.dataURL) continue
        add(file.dataURL, "diagram-image")
      }
    }

    for (const child of node.content ?? []) walk(child)
  }

  if (doc) walk(doc)
  return [...found.values()]
}

/**
 * Just the files in the app's own store, for a backup or a sweep.
 *
 * The narrow question `referencesOf` grew out of, kept because it is the one
 * most callers want: what did this note put in the store.
 */
export function assetsOf(doc: JSONContent | null | undefined): Reference[] {
  return referencesOf(doc).filter((ref) => ref.kind === "image" || ref.kind === "attachment")
}

/** Is this in the app's own store, rather than someone else's server? */
export const isStored = (ref: Reference): boolean => ref.src.startsWith("mindflow://assets/")

/** Still inside the document rather than in a store: a drawing's pictures. */
export const isInline = (ref: Reference): boolean => ref.src.startsWith("data:")

/** What a document weighs beyond its text, which is what makes a row too big. */
export const inlineBytes = (doc: JSONContent | null | undefined): number =>
  referencesOf(doc)
    .filter(isInline)
    .reduce((total, ref) => total + (ref.size ?? 0), 0)

/** The bytes behind a `data:<mime>;base64,<...>` URL, and what they are. */
function decode(src: string): { mime: string; bytes: Uint8Array } | null {
  const [head, base64] = src.split(",")
  if (!head?.startsWith("data:") || !base64) return null
  try {
    const binary = atob(base64)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return { mime: head.slice(5).replace(";base64", "") || "application/octet-stream", bytes }
  } catch {
    return null
  }
}

/**
 * Put everything a document points at into the host's own store.
 *
 * The pictures pasted into drawings stop riding inside the document, and a
 * link card's preview stops being a request to somebody else's server every
 * time the note is opened. What comes back is a new document; the one passed
 * in is not touched.
 *
 * Anything that cannot be moved is left exactly as it was - a host with no
 * `saveImage`, a server that will not answer, bytes that will not decode. This
 * is a thing you run to tidy up, not a thing that can fail a save.
 *
 * Safe to run twice: a reference already in the store is skipped, and the same
 * picture in two places is stored once because the store addresses by hash.
 */
export async function localise(
  doc: JSONContent | null | undefined,
  using: MindflowHost = host()
): Promise<JSONContent | null | undefined> {
  if (!doc || !using.saveImage) return doc

  // One upload per distinct source, however many places point at it. The
  // promise is what is remembered, not the answer: siblings are walked
  // together, so the second place to ask for a picture arrives while the first
  // upload is still in the air, and remembering a not-yet-filled-in answer
  // would leave that one pointing at the original.
  const moved = new Map<string, Promise<string | null>>()

  const store = (src: string): Promise<string | null> => {
    const already = moved.get(src)
    if (already) return already

    const job = (async () => {
      try {
        const inline = decode(src)
        const got = inline ?? (src.startsWith("http") ? await using.fetchImage?.(src) : null)
        return got ? ((await using.saveImage?.(got.mime, got.bytes)) ?? null) : null
      } catch {
        return null
      }
    })()

    moved.set(src, job)
    return job
  }

  /** Swap one attribute for its stored copy, if there is anything to swap. */
  const swap = async (attrs: Record<string, unknown>, key: string): Promise<void> => {
    const src = attrs[key]
    if (typeof src !== "string" || !src || src.startsWith("mindflow://")) return
    const url = await store(src)
    if (url) attrs[key] = url
  }

  const walk = async (node: JSONContent): Promise<JSONContent> => {
    const next: JSONContent = { ...node }

    if (node.attrs) {
      const attrs = { ...node.attrs }
      // Driven by the same table `referencesOf` reads, so the two cannot come
      // to disagree about where a picture hangs off a node.
      for (const { attr, kind } of FROM_ATTR[node.type ?? ""] ?? []) {
        if (MOVABLE.includes(kind)) await swap(attrs, attr)
      }

      // A drawing's pictures sit inside the scene rather than on the node, so
      // the scene is rebuilt around them.
      if (node.type === "excalidraw") {
        const scene = attrs.scene as { files?: Record<string, { dataURL?: string }> } | null
        if (scene?.files) {
          const files: Record<string, unknown> = {}
          for (const [id, file] of Object.entries(scene.files)) {
            const url = file?.dataURL ? await store(file.dataURL) : null
            files[id] = url ? { ...file, dataURL: url } : file
          }
          attrs.scene = { ...scene, files }
        }
      }
      next.attrs = attrs
    }

    if (node.content) next.content = await Promise.all(node.content.map(walk))
    return next
  }

  return walk(doc)
}
