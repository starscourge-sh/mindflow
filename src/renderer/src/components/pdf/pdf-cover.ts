import { useEffect, useState } from "react"
import { call } from "@/lib/haligtree"
import { loadPdf, pdfAuthor, pdfTitle } from "./pdf-pages"
import { learnTitle } from "./pdf-reader"

/** A PDF's cover and its own title, as every card of it shows them. */
export type PdfCover = { image: string; title: string; /** Width over height, read once the picture is decoded: a box sized by it never changes shape as it draws. */ aspect: number }

/** Asked once per PDF per window: every card of the same book shares the answer. */
const covers = new Map<string, Promise<PdfCover | null>>()
/** The answers already in, so a card drawn after them has its cover in its first frame, never a frame later. */
const ready = new Map<string, PdfCover | null>()

/** A picture's shape, from the picture itself: a page's own 3:4 when it cannot be read. */
const shapeOf = (image: string): Promise<number> =>
  new Promise((done) => {
    const one = new Image()
    one.onload = () => done(one.naturalWidth && one.naturalHeight ? one.naturalWidth / one.naturalHeight : 3 / 4)
    one.onerror = () => done(3 / 4)
    one.src = image
  })

/** The width a cover is drawn at: twice a large card's, for Retina screens. */
const WIDE = 520

/**
 * A PDF's first page as a picture, with the title the file carries (else the
 * name it arrived under). Kept in the book's store the first time it is drawn,
 * so after that it is there at once, on every card and in every window.
 */
export function pdfCover(src: string, name = ""): Promise<PdfCover | null> {
  // Always in its own colours, "Dark pages" or not: drawn with the dark pages' two colours, a cover of
  // lines and type came out black and white.
  const key = src
  let made = covers.get(key)
  if (!made) {
    made = (async () => {
      const kept = await call<{ image: string; title: string | null } | null>("pdf:cover", src).catch(() => null)
      if (kept) return { image: kept.image, title: kept.title ?? fallback(name), aspect: await shapeOf(kept.image) }
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
      void call("pdf:cover:set", src, image, { author: await pdfAuthor(doc), pages: doc.numPages })
      return { image, title, aspect: canvas.width / canvas.height }
    })()
      .catch(() => null)
      .then((made) => (ready.set(key, made), made))
    covers.set(key, made)
  }
  return made
}

/** The pages' paper, as pdf.css lays it under every page and cover. */
const PAPER = "#f4ecdb"
const papered = new Map<string, Promise<string>>()

/**
 * A cover on the pages' paper, baked into the picture, for a surface that draws it itself (the
 * Continue reading carousel draws in WebGL, where pdf.css cannot reach): the same multiply as
 * every other cover, so a book never shows white in one place and paper in the next. With "Paper
 * pages" off, the picture as it is.
 */
export function coverOnPaper(image: string): Promise<string> {
  if (!document.documentElement.classList.contains("paper-pages")) return Promise.resolve(image)
  let made = papered.get(image)
  if (!made) {
    made = new Promise<string>((done) => {
      const one = new Image()
      one.onload = () => {
        const canvas = document.createElement("canvas")
        canvas.width = one.naturalWidth
        canvas.height = one.naturalHeight
        const ink = canvas.getContext("2d")
        if (!ink) return done(image)
        ink.fillStyle = PAPER
        ink.fillRect(0, 0, canvas.width, canvas.height)
        ink.globalCompositeOperation = "multiply"
        ink.drawImage(one, 0, 0)
        done(canvas.toDataURL("image/jpeg", 0.86))
      }
      one.onerror = () => done(image)
      one.src = image
    })
    papered.set(image, made)
  }
  return made
}

const fallback = (name: string): string => name.replace(/\.pdf$/i, "") || "PDF"

/** A PDF's cover for a card: null until it is ready, then the picture and the title. One already drawn is there in the first frame, a new book's too. */
export function usePdfCover(src: string | null | undefined, name = ""): PdfCover | null | undefined {
  const [got, setGot] = useState<{ src: string; cover: PdfCover | null } | null>(null)
  const key = src
  useEffect(() => {
    if (!src || !key) return
    let live = true
    void pdfCover(src, name).then((made) => live && setGot({ src: key, cover: made }))
    return () => void (live = false)
  }, [src, name, key])
  if (!src || !key) return undefined
  return got?.src === key ? got.cover : ready.has(key) ? ready.get(key) : undefined
}
