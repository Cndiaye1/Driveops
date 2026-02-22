// src/store/driveStore/utils.js

// -----------------------------------------------------
// Utils temps / blocs
export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function timeToMinutes(hhmm) {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

export function minutesToTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

// ✅ legacy index -> minutes id (ex: "8" => horaires[8]="14:00" => "840")
export function normalizeBlockId(blockId, horaires) {
  const raw = String(blockId ?? "");
  const n = Number(raw);
  const hs = Array.isArray(horaires) ? horaires : [];

  if (!Number.isFinite(n)) return raw;

  // legacy: id = index dans horaires
  if (Number.isInteger(n) && n >= 0 && n < hs.length && hs[n]) {
    return String(timeToMinutes(hs[n]));
  }

  // nouveau format: minutes id
  return raw;
}

export function buildBlocks(horaires, rotationMinutes) {
  const hs = Array.isArray(horaires) ? horaires : [];
  if (hs.length < 2) return [];

  const startMin = timeToMinutes(hs[0]);
  const endMin = timeToMinutes(hs[hs.length - 1]);
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) return [];

  const step = Math.max(1, Math.floor(Number(rotationMinutes) || 0));
  const blocks = [];

  for (let t = startMin; t < endMin; t += step) {
    const bStart = t;
    const bEnd = Math.min(t + step, endMin);
    blocks.push({
      id: String(bStart),
      start: minutesToTime(bStart),
      end: minutesToTime(bEnd),
      startMin: bStart,
      endMin: bEnd,
    });
  }

  return blocks;
}

export function getFirstBlockId(horaires, rotationMinutes) {
  const blocks = buildBlocks(horaires, rotationMinutes);
  return blocks[0]?.id ?? "0";
}

export function getPrevBlockId(horaires, rotationMinutes, currentBlockId) {
  const blocks = buildBlocks(horaires, rotationMinutes);
  const curId = String(currentBlockId ?? "");
  const idx = blocks.findIndex((b) => b.id === curId);
  if (idx <= 0) return null;
  return blocks[idx - 1]?.id ?? null;
}

export function getBlockStartMinForNow(horaires, rotationMinutes, now = new Date()) {
  const hs = Array.isArray(horaires) ? horaires : [];
  if (hs.length < 2) return null;

  const startMin = timeToMinutes(hs[0]);
  const endMin = timeToMinutes(hs[hs.length - 1]);
  const step = Math.max(1, Math.floor(Number(rotationMinutes) || 0));

  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (nowMin < startMin || nowMin >= endMin) return null;

  const offset = nowMin - startMin;
  return startMin + Math.floor(offset / step) * step;
}

export function blockStartTimestamp(dayDate, blockStartMin, useSystemDate) {
  const dateISO = useSystemDate ? todayISO() : dayDate;
  const base = new Date(`${dateISO}T00:00:00`);
  base.setMinutes(base.getMinutes() + blockStartMin);
  return base.getTime();
}

// -----------------------------------------------------
// Remote (Supabase) : SESSIONS (par jour)
export function sessionKey(siteCode, dayDate) {
  return `${siteCode}__${dayDate}`;
}

export function isEmptyObject(x) {
  return !!x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).length === 0;
}

export function prettifyApiError(msgRaw) {
  const msg = String(msgRaw || "");
  const lower = msg.toLowerCase();

  if (!msg) return "";
  if (lower.includes("row-level security") || lower.includes("violates row-level security")) {
    return "Accès refusé (compte non autorisé sur ce site).";
  }
  if (lower.includes("jwt") || lower.includes("unauthorized") || lower.includes("not authenticated")) {
    return "Connexion requise (merci de te reconnecter).";
  }
  if (
    lower.includes("fetch") ||
    lower.includes("network") ||
    lower.includes("offline") ||
    lower.includes("timeout")
  ) {
    return "Connexion instable — en attente…";
  }

  return msg;
}

/**
 * ✅ IMPORTANT
 * - Les référentiels + règles viennent de drive_site_config (par site).
 * - drive_sessions (par jour) ne garde que la journée (coordinator/dayStaff/assignments/runtime…)
 */
export const REMOTE_ALLOWED_KEYS_SESSION = [
  // config journée (par jour)
  "dayDate",
  "coordinator",
  "dayStaff",

  // runtime service (par jour)
  "dayStartedAt",
  "blockStartedAt",
  "serviceStartedAt",
  "currentBlockId",
  "rotationImminent",
  "rotationLocked",

  // data métier (par jour)
  "assignments",
  "pauseTakenAt",
  "skipRotation",
  "pausePrevPoste",
  "returnAlertUntil",
];

export function serializeSessionState(s) {
  const out = {};
  for (const k of REMOTE_ALLOWED_KEYS_SESSION) out[k] = s[k];
  return out;
}

export function pickRemoteSession(remoteJson) {
  if (!remoteJson || typeof remoteJson !== "object") return null;
  if (isEmptyObject(remoteJson)) return null;

  const out = {};
  for (const k of REMOTE_ALLOWED_KEYS_SESSION) {
    if (remoteJson[k] !== undefined) out[k] = remoteJson[k];
  }
  return out;
}

export function mergeRemoteSessionIntoState(defaults, remoteJson) {
  const safeRemote = pickRemoteSession(remoteJson);
  if (!safeRemote) return defaults;

  // ⚠️ horaires viennent du store (site config). On s’appuie dessus pour migrer les clés legacy.
  const horaires = defaults.horaires;

  const migrateMapByBlock = (obj) => {
    const src = obj || {};
    const out = {};
    for (const oldKey of Object.keys(src)) {
      const newKey = normalizeBlockId(oldKey, horaires);
      out[newKey] = src[oldKey];
    }
    return out;
  };

  const merged = {
    ...defaults,
    ...safeRemote,
  };

  merged.currentBlockId = normalizeBlockId(merged.currentBlockId || "0", horaires);

  merged.assignments = migrateMapByBlock(merged.assignments);
  merged.skipRotation = migrateMapByBlock(merged.skipRotation);
  merged.pausePrevPoste = migrateMapByBlock(merged.pausePrevPoste);

  return merged;
}

// -----------------------------------------------------
// Remote (API) : SITE CONFIG (par site)
export function normalizeListUpper(arr) {
  const out = [];
  const set = new Set();

  (arr || []).forEach((x) => {
    const v = String(x || "").trim().toUpperCase();
    if (!v) return;
    if (set.has(v)) return;
    set.add(v);
    out.push(v);
  });

  return out;
}

export function normalizeHours(arr) {
  const out = [];
  const set = new Set();

  (arr || []).forEach((x) => {
    const v = String(x || "").trim();
    if (!/^\d{2}:\d{2}$/.test(v)) return;
    if (set.has(v)) return;
    set.add(v);
    out.push(v);
  });

  return out;
}

export function mapConfigRowToStore(cfg, fallback) {
  if (!cfg) return null;

  const next = {};

  // arrays
  if (cfg.preparateurs) next.preparateursList = normalizeListUpper(cfg.preparateurs);
  if (cfg.coordos) next.coordosList = normalizeListUpper(cfg.coordos);
  if (cfg.postes) next.postes = normalizeListUpper(cfg.postes);
  if (cfg.horaires) {
    const hrs = normalizeHours(cfg.horaires);
    if (hrs.length >= 2) next.horaires = hrs;
  }

  // numbers/bools (snake_case -> store)
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

  if (cfg.rotation_minutes != null) {
    next.rotationMinutes = num(cfg.rotation_minutes, fallback.rotationMinutes);
  }
  if (cfg.rotation_warn_minutes != null) {
    next.rotationWarnMinutes = num(cfg.rotation_warn_minutes, fallback.rotationWarnMinutes);
  }
  if (cfg.pause_after_minutes != null) {
    next.pauseAfterMinutes = num(cfg.pause_after_minutes, fallback.pauseAfterMinutes);
  }
  if (cfg.pause_duration_minutes != null) {
    next.pauseDurationMinutes = num(cfg.pause_duration_minutes, fallback.pauseDurationMinutes);
  }
  if (cfg.pause_wave_size != null) {
    next.pauseWaveSize = num(cfg.pause_wave_size, fallback.pauseWaveSize);
  }
  if (cfg.sync_blocks_to_system_clock != null) {
    next.syncBlocksToSystemClock = !!cfg.sync_blocks_to_system_clock;
  }

  return next;
}
