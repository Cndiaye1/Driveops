// src/store/useDriveStore.js
import { create } from "zustand";
import { supabase } from "../services/supabaseClient";

// -----------------------------------------------------
// ENV
const SITE_CODE = (import.meta.env.VITE_SITE_CODE || "MELUN").trim().toUpperCase();

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
// Remote (Supabase) helpers
const TABLE = "drive_sessions";

function sessionKey(siteCode, dayDate) {
  return `${siteCode}__${dayDate}`;
}

function serializeState(s) {
  // ✅ on enregistre UNIQUEMENT les données métier (pas les fonctions / flags internes)
  return {
    // meta
    siteCode: s.siteCode,
    dayDate: s.dayDate,

    // UI
    screen: s.screen,
    setupStep: s.setupStep,
    wallMode: s.wallMode,
    printMode: s.printMode,

    // référentiels
    preparateursList: s.preparateursList,
    coordosList: s.coordosList,
    postes: s.postes,
    horaires: s.horaires,

    // règles
    rotationMinutes: s.rotationMinutes,
    rotationWarnMinutes: s.rotationWarnMinutes,
    pauseAfterMinutes: s.pauseAfterMinutes,
    pauseDurationMinutes: s.pauseDurationMinutes,
    pauseWaveSize: s.pauseWaveSize,
    syncBlocksToSystemClock: s.syncBlocksToSystemClock,

    // config journée
    coordinator: s.coordinator,
    dayStaff: s.dayStaff,

    // runtime
    dayStartedAt: s.dayStartedAt,
    blockStartedAt: s.blockStartedAt,
    serviceStartedAt: s.serviceStartedAt,
    currentBlockId: s.currentBlockId,
    rotationImminent: s.rotationImminent,
    rotationLocked: s.rotationLocked,

    // data runtime
    assignments: s.assignments,
    pauseTakenAt: s.pauseTakenAt,
    skipRotation: s.skipRotation,
    pausePrevPoste: s.pausePrevPoste,
    returnAlertUntil: s.returnAlertUntil,
  };
}

function mergeRemoteIntoState(defaults, remoteJson) {
  if (!remoteJson || typeof remoteJson !== "object") return defaults;

  // ✅ petit garde-fou: si remote a des vieux IDs bloc legacy -> normalise
  const horaires = remoteJson.horaires || defaults.horaires;

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
    ...remoteJson,
  };

  merged.horaires = horaires;
  merged.currentBlockId = normalizeBlockId(merged.currentBlockId || "0", horaires);

  merged.assignments = migrateMapByBlock(merged.assignments);
  merged.skipRotation = migrateMapByBlock(merged.skipRotation);
  merged.pausePrevPoste = migrateMapByBlock(merged.pausePrevPoste);

  // ✅ clamps
  const staffLen = merged.dayStaff?.length || 1;
  merged.pauseWaveSize = Math.max(1, Math.min(staffLen, Number(merged.pauseWaveSize) || 1));

  return merged;
}

// -----------------------------------------------------
// Defaults (ton app)
const defaultState = {
  // meta
  siteCode: SITE_CODE,

  // UI
  screen: "setup",
  setupStep: 1,

  // Modes
  wallMode: false,
  printMode: false,

  // Référentiels (tu peux les modifier dans Setup)
  preparateursList: ["STEVE", "THÉRY", "JOHN", "MIKE", "TOM"],
  coordosList: ["STEVE", "THÉRY", "JOHN"],

  // Postes (tes postes)
  postes: ["PGC", "FS", "LIV", "MES", "LAD", "FLEG/SURG", "RE", "NET", "PAUSE"],

  // Horaires
  horaires: [
    "06:00","07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00",
    "16:00","17:00","18:00","19:00","20:00","21:00",
  ],

  // Règles
  rotationMinutes: 120,
  rotationWarnMinutes: 10,
  pauseAfterMinutes: 180,
  pauseDurationMinutes: 30,
  pauseWaveSize: 1,
  syncBlocksToSystemClock: true,

  // Config journée
  dayDate: todayISO(),
  coordinator: "",
  dayStaff: [],

  // Runtime
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

  // Flags sync
  _sessionLoadedKey: null,
  _subscribedKey: null,
  _saving: false,
  _lastRemoteUpdatedAt: null,
  _lastLocalWriteAt: 0,
  _error: null,
};

// -----------------------------------------------------
// Store
export const useDriveStore = create((set, get) => {
  // ---------------- helpers state maps
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

  // ---------------- Remote: load + save + realtime
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

  let saveTimer = null;
  const scheduleSave = () => {
    const s = get();
    if (!s._sessionLoadedKey) return; // pas encore chargé => on évite d’écraser

    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const st = get();
      try {
        set({ _saving: true, _error: null });
        const body = serializeState(st);
        await upsertSession(st.siteCode, st.dayDate, body);
        set({ _saving: false, _lastLocalWriteAt: Date.now() });
      } catch (e) {
        set({ _saving: false, _error: String(e?.message || e) });
      }
    }, 350); // debounce
  };

  const ensureRealtimeSubscribed = async (siteCode, dayDate) => {
    const key = sessionKey(siteCode, dayDate);
    const st = get();
    if (st._subscribedKey === key) return;

    // unsubscribe précédent
    if (st._subscribedKey) {
      try {
        supabase.removeAllChannels();
      } catch {}
    }

    const channel = supabase
      .channel(`drive_sessions_${key}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TABLE, filter: `site_code=eq.${siteCode}` },
        async (payload) => {
          // On ne hydrate que si c'est le bon day_date
          const row = payload?.new || payload?.old;
          if (!row) return;
          if (String(row.day_date) !== String(dayDate)) return;

          // ✅ Remote écrase local (mais seulement si ce n’est pas nous qui venons d’écrire)
          const now = Date.now();
          const st2 = get();
          const remoteUpdatedAt = row.updated_at ? new Date(row.updated_at).getTime() : 0;

          // si on vient d’écrire localement (dernières 700ms), on ignore l’écho réseau
          if (now - (st2._lastLocalWriteAt || 0) < 700) return;

          const next = mergeRemoteIntoState(st2, row.state_json);
          set({
            ...next,
            _lastRemoteUpdatedAt: row.updated_at || null,
            _error: null,
          });
        }
      )
      .subscribe();

    set({ _subscribedKey: key });
    return channel;
  };

  const hydrateFromRemote = async (siteCode, dayDate) => {
    const key = sessionKey(siteCode, dayDate);
    const st = get();
    if (st._sessionLoadedKey === key) return;

    set({ _error: null });

    try {
      const row = await loadSession(siteCode, dayDate);

      if (!row) {
        // ✅ si rien en remote, on crée une session vide (sans casser tes defaults)
        const base = { ...defaultState, siteCode, dayDate };
        base.currentBlockId = getFirstBlockId(base.horaires, base.rotationMinutes);
        set({
          ...base,
          _sessionLoadedKey: key,
          _lastRemoteUpdatedAt: null,
        });
        await upsertSession(siteCode, dayDate, serializeState(get()));
      } else {
        const merged = mergeRemoteIntoState(
          { ...defaultState, siteCode, dayDate },
          row.state_json
        );
        // ✅ remote écrase local
        set({
          ...merged,
          _sessionLoadedKey: key,
          _lastRemoteUpdatedAt: row.updated_at || null,
        });
      }

      await ensureRealtimeSubscribed(siteCode, dayDate);
    } catch (e) {
      set({ _error: String(e?.message || e) });
    }
  };

  // -----------------------------------------------------
  // Public API store
  return {
    ...defaultState,

    // ✅ à appeler au démarrage (Setup/Cockpit)
    ensureSessionLoaded: async () => {
      const s = get();
      await hydrateFromRemote(s.siteCode, s.dayDate);
    },

    // ---------- navigation
    goSetup: () => set((s) => ({ ...s, screen: "setup" })),
    goCockpit: () => set((s) => ({ ...s, screen: "cockpit" })),

    setSetupStep: (setupStep) => set((s) => ({ ...s, setupStep })),

    // ---------- modes UI
    setWallMode: (wallMode) => set((s) => ({ ...s, wallMode: !!wallMode })),
    enterPrintMode: () => set((s) => ({ ...s, printMode: true })),
    exitPrintMode: () => set((s) => ({ ...s, printMode: false })),

    // ---------- sync blocks
    setSyncBlocksToSystemClock: (value) => {
      set((s) => ({ ...s, syncBlocksToSystemClock: !!value }));
      scheduleSave();
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
        const coordinator = s.coordinator === upper ? "" : s.coordinator;
        return { ...s, coordosList, coordinator };
      });
      scheduleSave();
    },

    // ---------- config journée
    setDayDate: async (dayDate) => {
      const d = String(dayDate || "").slice(0, 10);
      set((s) => ({ ...s, dayDate: d, _sessionLoadedKey: null })); // force reload
      await hydrateFromRemote(get().siteCode, d);
    },

    setCoordinator: (coordinator) => {
      set((s) => ({ ...s, coordinator }));
      scheduleSave();
    },

    toggleDayStaff: (name) => {
      const upper = normalizeName(name);
      if (!upper) return;

      set((s) => {
        const exists = s.dayStaff.includes(upper);
        const dayStaff = exists ? s.dayStaff.filter((x) => x !== upper) : [...s.dayStaff, upper].sort();

        const pauseWaveSize = Math.max(1, Math.min(dayStaff.length || 1, s.pauseWaveSize || 1));

        // Si on est en setup (service pas lancé), on garde cohérence sur le premier bloc
        const serviceOn = !!(s.dayStartedAt || s.serviceStartedAt);
        const setupBlockId = getFirstBlockId(s.horaires, s.rotationMinutes);

        const assignments = { ...s.assignments };
        const bid = serviceOn ? normalizeBlockId(s.currentBlockId || setupBlockId, s.horaires) : setupBlockId;

        if (!assignments[bid]) assignments[bid] = {};
        const copy = { ...assignments[bid] };

        if (exists) delete copy[upper];
        else copy[upper] = copy[upper] ?? "";

        assignments[bid] = copy;

        return {
          ...s,
          dayStaff,
          pauseWaveSize,
          assignments,
          currentBlockId: bid,
        };
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

    // ---------- smart fill
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

    // ---------- FORCER bloc (désactive sync)
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

      scheduleSave();
    },

    // ---------- runtime
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
          if (!pauseTakenAt[upperNom]) {
            pauseTakenAt = { ...pauseTakenAt, [upperNom]: Date.now() };
          }
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

    // ✅ Reset JOURNÉE (garde référentiels + règles)
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
});
