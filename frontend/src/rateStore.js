// Remembers the last real FX rate SwiftX quoted per corridor, so the "Today's
// rates" board can show a live-derived number instead of the static estimate
// in corridors.js. There's no dedicated rate-lookup endpoint worth polling —
// this just captures the rate every time a real quote already happens to be
// fetched (EnterAmount.jsx) and reuses it until the next one comes in.
const RATE_KEY_PREFIX = 'falcon_demo_rate_';

export function getCachedRate(corridorCode) {
  try {
    const raw = localStorage.getItem(RATE_KEY_PREFIX + corridorCode);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

export function setCachedRate(corridorCode, rate) {
  try {
    localStorage.setItem(RATE_KEY_PREFIX + corridorCode, String(rate));
  } catch {
    // storage unavailable — the static estimate stays the fallback
  }
}
