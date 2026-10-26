export interface RecentEntry {
  path: string;
  name: string;
  isFolder: boolean;
}

const KEY = 'reader:recents';
const LIMIT = 12;

export function loadRecents(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is RecentEntry =>
        !!e &&
        typeof e === 'object' &&
        typeof e.path === 'string' &&
        typeof e.name === 'string' &&
        typeof e.isFolder === 'boolean',
    );
  } catch {
    return [];
  }
}

export function pushRecent(path: string, isFolder: boolean): void {
  const name = path.split('/').pop() || path;
  const list = loadRecents().filter((e) => e.path !== path);
  list.unshift({ path, name, isFolder });
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT)));
  } catch {
    // localStorage may be unavailable; recents are best-effort
  }
}
