/**
 * Pasted HTML made into what a note can hold, before the editor reads it.
 *
 * Word writes a list as paragraphs, each with its bullet or number typed in a
 * span only Word shows (`<![if !supportLists]>`), so a list pasted from Word
 * came in as lines starting "·   ". Those runs become real lists again. A web
 * page brings its chrome along: the menu, buttons, forms and scripts go, and
 * the words stay.
 */
export function tidyPastedHtml(html: string): string {
  if (!/mso-list|<nav|<button|<form|<script|<style/i.test(html)) return html
  // Word's conditional comments wrap the typed bullet: drop it with them.
  const cleaned = html.replace(/<!\[if !supportLists\]>[\s\S]*?<!\[endif\]>/gi, (bullet) => `<span data-word-bullet="${/\d/.test(bullet.replace(/<[^>]+>/g, '')) ? 'number' : 'bullet'}"></span>`)
  const doc = new DOMParser().parseFromString(cleaned, 'text/html')
  doc.querySelectorAll('nav, button, form, input, select, textarea, script, style, noscript, iframe').forEach((one) => one.remove())

  // Each run of Word list paragraphs, side by side, becomes one list. Word's
  // `level2` and deeper indent nests them under the item before.
  const items = [...doc.querySelectorAll<HTMLElement>('p[style*="mso-list"]')]
  for (const item of items) {
    if (!item.isConnected) continue
    const run: HTMLElement[] = [item]
    for (let next = item.nextElementSibling; next instanceof HTMLElement && /mso-list/.test(next.getAttribute('style') ?? ''); next = next.nextElementSibling) run.push(next)
    const numbered = run[0].querySelector('[data-word-bullet="number"]')
    const list = doc.createElement(numbered ? 'ol' : 'ul')
    const stack: { level: number; list: HTMLElement }[] = [{ level: 1, list }]
    for (const one of run) {
      const level = Number(/level(\d+)/.exec(one.getAttribute('style') ?? '')?.[1]) || 1
      while (stack.length > 1 && stack[stack.length - 1].level > level) stack.pop()
      let host = stack[stack.length - 1]
      if (level > host.level && host.list.lastElementChild) {
        const inner = doc.createElement(numbered ? 'ol' : 'ul')
        host.list.lastElementChild.append(inner)
        host = { level, list: inner }
        stack.push(host)
      }
      const li = doc.createElement('li')
      const p = doc.createElement('p')
      one.querySelector('[data-word-bullet]')?.remove()
      p.innerHTML = one.innerHTML
      li.append(p)
      host.list.append(li)
    }
    run[0].replaceWith(list)
    run.slice(1).forEach((one) => one.remove())
  }
  doc.querySelectorAll('[data-word-bullet]').forEach((one) => one.remove())
  return doc.body.innerHTML
}
