import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

export function openFileDialog(): Promise<string | null> {
  return open({
    multiple: false,
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd'] }],
  });
}

export interface DirEntry {
  name: string;
  path: string;
}

export function openFolderDialog(): Promise<string | null> {
  return open({ multiple: false, directory: true });
}

export function listDir(path: string): Promise<DirEntry[]> {
  return invoke<DirEntry[]>('list_dir', { path });
}

export function loadFile(path: string): Promise<string> {
  return invoke<string>('read_file', { path });
}

export interface FileMeta {
  mtime: number;
  size: number;
}

export function fileMeta(path: string): Promise<FileMeta> {
  return invoke<FileMeta>('file_meta', { path });
}

export function saveFile(path: string, contents: string): Promise<void> {
  return invoke('write_file', { path, contents });
}
