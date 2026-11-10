import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type { PDFDocumentProxy } from "pdfjs-dist"

/**
 * A book's printed page numbers. A printed book's file rarely starts its page
 * 1 on the file's first page (The Crime Book's covers are "CA" and "CB", so
 * its page 48 is the file's 50th): pdf.js reads the numbers the file carries,
 * and every place the app names a page (the page box, citations, the outline,
 * "You are on p. 48") uses them. Links keep the file's page, so a link kept
 * before still lands where it did. Kept per book in this window's storage, so
 * the shelf and the note's lists can name the printed page without opening it.
 */
const KEY = (src: string): string => `pdf-labels:${src}`
const known = new Map<string, string[] | null>()

/** The printed page numbers kept for a book, or null when it has none of its own. */
export function labelsOf(src: string): string[] | null {
  if (!known.has(src)) {
    let kept: string[] | null = null
    try {
      kept = JSON.parse(localStorage.getItem(KEY(src)) ?? "null")
    } catch {
      kept = null
    }
    known.set(src, Array.isArray(kept) ? kept : null)
  }
  return known.get(src) ?? null
}

/** The page as the book prints it ("48", "xii"), else its place in the file. */
export const labelFor = (src: string, n: number): string => labelsOf(src)?.[n - 1] || String(n)

/** A page of the file from what someone typed: a printed page first ("48" is the page printed 48), else the file's own page. */
export function pageFromLabel(labels: string[] | null, typed: string, pages: number): number | null {
  const text = typed.trim().toLowerCase()
  if (!text) return null
  const at = labels?.findIndex((one) => one.toLowerCase() === text) ?? -1
  if (at >= 0) return at + 1
  return /^\d+$/.test(text) && Number(text) >= 1 && Number(text) <= pages ? Number(text) : null
}

/** Read a book's numbers once it is open; only kept when they differ from the file's own (1, 2, 3…). */
async function learnLabels(src: string, doc: PDFDocumentProxy): Promise<string[] | null> {
  const read = await doc.getPageLabels().catch(() => null)
  const own = read && read.length === doc.numPages && read.some((one, i) => one !== String(i + 1)) ? read : null
  if (JSON.stringify(own) !== JSON.stringify(labelsOf(src))) {
    known.set(src, own)
    if (own) localStorage.setItem(KEY(src), JSON.stringify(own))
    else localStorage.removeItem(KEY(src))
    window.dispatchEvent(new CustomEvent("haligtree:pdf-labels"))
  }
  return own
}

/** The book's printed numbers, read when its document opens: `label(n)` names a page, `find(typed)` reads one typed. */
export function usePageLabels(src: string, doc: PDFDocumentProxy | null): { labels: string[] | null; label: (n: number) => string; find: (typed: string) => number | null } {
  const [labels, setLabels] = useState(() => labelsOf(src))
  useEffect(() => {
    setLabels(labelsOf(src))
    if (doc) void learnLabels(src, doc).then(setLabels)
  }, [src, doc])
  return useMemo(() => ({
    labels,
    label: (n: number) => labels?.[n - 1] || String(n),
    find: (typed: string) => pageFromLabel(labels, typed, doc?.numPages ?? labels?.length ?? 0),
  }), [labels, doc])
}

/** Every book's printed numbers kept as they change, for a list that names pages (the shelf, Details). */
export function useLabelsChanged(): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const on = (): void => setCount((n) => n + 1)
    window.addEventListener("haligtree:pdf-labels", on)
    return () => window.removeEventListener("haligtree:pdf-labels", on)
  }, [])
  return count
}

/** The open book's way of naming a page, for every list beside its pages (thumbnails, outline, Details, chapter cards). */
export const PageLabel = createContext<(n: number) => string>(String)
export const usePageLabel = (): ((n: number) => string) => useContext(PageLabel)
