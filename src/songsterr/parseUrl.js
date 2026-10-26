const SONG_ID_PATTERNS = [
  /[?&]id=(\d+)/i,
  /-s(\d+)(?:[/?#]|$)/i,
  /\/songs?\/(\d+)/i,
];

const INSTRUMENT_HINTS = [
  { hint: "drum", re: /(?:^|[-_/])drums?(?:[-_/]|$)/i },
  { hint: "bass", re: /(?:^|[-_/])bass(?:[-_/]|$)/i },
  { hint: "piano", re: /(?:^|[-_/])piano(?:[-_/]|$)/i },
  { hint: "vocal", re: /(?:^|[-_/])(?:vocal|voice|lyrics)(?:[-_/]|$)/i },
  { hint: "guitar", re: /(?:^|[-_/])guitars?(?:[-_/]|$)/i },
];

export function parseSongsterrUrl(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    throw new Error("Paste a Songsterr tab URL.");
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("That does not look like a URL.");
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host !== "songsterr.com") {
    throw new Error("Only Songsterr URLs are supported.");
  }

  const haystack = `${url.pathname}${url.search}`;
  let songId = null;
  for (const pattern of SONG_ID_PATTERNS) {
    const match = haystack.match(pattern);
    if (match) {
      songId = Number(match[1]);
      break;
    }
  }

  if (!Number.isInteger(songId) || songId <= 0) {
    throw new Error("Could not find a song id in that URL.");
  }

  let instrumentHint = null;
  for (const { hint, re } of INSTRUMENT_HINTS) {
    if (re.test(url.pathname)) {
      instrumentHint = hint;
      break;
    }
  }

  return { songId, instrumentHint, url: url.toString() };
}
