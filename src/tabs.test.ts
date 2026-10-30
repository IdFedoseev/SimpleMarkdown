import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activeTab,
  closeTab,
  initTabs,
  neighborTab,
  openTab,
  restoreSession,
  setActive,
  setDirty,
  tabAt,
  tabCount,
} from './tabs';

function setup(): { onActivate: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn> } {
  document.body.innerHTML = '<nav id="tabbar"></nav>';
  const onActivate = vi.fn();
  const onClose = vi.fn();
  initTabs({ onActivate, onClose });
  return { onActivate, onClose };
}

const tabAt0 = (): HTMLElement => document.querySelectorAll('.tab')[0] as HTMLElement;

beforeEach(() => {
  localStorage.clear();
});

describe('tabs', () => {
  it('дедуплицирует повторный openTab и активирует существующую вкладку', () => {
    const { onActivate } = setup();
    openTab('/a.md', 'md');
    openTab('/b.txt', 'txt');
    openTab('/a.md', 'md');
    expect(tabCount()).toBe(2);
    expect(activeTab()).toBe('/a.md');
    const tabs = [...document.querySelectorAll('.tab')];
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('при закрытии активной выбирает соседа справа, иначе слева', () => {
    setup();
    openTab('/a.md', 'md');
    openTab('/b.md', 'md');
    openTab('/c.md', 'md');
    setActive('/b.md');
    expect(closeTab('/b.md')).toBe('/c.md');
    setActive('/a.md');
    expect(closeTab('/a.md')).toBe('/c.md');
    expect(closeTab('/c.md')).toBe(null);
  });

  it('после закрытия последней вкладки состояние пустое', () => {
    setup();
    openTab('/a.md', 'md');
    expect(closeTab('/a.md')).toBe(null);
    expect(tabCount()).toBe(0);
    expect(activeTab()).toBe(null);
    expect(document.querySelector('.tab')).toBe(null);
    expect(document.getElementById('tabbar')!.childElementCount).toBe(0);
  });

  it('persist/restore round-trip восстанавливает порядок и активную', () => {
    setup();
    openTab('/a.md', 'md');
    openTab('/b.txt', 'txt');
    setActive('/a.md');
    const session = restoreSession();
    expect(session.entries).toEqual([
      { path: '/a.md', kind: 'md' },
      { path: '/b.txt', kind: 'txt' },
    ]);
    expect(session.active).toBe('/a.md');
    expect(activeTab()).toBe('/a.md');
    expect(document.querySelectorAll('.tab')).toHaveLength(2);
    expect(tabAt0().getAttribute('aria-selected')).toBe('true');
  });

  it('персистит формат {entries, active} при каждой мутации', () => {
    setup();
    openTab('/a.md', 'md');
    expect(JSON.parse(localStorage.getItem('reader:tabs')!)).toEqual({
      entries: [{ path: '/a.md', kind: 'md' }],
      active: '/a.md',
    });
    openTab('/b.md', 'md');
    setActive('/a.md');
    expect(JSON.parse(localStorage.getItem('reader:tabs')!)).toEqual({
      entries: [
        { path: '/a.md', kind: 'md' },
        { path: '/b.md', kind: 'md' },
      ],
      active: '/a.md',
    });
    closeTab('/b.md');
    expect(JSON.parse(localStorage.getItem('reader:tabs')!)).toEqual({
      entries: [{ path: '/a.md', kind: 'md' }],
      active: '/a.md',
    });
  });

  it('терпит битый JSON в localStorage', () => {
    setup();
    localStorage.setItem('reader:tabs', '{oops');
    const session = restoreSession();
    expect(session.entries).toEqual([]);
    expect(session.active).toBe(null);
    expect(document.querySelectorAll('.tab')).toHaveLength(0);
  });

  it('при restore отбрасывает мусорные записи и невалидную активную', () => {
    setup();
    localStorage.setItem(
      'reader:tabs',
      JSON.stringify({
        entries: [
          null,
          42,
          'junk',
          { path: '/ok.md', kind: 'md' },
          { path: '/no-kind.md' },
          { path: '/bad.md', kind: 'docx' },
          { kind: 'md' },
          { path: '/ok.md', kind: 'txt' },
        ],
        active: '/gone.md',
      }),
    );
    const session = restoreSession();
    expect(session.entries).toEqual([{ path: '/ok.md', kind: 'md' }]);
    expect(session.active).toBe(null);
    expect(document.querySelectorAll('.tab')).toHaveLength(1);
  });

  it('отражает dirty флаг в classList', () => {
    setup();
    openTab('/a.md', 'md');
    setDirty('/a.md', true);
    expect(tabAt0().classList.contains('dirty')).toBe(true);
    setDirty('/a.md', false);
    expect(tabAt0().classList.contains('dirty')).toBe(false);
  });

  it('клик по вкладке активирует её и зовёт onActivate', () => {
    const { onActivate } = setup();
    openTab('/a.md', 'md');
    openTab('/b.md', 'md');
    tabAt0().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(activeTab()).toBe('/a.md');
    expect(onActivate).toHaveBeenCalledWith('/a.md');
  });

  it('Enter на сфокусированной вкладке активирует её', () => {
    const { onActivate } = setup();
    openTab('/a.md', 'md');
    openTab('/b.md', 'md');
    tabAt0().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(activeTab()).toBe('/a.md');
    expect(onActivate).toHaveBeenCalledWith('/a.md');
  });

  it('neighborTab циклически ходит по вкладкам, tabAt за границей — null', () => {
    setup();
    openTab('/a.md', 'md');
    openTab('/b.md', 'md');
    openTab('/c.md', 'md');
    setActive('/b.md');
    expect(neighborTab(1)).toBe('/c.md');
    expect(neighborTab(-1)).toBe('/a.md');
    setActive('/c.md');
    expect(neighborTab(1)).toBe('/a.md');
    setActive('/a.md');
    expect(neighborTab(-1)).toBe('/c.md');
    expect(tabAt(2)).toBe('/c.md');
    expect(tabAt(5)).toBe(null);
  });

  it('единственная вкладка — сосед это она сама', () => {
    setup();
    openTab('/a.md', 'md');
    expect(neighborTab(1)).toBe('/a.md');
    expect(neighborTab(-1)).toBe('/a.md');
  });

  it('клик по × и middle-click закрывают вкладку через onClose', () => {
    const { onClose } = setup();
    openTab('/a.md', 'md');
    openTab('/b.md', 'md');
    (tabAt0().querySelector('.tab-close') as HTMLElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(onClose).toHaveBeenCalledWith('/a.md');
    document.querySelectorAll('.tab')[1].dispatchEvent(
      new MouseEvent('auxclick', { bubbles: true, button: 1 }),
    );
    expect(onClose).toHaveBeenCalledWith('/b.md');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
