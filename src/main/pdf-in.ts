/** A link into one of the book's PDFs, as a gem's body keeps it: `haligtree://assets/….pdf#page=3&mark=…&name=…`. */
const PDF_IN_BODY = /((?:haligtree|mindflow):\/\/assets\/[^#?)\s"\\]+\.pdf)#([^)\s"\\]*)/i

/**
 * The PDF a gem's words were kept from, and the page, read from the link in its body: a document, or its words as
 * stored (the reading thread is asked this of a note by itself, reader-jobs.ts `note:pdf`). Pure, so the windows,
 * and the reading thread share it.
 */
export function pdfIn(body: unknown): { src: string; name: string; page: number; mark?: string } | null {
  const found = PDF_IN_BODY.exec(typeof body === 'string' ? body : JSON.stringify(body ?? ''))
  if (!found) return null
  const hash = new URLSearchParams(found[2].replace(/&amp;/g, '&'))
  const page = Number(hash.get('page'))
  if (!page) return null
  return { src: found[1], name: hash.get('name') ?? '', page, mark: hash.get('mark') || undefined }
}
