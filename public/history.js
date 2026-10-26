(function () {
  const HISTORY_KEY = "bare-staff-history";
  const MAX_HISTORY = 25;

  const load = () => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((u) => typeof u === "string" && u.length) : [];
    } catch {
      return [];
    }
  };

  const store = (urls) => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(urls.slice(0, MAX_HISTORY)));
    } catch {
      // storage unavailable or full — history is best-effort
    }
  };

  const add = (url) => {
    const urls = load().filter((u) => u !== url);
    store([url, ...urls]);
  };

  const render = () => {
    const box = document.getElementById("history");
    if (!box) return;
    const urls = load();
    box.innerHTML = "";
    if (!urls.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;

    const head = document.createElement("p");
    head.className = "history-label";
    head.textContent = "Recent extractions";
    box.appendChild(head);

    const list = document.createElement("ul");
    list.className = "history-list";
    urls.forEach((url, i) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.className = "history-chip";
      a.href = "#";
      a.title = url;
      a.style.animationDelay = `${0.28 + Math.min(i, 6) * 0.05}s`;
      a.textContent = url;
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const input = document.getElementById("url");
        if (input) input.value = url;
        const form = document.querySelector(".extract");
        if (form) form.requestSubmit();
      });
      li.appendChild(a);
      list.appendChild(li);
    });
    box.appendChild(list);
  };

  window.BareStaffHistory = { add, render };

  // The sheet page carries the original Songsterr URL in a <data> element. Its
  // presence is the success signal: record it once so the home page can offer
  // it for re-extraction. On the home page we simply render any stored URLs.
  const sourceUrl = document.getElementById("bare-staff-source")?.getAttribute("value");
  if (sourceUrl) {
    add(sourceUrl);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
