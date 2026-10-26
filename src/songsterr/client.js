const META_BASE = "https://www.songsterr.com/api/meta";
const CDN_HOST = "https://dqsljvtekg760.cloudfront.net";

const BROWSER_HEADERS = {
  Accept: "application/json,text/plain,*/*",
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Referer: "https://www.songsterr.com/",
};

async function getJson(url) {
  let response;
  try {
    response = await fetch(url, { headers: BROWSER_HEADERS });
  } catch (err) {
    throw new Error(`Network error talking to Songsterr: ${err.message}`);
  }

  if (response.status === 403 || response.status === 429) {
    throw new Error(
      `Songsterr blocked the request (${response.status}). Try again in a moment.`,
    );
  }
  if (response.status === 404) {
    throw new Error("Songsterr could not find that tab.");
  }
  if (!response.ok) {
    throw new Error(`Songsterr returned ${response.status} for ${url}`);
  }

  return response.json();
}

export async function fetchMeta(songId) {
  return getJson(`${META_BASE}/${songId}`);
}

export function normalizeTracks(meta) {
  const tracks = Array.isArray(meta.tracks) ? meta.tracks : [];
  return tracks.map((track, index) => {
    const instrument = String(track.instrument ?? "");
    const lower = instrument.toLowerCase();
    return {
      ...track,
      partId: track.partId ?? index,
      title: track.title ?? `${track.name ?? "Track"} — ${instrument}`.replace(/ — $/, ""),
      isDrums: Boolean(track.isDrums) || track.instrumentId === 1024 || lower.includes("drum"),
      isBassGuitar: Boolean(track.isBassGuitar) || lower.includes("bass"),
      isPiano: Boolean(track.isPiano) || lower.includes("piano"),
      isGuitar: Boolean(track.isGuitar) || lower.includes("guitar"),
    };
  });
}

export function pickTrack(meta, instrumentHint) {
  const tracks = normalizeTracks(meta);
  if (tracks.length === 0) {
    throw new Error("This tab has no tracks.");
  }

  const hinted = tracks.find((track) => matchesHint(track, instrumentHint));
  if (hinted) return hinted;

  const preferredId = preferredPartId(meta, instrumentHint);

  const byPreferred = tracks.find((track) => track.partId === preferredId);
  return byPreferred ?? tracks[0];
}

function preferredPartId(meta, hint) {
  if (hint === "drum" && meta.popularTrackDrum != null) return meta.popularTrackDrum;
  if (hint === "bass" && meta.popularTrackBass != null) return meta.popularTrackBass;
  if (hint === "guitar" && meta.popularTrackGuitar != null) return meta.popularTrackGuitar;
  return meta.defaultTrack ?? meta.popularTrack;
}

function matchesHint(track, hint) {
  if (!hint) return false;
  const title = String(track.title ?? "").toLowerCase();
  if (hint === "drum") return track.isDrums;
  if (hint === "bass") return track.isBassGuitar;
  if (hint === "piano") return track.isPiano;
  if (hint === "vocal") {
    return Boolean(track.isVocalTrack) || /vocal|voice|lyric/.test(title);
  }
  if (hint === "guitar") return track.isGuitar;
  return false;
}

export async function fetchPart(meta, partId) {
  const { songId, revisionId, image } = meta;
  if (!revisionId || !image) {
    throw new Error("Song metadata is missing a revision or image hash.");
  }
  const url = `${CDN_HOST}/${songId}/${revisionId}/${image}/${partId}.json`;
  return getJson(url);
}

export async function extractSong(parsed) {
  const meta = await fetchMeta(parsed.songId);
  const track = pickTrack(meta, parsed.instrumentHint);
  const part = await fetchPart(meta, track.partId);
  return { meta, track, part };
}
