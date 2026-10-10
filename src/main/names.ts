/** A name as it is compared everywhere: no accents, capitals or doubled spaces. Shared with the page. */
export const personKey = (name: string): string =>
  name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
