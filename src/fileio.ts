import { invoke } from '@tauri-apps/api/core';
import { message, open, save } from '@tauri-apps/plugin-dialog';

export function openFileDialog(): Promise<string | null> {
  return open({
    multiple: false,
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd'] }],
  });
}

export function saveFileDialog(defaultName: string): Promise<string | null> {
  return save({
    defaultPath: defaultName,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
}

export function askSaveNote(name: string): Promise<'save' | 'discard' | 'cancel'> {
  return message(`Сохранить заметку «${name}»?`, {
    title: 'Несохранённая заметка',
    kind: 'warning',
    buttons: { yes: 'Сохранить', no: 'Не сохранять', cancel: 'Отмена' },
  }).then((result) =>
    result === 'Сохранить' ? 'save' : result === 'Не сохранять' ? 'discard' : 'cancel',
  );
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
