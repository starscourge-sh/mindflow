/**
 * Notes like the one you are writing, found offline and without any AI
 * service: each note's words weighed by how rare they are across all your
 * notes (TF-IDF), and the notes whose weighed words point the same way
 * (cosine). Private notes are never offered, nor offered to.
 */

const STOP = new Set('the and for are but not you all any can had her was one our out has his how its may new now old see two way who did get let put say she too use that with have this will your from they know want been good much some time very when come here just like long make many more only over such take than them well were what into also each then there their about would these other which could after first never where those being while again under might every'.split(' '))

export const tokens = (text: string): string[] =>
  text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 3 && !STOP.has(word) && !/^\d+$/.test(word))

export type Doc = { type: string; id: string; title: string; kind: string; text: string }

/** The `n` notes nearest `id` by their words, best first; none under a faint likeness. */
export function similar(docs: Doc[], id: string, n = 4): { type: string; id: string; title: string; kind: string; score: number }[] {
  const counts = docs.map((doc) => {
    const tf = new Map<string, number>()
    for (const word of tokens(`${doc.title} ${doc.title} ${doc.text}`)) tf.set(word, (tf.get(word) ?? 0) + 1)
    return tf
  })
  const df = new Map<string, number>()
  for (const tf of counts) for (const word of tf.keys()) df.set(word, (df.get(word) ?? 0) + 1)
  const vector = (tf: Map<string, number>): Map<string, number> => {
    const out = new Map<string, number>()
    let size = 0
    for (const [word, n] of tf) {
      const weight = (1 + Math.log(n)) * Math.log(1 + docs.length / (df.get(word) ?? 1))
      out.set(word, weight)
      size += weight * weight
    }
    size = Math.sqrt(size) || 1
    for (const [word, weight] of out) out.set(word, weight / size)
    return out
  }
  const at = docs.findIndex((doc) => doc.id === id)
  if (at < 0) return []
  const own = vector(counts[at])
  return docs
    .map((doc, index) => {
      if (index === at) return null
      let score = 0
      for (const [word, weight] of vector(counts[index])) score += weight * (own.get(word) ?? 0)
      return { type: doc.type, id: doc.id, title: doc.title, kind: doc.kind, score }
    })
    .filter((one): one is NonNullable<typeof one> => !!one && one.score >= 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
}

