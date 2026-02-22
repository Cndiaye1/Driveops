// src/store/useDriveStore.js
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabase } from "../services/supabaseClient";

// -----------------------------------------------------
// Utils temps / blocs
function pad2(n) {
  return String(n).padStart(2, "0");
}

// ✅ FIX IMPORTANT : date locale (pas UTC)
// Évite les décalages qui cassent la condition:
// s.dayDate === todayISO() quand "Sync sur l’heure du PC" est cochée
function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function timeToMinutes(hhmm) {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}
function minutesToTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

// ✅ legacy index -> minutes id (ex: "8" => horaires[8]="14:00" => "840")
function normalizeBlockId(blockId, horaires) {
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

function buildBlocks(horaires, rotationMinutes) {
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

function getFirstBlockId(horaires, rotationMinutes) {
  const blocks = buildBlocks(horaires, rotationMinutes);
  return blocks[0]?.id ?? "0";
}

function getPrevBlockId(horaires, rotationMinutes, currentBlockId) {
  const blocks = buildBlocks(horaires, rotationMinutes);
  const curId = String(currentBlockId ?? "");
  const idx = blocks.findIndex((b) => b.id === curId);
  if (idx <= 0) return null;
  return blocks[idx - 1]?.id ?? null;
}

function getBlockStartMinForNow(horaires, rotationMinutes, now = new Date()) {
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

function blockStartTimestamp(dayDate, blockStartMin, useSystemDate) {
  const dateISO = useSystemDate ? todayISO() : dayDate;
  const base = new Date(`${dateISO}T00:00:00`);
  base.setMinutes(base.getMinutes() + blockStartMin);
  return base.getTime();
}

// -----------------------------------------------------
// Remote (Supabase) : SESSIONS (par jour)
const TABLE = "drive_sessions";

function sessionKey(siteCode, dayDate) {
  return `${siteCode}__${dayDate}`;
}

function isEmptyObject(x) {
  return !!x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).length === 0;
}

function prettifyApiError(msgRaw) {
  const msg = String(msgRaw || "");
  const lower = msg.toLowerCase();

  if (!msg) return "";
  if (lower.includes("row-level security") || lower.includes("violates row-level security")) {
    return "Accès refusé (compte non autorisé sur ce site).";
  }
  if (lower.includes("jwt") || lower.includes("unauthorized") || lower.includes("not authenticated")) {
    return "Connexion requise (merci de te reconnecter).";
  }
  if (lower.includes("fetch") || lower.includes("network") || lower.includes("offline") || lower.includes("timeout")) {
    return "Connexion instable — en attente…";
  }
  return msg;
}

/**
 * ✅ IMPORTANT (NEW)
 * - Les référentiels + règles (prépas/coordos/postes/horaires/rotation/pause…) viennent maintenant de drive_site_config (par site).
 * - drive_sessions (par jour) ne garde que la journée (coordinator/dayStaff/assignments/runtime…)
 */
const REMOTE_ALLOWED_KEYS_SESSION = [
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

function serializeSessionState(s) {
  const out = {};
  for (const k of REMOTE_ALLOWED_KEYS_SESSION) out[k] = s[k];
  return out;
}

function pickRemoteSession(remoteJson) {
  if (!remoteJson || typeof remoteJson !== "object") return null;
  if (isEmptyObject(remoteJson)) return null;

  const out = {};
  for (const k of REMOTE_ALLOWED_KEYS_SESSION) {
    if (remoteJson[k] !== undefined) out[k] = remoteJson[k];
  }
  return out;
}

function mergeRemoteSessionIntoState(defaults, remoteJson) {
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
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function urlJoin(path) {
  if (!API_BASE) return path; // same-origin
  return `${API_BASE}${path}`;
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || "";
}

function normalizeListUpper(arr) {
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

function normalizeHours(arr) {
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

function mapConfigRowToStore(cfg, fallback) {
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

  if (cfg.rotation_minutes != null) next.rotationMinutes = num(cfg.rotation_minutes, fallback.rotationMinutes);
  if (cfg.rotation_warn_minutes != null) next.rotationWarnMinutes = num(cfg.rotation_warn_minutes, fallback.rotationWarnMinutes);
  if (cfg.pause_after_minutes != null) next.pauseAfterMinutes = num(cfg.pause_after_minutes, fallback.pauseAfterMinutes);
  if (cfg.pause_duration_minutes != null) next.pauseDurationMinutes = num(cfg.pause_duration_minutes, fallback.pauseDurationMinutes);
  if (cfg.pause_wave_size != null) next.pauseWaveSize = num(cfg.pause_wave_size, fallback.pauseWaveSize);
  if (cfg.sync_blocks_to_system_clock != null) next.syncBlocksToSystemClock = !!cfg.sync_blocks_to_system_clock;

  return next;
}

/**
 * ✅ apiFetch robuste :
 * - envoie toujours Authorization Bearer
 * - si 401 : refreshSession() puis retry 1 fois
 */
async function apiFetch(path, { method = "GET", body, siteCode } = {}) {
  const site = String(siteCode || "").trim().toLowerCase();

  const doRequest = async (token) => {
    return fetch(urlJoin(path), {
      method,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Site-Code": site,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  let token = await getAccessToken();
  if (!token) throw new Error("Missing token (reconnecte-toi)");

  let r = await doRequest(token);

  // retry après refresh si session/token pas prêt sur certains devices
  if (r.status === 401) {
    try {
      await supabase.auth.refreshSession();
    } catch {}
    token = await getAccessToken();
    if (!token) throw new Error("Missing token after refresh (reconnecte-toi)");
    r = await doRequest(token);
  }

  const text = await r.text();
  let j = {};
  try {
    j = text ? JSON.parse(text) : {};
  } catch {
    j = {};
  }

  if (!r.ok) {
    throw new Error(j?.error || `Erreur API (${r.status})`);
  }
  return j;
}

// -----------------------------------------------------
// Defaults
// ✅ IMPORTANT: site_code = lowercase (DB/RLS/API alignés)
const DEFAULT_SITE_CODE = String(import.meta.env.VITE_SITE_CODE || "melun").trim().toLowerCase();

const defaultState = {
  siteCode: DEFAULT_SITE_CODE,

  // UI only (local)
  screen: "setup", // setup | cockpit | admin | planning
  setupStep: 1,
  wallMode: false,
  printMode: false,

  // ✅ référentiels + règles (par site) — seront remplacés par drive_site_config dès que chargé
  preparateursList: ["STEVE", "THÉRY", "JOHN", "MIKE", "TOM"],
  coordosList: ["STEVE", "THÉRY", "JOHN"],
  postes: ["ACCUEIL", "PGC", "FS", "LIV", "MES", "LAD", "FLEG/SURG", "RE", "NET", "PAUSE"],
  horaires: [
    "06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00",
    "16:00", "17:00", "18:00", "19:00", "20:00", "21:00",
  ],

  rotationMinutes: 120,
  rotationWarnMinutes: 10,
  pauseAfterMinutes: 180,
  pauseDurationMinutes: 30,
  pauseWaveSize: 1,
  syncBlocksToSystemClock: true,

  // ✅ journée (par jour)
  dayDate: todayISO(),
  coordinator: "",
  dayStaff: [],

  dayStartedAt: null,
  blockStartedAt: null,
  serviceStartedAt: null,
  currentBlockId: "0",
  rotationImminent: false,
  rotationLocked: false,

  assignments: {},
  pauseTakenAt: {},
  skipRotation: {},
  pausePrevPoste: {},
  returnAlertUntil: {},

  // statuses
  apiStatus: "idle", // idle|syncing|pulled|pushed|offline|error
  apiError: "",

  cfgStatus: "idle", // idle|loading|loaded|saving|offline|error
  cfgError: "",

  _sessionLoadedKey: null,
  _subscribedKey: null,
  _cfgLoadedSite: null,

  _saving: false,
  _lastRemoteUpdatedAt: null,
  _lastLocalWriteAt: 0,
  _error: null,

  _pendingSave: false,
  _retryCount: 0,

  _cfgSaving: false,
  _cfgPendingSave: false,
  _cfgRetryCount: 0,
  _cfgLastWriteAt: 0,

  _hasHydrated: false,

  // ✅ Auth / RBAC (local)
  memberRole: null, // admin|manager|user|null
};

// -----------------------------------------------------
// Hydration guard (évite wipe au refresh)
let _hydrated = false;
let _resolveHydrated = null;
const hydratedPromise = new Promise((res) => {
  _resolveHydrated = res;
});
async function awaitHydrated() {
  if (_hydrated) return;
  await hydratedPromise;
}

// -----------------------------------------------------
// Store (persist local + sync supabase)
export const useDriveStore = create(
  persist(
    (set, get) => {
      const ensureBlockMaps = (s, bid) => {
        const assignments = { ...(s.assignments || {}) };
        const skipRotation = { ...(s.skipRotation || {}) };
        const pausePrevPoste = { ...(s.pausePrevPoste || {}) };

        if (!assignments[bid]) assignments[bid] = {};
        if (!skipRotation[bid]) skipRotation[bid] = {};
        if (!pausePrevPoste[bid]) pausePrevPoste[bid] = {};

        return { assignments, skipRotation, pausePrevPoste };
      };

      const normalizeName = (n) => String(n || "").trim().toUpperCase();
      const normalizePoste = (p) => String(p || "").trim().toUpperCase();

      // Remote: load + upsert (drive_sessions)
      const loadSession = async (siteCode, dayDate) => {
        const { data, error } = await supabase
          .from(TABLE)
          .select("id, site_code, day_date, state_json, updated_at")
          .eq("site_code", siteCode)
          .eq("day_date", dayDate)
          .maybeSingle();

        if (error) throw error;
        return data || null;
      };

      const upsertSession = async (siteCode, dayDate, stateJson) => {
        const payload = {
          site_code: siteCode,
          day_date: dayDate,
          state_json: stateJson,
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from(TABLE)
          .upsert(payload, { onConflict: "site_code,day_date" })
          .select("id, updated_at")
          .single();

        if (error) throw error;
        return data;
      };

      // ---------------- Autosave (SESSION) debounce + offline retry
      let sessionSaveTimer = null;
      let sessionRetryTimer = null;

      const scheduleSessionRetry = () => {
        const st = get();
        if (!st._pendingSave) return;

        const ms = Math.min(20000, 1000 * Math.pow(2, Math.min(4, st._retryCount || 0)));

        if (sessionRetryTimer) clearTimeout(sessionRetryTimer);
        sessionRetryTimer = setTimeout(async () => {
          await doSessionSaveNow();
        }, ms);
      };

      const doSessionSaveNow = async () => {
        await awaitHydrated();

        const st = get();
        const key = sessionKey(st.siteCode, st.dayDate);

        if (st._sessionLoadedKey !== key) {
          set({ apiStatus: "syncing", apiError: "" });
          await hydrateFromRemote(st.siteCode, st.dayDate);
        }

        try {
          if (typeof navigator !== "undefined" && navigator.onLine === false) {
            set({ apiStatus: "offline", _pendingSave: true, apiError: prettifyApiError("offline") });
            scheduleSessionRetry();
            return;
          }

          set({ _saving: true, _error: null, apiStatus: "syncing", apiError: "" });

          const body = serializeSessionState(get());
          await upsertSession(st.siteCode, st.dayDate, body);

          set({
            _saving: false,
            _pendingSave: false,
            _retryCount: 0,
            _lastLocalWriteAt: Date.now(),
            apiStatus: "pushed",
            apiError: "",
          });
        } catch (e) {
          const msg = String(e?.message || e);

          const isNetwork =
            msg.toLowerCase().includes("fetch") ||
            msg.toLowerCase().includes("network") ||
            msg.toLowerCase().includes("offline") ||
            msg.toLowerCase().includes("timeout");

          if (isNetwork) {
            set((s) => ({
              _saving: false,
              apiStatus: "offline",
              apiError: prettifyApiError(msg),
              _pendingSave: true,
              _retryCount: (s._retryCount || 0) + 1,
            }));
            scheduleSessionRetry();
            return;
          }

          set({
            _saving: false,
            apiStatus: "error",
            apiError: prettifyApiError(msg),
            _error: msg,
            _pendingSave: false,
          });
        }
      };

      const scheduleSessionSave = () => {
        if (sessionSaveTimer) clearTimeout(sessionSaveTimer);
        sessionSaveTimer = setTimeout(async () => {
          await doSessionSaveNow();
        }, 350);
      };

      // ---------------- Autosave (SITE CONFIG) debounce + offline retry
      let cfgSaveTimer = null;
      let cfgRetryTimer = null;

      const scheduleCfgRetry = () => {
        const st = get();
        if (!st._cfgPendingSave) return;

        const ms = Math.min(20000, 1000 * Math.pow(2, Math.min(4, st._cfgRetryCount || 0)));

        if (cfgRetryTimer) clearTimeout(cfgRetryTimer);
        cfgRetryTimer = setTimeout(async () => {
          await doCfgSaveNow();
        }, ms);
      };

      const doCfgSaveNow = async () => {
        await awaitHydrated();

        const st = get();
        const siteCode = String(st.siteCode || "").trim().toLowerCase();
        if (!siteCode) return;

        // ✅ IMPORTANT : seule une personne admin doit écrire la config site
        const role = String(st.memberRole || "").trim().toLowerCase();
        if (role !== "admin") {
          // on ne casse rien : on laisse la config locale, mais on n'appelle pas l'API admin
          set({ cfgStatus: "loaded", cfgError: "" });
          return;
        }

        try {
          if (typeof navigator !== "undefined" && navigator.onLine === false) {
            set({ cfgStatus: "offline", cfgError: prettifyApiError("offline"), _cfgPendingSave: true });
            scheduleCfgRetry();
            return;
          }

          set({ _cfgSaving: true, cfgStatus: "saving", cfgError: "" });

          await apiFetch(`/api/admin/update-config`, {
            method: "POST",
            siteCode,
            body: {
              siteCode,
              preparateursList: st.preparateursList,
              coordosList: st.coordosList,
              postes: st.postes,
              horaires: st.horaires,
              rotationMinutes: st.rotationMinutes,
              rotationWarnMinutes: st.rotationWarnMinutes,
              pauseAfterMinutes: st.pauseAfterMinutes,
              pauseDurationMinutes: st.pauseDurationMinutes,
              pauseWaveSize: st.pauseWaveSize,
              syncBlocksToSystemClock: st.syncBlocksToSystemClock,
            },
          });

          set({
            _cfgSaving: false,
            _cfgPendingSave: false,
            _cfgRetryCount: 0,
            _cfgLastWriteAt: Date.now(),
            cfgStatus: "loaded",
            cfgError: "",
          });
        } catch (e) {
          const msg = String(e?.message || e);
          const lower = msg.toLowerCase();

          const isNetwork =
            lower.includes("fetch") ||
            lower.includes("network") ||
            lower.includes("offline") ||
            lower.includes("timeout");

          if (isNetwork) {
            set((s) => ({
              _cfgSaving: false,
              cfgStatus: "offline",
              cfgError: prettifyApiError(msg),
              _cfgPendingSave: true,
              _cfgRetryCount: (s._cfgRetryCount || 0) + 1,
            }));
            scheduleCfgRetry();
            return;
          }

          set((s) => ({
            _cfgSaving: false,
            cfgStatus: "error",
            cfgError: prettifyApiError(msg),
            _cfgPendingSave: false,
            _cfgRetryCount: s._cfgRetryCount || 0,
          }));
        }
      };

      const scheduleCfgSave = () => {
        if (cfgSaveTimer) clearTimeout(cfgSaveTimer);
        cfgSaveTimer = setTimeout(async () => {
          await doCfgSaveNow();
        }, 450);
      };

      // listeners online => retry
      if (typeof window !== "undefined" && !window.__driveopsOnlineListener) {
        window.__driveopsOnlineListener = true;
        window.addEventListener("online", () => {
          const st = get();
          if (st._pendingSave) doSessionSaveNow();
          if (st._cfgPendingSave) doCfgSaveNow();
        });
      }

      // ---------------- Site Config Hydrate
      const hydrateSiteConfig = async (siteCode) => {
        await awaitHydrated();
        const site = String(siteCode || "").trim().toLowerCase();
        if (!site) return;

        const st = get();
        if (st._cfgLoadedSite === site && st.cfgStatus === "loaded") return;

        set({ cfgStatus: "loading", cfgError: "" });

        try {
          const j = await apiFetch(`/api/site/get-config?siteCode=${encodeURIComponent(site)}`, {
            method: "GET",
            siteCode: site,
          });

          const cfg = j?.config || null;
          const mapped = mapConfigRowToStore(cfg, get());

          if (mapped) {
            set((s) => {
              const next = { ...s, ...mapped };

              // clamp pauseWaveSize
              const staffLen = next.dayStaff?.length || 1;
              next.pauseWaveSize = Math.max(1, Math.min(staffLen, Number(next.pauseWaveSize) || 1));

              // ensure currentBlockId
              const first = getFirstBlockId(next.horaires, next.rotationMinutes);
              if (!next.currentBlockId || next.currentBlockId === "0") next.currentBlockId = first;
              else next.currentBlockId = normalizeBlockId(next.currentBlockId, next.horaires);

              return next;
            });
          }

          set({ cfgStatus: "loaded", cfgError: "", _cfgLoadedSite: site });
        } catch (e) {
          const msg = String(e?.message || e);
          set({ cfgStatus: "error", cfgError: prettifyApiError(msg), _cfgLoadedSite: site });
        }
      };

      // ---------------- Realtime (drive_sessions)
      let currentChannel = null;

      const ensureRealtimeSubscribed = async (siteCode, dayDate) => {
        await awaitHydrated();

        const key = sessionKey(siteCode, dayDate);
        const st = get();
        if (st._subscribedKey === key) return;

        try {
          if (currentChannel) await supabase.removeChannel(currentChannel);
        } catch {}
        currentChannel = null;

        currentChannel = supabase
          .channel(`drive_sessions_${key}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: TABLE,
              filter: `site_code=eq.${siteCode}`,
            },
            async (payload) => {
              const row = payload?.new || payload?.old;
              if (!row) return;
              if (String(row.day_date) !== String(dayDate)) return;

              const now = Date.now();
              const st2 = get();
              if (now - (st2._lastLocalWriteAt || 0) < 700) return;
              if (isEmptyObject(row.state_json)) return;

              const next = mergeRemoteSessionIntoState(st2, row.state_json);
              set({
                ...next,
                apiStatus: "pulled",
                apiError: "",
                _lastRemoteUpdatedAt: row.updated_at || null,
                _error: null,
              });
            }
          )
          .subscribe();

        set({ _subscribedKey: key });
      };

      // ---------------- Hydrate (REMOTE session -> LOCAL)
      const hydrateFromRemote = async (siteCode, dayDate) => {
        await awaitHydrated();

        const key = sessionKey(siteCode, dayDate);
        const st = get();
        if (st._sessionLoadedKey === key) return;

        set({ _error: null, apiStatus: "syncing", apiError: "" });

        try {
          const row = await loadSession(siteCode, dayDate);

          if (!row || isEmptyObject(row.state_json)) {
            const base = { ...get(), siteCode, dayDate };
            if (!base.currentBlockId || base.currentBlockId === "0") {
              base.currentBlockId = getFirstBlockId(base.horaires, base.rotationMinutes);
            }

            set({
              ...base,
              _sessionLoadedKey: key,
              _lastRemoteUpdatedAt: row?.updated_at || null,
              apiStatus: "pulled",
              apiError: "",
            });

            await doSessionSaveNow();
          } else {
            const merged = mergeRemoteSessionIntoState({ ...get(), siteCode, dayDate }, row.state_json);

            if (!merged.currentBlockId || merged.currentBlockId === "0") {
              merged.currentBlockId = getFirstBlockId(merged.horaires, merged.rotationMinutes);
            }

            set({
              ...merged,
              _sessionLoadedKey: key,
              _lastRemoteUpdatedAt: row.updated_at || null,
              apiStatus: "pulled",
              apiError: "",
            });
          }

          await ensureRealtimeSubscribed(siteCode, dayDate);
        } catch (e) {
          const msg = String(e?.message || e);
          set({
            apiStatus: "error",
            apiError: prettifyApiError(msg),
            _error: msg,
          });
        }
      };

      // -----------------------------------------------------
      // Public API
      return {
        ...defaultState,

        setHasHydrated: (v) => set({ _hasHydrated: !!v }),

        // ✅ Auth / role
        setMemberRole: (role) =>
          set({
            memberRole: role ? String(role).trim().toLowerCase() : null,
          }),

        resetAuthState: () =>
          set((s) => ({
            ...s,
            memberRole: null,
            screen: "setup",
            apiStatus: "idle",
            apiError: "",
            cfgStatus: "idle",
            cfgError: "",
            _sessionLoadedKey: null,
            _subscribedKey: null,
            _cfgLoadedSite: null,
          })),

        // ✅ charge d’abord la config du site, puis la session du jour
        ensureSessionLoaded: async () => {
          await awaitHydrated();
          const s = get();
          await hydrateSiteConfig(s.siteCode);
          await hydrateFromRemote(s.siteCode, s.dayDate);
        },

        // ---------- navigation (LOCAL only)
        goSetup: () => set((s) => ({ ...s, screen: "setup" })),
        goCockpit: () => set((s) => ({ ...s, screen: "cockpit" })),
        goAdmin: () => set((s) => ({ ...s, screen: "admin" })),
        goPlanning: () => set((s) => ({ ...s, screen: "planning" })), // ✅ NEW

        setSetupStep: (setupStep) => set((s) => ({ ...s, setupStep })),

        // ---------- site/date (clé = site+date)
        setSiteCode: async (siteCode) => {
          await awaitHydrated();

          const v = String(siteCode || "").trim().toLowerCase();
          if (!v) return;

          set((s) => ({
            ...s,
            siteCode: v,
            _sessionLoadedKey: null,
            _subscribedKey: null,
            apiStatus: "idle",
            apiError: "",
          }));

          await hydrateSiteConfig(v);
          await hydrateFromRemote(v, get().dayDate);
        },

        setDayDate: async (dayDate) => {
          await awaitHydrated();

          const d = String(dayDate || "").slice(0, 10);
          set((s) => ({ ...s, dayDate: d, _sessionLoadedKey: null, apiStatus: "idle", apiError: "" }));

          // day change => session change
          await hydrateFromRemote(get().siteCode, d);
        },

        // ---------- modes UI (LOCAL)
        setWallMode: (wallMode) => set((s) => ({ ...s, wallMode: !!wallMode })),
        enterPrintMode: () => set((s) => ({ ...s, printMode: true })),
        exitPrintMode: () => set((s) => ({ ...s, printMode: false })),

        // ---------- règles (SITE CONFIG)
        setSyncBlocksToSystemClock: (value) => {
          set((s) => ({ ...s, syncBlocksToSystemClock: !!value }));
          scheduleCfgSave();
        },

        setPauseWaveSize: (pauseWaveSize) => {
          set((s) => {
            const max = Math.max(1, s.dayStaff?.length || 1);
            const v = Math.max(1, Math.min(max, Number(pauseWaveSize) || 1));
            return { ...s, pauseWaveSize: v };
          });
          scheduleCfgSave();
        },

        // ---------- référentiels (SITE CONFIG)
        addPreparateurToList: (name) => {
          const n = normalizeName(name);
          if (!n) return;
          set((s) => {
            if (s.preparateursList.includes(n)) return s;
            return { ...s, preparateursList: [...s.preparateursList, n].sort() };
          });
          scheduleCfgSave();
        },

        removePreparateurFromList: (name) => {
          const upper = normalizeName(name);
          set((s) => {
            const preparateursList = (s.preparateursList || []).filter((x) => x !== upper);
            const dayStaff = (s.dayStaff || []).filter((x) => x !== upper);

            const assignments = { ...(s.assignments || {}) };
            for (const bid of Object.keys(assignments)) {
              const copy = { ...(assignments[bid] || {}) };
              delete copy[upper];
              assignments[bid] = copy;
            }

            const skipRotation = { ...(s.skipRotation || {}) };
            for (const bid of Object.keys(skipRotation)) {
              const copy = { ...(skipRotation[bid] || {}) };
              delete copy[upper];
              skipRotation[bid] = copy;
            }

            const pausePrevPoste = { ...(s.pausePrevPoste || {}) };
            for (const bid of Object.keys(pausePrevPoste)) {
              const copy = { ...(pausePrevPoste[bid] || {}) };
              delete copy[upper];
              pausePrevPoste[bid] = copy;
            }

            const pauseTakenAt = { ...(s.pauseTakenAt || {}) };
            delete pauseTakenAt[upper];

            const returnAlertUntil = { ...(s.returnAlertUntil || {}) };
            delete returnAlertUntil[upper];

            const pauseWaveSize = Math.max(1, Math.min(dayStaff.length || 1, s.pauseWaveSize || 1));

            return {
              ...s,
              preparateursList,
              dayStaff,
              assignments,
              skipRotation,
              pausePrevPoste,
              pauseTakenAt,
              returnAlertUntil,
              pauseWaveSize,
            };
          });

          // ✅ c’est à la fois config + journée
          scheduleCfgSave();
          scheduleSessionSave();
        },

        addCoordoToList: (name) => {
          const n = normalizeName(name);
          if (!n) return;
          set((s) => {
            if (s.coordosList.includes(n)) return s;
            return { ...s, coordosList: [...s.coordosList, n].sort() };
          });
          scheduleCfgSave();
        },

        removeCoordoFromList: (name) => {
          const upper = normalizeName(name);
          set((s) => {
            const coordosList = (s.coordosList || []).filter((x) => x !== upper);
            const coordinator = normalizeName(s.coordinator) === upper ? "" : s.coordinator;
            return { ...s, coordosList, coordinator };
          });
          scheduleCfgSave();
          scheduleSessionSave();
        },

        // ---------- config journée (SESSION)
        setCoordinator: (coordinator) => {
          const c = normalizeName(coordinator);
          set((s) => ({ ...s, coordinator: c }));
          scheduleSessionSave();
        },

        toggleDayStaff: (name) => {
          const upper = normalizeName(name);
          if (!upper) return;

          set((s) => {
            const exists = s.dayStaff.includes(upper);
            const dayStaff = exists ? s.dayStaff.filter((x) => x !== upper) : [...s.dayStaff, upper].sort();

            // clamp wave size (config) selon staff (jour)
            const pauseWaveSize = Math.max(1, Math.min(dayStaff.length || 1, s.pauseWaveSize || 1));

            const serviceOn = !!(s.dayStartedAt || s.serviceStartedAt);
            const setupBlockId = getFirstBlockId(s.horaires, s.rotationMinutes);

            const assignments = { ...s.assignments };
            const bid = serviceOn ? normalizeBlockId(s.currentBlockId || setupBlockId, s.horaires) : setupBlockId;

            if (!assignments[bid]) assignments[bid] = {};
            const copy = { ...assignments[bid] };

            if (exists) delete copy[upper];
            else copy[upper] = copy[upper] ?? "";

            assignments[bid] = copy;

            return { ...s, dayStaff, pauseWaveSize, assignments, currentBlockId: bid };
          });

          scheduleSessionSave();
        },

        // ---------- placement initial (setup) (SESSION)
        setInitialAssignment: (nom, poste) => {
          const s = get();
          const serviceOn = !!(s.dayStartedAt || s.serviceStartedAt);

          const blockId = serviceOn
            ? normalizeBlockId(s.currentBlockId || "0", s.horaires)
            : getFirstBlockId(s.horaires, s.rotationMinutes);

          const upperNom = normalizeName(nom);
          const p = normalizePoste(poste);
          if (!upperNom) return;

          set((prev) => {
            const assignments = { ...prev.assignments };
            if (!assignments[blockId]) assignments[blockId] = {};
            assignments[blockId] = { ...assignments[blockId], [upperNom]: p };
            return { ...prev, assignments, currentBlockId: blockId };
          });

          scheduleSessionSave();
        },

        fillMissingAssignmentsFromPrevBlock: () => {
          set((s) => {
            const bid = normalizeBlockId(s.currentBlockId, s.horaires);
            const prevId = getPrevBlockId(s.horaires, s.rotationMinutes, bid);
            if (!prevId) return s;

            const { assignments, skipRotation, pausePrevPoste } = ensureBlockMaps(s, bid);
            const prevMap = (s.assignments || {})[prevId] || {};
            const curMap = assignments[bid] || {};

            const nextMap = { ...curMap };
            for (const rawName of s.dayStaff || []) {
              const name = normalizeName(rawName);
              const curPoste = normalizePoste(nextMap[name]);
              if (curPoste) continue;

              const prevPoste = normalizePoste(prevMap[name]);
              if (prevPoste) nextMap[name] = prevPoste;
            }

            assignments[bid] = nextMap;
            return { ...s, assignments, skipRotation, pausePrevPoste, currentBlockId: bid };
          });

          scheduleSessionSave();
        },

        setCurrentBlockManual: (blockId) => {
          set((s) => {
            const bid = String(blockId ?? "");
            const curId = normalizeBlockId(s.currentBlockId, s.horaires);
            const syncBlocksToSystemClock = false;

            let { assignments, skipRotation, pausePrevPoste } = ensureBlockMaps(s, bid);
            const curMaps = ensureBlockMaps(s, curId);

            if (!s.assignments?.[bid]) {
              const prev = curMaps.assignments?.[curId] || {};
              const carried = {};
              (s.dayStaff || []).forEach((n) => (carried[normalizeName(n)] = prev[normalizeName(n)] ?? ""));
              assignments[bid] = carried;
            }

            if (!s.skipRotation?.[bid]) {
              const prevSkip = curMaps.skipRotation?.[curId] || {};
              const carriedSkip = {};
              (s.dayStaff || []).forEach((n) => (carriedSkip[normalizeName(n)] = !!prevSkip[normalizeName(n)]));
              skipRotation[bid] = carriedSkip;
            }

            if (!s.pausePrevPoste?.[bid]) {
              const prevPrev = curMaps.pausePrevPoste?.[curId] || {};
              const carriedPrev = {};
              (s.dayStaff || []).forEach((n) => (carriedPrev[normalizeName(n)] = prevPrev[normalizeName(n)] ?? ""));
              pausePrevPoste[bid] = carriedPrev;
            }

            const startMin = Number(bid);
            const blockStartedAt = Number.isFinite(startMin)
              ? blockStartTimestamp(s.dayDate, startMin, true)
              : Date.now();

            return {
              ...s,
              syncBlocksToSystemClock,
              currentBlockId: bid,
              blockStartedAt,
              rotationImminent: false,
              rotationLocked: false,
              assignments,
              skipRotation,
              pausePrevPoste,
            };
          });

          scheduleSessionSave();
        },

        startService: () => {
          set((s) => {
            if (!s.coordinator || s.dayStaff.length === 0) return s;

            const blocks = buildBlocks(s.horaires, s.rotationMinutes);
            const firstDefault = blocks[0]?.id ?? getFirstBlockId(s.horaires, s.rotationMinutes);

            const shouldSyncToday = !!(s.syncBlocksToSystemClock && s.dayDate === todayISO());

            const now = new Date();
            const sysStartMin = shouldSyncToday ? getBlockStartMinForNow(s.horaires, s.rotationMinutes, now) : null;
            const first = sysStartMin != null ? String(sysStartMin) : firstDefault;

            const assignments = { ...s.assignments };
            if (!assignments[first] && assignments[firstDefault] && first !== firstDefault) {
              assignments[first] = { ...assignments[firstDefault] };
            }

            const blockAssignments = assignments?.[first] || {};
            const allHavePoste = s.dayStaff.every((n) => {
              const nn = normalizeName(n);
              return blockAssignments[nn] && blockAssignments[nn] !== "";
            });
            if (!allHavePoste) return s;

            const pauseTakenAt = { ...(s.pauseTakenAt || {}) };
            s.dayStaff.forEach((n) => (pauseTakenAt[normalizeName(n)] = pauseTakenAt[normalizeName(n)] ?? null));

            const nowMs = Date.now();
            const blockStartedAt = sysStartMin != null ? blockStartTimestamp(s.dayDate, sysStartMin, true) : nowMs;

            const skipRotation = { ...(s.skipRotation || {}) };
            if (!skipRotation[first]) skipRotation[first] = {};

            const pausePrevPoste = { ...(s.pausePrevPoste || {}) };
            if (!pausePrevPoste[first]) pausePrevPoste[first] = {};

            return {
              ...s,
              screen: "cockpit",
              setupStep: 1,
              dayStartedAt: nowMs,
              blockStartedAt,
              serviceStartedAt: nowMs,
              currentBlockId: first,
              rotationImminent: false,
              rotationLocked: false,
              pauseTakenAt,
              assignments,
              skipRotation,
              pausePrevPoste,
            };
          });

          scheduleSessionSave();
        },

        stopService: () => {
          set((s) => {
            const first = getFirstBlockId(s.horaires, s.rotationMinutes);
            return {
              ...s,
              dayStartedAt: null,
              blockStartedAt: null,
              serviceStartedAt: null,
              rotationImminent: false,
              rotationLocked: false,
              screen: "setup",
              setupStep: 1,
              wallMode: false,
              printMode: false,
              currentBlockId: first,
            };
          });

          scheduleSessionSave();
        },

        tick: () => {
          const s = get();
          const serviceOn = !!(s.dayStartedAt || s.serviceStartedAt);
          if (!serviceOn) return;

          const currentId = normalizeBlockId(s.currentBlockId, s.horaires);
          const shouldSyncToday = !!(s.syncBlocksToSystemClock && s.dayDate === todayISO());

          if (shouldSyncToday) {
            const now = new Date();
            const sysStartMin = getBlockStartMinForNow(s.horaires, s.rotationMinutes, now);

            if (sysStartMin != null) {
              const sysBlockId = String(sysStartMin);
              if (sysBlockId !== currentId) {
                set((prev) => {
                  const assignments = { ...(prev.assignments || {}) };
                  const skipRotation = { ...(prev.skipRotation || {}) };
                  const pausePrevPoste = { ...(prev.pausePrevPoste || {}) };

                  if (!assignments[sysBlockId]) {
                    const prevMap = assignments?.[currentId] || {};
                    const carried = {};
                    (prev.dayStaff || []).forEach((n) => {
                      const nn = normalizeName(n);
                      carried[nn] = prevMap[nn] ?? "";
                    });
                    assignments[sysBlockId] = carried;
                  }

                  if (!skipRotation[sysBlockId]) skipRotation[sysBlockId] = {};

                  if (!pausePrevPoste[sysBlockId]) {
                    const prevPrev = pausePrevPoste?.[currentId] || {};
                    const carriedPrev = {};
                    (prev.dayStaff || []).forEach((n) => {
                      const nn = normalizeName(n);
                      carriedPrev[nn] = prevPrev[nn] ?? "";
                    });
                    pausePrevPoste[sysBlockId] = carriedPrev;
                  }

                  return {
                    ...prev,
                    currentBlockId: sysBlockId,
                    blockStartedAt: blockStartTimestamp(prev.dayDate, sysStartMin, true),
                    assignments,
                    skipRotation,
                    pausePrevPoste,
                    rotationImminent: false,
                    rotationLocked: false,
                  };
                });

                scheduleSessionSave();
                return;
              }
            }
          }

          const blockStart = s.blockStartedAt || s.serviceStartedAt;
          if (!blockStart) return;

          const elapsedMin = Math.floor((Date.now() - blockStart) / 60000);
          const warnFrom = s.rotationMinutes - s.rotationWarnMinutes;

          const nextRotationImminent = elapsedMin >= warnFrom && elapsedMin < s.rotationMinutes;
          const nextRotationLocked = elapsedMin >= s.rotationMinutes;

          const rotationImminent = s.rotationLocked ? false : nextRotationImminent;
          const rotationLocked = s.rotationLocked ? true : nextRotationLocked;

          if (rotationImminent === s.rotationImminent && rotationLocked === s.rotationLocked) return;
          set({ rotationImminent, rotationLocked, currentBlockId: currentId });
        },

        validateRotation: () => {
          set((s) => {
            const blocks = buildBlocks(s.horaires, s.rotationMinutes);
            const curId = normalizeBlockId(s.currentBlockId, s.horaires);

            const currentMap = (s.assignments || {})[curId] || {};
            const missing = (s.dayStaff || []).filter((raw) => {
              const n = normalizeName(raw);
              const p = normalizePoste(currentMap[n]);
              return !p;
            });
            if (missing.length > 0) return s;

            const currentIndex = blocks.findIndex((b) => b.id === curId);
            const nextObj = currentIndex >= 0 ? blocks[currentIndex + 1] : null;
            if (!nextObj) {
              return {
                ...s,
                currentBlockId: curId,
                blockStartedAt: Date.now(),
                rotationImminent: false,
                rotationLocked: false,
              };
            }

            const nextBlockId = nextObj.id;
            const assignments = { ...(s.assignments || {}) };
            const existingNext = assignments?.[nextBlockId] || {};

            const skipRotation = { ...(s.skipRotation || {}) };
            const skipCur = skipRotation?.[curId] || {};

            const carried = {};
            for (const raw of s.dayStaff || []) {
              const upper = normalizeName(raw);
              const isSkipped = !!skipCur?.[upper];
              if (isSkipped) carried[upper] = currentMap[upper] ?? "";
              else carried[upper] = currentMap[upper] ?? existingNext[upper] ?? "";
            }

            assignments[nextBlockId] = carried;
            skipRotation[nextBlockId] = {};

            return {
              ...s,
              assignments,
              skipRotation,
              blockStartedAt: Date.now(),
              currentBlockId: nextBlockId,
              rotationImminent: false,
              rotationLocked: false,
            };
          });

          scheduleSessionSave();
        },

        setAssignment: (blockId, nom, poste) => {
          set((s) => {
            const upperNom = normalizeName(nom);
            const p = normalizePoste(poste);
            const bid = normalizeBlockId(blockId, s.horaires);

            const { assignments, pausePrevPoste } = ensureBlockMaps(s, bid);
            const prevPoste = normalizePoste(assignments?.[bid]?.[upperNom]);

            if (p === "PAUSE" && prevPoste && prevPoste !== "PAUSE") {
              pausePrevPoste[bid] = { ...(pausePrevPoste[bid] || {}), [upperNom]: prevPoste };
            }

            assignments[bid] = { ...assignments[bid], [upperNom]: p };

            let pauseTakenAt = s.pauseTakenAt || {};
            if (p === "PAUSE" && (s.dayStartedAt || s.serviceStartedAt)) {
              if (!pauseTakenAt[upperNom]) {
                pauseTakenAt = { ...pauseTakenAt, [upperNom]: Date.now() };
              }
            }

            return { ...s, assignments, pausePrevPoste, pauseTakenAt };
          });

          scheduleSessionSave();
        },

        toggleSkipRotation: (blockId, nom) => {
          set((s) => {
            const bid = normalizeBlockId(blockId, s.horaires);
            const upperNom = normalizeName(nom);
            if (!upperNom) return s;

            const skipRotation = { ...(s.skipRotation || {}) };
            if (!skipRotation[bid]) skipRotation[bid] = {};
            skipRotation[bid] = { ...skipRotation[bid], [upperNom]: !skipRotation[bid][upperNom] };

            return { ...s, skipRotation };
          });

          scheduleSessionSave();
        },

        returnFromPause: (blockId, nom) => {
          set((s) => {
            const bid = normalizeBlockId(blockId, s.horaires);
            const upperNom = normalizeName(nom);
            if (!upperNom) return s;

            const { assignments, pausePrevPoste } = ensureBlockMaps(s, bid);

            const cur = normalizePoste(assignments?.[bid]?.[upperNom]);
            if (cur !== "PAUSE") return s;

            const prev = normalizePoste(pausePrevPoste?.[bid]?.[upperNom]);
            assignments[bid] = { ...assignments[bid], [upperNom]: prev || "" };

            const returnAlertUntil = { ...(s.returnAlertUntil || {}) };
            returnAlertUntil[upperNom] = Date.now() + 2 * 60 * 1000;

            return { ...s, assignments, returnAlertUntil };
          });

          scheduleSessionSave();
        },

        returnAllEndedPausesCurrentBlock: () => {
          set((s) => {
            const bid = normalizeBlockId(s.currentBlockId, s.horaires);
            const { assignments, pausePrevPoste } = ensureBlockMaps(s, bid);

            const durMs = (Number(s.pauseDurationMinutes) || 30) * 60000;
            const now = Date.now();
            const returnAlertUntil = { ...(s.returnAlertUntil || {}) };

            for (const nom of s.dayStaff || []) {
              const upperNom = normalizeName(nom);
              const cur = normalizePoste(assignments?.[bid]?.[upperNom]);
              if (cur !== "PAUSE") continue;

              const started = s.pauseTakenAt?.[upperNom];
              if (!started) continue;

              if (now - started >= durMs) {
                const prev = normalizePoste(pausePrevPoste?.[bid]?.[upperNom]);
                assignments[bid] = { ...assignments[bid], [upperNom]: prev || "" };
                returnAlertUntil[upperNom] = Date.now() + 2 * 60 * 1000;
              }
            }

            return { ...s, assignments, returnAlertUntil, pausePrevPoste };
          });

          scheduleSessionSave();
        },

        resetDay: () => {
          set((s) => {
            const first = getFirstBlockId(s.horaires, s.rotationMinutes);
            return {
              ...s,
              screen: "setup",
              setupStep: 1,
              wallMode: false,
              printMode: false,

              dayDate: todayISO(),
              coordinator: "",
              dayStaff: [],

              dayStartedAt: null,
              blockStartedAt: null,
              serviceStartedAt: null,
              currentBlockId: first,
              rotationImminent: false,
              rotationLocked: false,

              assignments: {},
              pauseTakenAt: {},
              skipRotation: {},
              pausePrevPoste: {},
              returnAlertUntil: {},

              syncBlocksToSystemClock: true,
            };
          });

          scheduleSessionSave();
        },
      };
    },
    {
      name: "driveops_v2",
      version: 2,

      onRehydrateStorage: () => (state, err) => {
        _hydrated = true;
        _resolveHydrated?.();

        state?.setHasHydrated?.(true);

        if (err) {
          console.warn("driveops persist hydration error:", err);
        }
      },

      // ✅ local persist: on garde UI + config site + journée
      partialize: (s) => ({
        siteCode: s.siteCode,
        dayDate: s.dayDate,

        screen: s.screen,
        setupStep: s.setupStep,
        wallMode: s.wallMode,
        printMode: s.printMode,

        // site config (persist local en backup)
        preparateursList: s.preparateursList,
        coordosList: s.coordosList,
        postes: s.postes,
        horaires: s.horaires,

        rotationMinutes: s.rotationMinutes,
        rotationWarnMinutes: s.rotationWarnMinutes,
        pauseAfterMinutes: s.pauseAfterMinutes,
        pauseDurationMinutes: s.pauseDurationMinutes,
        pauseWaveSize: s.pauseWaveSize,
        syncBlocksToSystemClock: s.syncBlocksToSystemClock,

        // session day
        coordinator: s.coordinator,
        dayStaff: s.dayStaff,

        dayStartedAt: s.dayStartedAt,
        blockStartedAt: s.blockStartedAt,
        serviceStartedAt: s.serviceStartedAt,
        currentBlockId: s.currentBlockId,

        rotationImminent: s.rotationImminent,
        rotationLocked: s.rotationLocked,

        assignments: s.assignments,
        pauseTakenAt: s.pauseTakenAt,
        skipRotation: s.skipRotation,
        pausePrevPoste: s.pausePrevPoste,
        returnAlertUntil: s.returnAlertUntil,

        apiStatus: s.apiStatus,
        apiError: s.apiError,

        cfgStatus: s.cfgStatus,
        cfgError: s.cfgError,

        memberRole: s.memberRole,
      }),
    }
  )
);