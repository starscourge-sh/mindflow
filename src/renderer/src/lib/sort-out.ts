/**
 * "Sort this out": a pasted or written page, line by line, into what each
 * line is best kept as (components/vigil/sort-out.tsx). From any window: the
 * main window opens the sheet; another window asks it to.
 */
export function openSort(text: string, origin: string | null = null): void {
  const detail = { text, origin }
  if (new URLSearchParams(location.search).get('view') === 'home') window.dispatchEvent(new CustomEvent('vigil:sort-out', { detail }))
  else window.api.openInHome('sort', JSON.stringify(detail))
}
