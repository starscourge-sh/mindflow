/** A title without what download sites and word processors stamp on it ("Cosmos - PDFDrive.com",
 *  "Algebra (z-lib.org)", "Microsoft Word - essay.docx"); a title that is only such a stamp, a file
 *  name or a long number is no title at all. A file name loses a leading "18 - " and its underscores. */
export function cleanTitle(raw: string): string {
  const title = raw
    .replace(/\s*[-–|:]?\s*\(?\s*(pdf\s*drive(\.com)?|z-?lib(rary)?(\.(org|sk))?([,\s]*(1lib|z-lib)\.sk)*|libgen(\.\w+)?|www\.\S+|\S+\.(com|org|net))\s*\)?\s*/gi, " ")
    .replace(/^microsoft (word|powerpoint) - /i, "")
    .replace(/\.(docx?|pptx?|indd|pdf|epub)$/i, "")
    .replace(/^\s*\d{1,3}\s*[-–.]\s+/, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return /^(untitled|title|document|\d{5,})$/i.test(title) ? "" : title
}
