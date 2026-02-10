// src/store/useDriveStore.js
import { create } from "zustand";

const LS_KEY = "driveops_v2";

// ----------------- utils temps
function timeToMinutes(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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

/**
 * ✅ Timestamp du début de bloc.
 * - si useSystemDate=true => on aligne sur aujourd’hui (date système)
 * - sinon => on aligne sur dayDate (jour configuré)
 */
function blockStartTimestamp(dayDate, blockStartMin, useSystemDate) {
  const dateISO = useSystemDate ? todayISO() : dayDate;
  const base = new Date(`${dateISO}T00:00:00`);
  base.setMinutes(base.getMinutes() + blockStartMin);
  return base.getTime();
}

/**
 * ✅ buildBlocks minutes (rotationMinutes libre)
 * id = minute de début "360" (06:00)
 */
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

// ----------------- persistence
function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persist(state) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {}
}

/**
 * ✅ Migration :
 * - convertit currentBlockId legacy ("8") => minutes ("840")
 * - convertit les keys de assignments
 * - convertit keys de skipRotation / pausePrevPoste si présents
 */
function migrateSavedState(saved) {
  if (!saved) return saved;

  const horaires = saved.horaires || [];

  const migrateMapByBlock = (obj) => {
    const src = obj || {};
    const out = {};
    for (const oldKey of Object.keys(src)) {
      const newKey = normalizeBlockId(oldKey, horaires);
      out[newKey] = src[oldKey];
    }
    return out;
  };

  const assignments = migrateMapByBlock(saved.assignments);
  const skipRotation = migrateMapByBlock(saved.skipRotation);
  const pausePrevPoste = migrateMapByBlock(saved.pausePrevPoste);

  const currentBlockId = normalizeBlockId(saved.currentBlockId || "0", horaires);

  return {
    ...saved,
    assignments,
    skipRotation,
    pausePrevPoste,
    currentBlockId,
  };
}

// ----------------- default
const defaultState = {
  // UI
  screen: "setup",
  setupStep: 1,

  // Modes
  wallMode: false,
  printMode: false,

  // Référentiels
  preparateursList: ["STEVE", "THÉRY", "JOHN", "MIKE", "TOM"],
  coordosList: ["STEVE", "THÉRY", "JOHN"],

  // ✅ tes postes
  postes: ["PGC", "FS", "LIV", "MES", "LAD", "FLEG/SURG", "RE", "NET", "PAUSE"],

  horaires: [
    "06:00",
    "07:00",
    "08:00",
    "09:00",
    "10:00",
    "11:00",
    "12:00",
    "13:00",
    "14:00",
    "15:00",
    "16:00",
    "17:00",
    "18:00",
    "19:00",
    "20:00",
    "21:00",
  ],

  rotationMinutes: 120,
  rotationWarnMinutes: 10,

  pauseAfterMinutes: 180,
  pauseDurationMinutes: 30,

  pauseWaveSize: 1,

  // règle safe : sync seulement si dayDate = today
  syncBlocksToSystemClock: true,

  // Configuration journée
  dayDate: new Date().toISOString().slice(0, 10),
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

  // ✅ Skip rotation (par bloc)
  skipRotation: {},

  // ✅ Dernier poste du même bloc avant PAUSE
  pausePrevPoste: {},

  // ✅ micro feedback UI (badge ↩ Retour)
  returnAlertUntil: {},
};

export const useDriveStore = create((set, get) => {
  const savedRaw = load();
  const saved = migrateSavedState(savedRaw);
  const initial = saved ? saved : defaultState;

  // normalise au boot
  const bootBlockId = normalizeBlockId(initial.currentBlockId || "0", initial.horaires);

  const bootWave = Math.max(
    1,
    Math.min(initial.dayStaff?.length || 1, Number(initial.pauseWaveSize) || 1)
  );

  const boot = { ...initial, currentBlockId: bootBlockId, pauseWaveSize: bootWave };
  try {
    persist(boot);
  } catch {}

  // helpers
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

  return {
    ...boot,

    // ---------- navigation
    goSetup: () =>
      set((s) => {
        const serviceOn = !!(s.dayStartedAt || s.serviceStartedAt);
        const safeBlockId = serviceOn
          ? normalizeBlockId(s.currentBlockId, s.horaires)
          : getFirstBlockId(s.horaires, s.rotationMinutes);

        const next = { ...s, screen: "setup", currentBlockId: safeBlockId };
        persist(next);
        return next;
      }),

    goCockpit: () =>
      set((s) => {
        const next = { ...s, screen: "cockpit" };
        persist(next);
        return next;
      }),

    setSetupStep: (setupStep) =>
      set((s) => {
        const next = { ...s, setupStep };
        persist(next);
        return next;
      }),

    // ---------- modes UI
    setWallMode: (wallMode) =>
      set((s) => {
        const next = { ...s, wallMode: !!wallMode };
        persist(next);
        return next;
      }),

    enterPrintMode: () =>
      set((s) => {
        const next = { ...s, printMode: true };
        persist(next);
        return next;
      }),

    exitPrintMode: () =>
      set((s) => {
        const next = { ...s, printMode: false };
        persist(next);
        return next;
      }),

    // ---------- pauses config
    setPauseWaveSize: (pauseWaveSize) =>
      set((s) => {
        const max = Math.max(1, s.dayStaff?.length || 1);
        const v = Math.max(1, Math.min(max, Number(pauseWaveSize) || 1));
        const next = { ...s, pauseWaveSize: v };
        persist(next);
        return next;
      }),

    // toggle sync bloc ↔ heure PC
    setSyncBlocksToSystemClock: (value) =>
      set((s) => {
        const next = { ...s, syncBlocksToSystemClock: !!value };
        persist(next);
        return next;
      }),

    /**
     * ✅ Smart Fill (bloc courant)
     * Remplit uniquement les vides du bloc courant
     * en réutilisant les postes déjà utilisés sur ce même bloc (hors PAUSE).
     */
    fillMissingAssignmentsFromCurrentBlock: () =>
      set((s) => {
        const bid = normalizeBlockId(s.currentBlockId, s.horaires);
        const { assignments, skipRotation, pausePrevPoste } = ensureBlockMaps(s, bid);

        const curMap = assignments[bid] || {};
        const staff = (s.dayStaff || []).map(normalizeName);

        const missing = staff.filter((n) => !normalizePoste(curMap[n]));
        if (missing.length === 0) return s;

        const pool = staff
          .map((n) => normalizePoste(curMap[n]))
          .filter((p) => p && p !== "PAUSE");

        if (pool.length === 0) return s;

        const nextMap = { ...curMap };
        let i = 0;

        for (const n of missing) {
          nextMap[n] = pool[i % pool.length];
          i++;
        }

        assignments[bid] = nextMap;

        const next = { ...s, assignments, skipRotation, pausePrevPoste, currentBlockId: bid };
        persist(next);
        return next;
      }),

    /**
     * ✅ Remplit les postes manquants sur le bloc courant
     * en copiant le bloc précédent (uniquement les vides).
     */
    fillMissingAssignmentsFromPrevBlock: () =>
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

        const next = { ...s, assignments, skipRotation, pausePrevPoste, currentBlockId: bid };
        persist(next);
        return next;
      }),

    /**
     * ✅ FORCER UN BLOC MANUELLEMENT
     */
    setCurrentBlockManual: (blockId) =>
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

        const next = {
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

        persist(next);
        return next;
      }),

    // ---------- référentiels
    addPreparateurToList: (name) =>
      set((s) => {
        const n = normalizeName(name);
        if (!n || s.preparateursList.includes(n)) return s;
        const next = { ...s, preparateursList: [...s.preparateursList, n].sort() };
        persist(next);
        return next;
      }),

    removePreparateurFromList: (name) =>
      set((s) => {
        const upper = normalizeName(name);
        const preparateursList = s.preparateursList.filter((x) => x !== upper);
        const dayStaff = s.dayStaff.filter((x) => x !== upper);

        const assignments = { ...s.assignments };
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

        const next = {
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
        persist(next);
        return next;
      }),

    addCoordoToList: (name) =>
      set((s) => {
        const n = normalizeName(name);
        if (!n || s.coordosList.includes(n)) return s;
        const next = { ...s, coordosList: [...s.coordosList, n].sort() };
        persist(next);
        return next;
      }),

    removeCoordoFromList: (name) =>
      set((s) => {
        const upper = normalizeName(name);
        const coordosList = s.coordosList.filter((x) => x !== upper);
        const nextCoordinator = s.coordinator === upper ? "" : s.coordinator;
        const next = { ...s, coordosList, coordinator: nextCoordinator };
        persist(next);
        return next;
      }),

    // ---------- config journée
    setDayDate: (dayDate) =>
      set((s) => {
        const next = { ...s, dayDate };
        persist(next);
        return next;
      }),

    setCoordinator: (coordinator) =>
      set((s) => {
        const next = { ...s, coordinator };
        persist(next);
        return next;
      }),

    toggleDayStaff: (name) =>
      set((s) => {
        const upper = normalizeName(name);
        if (!upper) return s;

        const exists = s.dayStaff.includes(upper);
        const dayStaff = exists ? s.dayStaff.filter((x) => x !== upper) : [...s.dayStaff, upper].sort();

        const serviceOn = !!(s.dayStartedAt || s.serviceStartedAt);
        const setupBlockId = getFirstBlockId(s.horaires, s.rotationMinutes);

        const assignments = { ...s.assignments };
        if (!serviceOn && assignments[setupBlockId]) {
          const copy = { ...assignments[setupBlockId] };
          if (exists) delete copy[upper];
          assignments[setupBlockId] = copy;
        }

        const skipRotation = { ...(s.skipRotation || {}) };
        if (!serviceOn && skipRotation[setupBlockId]) {
          const copy = { ...skipRotation[setupBlockId] };
          if (exists) delete copy[upper];
          skipRotation[setupBlockId] = copy;
        }

        const pausePrevPoste = { ...(s.pausePrevPoste || {}) };
        if (!serviceOn && pausePrevPoste[setupBlockId]) {
          const copy = { ...pausePrevPoste[setupBlockId] };
          if (exists) delete copy[upper];
          pausePrevPoste[setupBlockId] = copy;
        }

        const pauseWaveSize = Math.max(1, Math.min(dayStaff.length || 1, s.pauseWaveSize || 1));

        const next = {
          ...s,
          dayStaff,
          assignments,
          skipRotation,
          pausePrevPoste,
          pauseWaveSize,
          currentBlockId: serviceOn
            ? normalizeBlockId(s.currentBlockId || setupBlockId, s.horaires)
            : setupBlockId,
        };
        persist(next);
        return next;
      }),

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

        const next = { ...prev, assignments, currentBlockId: blockId };
        persist(next);
        return next;
      });
    },

    // ---------- skip rotation
    toggleSkipRotation: (blockId, nom) =>
      set((s) => {
        const bid = normalizeBlockId(blockId, s.horaires);
        const upperNom = normalizeName(nom);
        if (!upperNom) return s;

        const skipRotation = { ...(s.skipRotation || {}) };
        if (!skipRotation[bid]) skipRotation[bid] = {};
        skipRotation[bid] = { ...skipRotation[bid], [upperNom]: !skipRotation[bid][upperNom] };

        const next = { ...s, skipRotation };
        persist(next);
        return next;
      }),

    clearSkipRotationForBlock: (blockId) =>
      set((s) => {
        const bid = normalizeBlockId(blockId, s.horaires);
        const skipRotation = { ...(s.skipRotation || {}) };
        skipRotation[bid] = {};
        const next = { ...s, skipRotation };
        persist(next);
        return next;
      }),

    // ---------- runtime
    startService: () =>
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

        const pauseTakenAt = {};
        s.dayStaff.forEach((n) => (pauseTakenAt[normalizeName(n)] = null));

        const nowMs = Date.now();
        const blockStartedAt = sysStartMin != null ? blockStartTimestamp(s.dayDate, sysStartMin, true) : nowMs;

        const skipRotation = { ...(s.skipRotation || {}) };
        if (!skipRotation[first]) skipRotation[first] = {};

        const pausePrevPoste = { ...(s.pausePrevPoste || {}) };
        if (!pausePrevPoste[first]) pausePrevPoste[first] = {};

        const next = {
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

        persist(next);
        return next;
      }),

    stopService: () =>
      set((s) => {
        const first = getFirstBlockId(s.horaires, s.rotationMinutes);

        const next = {
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

        persist(next);
        return next;
      }),

    // tick: SAFE sync bloc sur l'heure système (si dayDate=today) + rotation imminent/locked
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
            const assignments = { ...(s.assignments || {}) };
            const skipRotation = { ...(s.skipRotation || {}) };
            const pausePrevPoste = { ...(s.pausePrevPoste || {}) };

            if (!assignments[sysBlockId]) {
              const prev = assignments?.[currentId] || {};
              const carried = {};
              (s.dayStaff || []).forEach((n) => {
                const nn = normalizeName(n);
                carried[nn] = prev[nn] ?? "";
              });
              assignments[sysBlockId] = carried;
            }

            if (!skipRotation[sysBlockId]) {
              skipRotation[sysBlockId] = {};
            }

            if (!pausePrevPoste[sysBlockId]) {
              const prevPrev = pausePrevPoste?.[currentId] || {};
              const carriedPrev = {};
              (s.dayStaff || []).forEach((n) => {
                const nn = normalizeName(n);
                carriedPrev[nn] = prevPrev[nn] ?? "";
              });
              pausePrevPoste[sysBlockId] = carriedPrev;
            }

            const nextPatch = {
              currentBlockId: sysBlockId,
              blockStartedAt: blockStartTimestamp(s.dayDate, sysStartMin, true),
              assignments,
              skipRotation,
              pausePrevPoste,
              rotationImminent: false,
              rotationLocked: false,
            };

            set(nextPatch);
            persist({ ...s, ...nextPatch, currentBlockId: sysBlockId });
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

    // ✅ rotation manuelle : bloc suivant + carry-over + reset timer bloc
    // ✅ SKIP FORT : si skip sur le bloc courant => poste forcé du bloc courant vers le bloc suivant
    // ✅ GUARD : refuse si postes manquants sur bloc courant
    validateRotation: () =>
      set((s) => {
        const blocks = buildBlocks(s.horaires, s.rotationMinutes);
        const curId = normalizeBlockId(s.currentBlockId, s.horaires);

        // ✅ GUARD : tout le monde doit avoir un poste (hors vide)
        const currentMap = (s.assignments || {})[curId] || {};
        const missing = (s.dayStaff || []).filter((raw) => {
          const n = normalizeName(raw);
          const p = normalizePoste(currentMap[n]);
          return !p; // vide => bloquant
        });
        if (missing.length > 0) {
          return s;
        }

        const currentIndex = blocks.findIndex((b) => b.id === curId);

        if (currentIndex < 0) {
          const next = {
            ...s,
            currentBlockId: curId,
            blockStartedAt: Date.now(),
            rotationImminent: false,
            rotationLocked: false,
          };
          persist(next);
          return next;
        }

        const nextObj = blocks[currentIndex + 1] || null;
        if (!nextObj) {
          const next = {
            ...s,
            currentBlockId: curId,
            blockStartedAt: Date.now(),
            rotationImminent: false,
            rotationLocked: false,
          };
          persist(next);
          return next;
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

        // reset skip sur le nouveau bloc
        skipRotation[nextBlockId] = {};

        const next = {
          ...s,
          assignments,
          skipRotation,
          blockStartedAt: Date.now(),
          currentBlockId: nextBlockId,
          rotationImminent: false,
          rotationLocked: false,
        };

        persist(next);
        return next;
      }),

    /**
     * ✅ Set assignment
     * - si on passe en PAUSE : stocke l’ancien poste DU MÊME BLOC
     * - pauseTakenAt est rempli au premier passage en pause
     */
    setAssignment: (blockId, nom, poste) =>
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

        const next = { ...s, assignments, pausePrevPoste, pauseTakenAt };
        persist(next);
        return next;
      }),

    /**
     * ✅ ↩ Retour poste : remet l’ancien poste du même bloc
     */
    returnFromPause: (blockId, nom) =>
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

        const next = { ...s, assignments, returnAlertUntil };
        persist(next);
        return next;
      }),

    /**
     * ✅ ↩ Retour poste (tous) : seulement ceux dont la pause est terminée, sur le bloc courant
     */
    returnAllEndedPausesCurrentBlock: () =>
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

        const next = { ...s, assignments, returnAlertUntil, pausePrevPoste };
        persist(next);
        return next;
      }),

    /**
     * ✅ Reset JOURNÉE (prod/terrain)
     * -> garde les référentiels (préparateurs/coordos/postes/règles/horaires)
     */
    resetDay: () =>
      set((s) => {
        const first = getFirstBlockId(s.horaires, s.rotationMinutes);
        const next = {
          ...s,

          // UI / modes
          screen: "setup",
          setupStep: 1,
          wallMode: false,
          printMode: false,

          // journée
          dayDate: todayISO(),
          coordinator: "",
          dayStaff: [],

          // runtime
          dayStartedAt: null,
          blockStartedAt: null,
          serviceStartedAt: null,
          currentBlockId: first,
          rotationImminent: false,
          rotationLocked: false,

          // data runtime
          assignments: {},
          pauseTakenAt: {},
          skipRotation: {},
          pausePrevPoste: {},
          returnAlertUntil: {},

          // safety: on revient en auto
          syncBlocksToSystemClock: true,
        };

        persist(next);
        return next;
      }),

    /**
     * ✅ Reset USINE (dev only)
     * -> remet ABSOLUMENT tout à defaultState
     */
    resetFactory: () =>
      set(() => {
        persist(defaultState);
        return defaultState;
      }),
  };
});
