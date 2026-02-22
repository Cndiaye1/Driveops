// src/utils/planningRules.js
// DriveOps — RH Planning Rules (stable signatures + aliases)
// Aucun import externe. Compatible JS/JSX (Vite).

export const DAY_KEYS_MON_START = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const ABSENCE_CODES = ["RH", "CP", "OFF", "AT", "MAL", "ABS"];
export const REST_CODES = ["RH", "OFF"];
export const MEDICAL_ABSENCE_CODES = ["AT", "MAL", "ABS"];

const ABSENCE_SET = new Set(ABSENCE_CODES);

export const DEFAULT_RULES = {
  maxAmplitudeMinutes: 10 * 60, // amplitude quotidienne max (par défaut 10h)
  maxDailyWorkMinutes: 10 * 60, // travail effectif max / jour
  minRestBetweenDaysMinutes: 11 * 60, // repos mini entre 2 journées
  maxConsecutiveDays: 6, // nb de jours travaillés consécutifs
  weeklyOverContractToleranceMinutes: 60, // tolérance avant alerte sur-contrat
  weeklyUnderContractToleranceMinutes: 60, // tolérance avant alerte sous-contrat
  strictAvailability: true, // si indispo => violation bloquante
};

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function hhmmToMin(hhmm) {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

export function minToHHMM(min) {
  const safe = ((Number(min) || 0) + 24 * 60) % (24 * 60);
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

export function normalizeCellString(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[H]/g, ":")
    .replace(/\s+/g, "");
}

export function isAbsenceCode(value) {
  return ABSENCE_SET.has(String(value || "").trim().toUpperCase());
}

export function isRestCode(value) {
  return REST_CODES.includes(String(value || "").trim().toUpperCase());
}

export function parseShiftCellDetailed(cell) {
  const raw = String(cell || "").trim();
  const normalized = normalizeCellString(raw);

  if (!normalized) {
    return {
      raw,
      normalized,
      type: "empty",
      valid: true,
      isWork: false,
      isAbsence: false,
      absenceCode: "",
      code: "",
      startMin: null,
      endMin: null,
      durationMin: 0,
      startHHMM: "",
      endHHMM: "",
      crossesMidnight: false,
      label: "",
    };
  }

  if (isAbsenceCode(normalized)) {
    return {
      raw,
      normalized,
      type: "absence",
      valid: true,
      isWork: false,
      isAbsence: true,
      absenceCode: normalized,
      code: normalized,
      startMin: null,
      endMin: null,
      durationMin: 0,
      startHHMM: "",
      endHHMM: "",
      crossesMidnight: false,
      label: normalized,
    };
  }

  // accepte "06:00-13:30" | "06:00-13:30/DRIVE" | "06:00-13:30 / DRIVE"
  const compact = normalized.replace(/\s+/g, "");
  const m = compact.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})(?:\/([A-Z0-9_-]+))?$/);

  if (!m) {
    return {
      raw,
      normalized,
      type: "invalid",
      valid: false,
      isWork: false,
      isAbsence: false,
      absenceCode: "",
      code: "",
      startMin: null,
      endMin: null,
      durationMin: 0,
      startHHMM: "",
      endHHMM: "",
      crossesMidnight: false,
      label: raw,
      error: "Format invalide",
    };
  }

  const startHHMM = m[1];
  const endHHMM = m[2];
  const code = String(m[3] || "").toUpperCase();

  // rétrocompat : si code suffixe = code d'absence (ex "06:00-13:30 / RH"), on considère absence (0h)
  if (code && isAbsenceCode(code)) {
    return {
      raw,
      normalized,
      type: "absence",
      valid: true,
      isWork: false,
      isAbsence: true,
      absenceCode: code,
      code,
      startMin: null,
      endMin: null,
      durationMin: 0,
      startHHMM: "",
      endHHMM: "",
      crossesMidnight: false,
      label: code,
    };
  }

  const startMin = hhmmToMin(startHHMM);
  const endMinRaw = hhmmToMin(endHHMM);
  if (!Number.isFinite(startMin) || !Number.isFinite(endMinRaw)) {
    return {
      raw,
      normalized,
      type: "invalid",
      valid: false,
      isWork: false,
      isAbsence: false,
      absenceCode: "",
      code,
      startMin: null,
      endMin: null,
      durationMin: 0,
      startHHMM,
      endHHMM,
      crossesMidnight: false,
      label: raw,
      error: "Heure invalide",
    };
  }

  let endMin = endMinRaw;
  let duration = endMin - startMin;
  let crossesMidnight = false;
  if (duration < 0) {
    duration += 24 * 60;
    endMin += 24 * 60;
    crossesMidnight = true;
  }

  return {
    raw,
    normalized,
    type: "work",
    valid: true,
    isWork: true,
    isAbsence: false,
    absenceCode: "",
    code,
    startMin,
    endMin,
    durationMin: Math.max(0, duration),
    startHHMM,
    endHHMM,
    crossesMidnight,
    label: code ? `${startHHMM}-${endHHMM}/${code}` : `${startHHMM}-${endHHMM}`,
  };
}

export function parseShiftToMinutes(cell) {
  const d = parseShiftCellDetailed(cell);
  return d.isWork ? d.durationMin : 0;
}

export function computeRowWeeklyMinutes(cells = {}) {
  return DAY_KEYS_MON_START.reduce((sum, dayKey) => sum + parseShiftToMinutes(cells?.[dayKey]), 0);
}

export function contractHoursToMinutes(contractHours) {
  const h = Number(contractHours);
  return Number.isFinite(h) ? Math.max(0, Math.round(h * 60)) : 35 * 60;
}

export function getCellWorkWindow(cell) {
  const d = parseShiftCellDetailed(cell);
  if (!d.isWork) return null;
  return { startMin: d.startMin, endMin: d.endMin, durationMin: d.durationMin, code: d.code };
}

export function cellOverlapsSlot(cell, slotStartMin, slotEndMin) {
  const d = parseShiftCellDetailed(cell);
  if (!d.isWork) return false;
  const a1 = d.startMin;
  const a2 = d.endMin;
  const b1 = slotStartMin;
  const b2 = slotEndMin;
  return a1 < b2 && a2 > b1;
}

export function normalizeSkills(skills) {
  if (Array.isArray(skills)) {
    return skills
      .map((s) => String(s || "").trim().toLowerCase())
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i);
  }
  if (typeof skills === "string") {
    return skills
      .split(/[;,]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i);
  }
  return [];
}

// availability support (souple)
export function normalizeAvailabilityDay(value) {
  // Formats acceptés:
  // - false / "OFF" / "INDISPO"
  // - true / "OK"
  // - ["06:00-14:00", "17:00-21:00"] (créneaux autorisés)
  // - { available:false }
  // - { slots:["06:00-14:00"], unavailableSlots:["17:00-21:00"] }
  if (value == null) return null;

  if (value === false) return { available: false };
  if (value === true) return { available: true };

  if (Array.isArray(value)) {
    return { available: true, slots: value };
  }

  if (typeof value === "string") {
    const v = value.trim().toUpperCase();
    if (!v) return null;
    if (["OFF", "INDISPO", "UNAVAILABLE", "NO"].includes(v)) return { available: false };
    if (["OK", "AVAILABLE", "YES", "OUI"].includes(v)) return { available: true };
    // string de créneaux "06:00-12:00,14:00-18:00"
    return {
      available: true,
      slots: v.split(",").map((s) => s.trim()).filter(Boolean),
    };
  }

  if (typeof value === "object") {
    const out = {};
    if ("available" in value) out.available = !!value.available;
    if (Array.isArray(value.slots)) out.slots = value.slots;
    if (Array.isArray(value.unavailableSlots)) out.unavailableSlots = value.unavailableSlots;
    return out;
  }

  return null;
}

function parseAvailabilityRange(rangeStr) {
  const raw = String(rangeStr || "").trim().toUpperCase().replace(/[H]/g, ":");
  const m = raw.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
  if (!m) return null;
  let start = hhmmToMin(m[1]);
  let end = hhmmToMin(m[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (end < start) end += 24 * 60;
  return { startMin: start, endMin: end };
}

function windowsOverlap(a, b) {
  return a.startMin < b.endMin && a.endMin > b.startMin;
}

export function checkAvailabilityForCell(row, dayKey, cell) {
  const d = parseShiftCellDetailed(cell);
  if (!d.isWork) return { ok: true, reason: "" };

  const dayAvailRaw = row?.availability?.[dayKey];
  const av = normalizeAvailabilityDay(dayAvailRaw);
  if (!av) return { ok: true, reason: "" };

  if (av.available === false) {
    return { ok: false, reason: "Indisponible ce jour" };
  }

  const shiftWindow = { startMin: d.startMin, endMin: d.endMin };

  if (Array.isArray(av.unavailableSlots) && av.unavailableSlots.length > 0) {
    for (const r of av.unavailableSlots) {
      const w = parseAvailabilityRange(r);
      if (w && windowsOverlap(shiftWindow, w)) {
        return { ok: false, reason: `Indispo sur créneau ${r}` };
      }
    }
  }

  if (Array.isArray(av.slots) && av.slots.length > 0) {
    // au moins un créneau autorisé doit contenir totalement le shift
    let fits = false;
    for (const r of av.slots) {
      const w = parseAvailabilityRange(r);
      if (!w) continue;
      if (shiftWindow.startMin >= w.startMin && shiftWindow.endMin <= w.endMin) {
        fits = true;
        break;
      }
    }
    if (!fits) {
      return { ok: false, reason: "Shift hors disponibilités" };
    }
  }

  return { ok: true, reason: "" };
}

export function buildRulesConfig(input = {}, options = {}) {
  const docCfg = input?.docConfig || input?.planningDoc?.config || {};
  const rhRules = docCfg?.rhRules || {};
  const rules = {
    ...DEFAULT_RULES,
    ...(typeof rhRules === "object" ? rhRules : {}),
    ...(typeof options === "object" ? options : {}),
  };

  // normalisation
  Object.keys(rules).forEach((k) => {
    if (typeof rules[k] === "string" && /^\d+(\.\d+)?$/.test(rules[k])) {
      rules[k] = Number(rules[k]);
    }
  });

  return rules;
}

export function evaluatePlanningRules(input = {}, options = {}) {
  const rows = Array.isArray(input?.rows) ? input.rows : [];
  const dayKeys = Array.isArray(input?.dayKeysMonStart) ? input.dayKeysMonStart : DAY_KEYS_MON_START;
  const cfg = buildRulesConfig(input, options);

  const violations = [];
  const warnings = [];

  rows.forEach((row, rowIndex) => {
    const rowName = String(row?.name || `Ligne ${rowIndex + 1}`).trim() || `Ligne ${rowIndex + 1}`;

    // 1) Formats / amplitude / daily duration / availability
    dayKeys.forEach((dayKey, dayIdx) => {
      const cell = row?.cells?.[dayKey];
      const d = parseShiftCellDetailed(cell);

      if (d.type === "invalid") {
        violations.push({
          type: "invalid_format",
          severity: "warning",
          rowId: row?.id,
          rowIndex,
          staff: rowName,
          dayKey,
          dayIndex: dayIdx,
          message: `${rowName} — ${dayKey.toUpperCase()} : format invalide (« ${String(cell || "")} »)`,
        });
        return;
      }

      if (d.isWork) {
        if (d.durationMin > (cfg.maxDailyWorkMinutes || Infinity)) {
          violations.push({
            type: "max_daily_work",
            severity: "high",
            rowId: row?.id,
            rowIndex,
            staff: rowName,
            dayKey,
            dayIndex: dayIdx,
            durationMin: d.durationMin,
            maxDailyWorkMinutes: cfg.maxDailyWorkMinutes,
            message: `${rowName} — ${dayKey.toUpperCase()} : ${Math.round(
              d.durationMin / 60
            )}h > max travail/jour`,
          });
        }

        // amplitude = durée dans ce modèle 1 seul shift/jour
        if (d.durationMin > (cfg.maxAmplitudeMinutes || Infinity)) {
          violations.push({
            type: "max_amplitude",
            severity: "high",
            rowId: row?.id,
            rowIndex,
            staff: rowName,
            dayKey,
            dayIndex: dayIdx,
            amplitudeMin: d.durationMin,
            maxAmplitudeMinutes: cfg.maxAmplitudeMinutes,
            message: `${rowName} — ${dayKey.toUpperCase()} : amplitude trop longue (${d.startHHMM}-${d.endHHMM})`,
          });
        }

        const av = checkAvailabilityForCell(row, dayKey, cell);
        if (!av.ok) {
          violations.push({
            type: "availability_conflict",
            severity: cfg.strictAvailability ? "high" : "warning",
            rowId: row?.id,
            rowIndex,
            staff: rowName,
            dayKey,
            dayIndex: dayIdx,
            message: `${rowName} — ${dayKey.toUpperCase()} : ${av.reason}`,
          });
        }
      }
    });

    // 2) repos mini entre jours successifs
    for (let i = 0; i < dayKeys.length - 1; i++) {
      const d1 = parseShiftCellDetailed(row?.cells?.[dayKeys[i]]);
      const d2 = parseShiftCellDetailed(row?.cells?.[dayKeys[i + 1]]);
      if (!d1.isWork || !d2.isWork) continue;

      // d1.endMin peut être > 24h si nuit ; repos = (24h - endDay1) + startDay2
      const endDay1WithinDay = d1.endMin % (24 * 60);
      const restMin = (24 * 60 - endDay1WithinDay) + d2.startMin;

      if (restMin < (cfg.minRestBetweenDaysMinutes || 0)) {
        violations.push({
          type: "min_rest_between_days",
          severity: "high",
          rowId: row?.id,
          rowIndex,
          staff: rowName,
          fromDayKey: dayKeys[i],
          toDayKey: dayKeys[i + 1],
          restMin,
          minRestBetweenDaysMinutes: cfg.minRestBetweenDaysMinutes,
          message: `${rowName} — repos insuffisant entre ${dayKeys[i].toUpperCase()} et ${dayKeys[
            i + 1
          ].toUpperCase()} (${Math.floor(restMin / 60)}h${String(restMin % 60).padStart(2, "0")})`,
        });
      }
    }

    // 3) jours consécutifs travaillés
    let streak = 0;
    let streakStart = null;
    for (let i = 0; i < dayKeys.length; i++) {
      const d = parseShiftCellDetailed(row?.cells?.[dayKeys[i]]);
      if (d.isWork) {
        streak += 1;
        if (streakStart == null) streakStart = i;
      } else {
        if (streak > (cfg.maxConsecutiveDays || Infinity)) {
          violations.push({
            type: "max_consecutive_days",
            severity: "high",
            rowId: row?.id,
            rowIndex,
            staff: rowName,
            consecutiveDays: streak,
            maxConsecutiveDays: cfg.maxConsecutiveDays,
            fromDayKey: dayKeys[streakStart],
            toDayKey: dayKeys[i - 1],
            message: `${rowName} — ${streak} jours consécutifs (> ${cfg.maxConsecutiveDays})`,
          });
        }
        streak = 0;
        streakStart = null;
      }
    }
    if (streak > (cfg.maxConsecutiveDays || Infinity)) {
      violations.push({
        type: "max_consecutive_days",
        severity: "high",
        rowId: row?.id,
        rowIndex,
        staff: rowName,
        consecutiveDays: streak,
        maxConsecutiveDays: cfg.maxConsecutiveDays,
        fromDayKey: dayKeys[streakStart],
        toDayKey: dayKeys[dayKeys.length - 1],
        message: `${rowName} — ${streak} jours consécutifs (> ${cfg.maxConsecutiveDays})`,
      });
    }

    // 4) écart contrat (warning, pas violation)
    const plannedMin = computeRowWeeklyMinutes(row?.cells || {});
    const contractMin = contractHoursToMinutes(row?.contractHours);
    const delta = plannedMin - contractMin;

    if (delta > (cfg.weeklyOverContractToleranceMinutes || Infinity)) {
      warnings.push({
        type: "weekly_over_contract",
        severity: "medium",
        rowId: row?.id,
        rowIndex,
        staff: rowName,
        deltaMinutes: delta,
        message: `${rowName} — sur-planifié de ${Math.floor(delta / 60)}h${String(delta % 60).padStart(
          2,
          "0"
        )}`,
      });
    } else if (-delta > (cfg.weeklyUnderContractToleranceMinutes || Infinity)) {
      warnings.push({
        type: "weekly_under_contract",
        severity: "medium",
        rowId: row?.id,
        rowIndex,
        staff: rowName,
        deltaMinutes: delta,
        message: `${rowName} — sous-planifié de ${Math.floor(Math.abs(delta) / 60)}h${String(
          Math.abs(delta) % 60
        ).padStart(2, "0")}`,
      });
    }
  });

  return {
    rulesConfig: cfg,
    violations,
    warnings,
    summary: {
      rowsCount: rows.length,
      violationsCount: violations.length,
      warningsCount: warnings.length,
      highCount: violations.filter((v) => v.severity === "high").length,
    },
  };
}

export function wouldViolateRulesForCell({
  rows = [],
  rowIndex,
  dayKey,
  nextCellValue,
  input = {},
  options = {},
}) {
  if (!Array.isArray(rows) || rowIndex == null || rowIndex < 0 || rowIndex >= rows.length) {
    return { blocked: false, violations: [] };
  }

  const clonedRows = rows.map((r, i) =>
    i === rowIndex
      ? {
          ...r,
          cells: { ...(r?.cells || {}), [dayKey]: String(nextCellValue || "").trim().toUpperCase() },
        }
      : r
  );

  const res = evaluatePlanningRules(
    {
      ...input,
      rows: clonedRows,
    },
    options
  );

  const row = rows[rowIndex];
  const rowId = row?.id;
  const rowViolations = (res?.violations || []).filter((v) => v.rowId === rowId);
  const blocking = rowViolations.filter((v) => v.severity === "high");

  return {
    blocked: blocking.length > 0,
    violations: rowViolations,
    blockingViolations: blocking,
  };
}

/* ===========================
   Aliases rétrocompatibles
   =========================== */

export const checkPlanningRules = evaluatePlanningRules;
export const runPlanningRules = evaluatePlanningRules;
export const validatePlanningRules = evaluatePlanningRules;

/* ===========================
   Aliases rétrocompatibles (legacy imports)
   =========================== */

// Legacy parse helpers (PlanningRH / anciennes branches)
export const parseCell = parseShiftCellDetailed;
export const getCellDetails = parseShiftCellDetailed;
export const defaultParseShiftCellDetailed = parseShiftCellDetailed;

// Legacy helpers attendus par anciennes versions d'autoBalance
export function canAssignShiftOnDay({
  rows = [],
  rowIndex,
  dayKey,
  nextCellValue,
  input = {},
  options = {},
} = {}) {
  const res = wouldViolateRulesForCell({
    rows,
    rowIndex,
    dayKey,
    nextCellValue,
    input,
    options,
  });

  const row = rows?.[rowIndex];
  const av = checkAvailabilityForCell(row, dayKey, nextCellValue);

  return {
    ok: !res.blocked && av.ok,
    blocked: res.blocked || !av.ok,
    violations: res.violations || [],
    blockingViolations: res.blockingViolations || [],
    availability: av,
    reason: !av.ok ? av.reason : res.blocked ? "Règle RH bloquante" : "",
  };
}

export function canReplaceShiftOnDay({
  rows = [],
  rowIndex,
  dayKey,
  nextCellValue,
  input = {},
  options = {},
} = {}) {
  // même logique que assign dans ce modèle (1 cellule/jour = remplacement)
  return canAssignShiftOnDay({
    rows,
    rowIndex,
    dayKey,
    nextCellValue,
    input,
    options,
  });
}

export function evaluateRowAgainstRules({
  row,
  rowIndex = 0,
  input = {},
  options = {},
} = {}) {
  const rows = Array.isArray(input?.rows)
    ? input.rows
    : row
    ? [row]
    : [];

  const safeIndex = rows.length ? Math.max(0, Math.min(rowIndex, rows.length - 1)) : 0;

  const res = evaluatePlanningRules(
    {
      ...input,
      rows,
    },
    options
  );

  const targetRow = rows[safeIndex];
  const rowId = targetRow?.id;

  const violations = rowId
    ? (res?.violations || []).filter((v) => v.rowId === rowId)
    : res?.violations || [];

  const warnings = rowId
    ? (res?.warnings || []).filter((w) => w.rowId === rowId)
    : res?.warnings || [];

  return {
    ok: !violations.some((v) => v.severity === "high"),
    violations,
    warnings,
  };
}

export default evaluatePlanningRules;