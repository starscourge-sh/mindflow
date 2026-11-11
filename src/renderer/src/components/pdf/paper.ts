import { useEffect, useState } from "react"

/** Told when "Paper pages" is turned on or off, so every reader and every PDF in a note follows at once. */
const CHANGED = "haligtree:pdf-paper"

// Said on the page itself too, for covers drawn outside any reader (the library,
// Continue reading, a PDF's card in a note): they are pages as well.
const mark = (): void => void document.documentElement.classList.toggle("paper-pages", localStorage.getItem("pdf-paper") !== "0")
mark()
window.addEventListener(CHANGED, mark)
window.addEventListener("storage", mark)
// "Dark pages" said on the page too: a cover's backing (--pdf-paper, pdf.css) is the dark page's, not white.
const markDark = (): void => void document.documentElement.classList.toggle("dark-pages", localStorage.getItem("pdf-dark") === "1")
markDark()
window.addEventListener("haligtree:pdf-dark", markDark)
window.addEventListener("storage", markDark)

/**
 * "Paper pages", on unless turned off: PDF pages in the app's warm paper rather than white, one
 * setting for the reader, an article and a PDF in a note alike, so a page
 * never reads one way in the reader and another in the note beside it.
 */
export function usePaperPages(): [boolean, (on: boolean) => void] {
  const [paper, setPaper] = useState(() => localStorage.getItem("pdf-paper") !== "0")
  useEffect(() => {
    const read = (): void => setPaper(localStorage.getItem("pdf-paper") !== "0")
    window.addEventListener(CHANGED, read)
    window.addEventListener("storage", read)
    return () => (window.removeEventListener(CHANGED, read), window.removeEventListener("storage", read))
  }, [])
  const set = (on: boolean): void => {
    localStorage.setItem("pdf-paper", on ? "1" : "0")
    window.dispatchEvent(new CustomEvent(CHANGED))
  }
  return [paper, set]
}

/** Told when "Dark pages" is turned on or off. */
const DARKENED = "haligtree:pdf-dark"

/**
 * "Dark pages", as Preview's "Use Dark Appearance for PDF": the page itself
 * in the theme's dark, its text light, its pictures kept true (pdf.js draws
 * text and lines in the colours given and leaves pictures as they are). Off
 * unless turned on; on, it wins over Paper and White. One setting for every reader.
 */
export function useDarkPages(): [boolean, (on: boolean) => void] {
  const [dark, setDark] = useState(() => localStorage.getItem("pdf-dark") === "1")
  useEffect(() => {
    const read = (): void => setDark(localStorage.getItem("pdf-dark") === "1")
    window.addEventListener(DARKENED, read)
    window.addEventListener("storage", read)
    return () => (window.removeEventListener(DARKENED, read), window.removeEventListener("storage", read))
  }, [])
  const set = (on: boolean): void => {
    localStorage.setItem("pdf-dark", on ? "1" : "0")
    window.dispatchEvent(new CustomEvent(DARKENED))
  }
  return [dark, set]
}

/** Told when "Only this page in colour" is turned on or off. */
const ONE_IN_COLOUR = "haligtree:pdf-one-colour"

/**
 * "Only this page in colour": the rail's other thumbnails in grey, so the page you are on stands
 * out at a glance. Off unless turned on; one setting for every reader and every rail.
 */
export function useOneInColour(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => localStorage.getItem("pdf-one-colour") === "1")
  useEffect(() => {
    const read = (): void => setOn(localStorage.getItem("pdf-one-colour") === "1")
    window.addEventListener(ONE_IN_COLOUR, read)
    window.addEventListener("storage", read)
    return () => (window.removeEventListener(ONE_IN_COLOUR, read), window.removeEventListener("storage", read))
  }, [])
  const set = (to: boolean): void => {
    localStorage.setItem("pdf-one-colour", to ? "1" : "0")
    window.dispatchEvent(new CustomEvent(ONE_IN_COLOUR))
  }
  return [on, set]
}

/** How pages look, one choice of three as Preview's: "Paper pages", "White pages" or "Dark pages". */
export type PageLook = "paper" | "white" | "dark"
export const LOOKS: { id: PageLook; label: string }[] = [
  { id: "paper", label: "Paper pages" },
  { id: "white", label: "White pages" },
  { id: "dark", label: "Dark pages" },
]
export function usePageLook(): [PageLook, (to: PageLook) => void] {
  const [paper, setPaper] = usePaperPages()
  const [dark, setDark] = useDarkPages()
  const look: PageLook = dark ? "dark" : paper ? "paper" : "white"
  const set = (to: PageLook): void => {
    setDark(to === "dark")
    if (to !== "dark") setPaper(to === "paper")
  }
  return [look, set]
}

/** The colours a dark page is drawn in: the dark theme's ground and ink. */
export const DARK_PAGE = { background: "#1c1a17", foreground: "#e9e3d7" }

/** How a book's pages are laid out, as Preview offers them: kept per book. */
export type PageLayout = "continuous" | "single" | "spread"
export const LAYOUTS: { id: PageLayout; label: string }[] = [
  { id: "continuous", label: "Continuous scroll" },
  { id: "single", label: "Single page" },
  { id: "spread", label: "Two pages" },
]
const layoutOf = (src: string): PageLayout => {
  const kept = localStorage.getItem(`pdf-layout:${src}`)
  return kept === "single" || kept === "spread" ? kept : "continuous"
}
export function usePageLayout(src: string): [PageLayout, (to: PageLayout) => void] {
  const [got, setGot] = useState(() => ({ src, layout: layoutOf(src) }))
  const layout = got.src === src ? got.layout : layoutOf(src)
  const set = (to: PageLayout): void => {
    localStorage.setItem(`pdf-layout:${src}`, to)
    setGot({ src, layout: to })
  }
  return [layout, set]
}
