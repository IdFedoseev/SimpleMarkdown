export type TabKind = 'md' | 'txt';

export interface TabEntry {
  path: string;
  kind: TabKind;
}

export interface TabSession {
  entries: TabEntry[];
  active: string | null;
}

export interface TabCallbacks {
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
}

const STORAGE_KEY = 'reader:tabs';

let tabbar: HTMLElement | null = null;
let callbacks: TabCallbacks | null = null;
let entries: TabEntry[] = [];
let active: string | null = null;
const dirtyPaths = new Set<string>();
const loadingPaths = new Set<string>();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries, active }));
  } catch {
    return;
  }
}

function readStored(): TabSession {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { entries: [], active: null };
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed) || !Array.isArray(parsed.entries)) return { entries: [], active: null };
    const valid: TabEntry[] = [];
    const seen = new Set<string>();
    for (const item of parsed.entries) {
      if (!isPlainObject(item)) continue;
      const { path, kind } = item;
      if (typeof path !== 'string' || path === '' || (kind !== 'md' && kind !== 'txt')) continue;
      if (seen.has(path)) continue;
      seen.add(path);
      valid.push({ path, kind });
    }
    const storedActive = parsed.active;
    return { entries: valid, active: typeof storedActive === 'string' ? storedActive : null };
  } catch {
    return { entries: [], active: null };
  }
}

function scrollIntoActive(): void {
  const el = tabbar?.querySelector('.tab.active');
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ inline: 'nearest' });
}

function tabEl(path: string): HTMLElement | null {
  return tabbar?.querySelector(`.tab[data-path="${CSS.escape(path)}"]`) ?? null;
}

function buildTab(entry: TabEntry): HTMLElement {
  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.dataset.path = entry.path;
  tab.setAttribute('role', 'tab');
  tab.tabIndex = 0;
  tab.title = entry.path;
  tab.setAttribute('aria-selected', entry.path === active ? 'true' : 'false');
  if (entry.path === active) tab.classList.add('active');
  if (dirtyPaths.has(entry.path)) tab.classList.add('dirty');
  if (loadingPaths.has(entry.path)) tab.classList.add('loading');
  const label = document.createElement('span');
  label.className = 'tab-label';
  label.textContent = entry.path.split('/').pop() || entry.path;
  const dot = document.createElement('span');
  dot.className = 'tab-dot';
  dot.setAttribute('aria-hidden', 'true');
  const close = document.createElement('button');
  close.className = 'tab-close';
  close.setAttribute('aria-label', 'Закрыть вкладку (⌘W)');
  close.textContent = '×';
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    callbacks?.onClose(entry.path);
  });
  const activate = (): void => {
    if (entry.path === active) return;
    setActive(entry.path);
    callbacks?.onActivate(entry.path);
  };
  tab.addEventListener('click', activate);
  tab.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    activate();
  });
  tab.addEventListener('auxclick', (e) => {
    if (e.button === 1) callbacks?.onClose(entry.path);
  });
  tab.append(label, dot, close);
  return tab;
}

function render(): void {
  if (!tabbar) return;
  tabbar.replaceChildren(...entries.map((entry) => buildTab(entry)));
}

export function initTabs(cb: TabCallbacks): void {
  callbacks = cb;
  entries = [];
  active = null;
  dirtyPaths.clear();
  loadingPaths.clear();
  const bar = document.getElementById('tabbar');
  if (bar) {
    tabbar = bar;
    bar.addEventListener('wheel', (e) => {
      bar.scrollLeft += e.deltaY;
    });
  }
  render();
}

export function openTab(path: string, kind: TabKind): void {
  if (entries.some((t) => t.path === path)) {
    setActive(path);
    return;
  }
  entries.push({ path, kind });
  active = path;
  persist();
  render();
  scrollIntoActive();
}

export function setActive(path: string): void {
  if (active === path || !entries.some((t) => t.path === path)) return;
  active = path;
  persist();
  render();
  scrollIntoActive();
}

export function setDirty(path: string, value: boolean): void {
  if (!entries.some((t) => t.path === path)) return;
  if (dirtyPaths.has(path) === value) return;
  if (value) dirtyPaths.add(path);
  else dirtyPaths.delete(path);
  tabEl(path)?.classList.toggle('dirty', value);
}

export function setLoading(path: string, value: boolean): void {
  if (!entries.some((t) => t.path === path)) return;
  if (loadingPaths.has(path) === value) return;
  if (value) loadingPaths.add(path);
  else loadingPaths.delete(path);
  tabEl(path)?.classList.toggle('loading', value);
}

export function closeTab(path: string): string | null {
  const index = entries.findIndex((t) => t.path === path);
  if (index === -1) return active;
  entries.splice(index, 1);
  dirtyPaths.delete(path);
  loadingPaths.delete(path);
  if (active === path) {
    const right = entries[index];
    active = right ? right.path : (entries[index - 1]?.path ?? null);
  }
  persist();
  render();
  return active;
}

export function restoreSession(): TabSession {
  entries = [];
  active = null;
  dirtyPaths.clear();
  loadingPaths.clear();
  const session = readStored();
  entries = session.entries;
  active =
    session.active !== null && entries.some((t) => t.path === session.active) ? session.active : null;
  persist();
  render();
  return { entries: [...entries], active };
}

export function tabCount(): number {
  return entries.length;
}

export function activeTab(): string | null {
  return active;
}

export function tabAt(index: number): string | null {
  return entries[index]?.path ?? null;
}

export function neighborTab(offset: 1 | -1): string | null {
  if (active === null || entries.length === 0) return null;
  const index = entries.findIndex((t) => t.path === active);
  if (index === -1) return null;
  return entries[(index + offset + entries.length) % entries.length].path;
}
