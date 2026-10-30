/// <reference types="vite/client" />
import { Crepe, CrepeFeature } from '@milkdown/crepe'
import mermaid from 'mermaid'
import './editor.css'

mermaid.initialize({
  startOnLoad: false,
  theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default',
})

let mermaidSeq = 0

const FULLSCREEN_ICON =
  'M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3'

const icon = (path: string) =>
  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`

export function mermaidPreview(
  language: string,
  content: string,
  applyPreview: (value: null | string | HTMLElement) => void,
): null | void {
  if (language !== 'mermaid') return null
  mermaid
    .render(`reader-mermaid-${++mermaidSeq}`, content)
    .then((result) => applyPreview(buildDiagramPreview(result.svg)))
    .catch(() => applyPreview(null))
}

function buildDiagramPreview(svgMarkup: string): HTMLElement {
  const preview = document.createElement('div')
  preview.className = 'diagram-preview'
  preview.innerHTML = svgMarkup
  const open = document.createElement('button')
  open.type = 'button'
  open.className = 'diagram-open'
  open.title = 'Открыть на весь экран'
  open.setAttribute('aria-label', 'Открыть диаграмму на весь экран')
  open.innerHTML = icon(FULLSCREEN_ICON)
  preview.appendChild(open)
  return preview
}

document.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest?.('.diagram-open')
  if (!btn) return
  const svg = btn.parentElement?.querySelector(':scope > svg')
  if (svg) openDiagramOverlay(svg.outerHTML)
})

function openDiagramOverlay(svgMarkup: string): void {
  const overlay = document.createElement('div')
  overlay.className = 'diagram-overlay'
  const stage = document.createElement('div')
  stage.className = 'diagram-stage'
  stage.innerHTML = svgMarkup
  overlay.appendChild(stage)

  const svg = stage.querySelector('svg')
  let baseW = 0
  let baseH = 0
  if (svg) {
    const vb = (svg.getAttribute('viewBox') || '')
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => Number.isFinite(n))
    if (vb.length === 4) {
      baseW = vb[2] - vb[0]
      baseH = vb[3] - vb[1]
    } else {
      baseW = Number.parseFloat(svg.getAttribute('width') || '') || 0
      baseH = Number.parseFloat(svg.getAttribute('height') || '') || 0
    }
    svg.style.maxWidth = 'none'
  }

  let scale = 1
  let x = 0
  let y = 0
  let zoomLabel: HTMLElement

  const apply = () => {
    if (svg) {
      svg.style.width = `${baseW * scale}px`
      svg.style.height = `${baseH * scale}px`
    }
    stage.style.transform = `translate(${x}px, ${y}px)`
    zoomLabel.textContent = `${Math.round(scale * 100)}%`
  }

  const zoomAt = (factor: number, cx: number, cy: number) => {
    const next = Math.min(20, Math.max(0.05, scale * factor))
    x = cx - ((cx - x) * next) / scale
    y = cy - ((cy - y) * next) / scale
    scale = next
    apply()
  }

  const fit = (minScale = 1) => {
    const w = baseW || stage.offsetWidth || 1
    const h = baseH || stage.offsetHeight || 1
    scale = Math.max(minScale, Math.min((innerWidth * 0.95) / w, (innerHeight * 0.95) / h))
    x = (innerWidth - w * scale) / 2
    y = (innerHeight - h * scale) / 2
    apply()
  }

  const close = () => {
    document.removeEventListener('keydown', onKeydown)
    overlay.remove()
  }
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close()
  }

  const controls = document.createElement('div')
  controls.className = 'diagram-controls'
  zoomLabel = document.createElement('span')
  zoomLabel.className = 'diagram-zoom-label'
  const addButton = (title: string, path: string, onClick: () => void) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.title = title
    btn.setAttribute('aria-label', title)
    btn.innerHTML = icon(path)
    btn.addEventListener('click', onClick)
    controls.appendChild(btn)
  }
  addButton('Уменьшить', 'M5 12h14', () => zoomAt(0.8, innerWidth / 2, innerHeight / 2))
  addButton('Вписать', FULLSCREEN_ICON, () => fit(0.05))
  addButton('Увеличить', 'M12 5v14M5 12h14', () => zoomAt(1.25, innerWidth / 2, innerHeight / 2))
  controls.appendChild(zoomLabel)
  addButton('Закрыть', 'M18 6 6 18M6 6l12 12', close)
  overlay.appendChild(controls)

  let dragX = 0
  let dragY = 0
  overlay.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('.diagram-controls')) return
    dragX = e.clientX
    dragY = e.clientY
    overlay.classList.add('dragging')
    overlay.setPointerCapture(e.pointerId)
  })
  overlay.addEventListener('pointermove', (e) => {
    if (!overlay.classList.contains('dragging')) return
    x += e.clientX - dragX
    y += e.clientY - dragY
    dragX = e.clientX
    dragY = e.clientY
    apply()
  })
  const stopDrag = () => overlay.classList.remove('dragging')
  overlay.addEventListener('pointerup', stopDrag)
  overlay.addEventListener('pointercancel', stopDrag)
  overlay.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX, e.clientY)
    },
    { passive: false },
  )
  overlay.addEventListener('dblclick', (e) => {
    if ((e.target as HTMLElement).closest('.diagram-controls')) return
    zoomAt(1.6, e.clientX, e.clientY)
  })

  document.addEventListener('keydown', onKeydown)
  document.body.appendChild(overlay)
  fit()
}

export interface EditorHandle {
  getMarkdown(): string
  setMarkdown(md: string): Promise<void>
  destroy(): void
}

export async function createEditor(
  container: HTMLElement,
  initialMarkdown: string,
  onChange: () => void,
): Promise<EditorHandle> {
  let crepe: Crepe | null = null
  let disposed = false
  let queue: Promise<void> = Promise.resolve()

  const spawn = async (md: string): Promise<Crepe> => {
    const instance = new Crepe({
      root: container,
      defaultValue: md,
      featureConfigs: {
        [CrepeFeature.CodeMirror]: {
          renderPreview: mermaidPreview,
          previewOnlyByDefault: true,
        },
      },
    })
    instance.on((api) => api.markdownUpdated(() => onChange()))
    await instance.create()
    return instance
  }

  const enqueue = (task: () => Promise<void>): Promise<void> => {
    queue = queue.then(task).catch(() => undefined)
    return queue
  }

  crepe = await spawn(initialMarkdown)

  return {
    getMarkdown: () => (crepe ? crepe.getMarkdown() : ''),
    setMarkdown: (md: string) =>
      enqueue(async () => {
        if (disposed) return
        if (crepe) {
          await crepe.destroy()
          crepe = null
        }
        crepe = await spawn(md)
      }),
    destroy: () => {
      disposed = true
      void enqueue(async () => {
        if (crepe) {
          await crepe.destroy()
          crepe = null
        }
      })
    },
  }
}
