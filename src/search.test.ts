import { describe, expect, it } from "vitest";
import { findMatches, stepIndex } from "./search";

function fixture(): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = `
    <h1>Hello Reader</h1>
    <p>Some <strong>bold</strong> text and <code>inline code</code> here.</p>
    <p>repeat repeat repeat</p>
    <p>end<strong>ing</strong> tail</p>
  `;
  return root;
}

describe("findMatches", () => {
  it("находит совпадения во всех текстовых узлах вложенной разметки (h1, strong, code)", () => {
    const root = fixture();
    const h1 = findMatches(root, "hello");
    expect(h1).toHaveLength(1);
    expect(h1[0].node.parentElement?.tagName).toBe("H1");
    expect(h1[0].start).toBe(0);
    expect(h1[0].end).toBe(5);

    const bold = findMatches(root, "bold");
    expect(bold).toHaveLength(1);
    expect(bold[0].node.parentElement?.tagName).toBe("STRONG");

    const code = findMatches(root, "code");
    expect(code).toHaveLength(1);
    expect(code[0].node.parentElement?.tagName).toBe("CODE");
  });

  it("регистронезависим", () => {
    const root = fixture();
    const matches = findMatches(root, "HELLO");
    expect(matches).toHaveLength(1);
    expect(matches[0].node.nodeValue).toBe("Hello Reader");
  });

  it("находит несколько вхождений в одном текстовом узле", () => {
    const root = fixture();
    const matches = findMatches(root, "repeat");
    expect(matches).toHaveLength(3);
    expect(matches.every((m) => m.node === matches[0].node)).toBe(true);
    expect(matches.map((m) => m.start)).toEqual([0, 7, 14]);
  });

  it("пустой запрос -> []", () => {
    expect(findMatches(fixture(), "")).toEqual([]);
  });

  it("не находит слово, разбитое границей элемента (strong внутри слова)", () => {
    expect(findMatches(fixture(), "ending")).toHaveLength(0);
  });

  it("пропускает узлы внутри .rd-findbar", () => {
    const root = fixture();
    const bar = document.createElement("div");
    bar.className = "rd-findbar";
    bar.textContent = "repeat";
    root.appendChild(bar);
    expect(findMatches(root, "repeat")).toHaveLength(3);
  });
});

describe("stepIndex", () => {
  it("шаг вперёд с заворотом", () => {
    expect(stepIndex(0, 3, true)).toBe(1);
    expect(stepIndex(1, 3, true)).toBe(2);
    expect(stepIndex(2, 3, true)).toBe(0);
  });

  it("шаг назад с заворотом", () => {
    expect(stepIndex(2, 3, false)).toBe(1);
    expect(stepIndex(1, 3, false)).toBe(0);
    expect(stepIndex(0, 3, false)).toBe(2);
  });

  it("count = 0 не рушит состояние", () => {
    expect(stepIndex(0, 0, true)).toBe(0);
    expect(stepIndex(5, 0, false)).toBe(0);
  });
});
