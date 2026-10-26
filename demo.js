const RAW = `# Release notes

**Reader 1.0** is out.

- Opens \`.md\` as a document
- Edit text in place
- Free, MIT

> No raw markdown. Ever.`;

const stage = document.getElementById("stage");
const rawEl = document.getElementById("raw");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function play() {
  if (stage.classList.contains("typing")) return;
  stage.classList.remove("done");
  stage.classList.add("typing");
  rawEl.textContent = "";
  for (const ch of RAW) {
    rawEl.textContent += ch;
    await wait(ch === "\n" ? 130 : 14 + Math.random() * 26);
  }
  await wait(650);
  stage.classList.remove("typing");
  stage.classList.add("done");
}

stage.addEventListener("click", () => {
  if (!stage.classList.contains("typing")) play();
});

document.getElementById("replay").addEventListener("click", (e) => {
  e.stopPropagation();
  play();
});

if (!reduced) play();
