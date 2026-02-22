// src/utils/planningAnalyzer.js
/* =========================================================
   planningAnalyzer.js — Sprint 3 PRO / stable signatures
   Exports:
   - analyzePlanning(input, options?)
   - aliases: analyzeWeekPlanning, getPlanningAnalysis, computePlanningAnalysis
   - default = analyzePlanning
   ========================================================= */

const DAY_KEYS_MON_START_DEFAULT = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const ABSENCE_CODES = new Set(["RH", "CP", "OFF", "AT", "MAL", "ABS", "CONGE", "VAC"]);

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function hhmmToMin(hhmm) {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

function minToHHMM(min) {
  const x = ((Number(min) % 1440) + 1440) % 1440;
  const h = Math.floor(x / 60);
  const m = x % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function minutesToHourLabel(min) {
  const sign = Number(min) < 0 ? "-" : "";
  const abs = Math.abs(Number(min) || 0);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m ? `${sign}${h}h${pad2(m)}` : `${sign}${h}h`;
}

function normalizeDayKeys(input) {
  return Array.isArray(input?.dayKeysMonStart) && input.dayKeysMonStart.length === 7
    ? input.dayKeysMonStart
    : DAY_KEYS_MON_START_DEFAULT;
}

function parseShiftCell(cell) {
  const raw0 = String(cell || "").trim();
  const raw = raw0.toUpperCase();
  if (!raw) return { kind: "empty", raw, durationMin: 0 };

  if (ABSENCE_CODES.has(raw)) {
    return { kind: "absence", raw, code: raw, durationMin: 0 };
  }

  const normalized = raw.replaceAll("H", ":").replace(/\s+/g, "");
  const m = normalized.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})(?:\/([A-Z0-9_-]+))?$/);
  if (!m) return { kind: "unknown", raw, durationMin: 0 };

  const start = m[1];
  const end = m[2];
  const code = String(m[3] || "").toUpperCase();
  if (code && ABSENCE_CODES.has(code)) {
    return { kind: "absence", raw, code, start, end, durationMin: 0 };
  }

  const startMin = hhmmToMin(start);
  const endMin = hhmmToMin(end);
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return { kind: "unknown", raw, durationMin: 0 };

  let durationMin = endMin - startMin;
  let crossesMidnight = false;
  if (durationMin < 0) {
    durationMin += 1440;
    crossesMidnight = true;
  }

  return {
    kind: "work",
    raw,
    start,
    end,
    code,
    startMin,
    endMin,
    absoluteEndMin: crossesMidnight ? endMin + 1440 : endMin,
    durationMin,
    crossesMidnight,
  };
}

function getWeeklyMinutes(cells, dayKeys) {
  let total = 0;
  for (const dk of dayKeys) total += parseShiftCell(cells?.[dk]).durationMin || 0;
  return total;
}

function normalizeSkillList(skills) {
  if (!Array.isArray(skills)) return [];
  return skills
    .map((s) => String(s || "").trim().toLowerCase())
    .filter(Boolean);
}

function getHourlyRateForRow(row, input) {
  const direct = Number(row?.hourlyRate);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const roleRate = Number(input?.defaults?.hourlyRateByRole?.[row?.role]);
  if (Number.isFinite(roleRate) && roleRate > 0) return roleRate;

  const fallback = Number(input?.defaults?.hourlyRate);
  if (Number.isFinite(fallback) && fallback > 0) return fallback;

  return 0;
}

function normalizeCoverageConfig(input, options) {
  const c = {
    ...(input?.defaults?.coverage || {}),
    ...(input?.coverageConfig || {}),
    ...(options?.coverage || {}),
  };

  const slotMinutes = Math.max(15, Number(c.slotMinutes) || 30);
  const from = String(c.from || "06:00");
  const to = String(c.to || "22:00");
  const fromMin = hhmmToMin(from);
  let toMin = hhmmToMin(to);

  if (!Number.isFinite(fromMin)) return { slotMinutes: 30, fromMin: 360, toMin: 1320 };
  if (!Number.isFinite(toMin)) toMin = 1320;
  if (toMin <= fromMin) toMin = fromMin + 16 * 60;

  return { slotMinutes, fromMin, toMin };
}

/**
 * Requirements formats supported:
 * requirementsByDaySlot[dayKey][slotKey] = number
 * requirementsByDaySlot[dayKey][slotKey] = { total, roles:{prep:2}, skills:{drive:1} }
 *
 * slotKey examples:
 * - "06:00"
 * - "06:00-06:30"
 */
function normalizeRequirements(input) {
  return (
    input?.requirementsByDaySlot ||
    input?.doc?.requirementsByDaySlot ||
    input?.coverageRequirements ||
    {}
  );
}

function resolveRequirementForSlot(requirementsByDaySlot, dayKey, slotStartMin, slotEndMin) {
  const dayReq = requirementsByDaySlot?.[dayKey];
  if (!dayReq || typeof dayReq !== "object") {
    return { total: 0, roles: {}, skills: {} };
  }

  const kStart = minToHHMM(slotStartMin);
  const kRange = `${minToHHMM(slotStartMin)}-${minToHHMM(slotEndMin)}`;

  const raw = dayReq[kRange] ?? dayReq[kStart] ?? null;
  if (raw == null) return { total: 0, roles: {}, skills: {} };

  if (typeof raw === "number") {
    return { total: Math.max(0, raw), roles: {}, skills: {} };
  }

  if (typeof raw === "object") {
    const total = Math.max(0, Number(raw.total ?? raw.need ?? 0) || 0);
    const roles = {};
    const skills = {};

    if (raw.roles && typeof raw.roles === "object") {
      for (const [k, v] of Object.entries(raw.roles)) {
        const n = Math.max(0, Number(v) || 0);
        if (n > 0) roles[String(k).toLowerCase()] = n;
      }
    }

    if (raw.skills && typeof raw.skills === "object") {
      for (const [k, v] of Object.entries(raw.skills)) {
        const n = Math.max(0, Number(v) || 0);
        if (n > 0) skills[String(k).toLowerCase()] = n;
      }
    }

    return { total, roles, skills };
  }

  return { total: 0, roles: {}, skills: {} };
}

function rowWorksOnSlot(row, dayKey, slotStartMin) {
  const parsed = parseShiftCell(row?.cells?.[dayKey]);
  if (parsed.kind !== "work") return false;

  // overnight: slot coverage limited to same-day window [start,24h)
  if (parsed.crossesMidnight) {
    return slotStartMin >= parsed.startMin;
  }

  return slotStartMin >= parsed.startMin && slotStartMin < parsed.endMin;
}

function aggregateCoverageForSlot(rows, dayKey, slotStartMin) {
  const plannedRows = rows.filter((r) => rowWorksOnSlot(r, dayKey, slotStartMin));
  const plannedTotal = plannedRows.length;

  const plannedRoles = {};
  const plannedSkills = {};
  const codes = {};

  for (const r of plannedRows) {
    const role = String(r?.role || "prep").toLowerCase();
    plannedRoles[role] = (plannedRoles[role] || 0) + 1;

    const skills = normalizeSkillList(r?.skills);
    for (const sk of skills) plannedSkills[sk] = (plannedSkills[sk] || 0) + 1;

    const parsed = parseShiftCell(r?.cells?.[dayKey]);
    if (parsed.code) {
      const code = String(parsed.code).toLowerCase();
      codes[code] = (codes[code] || 0) + 1;
    }
  }

  return { plannedRows, plannedTotal, plannedRoles, plannedSkills, codes };
}

export function analyzePlanning(input = {}, options = {}) {
  const dayKeys = normalizeDayKeys(input);
  const rows = Array.isArray(input?.rows) ? input.rows : [];
  const coverageCfg = normalizeCoverageConfig(input, options);
  const requirementsByDaySlot = normalizeRequirements(input);

  // Row stats + contract deltas + cost
  const rowStats = rows.map((r) => {
    const weeklyMinutes = Number(r?.weeklyMinutes) || getWeeklyMinutes(r?.cells || {}, dayKeys);
    const contractHours = Number(r?.contractHours) || 0;
    const targetMin = contractHours * 60;
    const deltaMin = weeklyMinutes - targetMin;
    const hourlyRate = getHourlyRateForRow(r, input);
    const estimatedCost = (weeklyMinutes / 60) * hourlyRate;

    return {
      rowId: r?.id || null,
      name: r?.name || "",
      role: r?.role || "prep",
      weeklyMinutes,
      contractHours,
      targetMin,
      deltaMin,
      hourlyRate,
      estimatedCost,
    };
  });

  const warnings = [];

  for (const st of rowStats) {
    if (st.contractHours > 0 && Math.abs(st.deltaMin) > 60) {
      warnings.push({
        type: "contract_delta",
        severity: Math.abs(st.deltaMin) >= 180 ? "high" : "medium",
        staff: st.name,
        rowId: st.rowId,
        deltaMinutes: st.deltaMin,
        message: `${st.name || "Collaborateur"} : écart contrat ${st.deltaMin > 0 ? "+" : ""}${minutesToHourLabel(st.deltaMin)}`,
      });
    }
  }

  // Day summary
  const byDay = {};
  for (const dk of dayKeys) {
    let plannedCount = 0;
    let plannedMinutes = 0;
    for (const r of rows) {
      const p = parseShiftCell(r?.cells?.[dk]);
      if (p.kind === "work") {
        plannedCount += 1;
        plannedMinutes += p.durationMin || 0;
      }
    }
    byDay[dk] = {
      plannedCount,
      plannedMinutes,
      plannedHours: Math.round((plannedMinutes / 60) * 100) / 100,
    };
  }

  // Coverage needs by slot / gaps
  const needsBySlot = [];
  const coverageGaps = [];

  for (const dk of dayKeys) {
    for (
      let slotStart = coverageCfg.fromMin;
      slotStart < coverageCfg.toMin;
      slotStart += coverageCfg.slotMinutes
    ) {
      const slotEnd = Math.min(slotStart + coverageCfg.slotMinutes, coverageCfg.toMin);
      const req = resolveRequirementForSlot(requirementsByDaySlot, dk, slotStart, slotEnd);
      const cov = aggregateCoverageForSlot(rows, dk, slotStart);

      const totalGap = Math.max(0, (Number(req.total) || 0) - cov.plannedTotal);

      const roleGaps = Object.entries(req.roles || {}).map(([role, needed]) => {
        const planned = Number(cov.plannedRoles?.[String(role).toLowerCase()] || 0);
        return {
          role: String(role).toLowerCase(),
          needed: Number(needed) || 0,
          planned,
          gap: Math.max(0, (Number(needed) || 0) - planned),
        };
      });

      const skillGaps = Object.entries(req.skills || {}).map(([skill, needed]) => {
        const planned = Number(cov.plannedSkills?.[String(skill).toLowerCase()] || 0);
        return {
          skill: String(skill).toLowerCase(),
          needed: Number(needed) || 0,
          planned,
          gap: Math.max(0, (Number(needed) || 0) - planned),
        };
      });

      const hasRoleGap = roleGaps.some((x) => x.gap > 0);
      const hasSkillGap = skillGaps.some((x) => x.gap > 0);
      const hasGap = totalGap > 0 || hasRoleGap || hasSkillGap;

      const slotRec = {
        dayKey: dk,
        slotKey: minToHHMM(slotStart),
        slotLabel: `${minToHHMM(slotStart)}-${minToHHMM(slotEnd)}`,
        start: minToHHMM(slotStart),
        end: minToHHMM(slotEnd),
        requiredTotal: Number(req.total) || 0,
        plannedTotal: cov.plannedTotal,
        totalGap,
        requiredRoles: req.roles || {},
        plannedRoles: cov.plannedRoles || {},
        roleGaps,
        requiredSkills: req.skills || {},
        plannedSkills: cov.plannedSkills || {},
        skillGaps,
        plannedCodes: cov.codes || {},
      };

      needsBySlot.push(slotRec);

      if (hasGap) {
        coverageGaps.push({
          ...slotRec,
          gap: totalGap,
          severity: totalGap >= 2 || skillGaps.some((x) => x.gap >= 2) ? "high" : "warning",
          message:
            totalGap > 0
              ? `${String(dk).toUpperCase()} ${slotRec.slotLabel} : besoin ${req.total}, planifié ${cov.plannedTotal}`
              : `${String(dk).toUpperCase()} ${slotRec.slotLabel} : manque compétence`,
        });
      }
    }
  }

  // Add coverage gap warnings (compact)
  for (const g of coverageGaps.slice(0, 20)) {
    warnings.push({
      type: "coverage_gap",
      severity: g.severity || "warning",
      dayKey: g.dayKey,
      slotKey: g.slotKey,
      message: g.message,
      gap: g.gap,
    });
  }

  // Cost summary
  const estimatedCost = rowStats.reduce((s, r) => s + (Number(r.estimatedCost) || 0), 0);
  const estimatedCostByRole = {};
  for (const r of rowStats) {
    const role = String(r.role || "prep").toLowerCase();
    estimatedCostByRole[role] = (estimatedCostByRole[role] || 0) + (Number(r.estimatedCost) || 0);
  }

  const totalPlannedMinutes = rowStats.reduce((s, r) => s + (Number(r.weeklyMinutes) || 0), 0);
  const totalTargetMinutes = rowStats.reduce((s, r) => s + (Number(r.targetMin) || 0), 0);

  return {
    summary: {
      staffCount: rows.length,
      warningsCount: warnings.length,
      totalPlannedMinutes,
      totalTargetMinutes,
      totalDeltaMinutes: totalPlannedMinutes - totalTargetMinutes,
      estimatedCost,
      estimatedCostByRole,
      coverageGapCount: coverageGaps.length,
      slotsAnalyzed: needsBySlot.length,
    },
    rowStats,
    byDay,
    warnings,
    needsBySlot,
    coverageGaps,
  };
}

// ----- aliases rétrocompat
export const analyzeWeekPlanning = analyzePlanning;
export const getPlanningAnalysis = analyzePlanning;
export const computePlanningAnalysis = analyzePlanning;

export default analyzePlanning;