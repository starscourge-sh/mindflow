/** Small words a title keeps lower case, past its first word. */
const SMALL = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "with"])

/** A title written all in lower case or all in capitals ("frankenstein", "A COURSE OF PURE MATHEMATICS"), cased as a book's cover is. */
const asTitle = (title: string): string =>
  /\p{L}/u.test(title) && (title === title.toLowerCase() || (title === title.toUpperCase() && /\p{Lu}{2,}\s+\p{Lu}{2,}/u.test(title)))
    ? title.toLowerCase().replace(/[\p{L}\d'’]+/gu, (word: string, at: number) => (at > 0 && SMALL.has(word) ? word : word[0].toUpperCase() + word.slice(1)))
    : title

/** A title without what download sites and word processors stamp on it ("Cosmos - PDFDrive.com",
 *  "Algebra (z-lib.org)", "Microsoft Word - essay.docx", "The Project Gutenberg eBook #38769: "); a title that is only
 *  such a stamp, a file name or a long number is no title at all. A file name loses a leading "18 - " and its
 *  underscores, and one written all in lower case or capitals is cased as a title. */
export function cleanTitle(raw: string): string {
  const title = raw
    .replace(/\s*[-–|:]?\s*\(?\s*(pdf\s*drive(\.com)?|z-?lib(rary)?(\.(org|sk))?([,\s]*(1lib|z-lib)\.sk)*|libgen(\.\w+)?|www\.\S+|\S+\.(com|org|net))\s*\)?\s*/gi, " ")
    .replace(/^microsoft (word|powerpoint) - /i, "")
    .replace(/^\s*(the )?project gutenberg('s)? e-?book( #\d+)?\s*(of\b|[:,.-])?\s*/i, "")
    .replace(/\.(docx?|pptx?|indd|pdf|epub)$/i, "")
    .replace(/^\s*\d{1,3}\s*[-–.]\s+/, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return /^(untitled|title|document|\d{5,})$/i.test(title) ? "" : asTitle(title)
}
