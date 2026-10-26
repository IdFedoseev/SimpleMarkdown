import { type RecentEntry, loadRecents } from './recents';

const fileIcon =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M9 1.5H4.5A1.5 1.5 0 0 0 3 3v10a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 13 13V5.5L9 1.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9 1.5V5.5h4" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
const folderIcon =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M1.75 4.25A1.25 1.25 0 0 1 3 3h3.2l1.3 1.75H13a1.25 1.25 0 0 1 1.25 1.25v6A1.25 1.25 0 0 1 13 13.25H3a1.25 1.25 0 0 1-1.25-1.25v-7.75Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';

interface Particle {
  el: HTMLElement;
  hw: number;
  hh: number;
  ax: number;
  ay: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pinned: boolean;
}

interface DragState {
  p: Particle;
  ox: number;
  oy: number;
  moved: boolean;
}

const SPRING = 0.03;
const DAMP = 0.72;
const GAP = 22;
const SEPARATE_ITERS = 5;
const VMAX = 24;

let raf = 0;

export function hideWelcome(): void {
  cancelAnimationFrame(raf);
  document.getElementById('welcome')?.remove();
}

export function showWelcome(
  onOpenDialog: () => void,
  onOpenRecent: (entry: RecentEntry) => void,
): void {
  hideWelcome();
  const el = document.createElement('div');
  el.id = 'welcome';
  const title = document.createElement('h1');
  title.textContent = 'Откройте Markdown-файл';
  const hint1 = document.createElement('p');
  hint1.textContent = '⌘O — открыть файл';
  const hint2 = document.createElement('p');
  hint2.textContent = '⌘⇧O — открыть папку';
  const hint3 = document.createElement('p');
  hint3.textContent = 'или перетащите файл/папку в окно';
  el.append(title, hint1, hint2, hint3);

  let cloud: HTMLElement | null = null;
  let particles: Particle[] = [];
  const recents = loadRecents();
  if (recents.length > 0) {
    cloud = document.createElement('div');
    cloud.id = 'recent-cloud';
    particles = recents.map((entry) => {
      const chip = document.createElement('button');
      chip.className = `recent-chip${entry.isFolder ? ' folder' : ''}`;
      chip.title = entry.path;
      chip.innerHTML = `${entry.isFolder ? folderIcon : fileIcon}<span class="recent-name"></span>`;
      (chip.querySelector('.recent-name') as HTMLElement).textContent = entry.name;
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        if (chip.dataset.dragged) {
          delete chip.dataset.dragged;
          return;
        }
        onOpenRecent(entry);
      });
      cloud!.appendChild(chip);
      return { el: chip, hw: 0, hh: 0, ax: 0, ay: 0, x: 0, y: 0, vx: 0, vy: 0, pinned: false };
    });
    el.appendChild(cloud);
  }

  el.addEventListener('click', () => onOpenDialog());
  document.getElementById('app')!.appendChild(el);

  if (cloud && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    startPhysics(cloud, particles);
  }
}

function applyTransform(p: Particle): void {
  p.el.style.transform = `translate3d(${p.ax - p.hw + p.x}px, ${p.ay - p.hh + p.y}px, 0)`;
}

function startPhysics(cloud: HTMLElement, particles: Particle[]): void {
  let firstLayout = true;
  const layout = (): void => {
    const prevX = particles.map((p) => p.ax + p.x);
    const prevY = particles.map((p) => p.ay + p.y);
    for (const p of particles) {
      p.el.style.position = '';
      p.el.style.transform = '';
    }
    cloud.classList.remove('floating');
    const box = cloud.getBoundingClientRect();
    particles.forEach((p, i) => {
      const r = p.el.getBoundingClientRect();
      p.ax = r.left - box.left + r.width / 2;
      p.ay = r.top - box.top + r.height / 2;
      p.hw = r.width / 2;
      p.hh = r.height / 2;
      p.el.style.position = 'absolute';
      if (p.pinned) {
        p.ax = prevX[i] - p.x;
        p.ay = prevY[i] - p.y;
      }
    });
    if (firstLayout) {
      firstLayout = false;
      const cx = box.width / 2;
      const cy = box.height / 2;
      for (const p of particles) {
        let dx = p.ax - cx;
        let dy = p.ay - cy;
        const len = Math.hypot(dx, dy);
        if (len < 1) {
          const a = Math.random() * Math.PI * 2;
          dx = Math.cos(a);
          dy = Math.sin(a);
        } else {
          dx /= len;
          dy /= len;
        }
        const dist = 260 + Math.random() * 220;
        const side = (Math.random() - 0.5) * 120;
        p.x = dx * dist - dy * side;
        p.y = dy * dist + dx * side;
      }
    }
    cloud.classList.add('floating');
    cloud.style.height = `${box.height}px`;
    for (const p of particles) applyTransform(p);
  };

  let queued = false;
  const onResize = (): void => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      layout();
    });
  };

  let drag: DragState | null = null;
  const endDrag = (): void => {
    if (!drag) return;
    const p = drag.p;
    if (drag.moved) {
      p.el.dataset.dragged = '1';
      p.pinned = true;
    }
    p.ax += p.x;
    p.ay += p.y;
    p.x = 0;
    p.y = 0;
    p.el.style.zIndex = '';
    drag = null;
  };

  for (const p of particles) {
    p.el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      p.el.setPointerCapture(e.pointerId);
      const box = cloud.getBoundingClientRect();
      drag = {
        p,
        ox: e.clientX - box.left - (p.ax + p.x),
        oy: e.clientY - box.top - (p.ay + p.y),
        moved: false,
      };
      p.vx = 0;
      p.vy = 0;
      p.el.style.zIndex = '10';
    });
    p.el.addEventListener('pointermove', (e) => {
      if (!drag || drag.p !== p) return;
      const box = cloud.getBoundingClientRect();
      const nx = e.clientX - box.left - drag.ox - p.ax;
      const ny = e.clientY - box.top - drag.oy - p.ay;
      if (Math.hypot(nx - p.x, ny - p.y) > 3) drag.moved = true;
      p.vx = Math.max(-40, Math.min(40, nx - p.x));
      p.vy = Math.max(-40, Math.min(40, ny - p.y));
      p.x = nx;
      p.y = ny;
      applyTransform(p);
    });
    p.el.addEventListener('pointerup', endDrag);
    p.el.addEventListener('pointercancel', endDrag);
  }

  window.addEventListener('resize', onResize);
  layout();

  const tick = (): void => {
    if (!cloud.isConnected) {
      window.removeEventListener('resize', onResize);
      return;
    }
    for (const p of particles) {
      if (drag && drag.p === p) continue;
      p.vx = (p.vx - SPRING * p.x) * DAMP;
      p.vy = (p.vy - SPRING * p.y) * DAMP;
    }
    for (const p of particles) {
      if (drag && drag.p === p) continue;
      const v = Math.hypot(p.vx, p.vy);
      if (v > VMAX) {
        p.vx = (p.vx / v) * VMAX;
        p.vy = (p.vy / v) * VMAX;
      }
      p.x += p.vx;
      p.y += p.vy;
    }
    for (let iter = 0; iter < SEPARATE_ITERS; iter++) {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const p = particles[i];
          const q = particles[j];
          const dx = p.ax + p.x - (q.ax + q.x);
          const dy = p.ay + p.y - (q.ay + q.y);
          const rx = p.hw + q.hw + GAP;
          const ry = p.hh + q.hh + GAP;
          let nx = dx / rx;
          let ny = dy / ry;
          const d2 = nx * nx + ny * ny;
          if (d2 >= 1) continue;
          let d = Math.sqrt(d2);
          if (d < 1e-4) {
            nx = Math.random() - 0.5;
            ny = Math.random() - 0.5;
            d = Math.hypot(nx, ny);
          }
          const cx = ((1 - d) * (nx / d) * rx) / 2;
          const cy = ((1 - d) * (ny / d) * ry) / 2;
          if (drag && drag.p === q) {
            p.x += 2 * cx;
            p.y += 2 * cy;
          } else if (drag && drag.p === p) {
            q.x -= 2 * cx;
            q.y -= 2 * cy;
          } else {
            p.x += cx;
            p.y += cy;
            q.x -= cx;
            q.y -= cy;
          }
        }
      }
    }
    for (const p of particles) applyTransform(p);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}
