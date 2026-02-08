function msFrom(value) {
  if (value == null) return null;

  // Date
  if (value instanceof Date) return value.getTime();

  // Timestamp number or numeric string
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// ✅ "06:00" -> "06h" | "14:30" -> "14h30"
export function formatHHmmToH(hhmm) {
  try {
    const [h, m] = String(hhmm).split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return String(hhmm || "");
    return m === 0 ? `${pad2(h)}h` : `${pad2(h)}h${pad2(m)}`;
  } catch {
    return String(hhmm || "");
  }
}

export function formatClock(d = new Date()) {
  try {
    const dt = d instanceof Date ? d : new Date(d); // ✅ safe
    return dt.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    const dt = d instanceof Date ? d : new Date();
    return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}:${pad2(dt.getSeconds())}`;
  }
}

/**
 * Minutes écoulées depuis startAt.
 * - floor=true par défaut
 * - capAtZero=true par défaut
 */
export function minutesSince(startAt, options = {}) {
  const startMs = msFrom(startAt);
  if (startMs == null) return null;

  const diffMin = (Date.now() - startMs) / 60000;

  const capAtZero = options.capAtZero !== false; // default true
  const useFloor = options.floor !== false; // default true

  const v = useFloor ? Math.floor(diffMin) : diffMin;
  return capAtZero ? Math.max(0, v) : v;
}

/**
 * Minutes restantes avant la rotation.
 * ⚠️ Par défaut: au tout début (elapsed=0) => renvoie rot (ex: 120).
 * Option: inclusiveStart=false (par défaut) garde ton comportement.
 * Si inclusiveStart=true : elapsed=0 => rot, elapsed=1 => rot-1 (affichage classique).
 */
export function minLeft(startAt, rotationMinutes, options = {}) {
  const startMs = msFrom(startAt);
  const rot = Math.floor(Number(rotationMinutes));

  if (startMs == null || !Number.isFinite(rot) || rot <= 0) return null;

  const elapsedMin = minutesSince(startMs, { floor: true, capAtZero: true });
  if (elapsedMin == null) return null;

  if (options.capAtZero && elapsedMin >= rot) return 0;

  // ✅ comportement actuel (stable)
  const mod = elapsedMin % rot;
  let left = rot - mod;

  // ✅ optionnel: affichage plus naturel (décrémente dès la 1ère minute)
  if (options.inclusiveStart === true && elapsedMin > 0) {
    left = Math.max(0, left - 1);
  }

  return clamp(left, 0, rot);
}

/**
 * ✅ Label bloc lisible: "06h–08h"
 * block.start / block.end attendus en "HH:MM"
 */
export function formatBlockLabel(block) {
  if (!block) return "";
  const a = formatHHmmToH(block.start);
  const b = formatHHmmToH(block.end);
  if (!a || !b) return "";
  return `${a}–${b}`;
}
