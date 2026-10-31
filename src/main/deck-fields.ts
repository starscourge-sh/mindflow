/**
 * Which of a shared deck's fields link it to the rest of the book, guessed
 * from the note type's field names in any of the common languages: the field
 * naming who made each thing (each a Sources page) and the fields naming its
 * kind (a movement, a period: each value a #tag). No Electron here, so tests
 * read it directly.
 */

/** Fields naming who made the thing a card is about: the card's "who", so each one is a Sources page. */
const WHO_FIELD = /^(artists?|artistes?|artista|kunstler(in)?|maler(in)?|peintre|pintor|pittore|painters?|sculptors?|sculpteur|bildhauer|authors?|auteur|autor(in)?|autore|composers?|compositeur|komponist(in)?|compositor|compositore|creators?|createur|poets?|poete|dichter(in)?|poeta|writers?|ecrivain|schriftsteller(in)?|escritor|scrittore|directors?|realisateur|regisseur(in)?|director|regista|architects?|architecte|architekt(in)?|arquitecto|architetto|photographers?|photographe|fotograf(in)?|scientists?|thinkers?|philosophers?|philosophe|philosoph(in)?|by|made by|artist name|creator name)$/
/** A field's name as the guessing reads it: lower case, accents off ("Künstler" is "kunstler"), spaces kept single. */
const plainName = (name: string): string => name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim()
/** The field a deck's cards name their maker in, by the note type's field names; null when none looks like one. */
export const whoFieldOf = (fields: string[]): string | null => fields.find((name) => WHO_FIELD.test(plainName(name))) ?? null
/** The fields a deck's cards name their kind in: each value a #tag. */
export const kindFieldsOf = (fields: string[]): string[] => fields.filter((name) => KIND_FIELD.test(plainName(name)))
/** Fields naming the kind of thing it is (a movement, a period, a genre): each value a #tag that links the deck to your own notes. */
const KIND_FIELD = /movement|mouvement|bewegung|movimiento|movimento|period|periode|periodo|epoche|epoque|epoca|\bera\b|\bage\b|style|\bstil\b|stile|estilo|genre|gattung|genero|school|ecole|schule|escuela|scuola|dynasty|dynastie|tradition|\bism\b/

/** A deck's kind fields' values as #tag words: a movement or a period ("Baroque"), never a date or a list. */
export const kindTags = (values: string[]): string[] =>
  values.map((value) => value.trim()).filter((value) => value && value.length <= 40 && !/\d|[,;/]/.test(value)).map(tagWord)

/** Words for a tag here: lower case, "::" levels joined by "-", spaces as "-". */
export const tagWord = (name: string): string =>
  name.toLowerCase().split('::').map((part) => part.trim().replace(/[^\p{L}\p{M}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '')).filter(Boolean).join('-')

