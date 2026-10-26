const key = "bare-staff-hscroll";
const body = document.body;
const input = document.getElementById("hscroll-toggle");

const tab = () => document.querySelector("#tablature");
const linesOf = (root) => [...root.querySelectorAll("[data-line-unit-index]")];

const unwrapPages = () => {
  const root = tab();
  if (!root) return;
  root.querySelectorAll(".sheet-page").forEach((page) => {
    while (page.firstChild) root.insertBefore(page.firstChild, page);
    page.remove();
  });
};

const packPages = () => {
  const root = tab();
  const sheet = document.querySelector(".extracted-sheet");
  if (!root || !sheet) return;
  unwrapPages();
  const lines = linesOf(root);
  if (!lines.length) return;

  const pageW = sheet.clientWidth;
  const probe = document.createElement("div");
  probe.className = "sheet-page";
  probe.style.setProperty("--page-w", `${pageW}px`);
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  sheet.appendChild(probe);
  const innerW = probe.clientWidth;
  const pageH = probe.clientHeight;
  probe.remove();

  lines.forEach((el) => {
    el.style.width = `${innerW}px`;
  });

  let page = null;
  let used = 0;
  for (const line of lines) {
    const h = line.getBoundingClientRect().height;
    if (!page || (used > 0 && used + h > pageH + 0.5)) {
      page = document.createElement("div");
      page.className = "sheet-page";
      page.style.setProperty("--page-w", `${pageW}px`);
      root.appendChild(page);
      used = 0;
    }
    page.appendChild(line);
    used += h;
    line.style.width = "";
  }
};

const apply = (on) => {
  unwrapPages();
  body.classList.toggle("sheet-hscroll", on);
  input.checked = on;
  if (on) requestAnimationFrame(packPages);
};

apply(localStorage.getItem(key) === "1");
input.addEventListener("change", () => {
  const on = input.checked;
  localStorage.setItem(key, on ? "1" : "0");
  apply(on);
});

let resizeTimer = 0;
window.addEventListener("resize", () => {
  if (!body.classList.contains("sheet-hscroll")) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => apply(true), 120);
});
