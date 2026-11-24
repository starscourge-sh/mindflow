const root = document.documentElement
const bar = () => root.classList.toggle('scrolled', window.scrollY > 4)
bar()
addEventListener('scroll', bar, { passive: true })

const links = [...document.querySelectorAll('.rail a')]
const byId = new Map(links.map((link) => [link.getAttribute('href').slice(1), link]))
const chapters = [...byId.keys()].map((id) => document.getElementById(id)).filter(Boolean)

const mark = (id) => {
  for (const link of links) {
    const on = link.getAttribute('href') === '#' + id
    if (on) link.setAttribute('aria-current', 'true')
    else link.removeAttribute('aria-current')
  }
}

const seen = new IntersectionObserver((entries) => {
  const hit = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
  if (hit) mark(hit.target.id)
}, { rootMargin: '-40% 0px -45% 0px', threshold: [0, 0.25, 0.6] })

for (const chapter of chapters) seen.observe(chapter)
