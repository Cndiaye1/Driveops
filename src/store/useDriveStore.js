import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabase } from "../services/supabaseClient";

// -----------------------------------------------------
// Utils temps / blocs
function pad2(n) {
  return String(n).padStart(2, "0");
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
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
// Remote (Supabase)
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
 * ✅ IMPORTANT
 * On n’envoie plus dans Supabase les champs UI (screen/setupStep/wall/print),
 * sinon un device peut “forcer” les autres à revenir sur Admin/Cockpit etc.
 */
const REMOTE_ALLOWED_KEYS = [
  // référentiels & règles
  "preparateursList",
  "coordosList",
  "postes",
  "horaires",
  "rotationMinutes",
  "rotationWarnMinutes",
  "pauseAfterMinutes",
  "pauseDurationMinutes",
  "pauseWaveSize",
  "syncBlocksToSystemClock",

  // config journée
  "dayDate",
  "coordinator",
  "dayStaff",

  // runtime service
  "dayStartedAt",
  "blockStartedAt",
  "serviceStartedAt",
  "currentBlockId",
  "rotationImminent",
  "rotationLocked",

  // data métier
  "assignments",
  "pauseTakenAt",
  "skipRotation",
  "pausePrevPoste",
  "returnAlertUntil",
];

function serializeState(s) {
  // ✅ on enregistre UNIQUEMENT les données métier (pas l’UI)
  const out = {};
  for (const k of REMOTE_ALLOWED_KEYS) out[k] = s[k];
  return out;
}

function pickRemote(remoteJson) {
  if (!remoteJson || typeof remoteJson !== "object") return null;
  if (isEmptyObject(remoteJson)) return null;

  const out = {};
  for (const k of REMOTE_ALLOWED_KEYS) {
    if (remoteJson[k] !== undefined) out[k] = remoteJson[k];
  }
  return out;
}

function mergeRemoteIntoState(defaults, remoteJson) {
  const safeRemote = pickRemote(remoteJson);
  if (!safeRemote) return defaults;

  const horaires = safeRemote.horaires || defaults.horaires;

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

  merged.horaires = horaires;
  merged.currentBlockId = normalizeBlockId(merged.currentBlockId || "0", horaires);

  merged.assignments = migrateMapByBlock(merged.assignments);
  merged.skipRotation = migrateMapByBlock(merged.skipRotation);
  merged.pausePrevPoste = migrateMapByBlock(merged.pausePrevPoste);

  const staffLen = merged.dayStaff?.length || 1;
  merged.pauseWaveSize = Math.max(1, Math.min(staffLen, Number(merged.pauseWaveSize) || 1));

  return merged;
}

// -----------------------------------------------------
// Defaults
const DEFAULT_SITE_CODE = String(import.meta.env.VITE_SITE_CODE || "melun").trim().toLowerCase();

const defaultState = {
  siteCode: DEFAULT_SITE_CODE,

  // UI only (local)
  screen: "setup", // setup | cockpit | admin
  setupStep: 1,
  wallMode: false,
  printMode: false,

  preparateursList: ["STEVE", "THÉRY", "JOHN", "MIKE", "TOM"],
  coordosList: ["STEVE", "THÉRY", "JOHN"],
  postes: ["PGC", "FS", "LIV", "MES", "LAD", "FLEG/SURG", "RE", "NET", "PAUSE"],
  horaires: ["06:00","07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00"],

  rotationMinutes: 120,
  rotationWarnMinutes: 10,
  pauseAfterMinutes: 180,
  pauseDurationMinutes: 30,
  pauseWaveSize: 1,
  syncBlocksToSystemClock: true,

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

  apiStatus: "idle", // idle|syncing|pulled|pushed|offline|error
  apiError: "",

  _sessionLoadedKey: null,
  _subscribedKey: null,

  _saving: false,
  _lastRemoteUpdatedAt: null,
  _lastLocalWriteAt: 0,
  _error: null,

  _pendingSave: false,
  _retryCount: 0,
  _hasHydrated: false,

  // Auth / RBAC (local)
  memberRole: null, // admin|manager|user|null
};

// -----------------------------------------------------
// Hydration guard
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

      // Remote: load + upsert
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

      // ---------------- Autosave (debounce + offline queue)
      let saveTimer = null;
      let retryTimer = null;

      const scheduleRetry = () => {
        const st = get();
        if (!st._pendingSave) return;

        const ms = Math.min(20000, 1000 * Math.pow(2, Math.min(4, st._retryCount || 0)));
        if (retryTimer) clearTimeout(retryTimer);

        retryTimer = setTimeout(async () => {
          await doSaveNow();
        }, ms);
      };

      const doSaveNow = async () => {
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
            scheduleRetry();
            return;
          }

          set({ _saving: true, _error: null, apiStatus: "syncing", apiError: "" });

          const body = serializeState(get());
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
            scheduleRetry();
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

      const scheduleSave = () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
          await doSaveNow();
        }, 350);
      };

      if (typeof window !== "undefined" && !window.__driveopsOnlineListener) {
        window.__driveopsOnlineListener = true;
        window.addEventListener("online", () => {
          const st = get();
          if (st._pendingSave) doSaveNow();
        });
      }

      // ---------------- Realtime
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

              // ✅ merge SAFE only (ignore UI)
              const next = mergeRemoteIntoState(st2, row.state_json);
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

      // ---------------- Hydrate (REMOTE -> LOCAL)
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

            await doSaveNow();
          } else {
            const merged = mergeRemoteIntoState({ ...get(), siteCode, dayDate }, row.state_json);

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
            setupStep: 1,
            apiStatus: "idle",
            apiError: "",
            _sessionLoadedKey: null,
            _subscribedKey: null,
          })),

        ensureSessionLoaded: async () => {
          await awaitHydrated();
          const s = get();
          await hydrateFromRemote(s.siteCode, s.dayDate);
        },

        // ---------- navigation (LOCAL only)
        goSetup: () => set((s) => ({ ...s, screen: "setup" })),
        goCockpit: () => set((s) => ({ ...s, screen: "cockpit" })),
        goAdmin: () => set((s) => ({ ...s, screen: "admin" })),

        setSetupStep: (setupStep) => set((s) => ({ ...s, setupStep })),

        // ---------- site/date (clé = site+date)
        setSiteCode: async (siteCode) => {
          await awaitHydrated();
          const v = String(siteCode || "").trim().toLowerCase();
          if (!v) return;

          set((s) => ({ ...s, siteCode: v, _sessionLoadedKey: null, apiStatus: "idle", apiError: "" }));
          await hydrateFromRemote(v, get().dayDate);
        },

        setDayDate: async (dayDate) => {
          await awaitHydrated();
          const d = String(dayDate || "").slice(0, 10);

          set((s) => ({ ...s, dayDate: d, _sessionLoadedKey: null, apiStatus: "idle", apiError: "" }));
          await hydrateFromRemote(get().siteCode, d);
        },

        // ---------- modes UI (LOCAL) ✅ pas de save remote ici
        setWallMode: (wallMode) => set((s) => ({ ...s, wallMode: !!wallMode })),
        enterPrintMode: () => set((s) => ({ ...s, printMode: true })),
        exitPrintMode: () => set((s) => ({ ...s, printMode: false })),

        setSyncBlocksToSystemClock: (value) => {
          set((s) => ({ ...s, syncBlocksToSystemClock: !!value }));
          scheduleSave(); // ✅ métier => remote ok
        },

        // ---------- pauses config
        setPauseWaveSize: (pauseWaveSize) => {
          set((s) => {
            const max = Math.max(1, s.dayStaff?.length || 1);
            const v = Math.max(1, Math.min(max, Number(pauseWaveSize) || 1));
            return { ...s, pauseWaveSize: v };
          });
          scheduleSave();
        },

        // ---------- référentiels
        addPreparateurToList: (name) => {
          const n = normalizeName(name);
          if (!n) return;
          set((s) => {
            if (s.preparateursList.includes(n)) return s;
            return { ...s, preparateursList: [...s.preparateursList, n].sort() };
          });
          scheduleSave();
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
          scheduleSave();
        },

        addCoordoToList: (name) => {
          const n = normalizeName(name);
          if (!n) return;
          set((s) => {
            if (s.coordosList.includes(n)) return s;
            return { ...s, coordosList: [...s.coordosList, n].sort() };
          });
          scheduleSave();
        },

        removeCoordoFromList: (name) => {
          const upper = normalizeName(name);
          set((s) => {
            const coordosList = (s.coordosList || []).filter((x) => x !== upper);
            const coordinator = normalizeName(s.coordinator) === upper ? "" : s.coordinator;
            return { ...s, coordosList, coordinator };
          });
          scheduleSave();
        },

        // ---------- config journée
        setCoordinator: (coordinator) => {
          const c = normalizeName(coordinator);
          set((s) => ({ ...s, coordinator: c }));
          scheduleSave();
        },

        toggleDayStaff: (name) => {
          const upper = normalizeName(name);
          if (!upper) return;

          set((s) => {
            const exists = s.dayStaff.includes(upper);
            const dayStaff = exists ? s.dayStaff.filter((x) => x !== upper) : [...s.dayStaff, upper].sort();

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

          scheduleSave();
        },

        // ---------- placement initial (setup)
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

          scheduleSave();
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

          scheduleSave();
        },

        setCurrentBlockManual: (blockId) => {
          set((s) => {
            const bid = String(blockId ?? "");
            const curId = normalizeBlockId(s.currentBlockId, s.horaires);

            // ✅ forcer mode manuel
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

          scheduleSave();
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

          scheduleSave();
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

          scheduleSave();
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

                scheduleSave();
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
              return { ...s, currentBlockId: curId, blockStartedAt: Date.now(), rotationImminent: false, rotationLocked: false };
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

          scheduleSave();
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
              if (!pauseTakenAt[upperNom]) pauseTakenAt = { ...pauseTakenAt, [upperNom]: Date.now() };
            }

            return { ...s, assignments, pausePrevPoste, pauseTakenAt };
          });

          scheduleSave();
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

          scheduleSave();
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

          scheduleSave();
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

          scheduleSave();
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

          scheduleSave();
        },
      };
    },
    {
      name: "driveops_v2",

      // ✅ IMPORTANT : on bump la version => purge/migration des vieux écrans collés (admin/cockpit)
      version: 2,

      onRehydrateStorage: () => (state, err) => {
        _hydrated = true;
        _resolveHydrated?.();
        state?.setHasHydrated?.(true);
        if (err) console.warn("driveops persist hydration error:", err);
      },

      // ✅ migration localStorage (si tu venais d’une version qui t’a collé screen=admin)
      migrate: (persisted, fromVersion) => {
        const p = persisted || {};
        if (!fromVersion || fromVersion < 2) {
          return {
            ...p,
            screen: "setup",
            setupStep: 1,
            wallMode: false,
            printMode: false,
          };
        }
        return p;
      },

      // ✅ local persist: ok de garder l’UI ici
      partialize: (s) => ({
        siteCode: s.siteCode,
        dayDate: s.dayDate,

        screen: s.screen,
        setupStep: s.setupStep,
        wallMode: s.wallMode,
        printMode: s.printMode,

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

        memberRole: s.memberRole,
      }),
    }
  )
);
