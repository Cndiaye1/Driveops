// src/utils/planning.js

// -----------------------------------------------------
// Constantes / codes RH
export const RH_CODES = ["RH", "CP", "OFF", "ABS", "MAL", "AT"];
export const NON_WORKED_CODES = new Set(["RH", "CP", "OFF", "ABS", "MAL", "AT"]);

// -----------------------------------------------------
// Temps
export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function timeToMinutes(hhmm) {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

export function minutesToTime(totalMin) {
  const m = Math.max(0, Number(totalMin) || 0);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${pad2(h)}:${pad2(mm)}`;
}

export function formatMinutesToHoursLabel(totalMin) {
  const sign = (Number(totalMin) || 0) < 0 ? "-" : "";
  const abs = Math.abs(Number(totalMin) || 0);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}h${String(m).padStart(2, "0")}`;
}

// -----------------------------------------------------
// Helpers dates / semaine (alignés store RH)
export function toISODate(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

/**
 * Retourne le lundi de la semaine courante au format ISO YYYY-MM-DD
 * (calcul local, évite les effets UTC)
 */
export function getMondayISO(baseDate = new Date()) {
  const d = new Date(baseDate);
  d.setHours(0, 0, 0, 0);
  const jsDay = d.getDay(); // 0=dim ... 6=sam
  const diff = jsDay === 0 ? -6 : 1 - jsDay;
  d.setDate(d.getDate() + diff);
  return toISODate(d);
}

/**
 * weekStartISO = lundi (YYYY-MM-DD)
 * Retourne [lun, mar, ..., dim] en ISO
 */
export function buildWeekDatesFromMonday(weekStartISO) {
  const [y, m, d] = String(weekStartISO || "").split("-").map(Number);
  const base = new Date(y || 2000, (m || 1) - 1, d || 1);
  base.setHours(0, 0, 0, 0);

  const out = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(base);
    x.setDate(base.getDate() + i);
    out.push(toISODate(x));
  }
  return out;
}

// -----------------------------------------------------
// Shifts "bibliothèque" (base)
export const DEFAULT_SHIFT_LIBRARY = [
  { id: "MATIN", label: "Matin", start: "06:00", end: "13:30" },
  { id: "JOURNEE", label: "Journée", start: "09:00", end: "17:00" },
  { id: "FERMETURE", label: "Fermeture", start: "13:30", end: "21:00" },
  { id: "COURT_MATIN", label: "Court matin", start: "06:00", end: "10:00" },
  { id: "MIDI", label: "Midi", start: "11:00", end: "15:00" },
  { id: "SOIR", label: "Soir", start: "17:00", end: "21:30" },
];

export function shiftDurationMinutes(start, end) {
  const a = timeToMinutes(start);
  const b = timeToMinutes(end);
  if (a == null || b == null) return 0;
  // si un jour tu veux gérer nuit, on pourra ajuster ici
  if (b <= a) return 0;
  return b - a;
}

export function buildShiftCellValue(start, end, code = "") {
  const s = String(start || "").trim();
  const e = String(end || "").trim();
  const c = String(code || "").trim().toUpperCase();

  if (!s || !e) return c || "";
  return c ? `${s}-${e} / ${c}` : `${s}-${e}`;
}

// -----------------------------------------------------
// Parsing cellule (compat legacy string)
function normalizeRawCell(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  // Compat future : si tu stockes déjà un objet
  if (typeof value === "object") {
    try {
      return String(value.label || value.raw || "").trim();
    } catch {
      return "";
    }
  }
  return String(value).trim();
}

/**
 * Retour standardisé (legacy UI parsing) :
 * {
 *   raw, type: "empty"|"code"|"shift",
 *   start, end, code, label,
 *   minutes, workedMinutes
 * }
 */
export function parseCellValue(value) {
  const raw = normalizeRawCell(value);

  const empty = {
    raw,
    type: "empty",
    start: "",
    end: "",
    code: "",
    label: "",
    minutes: 0,
    workedMinutes: 0,
  };

  if (!raw) return empty;

  // Ex: "06:00-13:30 / RH" ou "06:00-13:30/RH"
  const richShiftMatch = raw.match(
    /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})(?:\s*\/\s*([A-Za-zÀ-ÿ0-9_-]+))?$/i
  );
  if (richShiftMatch) {
    const start = richShiftMatch[1];
    const end = richShiftMatch[2];
    const code = String(richShiftMatch[3] || "").trim().toUpperCase();
    const minutes = shiftDurationMinutes(start, end);

    // si code RH est présent avec shift, on considère 0 heure travaillée
    const workedMinutes = code && NON_WORKED_CODES.has(code) ? 0 : minutes;

    return {
      raw,
      type: "shift",
      start,
      end,
      code,
      label: code ? `${start}-${end} / ${code}` : `${start}-${end}`,
      minutes,
      workedMinutes,
    };
  }

  // Ex: "RH", "CP", "OFF"
  const upper = raw.toUpperCase();
  if (RH_CODES.includes(upper)) {
    return {
      raw,
      type: "code",
      start: "",
      end: "",
      code: upper,
      label: upper,
      minutes: 0,
      workedMinutes: 0,
    };
  }

  // Ex: "06:00-13:30" (déjà couvert par regex ci-dessus normalement)
  const plainShift = raw.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
  if (plainShift) {
    const start = plainShift[1];
    const end = plainShift[2];
    const minutes = shiftDurationMinutes(start, end);
    return {
      raw,
      type: "shift",
      start,
      end,
      code: "",
      label: `${start}-${end}`,
      minutes,
      workedMinutes: minutes,
    };
  }

  // fallback texte libre (traité comme code non travaillé pour éviter de sur-compter)
  return {
    raw,
    type: "code",
    start: "",
    end: "",
    code: upper,
    label: raw,
    minutes: 0,
    workedMinutes: 0,
  };
}

// -----------------------------------------------------
// ✅ Parsing pour STORE RH (usePlanningStore)
// Format attendu en retour :
// - { kind: "empty" }
// - { kind: "invalid", error }
// - { kind: "value", entry_type, start_time, end_time, break_minutes, label }
export function parseCellInput(rawInput) {
  const raw = String(rawInput ?? "").trim();

  if (!raw) return { kind: "empty" };

  const upper = raw.toUpperCase();

  // Code RH seul
  if (RH_CODES.includes(upper)) {
    return {
      kind: "value",
      entry_type: upper, // RH / CP / OFF / ABS / MAL / AT
      start_time: null,
      end_time: null,
      break_minutes: 0,
      label: upper,
    };
  }

  // Shift + suffixe optionnel :
  //  - "06:00-13:30"
  //  - "06:00-13:30 /30"
  //  - "06:00-13:30 / RH"
  const m = raw.match(
    /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})(?:\s*\/\s*([A-Za-zÀ-ÿ0-9_-]+))?$/i
  );

  if (!m) {
    return {
      kind: "invalid",
      error: "Format attendu : 06:00-13:30, 06:00-13:30 /30, RH, CP, OFF...",
    };
  }

  const start = m[1];
  const end = m[2];
  const suffixRaw = String(m[3] || "").trim().toUpperCase();

  const startMin = timeToMinutes(start);
  const endMin = timeToMinutes(end);

  if (startMin == null || endMin == null) {
    return { kind: "invalid", error: "Heure invalide." };
  }

  if (endMin <= startMin) {
    return { kind: "invalid", error: "L’heure de fin doit être après l’heure de début." };
  }

  // suffixe numérique = pause (minutes)
  if (suffixRaw) {
    if (/^\d+$/.test(suffixRaw)) {
      const breakMinutes = Number(suffixRaw);
      if (!Number.isFinite(breakMinutes) || breakMinutes < 0 || breakMinutes > 300) {
        return { kind: "invalid", error: "Pause invalide (minutes)." };
      }

      return {
        kind: "value",
        entry_type: "shift",
        start_time: start,
        end_time: end,
        break_minutes: breakMinutes,
        label: null,
      };
    }

    // suffixe code RH (ex: "06:00-13:30 / RH")
    if (RH_CODES.includes(suffixRaw)) {
      return {
        kind: "value",
        entry_type: suffixRaw,
        start_time: null,
        end_time: null,
        break_minutes: 0,
        label: `${start}-${end}`, // info indicative conservée
      };
    }

    return {
      kind: "invalid",
      error: "Suffixe invalide : utilise /30 ou un code RH (RH, CP, OFF...).",
    };
  }

  // shift simple
  return {
    kind: "value",
    entry_type: "shift",
    start_time: start,
    end_time: end,
    break_minutes: 0,
    label: null,
  };
}

// -----------------------------------------------------
// ✅ Helpers store RH (matrix / calculs)
function upperName(v) {
  return String(v || "").trim().toUpperCase();
}

/**
 * staff = [{ staff_name, ... }]
 * -> { STAFF: {0:null,1:null,...6:null} }
 */
export function makeEmptyWeekMatrix(staff = []) {
  const matrix = {};
  for (const s of Array.isArray(staff) ? staff : []) {
    const name = upperName(s?.staff_name);
    if (!name) continue;
    matrix[name] = {};
    for (let d = 0; d < 7; d++) matrix[name][d] = null;
  }
  return matrix;
}

/**
 * Calcul des heures à partir d'une entrée DB (drive_planning_entries)
 * - shift => durée - pause
 * - RH/CP/OFF/... => 0
 * Retour en heures (float)
 */
export function entryToHours(entry) {
  if (!entry || typeof entry !== "object") return 0;

  const type = String(entry.entry_type || "").toUpperCase();
  if (!type) return 0;

  if (type !== "SHIFT") return 0;

  const start = entry.start_time;
  const end = entry.end_time;
  const a = timeToMinutes(start);
  const b = timeToMinutes(end);

  if (a == null || b == null || b <= a) return 0;

  const gross = b - a;
  const breakMin = Math.max(0, Number(entry.break_minutes) || 0);
  const worked = Math.max(0, gross - breakMin);

  return Math.round((worked / 60) * 100) / 100;
}

// -----------------------------------------------------
// Calculs RH (legacy / UI)
export function getCellWorkedMinutes(value) {
  return parseCellValue(value).workedMinutes || 0;
}

export function getRowWorkedMinutes(row, dayKeys) {
  if (!row) return 0;
  const keys = Array.isArray(dayKeys) ? dayKeys : [];
  return keys.reduce((sum, key) => sum + getCellWorkedMinutes(row?.days?.[key]), 0);
}

export function getRowWorkedHoursLabel(row, dayKeys) {
  return formatMinutesToHoursLabel(getRowWorkedMinutes(row, dayKeys));
}

/**
 * contractHours : ex 35 / 25 / 20
 */
export function getContractTargetMinutes(contractHours) {
  const h = Number(contractHours);
  if (!Number.isFinite(h) || h < 0) return 0;
  return Math.round(h * 60);
}

/**
 * Retour :
 * {
 *   targetMinutes,
 *   workedMinutes,
 *   deltaMinutes, // worked - target
 *   absDeltaMinutes,
 *   status: "under" | "ok" | "over"
 * }
 */
export function getContractDelta({ contractHours, workedMinutes, toleranceMinutes = 15 }) {
  const targetMinutes = getContractTargetMinutes(contractHours);
  const worked = Math.max(0, Number(workedMinutes) || 0);
  const deltaMinutes = worked - targetMinutes;
  const absDeltaMinutes = Math.abs(deltaMinutes);

  let status = "ok";
  if (deltaMinutes < -toleranceMinutes) status = "under";
  if (deltaMinutes > toleranceMinutes) status = "over";

  return {
    targetMinutes,
    workedMinutes: worked,
    deltaMinutes,
    absDeltaMinutes,
    status,
  };
}

export function getDeltaBadge(deltaInfo) {
  const info = deltaInfo || {};
  const status = info.status || "ok";
  const deltaLabel = formatMinutesToHoursLabel(info.deltaMinutes || 0);

  if (status === "under") {
    return {
      label: `Sous (${deltaLabel})`,
      tone: "under",
      title: "Sous-planifié vs contrat",
    };
  }
  if (status === "over") {
    return {
      label: `Sur (${deltaLabel.replace(/^-/, "+")})`,
      tone: "over",
      title: "Sur-planifié vs contrat",
    };
  }
  return {
    label: "OK",
    tone: "ok",
    title: "Écart contrat dans la tolérance",
  };
}

// -----------------------------------------------------
// Affichage cellule (pour UI plus lisible)
export function getCellDisplayParts(value) {
  const p = parseCellValue(value);

  if (p.type === "empty") {
    return {
      type: "empty",
      main: "",
      badge: "",
      code: "",
      isWorked: false,
    };
  }

  if (p.type === "code") {
    return {
      type: "code",
      main: p.code || p.label,
      badge: p.code || "",
      code: p.code || "",
      isWorked: false,
    };
  }

  // shift
  return {
    type: "shift",
    main: p.start && p.end ? `${p.start}-${p.end}` : p.label,
    badge: p.code || "",
    code: p.code || "",
    isWorked: p.workedMinutes > 0,
  };
}