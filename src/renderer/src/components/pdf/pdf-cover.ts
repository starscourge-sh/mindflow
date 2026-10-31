import { useEffect, useState } from "react"
import { call } from "@/lib/haligtree"
import { loadPdf, pdfTitle } from "./pdf-pages"
import { learnTitle } from "./pdf-reader"

/** A PDF's cover and its own title, as every card of it shows them. */
export type PdfCover = { image: string; title: string }

/** Asked once per PDF per window: every card of the same book shares the answer. */
const covers = new Map<string, Promise<PdfCover | null>>()

/** The width a cover is drawn at: twice a large card's, for Retina screens. */
const WIDE = 520

/**
 * A PDF's first page as a picture, with the title the file carries (else the
 * name it arrived under). Kept in the book's store the first time it is drawn,
 * so after that it is there at once, on every card and in every window.
 */
export function pdfCover(src: string, name = ""): Promise<PdfCover | null> {
  let made = covers.get(src)
  if (!made) {
    made = (async () => {
      const kept = await call<{ image: string; title: string | null } | null>("pdf:cover", src).catch(() => null)
      if (kept) return { image: kept.image, title: kept.title ?? fallback(name) }
      const doc = await loadPdf(src)
      const page = await doc.getPage(1)
      const flat = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: WIDE / flat.width })
      const canvas = document.createElement("canvas")
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      const ink = canvas.getContext("2d")
      if (!ink) return null
      // White under the page, as paper: a page with no background of its own is never drawn on black.
      ink.fillStyle = "#fff"
      ink.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ink, viewport, canvas }).promise
      const image = canvas.toDataURL("image/jpeg", 0.82)
      const title = await pdfTitle(doc, name)
      learnTitle(src, title)
      void call("pdf:cover:set", src, image)
      return { image, title }
    })().catch(() => null)
    covers.set(src, made)
  }
  return made
}

const fallback = (name: string): string => name.replace(/\.pdf$/i, "") || "PDF"

/** A PDF's cover for a card: null until it is ready, then the picture and the title. */
export function usePdfCover(src: string | null | undefined, name = ""): PdfCover | null | undefined {
  const [cover, setCover] = useState<PdfCover | null | undefined>(undefined)
  useEffect(() => {
    if (!src) return
    let live = true
    void pdfCover(src, name).then((made) => live && setCover(made))
    return () => void (live = false)
  }, [src, name])
  return cover
}
