/** How a DOI or an ISBN is known in typed or pasted words; shared by the main process and the page. */

/** A DOI in what was typed or pasted: bare, "doi:", or a doi.org link. */
export const doiIn = (text: string): string | null => {
  const found = /(?:^|\s|doi:\s*|doi\.org\/)(10\.\d{4,9}\/[^\s"<>]+)/i.exec(text.trim())
  return found ? found[1].replace(/[.,;)\]]+$/, '') : null
}

/** An ISBN in what was typed: ten or thirteen digits (the last may be X), hyphens and spaces allowed, its check digit right. */
export const isbnIn = (text: string): string | null => {
  const bare = text.trim().replace(/^isbn(?:-1[03])?:?\s*/i, '')
  if (!/^[\d\s-]+[\dXx]$/.test(bare)) return null
  const digits = bare.replace(/[\s-]/g, '').toUpperCase()
  if (digits.length === 13 && /^\d{13}$/.test(digits)) {
    const sum = [...digits].reduce((all, one, at) => all + Number(one) * (at % 2 ? 3 : 1), 0)
    return sum % 10 === 0 ? digits : null
  }
  if (digits.length === 10 && /^\d{9}[\dX]$/.test(digits)) {
    const sum = [...digits].reduce((all, one, at) => all + (one === 'X' ? 10 : Number(one)) * (10 - at), 0)
    return sum % 11 === 0 ? digits : null
  }
  return null
}

/** Words that are a DOI or a doi.org link and nothing else. */
export const loneDoi = (text: string): string | null => (/^\s*(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)?10\.\d{4,9}\/\S+\s*$/i.test(text) ? doiIn(text) : null)

export const names = (authors: string): string[] => authors.split(';').map((one) => one.trim()).filter(Boolean)
export const surname = (name: string): string => (name.includes(',') ? name.split(',')[0] : name.split(/\s+/).at(-1) ?? name).trim()

/** "(Shelley 1831, p. 82)": the first author's surname ("and" a second, "et al." for more), or a short title, then year and page. */
export function chipLabel(attrs: { work?: string; authors?: string; year?: string; page?: string; pending?: string }): string {
  if (attrs.pending && !attrs.work) return `(${attrs.pending})`
  const who = names(attrs.authors ?? '')
  const lead = who.length > 2 ? `${surname(who[0])} et al.` : who.length === 2 ? `${surname(who[0])} and ${surname(who[1])}` : who.length ? surname(who[0]) : shortTitle(attrs.work ?? '')
  return `(${[lead, attrs.year].filter(Boolean).join(' ')}${attrs.page ? `, p. ${attrs.page}` : ''})`
}
const shortTitle = (title: string): string => (title.length > 28 ? `${title.slice(0, 26).trim()}…` : title)
