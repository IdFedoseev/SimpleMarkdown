import './draw.css'

const FADE_MS = 600
const DEFAULT_TTL_MS = 5000
const TTL_STORE_KEY = 'draw-fade-ttl-ms'
const TTL_CHOICES_MS = [3000, 5000, 10000, 30000, 60000]
const STROKE_COLOR = '#ff4f2e'
const STROKE_WIDTH = 3

interface Stroke {
  points: number[][]
  doneAt: number | null
}

export function fadeAlpha(doneAt: number, now: number, ttlMs: number, fadeMs: number): number | null {
  const age = now - doneAt
  if (age <= ttlMs) return 1
  const fading = age - ttlMs
  if (fading >= fadeMs) return null
  return 1 - fading / fadeMs
}

export function initDraw(editorEl: HTMLElement): void {
  const canvas = document.createElement('canvas')
  canvas.id = 'draw-canvas'
  const ctxOrNull = canvas.getContext('2d')
  if (!ctxOrNull) return
  const ctx: CanvasRenderingContext2D = ctxOrNull
  editorEl.appendChild(canvas)

  let strokes: Stroke[] = []
  let active = false
  let raf = 0
  let fitW = -1
  let fitH = -1
  let ttlMs = loadTtl()

  const toggle = document.createElement('button')
  toggle.id = 'draw-toggle'
  toggle.title = 'Рисовать поверх документа (⌘D)'
  toggle.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M11.3 2.7a1.5 1.5 0 0 1 2.1 2.1L5.6 12.6 2.5 13.5l.9-3.1 7.9-7.7z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>'
  toggle.addEventListener('click', () => setActive(!active))
  document.body.appendChild(toggle)

  const panel = document.createElement('label')
  panel.id = 'draw-panel'
  panel.hidden = true
  const label = document.createElement('span')
  label.textContent = 'Исчезают через'
  const select = document.createElement('select')
  for (const ms of TTL_CHOICES_MS) {
    const opt = document.createElement('option')
    opt.value = String(ms)
    opt.textContent = `${Math.round(ms / 1000)} сек`
    select.appendChild(opt)
  }
  select.value = String(ttlMs)
  select.addEventListener('change', () => {
    ttlMs = Number(select.value)
    localStorage.setItem(TTL_STORE_KEY, String(ttlMs))
    ensureLoop()
  })
  panel.append(label, select)
  document.body.appendChild(panel)

  function loadTtl(): number {
    const saved = Number(localStorage.getItem(TTL_STORE_KEY))
    return TTL_CHOICES_MS.includes(saved) ? saved : DEFAULT_TTL_MS
  }

  function setActive(on: boolean): void {
    active = on
    toggle.classList.toggle('active', on)
    panel.hidden = !on
    editorEl.classList.toggle('drawing', on)
    ensureLoop()
  }

  function ensureLoop(): void {
    if (!raf) {
      raf = requestAnimationFrame((t) => {
        raf = 0
        render(t)
      })
    }
  }

  function fitIfNeeded(): void {
    const w = editorEl.clientWidth
    const h = editorEl.scrollHeight
    if (w === fitW && h === fitH) return
    fitW = w
    fitH = h
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function paintStroke(s: Stroke, alpha: number): void {
    ctx.globalAlpha = alpha
    ctx.beginPath()
    const first = s.points[0]
    ctx.moveTo(first[0], first[1])
    if (s.points.length === 1) {
      ctx.lineTo(first[0] + 0.01, first[1])
    } else {
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i][0], s.points[i][1])
    }
    ctx.stroke()
  }

  function render(now: number): void {
    fitIfNeeded()
    ctx.clearRect(0, 0, fitW, fitH)
    ctx.lineWidth = STROKE_WIDTH
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = STROKE_COLOR
    const visible: Stroke[] = []
    for (const s of strokes) {
      const alpha = s.doneAt === null ? 1 : fadeAlpha(s.doneAt, now, ttlMs, FADE_MS)
      if (alpha === null) continue
      visible.push(s)
      paintStroke(s, alpha)
    }
    strokes = visible
    if (strokes.length) ensureLoop()
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!active || e.button !== 0) return
    const last = strokes[strokes.length - 1]
    if (last && last.doneAt === null) return
    strokes.push({ points: [[e.offsetX, e.offsetY]], doneAt: null })
    canvas.setPointerCapture(e.pointerId)
    ensureLoop()
  })

  canvas.addEventListener('pointermove', (e) => {
    const s = strokes[strokes.length - 1]
    if (!s || s.doneAt !== null) return
    const last = s.points[s.points.length - 1]
    if (Math.hypot(e.offsetX - last[0], e.offsetY - last[1]) < 1) return
    s.points.push([e.offsetX, e.offsetY])
    ensureLoop()
  })

  const endStroke = (): void => {
    const s = strokes[strokes.length - 1]
    if (s && s.doneAt === null) s.doneAt = performance.now()
    ensureLoop()
  }
  canvas.addEventListener('pointerup', endStroke)
  canvas.addEventListener('pointercancel', endStroke)

  window.addEventListener(
    'keydown',
    (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault()
        setActive(!active)
      }
    },
    { capture: true },
  )
}

const editorEl = document.getElementById('editor')
if (editorEl) initDraw(editorEl)
