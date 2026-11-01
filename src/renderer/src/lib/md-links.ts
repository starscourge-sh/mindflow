/**
 * Markdown pictures and links read as words: a picture says nothing, a link says its words, never its address.
 * An address may hold brackets of its own ("…/Book (Library).pdf"), so a link ends at its own closing one.
 */
export const mdLinksAsWords = (text: string): string =>
  text.replace(/!\[[^\]]*\]\((?:[^()]|\([^()]*\))*\)/g, '').replace(/\[([^\]]+)\]\((?:[^()]|\([^()]*\))*\)/g, '$1')
