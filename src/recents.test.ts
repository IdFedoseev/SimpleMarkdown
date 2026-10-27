import { beforeEach, describe, expect, it } from 'vitest';
import { clearRecents, loadRecents, pushRecent, removeRecent } from './recents';

beforeEach(() => {
  localStorage.clear();
});

describe('recents', () => {
  it('кладёт самый свежий наверх и дедуплицирует по пути', () => {
    pushRecent('/notes/one.md', false);
    pushRecent('/books', true);
    pushRecent('/notes/one.md', false);
    const list = loadRecents();
    expect(list).toEqual([
      { path: '/notes/one.md', name: 'one.md', isFolder: false },
      { path: '/books', name: 'books', isFolder: true },
    ]);
  });

  it('ограничивает список 12 записями', () => {
    for (let i = 0; i < 20; i++) pushRecent(`/f${i}.md`, false);
    const list = loadRecents();
    expect(list).toHaveLength(12);
    expect(list[0].path).toBe('/f19.md');
    expect(list[11].path).toBe('/f8.md');
  });

  it('удаляет запись по пути, не трогая остальные', () => {
    pushRecent('/notes/one.md', false);
    pushRecent('/books', true);
    removeRecent('/notes/one.md');
    expect(loadRecents()).toEqual([{ path: '/books', name: 'books', isFolder: true }]);
  });

  it('полностью очищает список недавних', () => {
    pushRecent('/notes/one.md', false);
    pushRecent('/books', true);
    clearRecents();
    expect(loadRecents()).toEqual([]);
  });

  it('терпит битый JSON в localStorage', () => {
    localStorage.setItem('reader:recents', '{oops');
    expect(loadRecents()).toEqual([]);
  });
});
