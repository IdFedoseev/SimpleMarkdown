import "./search.css";

export interface SearchController {
  open(): void;
  close(): void;
  isOpen(): boolean;
}

export interface TextMatch {
  node: Text;
  start: number;
  end: number;
}

declare global {
  interface Window {
    find?(query?: string, caseSensitive?: boolean, backwards?: boolean, wrapAround?: boolean): boolean;
  }
}

const HITS = "rd-hits";
const CURRENT = "rd-current";
const INPUT_DEBOUNCE = 120;
const MUTATION_DEBOUNCE = 200;

export function findMatches(root: HTMLElement, query: string): TextMatch[] {
  if (!query) return [];
  const needle = query.toLowerCase();
  const matches: TextMatch[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Text) {
      const parent = node.parentElement;
      if (!parent || parent.closest(".rd-findbar")) return NodeFilter.FILTER_REJECT;
      // shortcut: offsetParent === null => невидимая ветка (display:none); body/html и окружения без layout (offsetParent undefined) пропускаем мимо guard
      if (parent !== document.body && parent !== document.documentElement && parent.offsetParent === null) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    // shortcut: совпадение не ищется через границу разметки (жирная часть слова и т.п.) — только внутри одного текстового узла
    const text = (node.nodeValue ?? "").toLowerCase();
    let at = text.indexOf(needle);
    while (at !== -1) {
      matches.push({ node, start: at, end: at + needle.length });
      at = text.indexOf(needle, at + needle.length);
    }
  }
  return matches;
}

export function stepIndex(current: number, count: number, forward: boolean): number {
  if (count <= 0) return 0;
  const step = forward ? 1 : -1;
  return (((current + step) % count) + count) % count;
}

function icon(path: string): string {
  return `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

const CHEVRON_LEFT = icon("M10 3 5 8l5 5");
const CHEVRON_RIGHT = icon("M6 3l5 5-5 5");
const CROSS = icon("M4 4l8 8M12 4 4 12");

function makeButton(label: string, svg: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "rd-findbar__btn";
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.innerHTML = svg;
  btn.addEventListener("click", onClick);
  return btn;
}

export function initSearch(getRoot: () => HTMLElement | null | undefined): SearchController {
  const fallback = typeof CSS === "undefined" || !CSS.highlights;
  let visible = false;
  let matches: TextMatch[] = [];
  let index = 0;
  let inputTimer: number | undefined;
  let mutationTimer: number | undefined;
  let observer: MutationObserver | null = null;
  let observedRoot: HTMLElement | null = null;

  const bar = document.createElement("div");
  bar.className = "rd-findbar rd-findbar--hidden";
  const input = document.createElement("input");
  input.className = "rd-findbar__input";
  input.placeholder = "Найти";
  input.spellcheck = false;
  input.autocomplete = "off";
  const counter = document.createElement("span");
  counter.className = "rd-findbar__count";
  if (fallback) counter.style.display = "none";
  const prevBtn = makeButton("Назад", CHEVRON_LEFT, () => go(false));
  const nextBtn = makeButton("Вперёд", CHEVRON_RIGHT, () => go(true));
  const closeBtn = makeButton("Закрыть", CROSS, close);
  bar.append(input, counter, prevBtn, nextBtn, closeBtn);
  document.body.appendChild(bar);

  function rangeOf(match: TextMatch): Range {
    const range = document.createRange();
    range.setStart(match.node, match.start);
    range.setEnd(match.node, match.end);
    return range;
  }

  function paint(): void {
    if (fallback) return;
    CSS.highlights.delete(HITS);
    CSS.highlights.delete(CURRENT);
    if (!matches.length) return;
    const ranges = matches.map(rangeOf);
    const current = ranges.splice(index, 1)[0];
    if (ranges.length) CSS.highlights.set(HITS, new Highlight(...ranges));
    if (current) CSS.highlights.set(CURRENT, new Highlight(current));
  }

  function updateCounter(): void {
    if (fallback) return;
    counter.textContent = input.value ? (matches.length ? `${index + 1}/${matches.length}` : "0") : "";
  }

  function scrollTo(match: TextMatch): void {
    const rect = rangeOf(match).getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    let scroller: HTMLElement = document.documentElement;
    for (let el = match.node.parentElement; el && el !== document.body; el = el.parentElement) {
      const overflowY = getComputedStyle(el).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") {
        scroller = el;
        break;
      }
    }
    const middle = rect.top + rect.height / 2;
    if (scroller === document.documentElement) {
      window.scrollBy(0, middle - window.innerHeight / 2);
    } else {
      scroller.scrollTop += middle - (scroller.getBoundingClientRect().top + scroller.clientHeight / 2);
    }
  }

  function syncObserver(): void {
    const root = visible && input.value && !fallback ? getRoot() ?? null : null;
    if (observer && root === observedRoot) return;
    observer?.disconnect();
    observer = null;
    observedRoot = null;
    if (!root) return;
    observer = new MutationObserver(() => {
      window.clearTimeout(mutationTimer);
      mutationTimer = window.setTimeout(recompute, MUTATION_DEBOUNCE);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    observedRoot = root;
  }

  function recompute(): void {
    const root = visible ? getRoot() : null;
    matches = root && input.value ? findMatches(root, input.value) : [];
    index = 0;
    paint();
    updateCounter();
    syncObserver();
    if (matches.length) scrollTo(matches[index]);
  }

  function go(forward: boolean): void {
    if (fallback) {
      if (input.value) window.find?.(input.value, false, !forward, true);
      return;
    }
    if (!matches.length) return;
    index = stepIndex(index, matches.length, forward);
    paint();
    updateCounter();
    scrollTo(matches[index]);
  }

  function open(): void {
    visible = true;
    bar.classList.remove("rd-findbar--hidden");
    recompute();
    input.focus();
    input.select();
  }

  function close(): void {
    visible = false;
    bar.classList.add("rd-findbar--hidden");
    if (!fallback) {
      CSS.highlights.delete(HITS);
      CSS.highlights.delete(CURRENT);
    }
    observer?.disconnect();
    observer = null;
    observedRoot = null;
    window.clearTimeout(inputTimer);
    window.clearTimeout(mutationTimer);
    getRoot()?.focus();
  }

  window.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        open();
        return;
      }
      if (!visible) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "g") {
        e.preventDefault();
        go(!e.shiftKey);
        return;
      }
      if (e.key === "F3") {
        e.preventDefault();
        go(!e.shiftKey);
      }
    },
    true,
  );

  input.addEventListener("input", () => {
    window.clearTimeout(inputTimer);
    inputTimer = window.setTimeout(recompute, INPUT_DEBOUNCE);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      go(!e.shiftKey);
    }
  });

  return { open, close, isOpen: () => visible };
}
