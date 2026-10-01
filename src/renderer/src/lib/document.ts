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
    found.set(src, { src, kind, ...extra })
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
        add(file.dataURL, "diagram-image", { size: dataUrlSize(file.dataURL) })
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
