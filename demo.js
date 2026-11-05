const RAW = `# Why Markdown won

One format, twenty years of notes, zero lock-in.

- Readable as plain text
- Rendered, it reads even better
- Now editable in place

> No raw markdown. Ever.`;

const stage = document.getElementById("stage");
const rawEl = document.getElementById("raw");
const dot = document.getElementById("autosave-dot");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let run = 0;

async function play() {
  if (stage.classList.contains("typing")) return;
  const my = ++run;
  stage.classList.remove("done");
  stage.classList.add("typing");
  dot.classList.add("on");
  rawEl.textContent = "";
  for (const ch of RAW) {
    rawEl.textContent += ch;
    await wait(ch === "\n" ? 130 : 14 + Math.random() * 26);
    if (my !== run) return;
  }
  await wait(650);
  if (my !== run) return;
  stage.classList.remove("typing");
  stage.classList.add("done");
  // autosave beat: dot is on while there are unsaved edits, clears ~700 ms after saving
  await wait(700);
  if (my !== run) return;
  dot.classList.remove("on");
}

stage.addEventListener("click", () => {
  if (!stage.classList.contains("typing")) play();
});

document.getElementById("replay").addEventListener("click", (e) => {
  e.stopPropagation();
  play();
});

if (!reduced) play();
