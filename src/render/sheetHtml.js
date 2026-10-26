function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderSheetPage({ title, artist, trackLabel, tablatureHtml, cssHrefs, sourceUrl }) {
  const cssLinks = (cssHrefs ?? [])
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}" crossorigin="anonymous">`)
    .join("\n  ");

  const source = sourceUrl ? `<data id="bare-staff-source" value="${escapeHtml(sourceUrl)}"></data>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title || "Sheet")}${artist ? ` — ${escapeHtml(artist)}` : ""}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;700&family=Syne:wght@700;800&display=swap" rel="stylesheet">
  ${cssLinks}
  <link rel="stylesheet" href="/styles.css">
</head>
  <body class="sheet-body">
    ${source}
    <header class="sheet-head">
      <div class="sheet-brand">
      <a class="back" href="/">Bare Staff</a>
      <label class="hscroll-toggle">
        <input type="checkbox" id="hscroll-toggle">
        <span>Pages</span>
      </label>
    </div>
    <div class="sheet-titles">
      <h1>${escapeHtml(title || "Untitled")}</h1>
      <p class="artist">${escapeHtml(artist)}</p>
      <p class="track">${escapeHtml(trackLabel)}</p>
    </div>
  </header>
  <main class="sheet-main">
    <div class="extracted-sheet">
      ${tablatureHtml}
    </div>
  </main>
  <script src="/history.js"></script>
  <script src="/sheet.js" defer></script>
</body>
</html>`;
}

export function renderErrorPage(message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sheet not found — Bare Staff</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body class="sheet-body">
  <header class="sheet-head">
    <a class="back" href="/">Bare Staff</a>
    <div class="sheet-titles">
      <h1>Sheet expired</h1>
      <p class="artist">${escapeHtml(message)}</p>
    </div>
  </header>
</body>
</html>`;
}
