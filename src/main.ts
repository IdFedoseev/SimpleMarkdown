import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { createEditor, type EditorHandle } from './editor';
import { type DirEntry, type FileMeta, fileMeta, listDir, loadFile, openFileDialog, openFolderDialog, saveFile } from './fileio';
import { pushRecent, type RecentEntry } from './recents';
import { activeTab, closeTab, initTabs, neighborTab, openTab, restoreSession, setActive, setDirty, setLoading, tabAt, tabCount } from './tabs';
import { hideWelcome, showWelcome } from './welcome';
import { initSearch } from './search';
import './style.css';

const app = document.getElementById('app')!;
const editorEl = document.getElementById('editor')!;
const win = getCurrentWindow();

const mdExt = /\.(md|markdown|mdown|mkd)$/i;
const txtExt = /\.txt$/i;

function kindOf(name: string): 'md' | 'txt' | 'other' {
  if (mdExt.test(name)) return 'md';
  if (txtExt.test(name)) return 'txt';
  return 'other';
}

let currentPath: string | null = null;
let folderPath: string | null = null;
let sidebarCollapsed = false;
let editor: EditorHandle | null = null;
let dirty = false;
let baseline: FileMeta | null = null;
let saveTimer: number | undefined;
const scrollPos = new Map<string, number>();
let activateGen = 0;
let loadDepth = 0;

const sidebarToggle = document.createElement('button');
sidebarToggle.id = 'sidebar-toggle';
sidebarToggle.title = 'Скрыть/показать список файлов (⌘\\)';
sidebarToggle.innerHTML =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
sidebarToggle.hidden = true;
sidebarToggle.addEventListener('click', () => toggleSidebar());
document.body.appendChild(sidebarToggle);

function toggleSidebar(): void {
  if (!folderPath) return;
  sidebarCollapsed = !sidebarCollapsed;
  app.classList.toggle('sidebar-collapsed', sidebarCollapsed);
  sidebarToggle.classList.toggle('collapsed', sidebarCollapsed);
}

initSearch(() => editorEl);

initTabs({
  onActivate: (path) => void selectTab(path),
  onClose: (path) => void closeTabByUser(path),
});

let statusTimer: number | undefined;

function showStatus(message: string): void {
  let el = document.getElementById('status');
  if (!el) {
    el = document.createElement('div');
    el.id = 'status';
    document.body.appendChild(el);
  }
  el.textContent = message;
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => document.getElementById('status')?.remove(), 4000);
}


function updateTitle(): void {
  const name = currentPath?.split('/').pop();
  void win.setTitle(name ? (dirty ? `• ${name}` : name) : 'Reader');
}

async function flushSave(): Promise<boolean> {
  window.clearTimeout(saveTimer);
  if (!currentPath || !editor || !dirty) return true;
  try {
    await saveFile(currentPath, editor.getMarkdown());
    dirty = false;
    setDirty(currentPath, false);
    baseline = await fileMeta(currentPath).catch(() => baseline);
    updateTitle();
    return true;
  } catch (err) {
    showStatus(`Не удалось сохранить: ${errText(err)}`);
    return false;
  }
}

function onDocChanged(): void {
  if (loadDepth > 0) return;
  dirty = true;
  if (currentPath) setDirty(currentPath, true);
  updateTitle();
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void flushSave(), 700);
}

function applyDocOpened(path: string): void {
  currentPath = path;
  dirty = false;
  pushRecent(path, false);
  hideWelcome();
  updateTitle();
  updateSidebarSelection();
}

async function loadMdDoc(path: string, gen: number): Promise<boolean> {
  try {
    const md = await loadFile(path);
    if (gen !== activateGen) return false;
    baseline = await fileMeta(path).catch(() => null);
    if (gen !== activateGen) return false;
    editorEl.classList.remove('view-txt');
    document.getElementById('txtview')?.setAttribute('hidden', '');
    if (!editor) {
      editor = await createEditor(editorEl, md, onDocChanged);
    } else {
      await editor.setMarkdown(md);
    }
    if (gen !== activateGen) return false;
    applyDocOpened(path);
    return true;
  } catch {
    return false;
  }
}

async function loadTxtDoc(path: string, gen: number): Promise<boolean> {
  try {
    const text = await loadFile(path);
    if (gen !== activateGen) return false;
    baseline = await fileMeta(path).catch(() => null);
    if (gen !== activateGen) return false;
    let pre = document.getElementById('txtview') as HTMLPreElement | null;
    if (!pre) {
      pre = document.createElement('pre');
      pre.id = 'txtview';
      editorEl.appendChild(pre);
    }
    pre.textContent = text;
    pre.hidden = false;
    editorEl.classList.add('view-txt');
    applyDocOpened(path);
    return true;
  } catch {
    return false;
  }
}

async function activateDoc(path: string): Promise<boolean> {
  const gen = ++activateGen;
  if (path === currentPath) return true;
  const kind = kindOf(path);
  if (kind !== 'md' && kind !== 'txt') return false;
  setLoading(path, true);
  try {
    if (editor && dirty && !(await flushSave())) {
      if (currentPath !== null) setActive(currentPath);
      return false;
    }
    if (gen !== activateGen) return true;
    if (currentPath !== null) scrollPos.set(currentPath, editorEl.scrollTop);
    loadDepth++;
    let ok: boolean;
    try {
      ok = kind === 'md' ? await loadMdDoc(path, gen) : await loadTxtDoc(path, gen);
    } finally {
      loadDepth--;
    }
    if (gen !== activateGen) return true;
    if (!ok) {
      const name = path.split('/').pop() || path;
      const gone = await fileMeta(path)
        .then(() => false)
        .catch(() => true);
      showStatus(gone ? `Файл не найден: ${name}` : `Не удалось открыть: ${name}`);
      if (gone) {
        closeTab(path);
        scrollPos.delete(path);
      }
      if (currentPath !== null) setActive(currentPath);
      return false;
    }
    editorEl.scrollTop = scrollPos.get(path) ?? 0;
    return true;
  } finally {
    if (gen === activateGen) setLoading(path, false);
  }
}

async function activateOrDrop(path: string | null): Promise<void> {
  let next = path;
  while (next !== null) {
    if (await activateDoc(next)) return;
    const cur = activeTab();
    if (cur === next) break;
    next = cur;
  }
  if (currentPath === null) showWelcome(() => void openFromDialog(), openRecent);
  updateTitle();
}

async function selectTab(path: string): Promise<void> {
  setActive(path);
  await activateOrDrop(path);
}

async function openDoc(path: string): Promise<void> {
  const kind = kindOf(path);
  if (kind !== 'md' && kind !== 'txt') return;
  openTab(path, kind);
  await activateOrDrop(path);
}

async function closeTabByUser(path: string): Promise<void> {
  if (path !== currentPath) {
    closeTab(path);
    scrollPos.delete(path);
    return;
  }
  if (!(await flushSave())) return;
  scrollPos.delete(path);
  currentPath = null;
  const next = closeTab(path);
  if (next !== null) await activateOrDrop(next);
  if (tabCount() === 0) showWelcome(() => void openFromDialog(), openRecent);
  updateTitle();
}

async function openFolder(dir: string): Promise<void> {
  try {
    const files = await listDir(dir);
    const kindRank = (f: DirEntry) => {
      const k = kindOf(f.name);
      return k === 'md' ? 0 : k === 'txt' ? 1 : 2;
    };
    files.sort((a, b) => kindRank(a) - kindRank(b) || a.name.localeCompare(b.name));
    folderPath = dir;
    pushRecent(dir, true);
    buildSidebar(files);
    sidebarToggle.hidden = false;
    hideWelcome();
    if (tabCount() === 0) {
      const first = files.find((f) => kindOf(f.name) === 'md') ?? files.find((f) => kindOf(f.name) === 'txt');
      if (first) await openDoc(first.path);
    } else {
      updateSidebarSelection();
    }
  } catch (err) {
    showStatus(`Не удалось открыть папку: ${errText(err)}`);
  }
}

async function tryOpenFolder(path: string): Promise<void> {
  try {
    await listDir(path);
    await openFolder(path);
  } catch {
    // not a folder
  }
}

function buildSidebar(files: DirEntry[]): void {
  document.getElementById('sidebar')?.remove();
  const sidebar = document.createElement('nav');
  sidebar.id = 'sidebar';
  const title = document.createElement('div');
  title.id = 'sidebar-title';
  title.textContent = folderPath?.split('/').pop() ?? '';
  sidebar.appendChild(title);
  for (const file of files) {
    const kind = kindOf(file.name);
    const item = document.createElement('button');
    item.className = `sidebar-item ${kind}`;
    item.textContent = file.name;
    item.dataset.path = file.path;
    if (kind === 'other') {
      item.disabled = true;
    } else {
      item.addEventListener('click', () => void openDoc(file.path));
    }
    sidebar.appendChild(item);
  }
  app.prepend(sidebar);
}

function updateSidebarSelection(): void {
  document.querySelectorAll('.sidebar-item').forEach((el) => {
    el.classList.toggle('selected', (el as HTMLElement).dataset.path === currentPath);
  });
}

function openRecent(entry: RecentEntry): void {
  if (kindOf(entry.path) !== 'other') void openDoc(entry.path);
  else void tryOpenFolder(entry.path);
}

async function openFromDialog(): Promise<void> {
  const path = await openFileDialog();
  if (path) void openDoc(path);
}

async function openFolderFromDialog(): Promise<void> {
  const dir = await openFolderDialog();
  if (dir) void openFolder(dir);
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function reloadIfChanged(): Promise<void> {
  if (document.hidden || loadDepth > 0 || !currentPath || dirty || !baseline) return;
  const path = currentPath;
  let meta: FileMeta;
  try {
    meta = await fileMeta(path);
  } catch {
    return;
  }
  if (path !== currentPath) return;
  if (meta.mtime === baseline.mtime && meta.size === baseline.size) return;
  baseline = meta;
  try {
    const text = await loadFile(path);
    if (path !== currentPath || loadDepth > 0) return;
    if (editorEl.classList.contains('view-txt')) {
      const pre = document.getElementById('txtview');
      if (pre) pre.textContent = text;
    } else if (editor && text !== editor.getMarkdown()) {
      await editor.setMarkdown(text);
    }
  } catch {
  }
}

window.setInterval(() => void reloadIfChanged(), 2000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void reloadIfChanged();
});

function stepTab(offset: 1 | -1): void {
  const path = neighborTab(offset);
  if (path) void selectTab(path);
}

window.addEventListener(
  'keydown',
  (e) => {
    if (e.ctrlKey && !e.metaKey && e.key === 'Tab') {
      e.preventDefault();
      stepTab(e.shiftKey ? -1 : 1);
      return;
    }
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      stepTab(e.key === 'ArrowRight' ? 1 : -1);
      return;
    }
    if (/^[1-9]$/.test(e.key)) {
      e.preventDefault();
      const path = e.key === '9' ? tabAt(tabCount() - 1) : tabAt(Number(e.key) - 1);
      if (path) void selectTab(path);
      return;
    }
    if (e.key === 'o' || e.key === 'O') {
      e.preventDefault();
      if (e.shiftKey) void openFolderFromDialog();
      else void openFromDialog();
    } else if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      void flushSave();
    } else if (e.code === 'Backslash') {
      e.preventDefault();
      toggleSidebar();
    } else if ((e.key === 'w' || e.key === 'W') && tabCount() > 0) {
      e.preventDefault();
      const path = activeTab();
      if (path) void closeTabByUser(path);
    }
  },
  { capture: true },
);

void getCurrentWebview().onDragDropEvent((e) => {
  if (e.payload.type === 'drop') {
    const path = e.payload.paths[0];
    if (!path) return;
    if (kindOf(path) !== 'other') void openDoc(path);
    else void tryOpenFolder(path);
  }
});

void win.onCloseRequested(async (e) => {
  e.preventDefault();
  await flushSave();
  await win.destroy();
});

async function start(): Promise<void> {
  const session = restoreSession();
  let pending: string | null = null;
  try {
    pending = await invoke<string | null>('take_pending_file');
  } catch {
    pending = null;
  }
  if (pending) {
    void openDoc(pending);
  } else if (session.entries.length > 0) {
    void activateOrDrop(session.active ?? session.entries[0].path);
  } else {
    showWelcome(() => void openFromDialog(), openRecent);
  }
  await listen<{ path: string }>('open-file', (e) => {
    if (e.payload.path !== currentPath) void openDoc(e.payload.path);
  });
}

void start();
