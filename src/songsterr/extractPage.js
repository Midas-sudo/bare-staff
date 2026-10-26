import { chromium } from "playwright";

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

let browserPromise = null;

const CONTAINER_ARGS = [
  "--disable-dev-shm-usage",
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-gpu",
  "--disable-software-rasterizer",
];

function isClosedBrowserError(err) {
  return /has been closed|Target closed|Browser has been closed|Connection closed/i.test(
    String(err?.message ?? err),
  );
}

async function launchBrowser() {
  const bundled = process.env.PLAYWRIGHT_BUNDLED === "1";
  const args = bundled ? CONTAINER_ARGS : [];
  if (!bundled) {
    try {
      return await chromium.launch({ channel: "chrome", headless: true });
    } catch {
      // bundled Chromium
    }
  }
  return chromium.launch({ headless: true, args });
}

function trackBrowser(browser) {
  browser.on("disconnected", () => {
    browserPromise = null;
  });
  return browser;
}

async function getBrowser() {
  if (browserPromise) {
    const existing = await browserPromise.catch(() => null);
    if (existing?.isConnected()) return existing;
    browserPromise = null;
  }

  browserPromise = launchBrowser()
    .then(trackBrowser)
    .catch((err) => {
      browserPromise = null;
      throw err;
    });
  return browserPromise;
}

async function newExtractContext() {
  const options = {
    userAgent: USER_AGENT,
    viewport: { width: 1440, height: 1100 },
    locale: "en-US",
  };
  let browser = await getBrowser();
  try {
    return await browser.newContext(options);
  } catch (err) {
    if (!isClosedBrowserError(err)) throw err;
    browserPromise = null;
    try {
      await browser.close();
    } catch {
      // already gone
    }
    browser = await getBrowser();
    return browser.newContext(options);
  }
}

const CHROME_SELECTOR = [
  '[data-tab-control="bar-dots"]',
  '[aria-label="bar dots"]',
  '[title="Open bar menu"]',
  "button",
  '[id^="cursor-playhead"]',
  '[data-testid="Cursor"]',
  'use[href^="#cursor-playhead"]',
].join(", ");

function rewriteAssetUrls(html) {
  return html
    .replaceAll('href="/static3/', 'href="https://www.songsterr.com/static3/')
    .replaceAll("href='/static3/", "href='https://www.songsterr.com/static3/")
    .replaceAll('xlink:href="/static3/', 'xlink:href="https://www.songsterr.com/static3/');
}

function sanitizeSheetHtml(html) {
  return html
    .replace(/<div[^>]*data-tab-control="bar-dots"[^>]*>[\s\S]*?<\/div>/gi, "")
    .replace(/<div[^>]*aria-label="bar dots"[^>]*>[\s\S]*?<\/div>/gi, "")
    .replace(/<button\b[^>]*>[\s\S]*?<\/button>/gi, "");
}

export async function extractPageSheet(pageUrl) {
  let context;
  try {
    context = await newExtractContext();
    const page = await context.newPage();
    page.setDefaultTimeout(25000);

    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await dismissConsent(page);
    await page.waitForSelector('#tablature svg[data-testid^="multitrack-line-group"]', {
      timeout: 25000,
    });

    const extracted = await page.evaluate(async (chromeSelector) => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const tab = document.querySelector("#tablature");
      if (!tab) throw new Error("Tablature never appeared.");

      const wraps = new Map();
      const harvest = () => {
        for (const svg of tab.querySelectorAll('svg[data-testid^="multitrack-line-group"]')) {
          const key = svg.getAttribute("data-testid");
          if (!key || wraps.has(key)) continue;
          const wrap = svg.closest("[data-line-unit-index]") ?? svg.parentElement;
          const clone = wrap.cloneNode(true);
          clone.querySelectorAll(chromeSelector).forEach((node) => node.remove());
          wraps.set(key, clone.outerHTML);
        }
      };

      harvest();
      let stable = 0;
      let previous = wraps.size;
      for (let i = 0; i < 50; i += 1) {
        const lines = tab.querySelectorAll('svg[data-testid^="multitrack-line-group"]');
        lines[lines.length - 1]?.scrollIntoView({ block: "center" });
        window.scrollBy(0, Math.round(window.innerHeight * 0.8));
        await sleep(280);
        harvest();
        if (wraps.size === previous) stable += 1;
        else stable = 0;
        previous = wraps.size;
        if (stable >= 5) break;
      }
      harvest();

      const defs = tab.querySelector('svg[width="0"]')?.outerHTML ?? "";
      const lineHtml = [...wraps.entries()]
        .sort((a, b) => {
          const na = Number(a[0].match(/(\d+)$/)?.[1] ?? 0);
          const nb = Number(b[0].match(/(\d+)$/)?.[1] ?? 0);
          return na - nb;
        })
        .map(([, html]) => html)
        .join("");

      const section = document.createElement("section");
      section.id = "tablature";
      section.className = tab.className.replace(/tablatureNoPrint/g, "");
      section.setAttribute("data-testid", "tablature");
      section.removeAttribute("data-id");
      section.dataset.print = "on";
      section.innerHTML = defs + lineHtml;
      section.querySelectorAll(chromeSelector).forEach((node) => node.remove());

      const cssHrefs = [...document.querySelectorAll('link[rel="stylesheet"]')]
        .map((link) => link.href)
        .filter((href) => /appClient|common-/i.test(href) && !/Consent/i.test(href));

      const instrument =
        document.querySelector(".gYbqeG_instrument")?.textContent?.trim() ?? "";
      const player = document.querySelector(".gYbqeG_name")?.textContent?.trim() ?? "";

      return {
        title: document.querySelector("#song-ttl")?.textContent?.trim() ?? "",
        artist: document.querySelector("#song-artist")?.textContent?.trim() ?? "",
        trackLabel: [player, instrument].filter(Boolean).join(" — "),
        lineCount: wraps.size,
        cssHrefs,
        tablatureHtml: section.outerHTML,
      };
    }, CHROME_SELECTOR);

    if (!extracted.lineCount) {
      throw new Error("The sheet rendered, but no staff lines were found.");
    }

    extracted.tablatureHtml = sanitizeSheetHtml(rewriteAssetUrls(extracted.tablatureHtml));
    return extracted;
  } catch (err) {
    if (/browserType\.launch|Executable doesn't exist/i.test(String(err))) {
      throw new Error(
        "Chromium is missing for page capture. Run: npx playwright install chromium",
      );
    }
    if (isClosedBrowserError(err)) {
      throw new Error("The capture browser closed unexpectedly. Try extract again.");
    }
    if (err instanceof Error && /Timeout|never appeared|selector/i.test(err.message)) {
      throw new Error("Songsterr did not finish drawing the sheet. Try again.");
    }
    throw err;
  } finally {
    await context?.close();
  }
}

async function dismissConsent(page) {
  const labels = ["Accept", "Agree", "I agree", "Got it", "Allow all"];
  for (const label of labels) {
    const button = page.locator(`button:has-text("${label}")`).first();
    try {
      if (await button.isVisible({ timeout: 800 })) {
        await button.click({ timeout: 800 });
        return;
      }
    } catch {
      // banner not present
    }
  }
}
