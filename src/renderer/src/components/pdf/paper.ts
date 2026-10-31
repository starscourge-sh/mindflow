import { useEffect, useState } from "react"

/** Told when "Paper pages" is turned on or off, so every reader and every PDF in a note follows at once. */
const CHANGED = "haligtree:pdf-paper"

/**
 * "Paper pages": PDF pages in the app's warm paper rather than white, one
 * setting for the reader, an article and a PDF in a note alike, so a page
 * never reads one way in the reader and another in the note beside it.
 */
export function usePaperPages(): [boolean, (on: boolean) => void] {
  const [paper, setPaper] = useState(() => localStorage.getItem("pdf-paper") === "1")
  useEffect(() => {
    const read = (): void => setPaper(localStorage.getItem("pdf-paper") === "1")
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
