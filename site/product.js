const root = document.documentElement
const capture = document.querySelector('#capture')
const mark = () => {
  root.classList.toggle('scrolled', window.scrollY > 8)
  const box = capture.getBoundingClientRect()
  root.classList.toggle('on-ink', box.top < 48 && box.bottom > 48)
}
mark()
addEventListener('scroll', mark, { passive: true })
