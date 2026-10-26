import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSongsterrUrl } from "./songsterr/parseUrl.js";
import { extractPageSheet } from "./songsterr/extractPage.js";
import { getSheet, saveSheet } from "./store.js";
import { renderErrorPage, renderSheetPage } from "./render/sheetHtml.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.static(publicDir));

app.post("/extract", async (req, res) => {
  try {
    const parsed = parseSongsterrUrl(req.body?.url);
    const extracted = await extractPageSheet(parsed.url);
    extracted.sourceUrl = parsed.url;
    const id = saveSheet(extracted);
    res.redirect(302, `/sheet/${id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not extract that tab.";
    res.redirect(302, `/?error=${encodeURIComponent(message)}`);
  }
});

app.get("/sheet/:id", (req, res) => {
  const entry = getSheet(req.params.id);
  if (!entry) {
    res.status(404).type("html").send(renderErrorPage("This temporary sheet is gone. Extract it again."));
    return;
  }
  res.type("html").send(renderSheetPage(entry));
});

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";
app.listen(port, host, () => {
  console.log(`Bare Staff listening on http://${host}:${port}`);
});
