import { createRoot } from 'react-dom/client'
import { config } from '@fortawesome/fontawesome-svg-core'
import '@fortawesome/fontawesome-svg-core/styles.css'
import { faNoteSticky } from '@fortawesome/free-regular-svg-icons'
import { App } from '@/app/App'
import './styles/app.css'
import './styles/tailwind.css'

config.autoAddCss = false

/** The inline note marker in the reader is the Font Awesome sticky note, drawn as a mask so it takes the theme colour. */
const [w, h, , , path] = faNoteSticky.icon
const d = Array.isArray(path) ? path.join('') : path
document.documentElement.style.setProperty(
  '--note-mask',
  `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}'><path d='${d}'/></svg>`)}")`,
)

createRoot(document.getElementById('root')!).render(<App />)
