import type { JSONContent } from "@tiptap/core"

/** A stored file a document points at. */
export interface DocumentAsset {
  /** The `mindflow://assets/<hash>.<ext>` URL held in the document. */
  src: string
  kind: "image" | "attachment"
  /** Attachments carry the name they arrived under; images do not. */
  name?: string
  size?: number
}

const KINDS: Record<string, DocumentAsset["kind"]> = {
  image: "image",
  attachment: "attachment",
}

/**
 * Every stored file a document points at, in the order it first appears.
 *
 * This is the list to back up, and the list to check a file against before
 * deleting it: the store addresses by hash, so one picture used in three notes
 * is one file, and it stops being reachable only when the last note drops it.
 *
 * Deduplicated by `src`, since the same file twice in one document is still
 * one file. Remote images are included, so a document that has not been fully
 * localised is visible rather than silently missing from the backup.
 */
export function assetsOf(doc: JSONContent | null | undefined): DocumentAsset[] {
  const found = new Map<string, DocumentAsset>()

  const walk = (node: JSONContent): void => {
    const kind = node.type ? KINDS[node.type] : undefined
    const src = node.attrs?.src

    if (kind && typeof src === "string" && src && !found.has(src)) {
      found.set(src, {
        src,
        kind,
        ...(typeof node.attrs?.name === "string" ? { name: node.attrs.name } : {}),
        ...(typeof node.attrs?.size === "number" ? { size: node.attrs.size } : {}),
      })
    }

    for (const child of node.content ?? []) walk(child)
  }

  if (doc) walk(doc)
  return [...found.values()]
}

/** Is this asset in the app's own store, rather than someone else's server? */
export const isStored = (asset: DocumentAsset): boolean =>
  asset.src.startsWith("mindflow://assets/")
