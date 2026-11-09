/** Every place `name` stands in `text` lies inside one of `titles` as written there. */
export function onlyInTitles(text: string, name: string, titles: string[]): boolean {
  const lower = text.toLowerCase()
  const at = (word: string, from: number): number => lower.indexOf(word.toLowerCase(), from)
  const held = new Set<number>()
  for (const title of titles) {
    if (!title.toLowerCase().includes(name.toLowerCase())) continue
    for (let i = at(title, 0); i >= 0; i = at(title, i + 1)) {
      const inner = title.toLowerCase().indexOf(name.toLowerCase())
      held.add(i + inner)
    }
  }
  let seen = false
  for (let i = at(name, 0); i >= 0; i = at(name, i + 1)) {
    seen = true
    if (!held.has(i)) return false
  }
  return seen
}
