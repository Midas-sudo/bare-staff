import { randomUUID } from "node:crypto";

const TTL_MS = 60 * 60 * 1000;

const sheets = new Map();

function prune() {
  const now = Date.now();
  for (const [id, entry] of sheets) {
    if (now - entry.createdAt > TTL_MS) sheets.delete(id);
  }
}

export function saveSheet(data) {
  prune();
  const id = randomUUID();
  sheets.set(id, { ...data, createdAt: Date.now() });
  return id;
}

export function getSheet(id) {
  prune();
  return sheets.get(id) ?? null;
}
