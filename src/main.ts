import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { createEditor, type EditorHandle } from './editor';
import { type DirEntry, listDir, loadFile, openFileDialog, openFolderDialog, saveFile } from './fileio';
import { pushRecent, type RecentEntry } from './recents';
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
let saveTimer: number | undefined;

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

async function flushSave(): Promise<void> {
  window.clearTimeout(saveTimer);
  if (!currentPath || !editor || !dirty) return;
  try {
    await saveFile(currentPath, editor.getMarkdown());
    dirty = false;
    updateTitle();
  } catch (err) {
    showStatus(`Не удалось сохранить: ${errText(err)}`);
  }
}

function onDocChanged(): void {
  dirty = true;
  updateTitle();
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void flushSave(), 700);
}

async function openPath(path: string): Promise<void> {
  try {
    if (editor && dirty) await flushSave();
    editorEl.classList.remove('view-txt');
    document.getElementById('txtview')?.setAttribute('hidden', '');
    const md = await loadFile(path);
    if (!editor) {
      editor = await createEditor(editorEl, md, onDocChanged);
    } else {
      await editor.setMarkdown(md);
    }
    currentPath = path;
    dirty = false;
    pushRecent(path, false);
    hideWelcome();
    updateTitle();
    updateSidebarSelection();
  } catch (err) {
    showStatus(`Не удалось открыть: ${errText(err)}`);
  }
}

async function openTxt(path: string): Promise<void> {
  try {
    if (editor && dirty) await flushSave();
    const text = await loadFile(path);
    let pre = document.getElementById('txtview') as HTMLPreElement | null;
    if (!pre) {
      pre = document.createElement('pre');
      pre.id = 'txtview';
      editorEl.appendChild(pre);
    }
    pre.textContent = text;
    pre.hidden = false;
    editorEl.classList.add('view-txt');
    currentPath = path;
    dirty = false;
    pushRecent(path, false);
    hideWelcome();
    updateTitle();
    updateSidebarSelection();
  } catch (err) {
    showStatus(`Не удалось открыть: ${errText(err)}`);
  }
}

async function openFolder(dir: string): Promise<void> {
  try {
    if (editor && dirty) await flushSave();
    const files = await listDir(dir);
    const kindRank = (f: DirEntry) => {
      const k = kindOf(f.name);
      return k === 'md' ? 0 : k === 'txt' ? 1 : 2;
    };
    files.sort((a, b) => kindRank(a) - kindRank(b) || a.name.localeCompare(b.name));
    folderPath = dir;
    pushRecent(dir, true);
    buildSidebar(files);
    app.classList.add('with-sidebar');
    sidebarToggle.hidden = false;
    hideWelcome();
    if (!currentPath) {
      const first = files.find((f) => kindOf(f.name) === 'md') ?? files.find((f) => kindOf(f.name) === 'txt');
      if (first) {
        if (kindOf(first.name) === 'md') await openPath(first.path);
        else await openTxt(first.path);
      }
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
      item.addEventListener('click', () =>
        kind === 'md' ? void openPath(file.path) : void openTxt(file.path),
      );
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
  if (mdExt.test(entry.path)) void openPath(entry.path);
  else if (txtExt.test(entry.path)) void openTxt(entry.path);
  else void openFolder(entry.path);
}

async function openFromDialog(): Promise<void> {
  const path = await openFileDialog();
  if (path) void openPath(path);
}

async function openFolderFromDialog(): Promise<void> {
  const dir = await openFolderDialog();
  if (dir) void openFolder(dir);
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

window.addEventListener(
  'keydown',
  (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
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
    }
  },
  { capture: true },
);

void getCurrentWebview().onDragDropEvent((e) => {
  if (e.payload.type === 'drop') {
    const path = e.payload.paths[0];
    if (!path) return;
    if (mdExt.test(path)) void openPath(path);
    else if (txtExt.test(path)) void openTxt(path);
    else void tryOpenFolder(path);
  }
});

void win.onCloseRequested(async (e) => {
  e.preventDefault();
  await flushSave();
  await win.destroy();
});

async function start(): Promise<void> {
  try {
    const pending = await invoke<string | null>('take_pending_file');
    if (pending) void openPath(pending);
    else showWelcome(() => void openFromDialog(), openRecent);
  } catch {
    showWelcome(() => void openFromDialog(), openRecent);
  }
  await listen<{ path: string }>('open-file', (e) => {
    if (e.payload.path !== currentPath) void openPath(e.payload.path);
  });
}

void start();
