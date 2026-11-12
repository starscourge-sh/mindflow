/** The PDF a gem's words were kept from, and the page, read from the link in its body. */
export { pdfIn } from '../../../main/pdf-in'

/** A book's name without a page once kept on its end ("The Law Book, p. 93" was the whole source once). */
export const bookOf = (medium: string | null | undefined): string => (medium ?? '').replace(/,\s*p\.\s*\d+\s*$/, '').trim()
