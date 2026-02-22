// src/utils/planningAnalyzer.js
/* =========================================================
   planningAnalyzer.js — Sprint 3 PRO / stable signatures
   Exports:
   - analyzePlanning(input, options?)
   - aliases: analyzeWeekPlanning, getPlanningAnalysis, computePlanningAnalysis
   - default = analyzePlanning

   ✅ Concordance PlanningRH + AutoBalance
   - Lit doc.config via input.docConfig / input.planningDoc.config
   - Lit requirementsByDaySlot depuis doc.config
   - Expose coverageSummary.byDay (attendu par PlanningRH)
   - Expose summary.coverageGapsCount + coverageGapCount (compat)
   - Expose summary.estimatedPayrollCost (compat)
   - Expose needsBySlot.slotStart / slotEnd (attendu par AutoBalance)
   - coverageGaps avec types: coverage_total_gap / coverage_skill_gap / coverage_role_gap
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

function normalizeCellString(v) {
  return String(v || "")
    .trim()
    .toUpperCase()
    .replace(/[H]/g, ":")
    .replace(/\s+/g, "");
}

function parseShiftCell(cell) {
  const raw0 = String(cell || "").trim();
  const raw = raw0.toUpperCase();
  const normalized = normalizeCellString(raw0);

  if (!normalized) {
    return {
      kind: "empty",
      type: "empty",
      raw,
      normalized,
      durationMin: 0,
      isWork: false,
      isAbsence: false,
      code: "",
      start: "",
      end: "",
      startHHMM: "",
      endHHMM: "",
    };
  }

  if (ABSENCE_CODES.has(normalized)) {
    return {
      kind: "absence",
      type: "absence",
      raw,
      normalized,
      code: normalized,
      absenceCode: normalized,
      durationMin: 0,
      isWork: false,
      isAbsence: true,
      start: "",
      end: "",
      startHHMM: "",
      endHHMM: "",
    };
  }

  const m = normalized.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})(?:\/([A-Z0-9_-]+))?$/);
  if (!m) {
    return {
      kind: "unknown",
      type: "invalid",
      raw,
      normalized,
      durationMin: 0,
      isWork: false,
      isAbsence: false,
      code: "",
      error: "Format invalide",
      start: "",
      end: "",
      startHHMM: "",
      endHHMM: "",
    };
  }

  const start = m[1];
  const end = m[2];
  const code = String(m[3] || "").toUpperCase();

  // rétrocompat : suffixe d'absence => considéré absence
  if (code && ABSENCE_CODES.has(code)) {
    return {
      kind: "absence",
      type: "absence",
      raw,
      normalized,
      code,
      absenceCode: code,
      start,
      end,
      startHHMM: start,
      endHHMM: end,
      durationMin: 0,
      isWork: false,
      isAbsence: true,
    };
  }

  const startMin = hhmmToMin(start);
  const endMinRaw = hhmmToMin(end);
  if (!Number.isFinite(startMin) || !Number.isFinite(endMinRaw)) {
    return {
      kind: "unknown",
      type: "invalid",
      raw,
      normalized,
      code,
      durationMin: 0,
      isWork: false,
      isAbsence: false,
      error: "Heure invalide",
      start,
      end,
      startHHMM: start,
      endHHMM: end,
    };
  }

  let absoluteEndMin = endMinRaw;
  let durationMin = endMinRaw - startMin;
  let crossesMidnight = false;
  if (durationMin < 0) {
    durationMin += 1440;
    absoluteEndMin = endMinRaw + 1440;
    crossesMidnight = true;
  }

  return {
    kind: "work",
    type: "work",
    raw,
    normalized,
    start,
    end,
    startHHMM: start,
    endHHMM: end,
    code,
    startMin,
    endMin: endMinRaw,
    absoluteEndMin,
    durationMin,
    crossesMidnight,
    isWork: true,
    isAbsence: false,
    valid: true,
  };
}

function getWeeklyMinutes(cells, dayKeys) {
  let total = 0;
  for (const dk of dayKeys) total += parseShiftCell(cells?.[dk]).durationMin || 0;
  return total;
}

function normalizeSkillList(skills) {
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

function getConfig(input) {
  return input?.docConfig || input?.planningDoc?.config || {};
}

function getHourlyRateForRow(row, input) {
  const direct = Number(row?.hourlyRate);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const cfg = getConfig(input);
  const role = String(row?.role || "prep").toLowerCase();

  // 1) flattened defaults (si PlanningRH les injecte)
  const flatRoleRate = Number(input?.defaults?.hourlyRateByRole?.[role]);
  if (Number.isFinite(flatRoleRate) && flatRoleRate > 0) return flatRoleRate;

  const flatDefault = Number(input?.defaults?.hourlyRate);
  if (Number.isFinite(flatDefault) && flatDefault > 0) return flatDefault;

  // 2) doc.config.costing
  const cfgRoleRate = Number(cfg?.costing?.hourlyRatesByRole?.[role]);
  if (Number.isFinite(cfgRoleRate) && cfgRoleRate > 0) return cfgRoleRate;

  const cfgDefault = Number(cfg?.costing?.defaultHourlyRate);
  if (Number.isFinite(cfgDefault) && cfgDefault > 0) return cfgDefault;

  return 0;
}

function normalizeCoverageConfig(input, options) {
  const cfg = getConfig(input);

  const c = {
    ...(cfg?.defaults?.coverage || {}),
    ...(cfg?.coverage || {}),
    ...(cfg?.coverageConfig || {}),

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
 * Formats supportés :
 * - input.requirementsByDaySlot
 * - input.docConfig.requirementsByDaySlot
 * - input.planningDoc.config.requirementsByDaySlot
 * - input.doc.requirementsByDaySlot
 * - input.coverageRequirements
 */
function normalizeRequirements(input) {
  const cfg = getConfig(input);

  return (
    input?.requirementsByDaySlot ||
    cfg?.requirementsByDaySlot ||
    input?.doc?.requirementsByDaySlot ||
    input?.planningDoc?.requirementsByDaySlot ||
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

function rowWorksOnSlot(row, dayKey, slotStartMin, slotEndMin) {
  const parsed = parseShiftCell(row?.cells?.[dayKey]);
  if (parsed.kind !== "work") return false;

  // Fenêtre du shift sur l'axe du jour
  const shiftStart = parsed.startMin;
  const shiftEnd = parsed.crossesMidnight ? 1440 : parsed.endMin;

  // Recouvrement de créneau
  return slotStartMin < shiftEnd && slotEndMin > shiftStart;
}

function aggregateCoverageForSlot(rows, dayKey, slotStartMin, slotEndMin) {
  const plannedRows = rows.filter((r) => rowWorksOnSlot(r, dayKey, slotStartMin, slotEndMin));
  const plannedTotal = plannedRows.length;

  const plannedRoles = {};
  const plannedSkills = {};
  const plannedCodes = {};

  for (const r of plannedRows) {
    const role = String(r?.role || "prep").toLowerCase();
    plannedRoles[role] = (plannedRoles[role] || 0) + 1;

    const skills = normalizeSkillList(r?.skills);
    for (const sk of skills) plannedSkills[sk] = (plannedSkills[sk] || 0) + 1;

    const parsed = parseShiftCell(r?.cells?.[dayKey]);
    if (parsed.code) {
      const code = String(parsed.code).toLowerCase();
      plannedCodes[code] = (plannedCodes[code] || 0) + 1;
    }
  }

  return { plannedRows, plannedTotal, plannedRoles, plannedSkills, plannedCodes };
}

function makeCoverageSummarySkeleton(dayKeys) {
  const byDay = {};
  for (const dk of dayKeys) {
    byDay[dk] = {
      totalNeed: 0,
      totalPlanned: 0,
      totalGap: 0,
      roleGapsCount: 0,
      skillGapsCount: 0,
      slotsCount: 0,
      slotsWithNeedCount: 0,
      slotsWithGapCount: 0,
    };
  }

  return {
    byDay,
    totals: {
      totalNeed: 0,
      totalPlanned: 0,
      totalGap: 0,
      roleGapsCount: 0,
      skillGapsCount: 0,
      slotsCount: 0,
      slotsWithNeedCount: 0,
      slotsWithGapCount: 0,
    },
  };
}

export function analyzePlanning(input = {}, options = {}) {
  const dayKeys = normalizeDayKeys(input);
  const rows = Array.isArray(input?.rows) ? input.rows : [];
  const coverageCfg = normalizeCoverageConfig(input, options);
  const requirementsByDaySlot = normalizeRequirements(input);

  // =============================
  // 1) Stats par ligne / contrats / coûts
  // =============================
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
      skills: normalizeSkillList(r?.skills),
      weeklyMinutes,
      weeklyHours: Math.round((weeklyMinutes / 60) * 100) / 100,
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
        message: `${st.name || "Collaborateur"} : écart contrat ${
          st.deltaMin > 0 ? "+" : ""
        }${minutesToHourLabel(st.deltaMin)}`,
      });
    }
  }

  // =============================
  // 2) Résumé simple par jour (heures planifiées)
  // =============================
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

  // =============================
  // 3) Couverture par créneau (needsBySlot + coverageGaps)
  // =============================
  const needsBySlot = [];
  const coverageGaps = [];
  const coverageSummary = makeCoverageSummarySkeleton(dayKeys);

  for (const dk of dayKeys) {
    for (
      let slotStart = coverageCfg.fromMin;
      slotStart < coverageCfg.toMin;
      slotStart += coverageCfg.slotMinutes
    ) {
      const slotEnd = Math.min(slotStart + coverageCfg.slotMinutes, coverageCfg.toMin);

      const req = resolveRequirementForSlot(requirementsByDaySlot, dk, slotStart, slotEnd);
      const cov = aggregateCoverageForSlot(rows, dk, slotStart, slotEnd);

      const totalGap = Math.max(0, (Number(req.total) || 0) - cov.plannedTotal);

      const roleGaps = Object.entries(req.roles || {}).map(([role, needed]) => {
        const key = String(role).toLowerCase();
        const planned = Number(cov.plannedRoles?.[key] || 0);
        return {
          role: key,
          needed: Number(needed) || 0,
          planned,
          gap: Math.max(0, (Number(needed) || 0) - planned),
        };
      });

      const skillGaps = Object.entries(req.skills || {}).map(([skill, needed]) => {
        const key = String(skill).toLowerCase();
        const planned = Number(cov.plannedSkills?.[key] || 0);
        return {
          skill: key,
          needed: Number(needed) || 0,
          planned,
          gap: Math.max(0, (Number(needed) || 0) - planned),
        };
      });

      const slotRec = {
        dayKey: dk,
        slotKey: minToHHMM(slotStart),
        slotLabel: `${minToHHMM(slotStart)}-${minToHHMM(slotEnd)}`,
        start: minToHHMM(slotStart),
        end: minToHHMM(slotEnd),

        // ✅ aliases attendus par AutoBalance
        slotStart: minToHHMM(slotStart),
        slotEnd: minToHHMM(slotEnd),

        slotStartMin: slotStart,
        slotEndMin: slotEnd,

        requiredTotal: Number(req.total) || 0,
        plannedTotal: cov.plannedTotal,
        totalGap,

        requiredRoles: req.roles || {},
        plannedRoles: cov.plannedRoles || {},
        roleGaps,

        requiredSkills: req.skills || {},
        plannedSkills: cov.plannedSkills || {},
        skillGaps,

        plannedCodes: cov.plannedCodes || {},
      };

      needsBySlot.push(slotRec);

      // ---- coverageSummary byDay (attendu par PlanningRH)
      const sumDay = coverageSummary.byDay[dk];
      sumDay.totalNeed += slotRec.requiredTotal;
      sumDay.totalPlanned += slotRec.plannedTotal;
      sumDay.totalGap += slotRec.totalGap;
      sumDay.slotsCount += 1;
      if (slotRec.requiredTotal > 0) sumDay.slotsWithNeedCount += 1;
      if (slotRec.totalGap > 0) sumDay.slotsWithGapCount += 1;
      sumDay.roleGapsCount += roleGaps.filter((x) => x.gap > 0).length;
      sumDay.skillGapsCount += skillGaps.filter((x) => x.gap > 0).length;

      // ---- coverageGaps détaillés (types stables)
      if (totalGap > 0) {
        coverageGaps.push({
          type: "coverage_total_gap",
          severity: totalGap >= 2 ? "high" : "warning",
          dayKey: dk,
          slotKey: slotRec.slotKey,
          slotLabel: slotRec.slotLabel,
          slotStart: slotRec.slotStart,
          slotEnd: slotRec.slotEnd,
          requiredTotal: slotRec.requiredTotal,
          plannedTotal: slotRec.plannedTotal,
          totalGap,
          gap: totalGap,
          message: `${String(dk).toUpperCase()} ${slotRec.slotLabel} : besoin total ${slotRec.requiredTotal}, planifié ${slotRec.plannedTotal} (gap ${totalGap})`,
        });
      }

      for (const rg of roleGaps.filter((x) => x.gap > 0)) {
        coverageGaps.push({
          type: "coverage_role_gap",
          severity: rg.gap >= 2 ? "high" : "warning",
          dayKey: dk,
          slotKey: slotRec.slotKey,
          slotLabel: slotRec.slotLabel,
          slotStart: slotRec.slotStart,
          slotEnd: slotRec.slotEnd,
          role: rg.role,
          needed: rg.needed,
          planned: rg.planned,
          gap: rg.gap,
          message: `${String(dk).toUpperCase()} ${slotRec.slotLabel} : manque rôle ${rg.role} (${rg.planned}/${rg.needed})`,
        });
      }

      for (const sg of skillGaps.filter((x) => x.gap > 0)) {
        coverageGaps.push({
          type: "coverage_skill_gap",
          severity: sg.gap >= 2 ? "high" : "warning",
          dayKey: dk,
          slotKey: slotRec.slotKey,
          slotLabel: slotRec.slotLabel,
          slotStart: slotRec.slotStart,
          slotEnd: slotRec.slotEnd,
          skill: sg.skill,
          needed: sg.needed,
          planned: sg.planned,
          gap: sg.gap,
          message: `${String(dk).toUpperCase()} ${slotRec.slotLabel} : manque compétence ${sg.skill} (${sg.planned}/${sg.needed})`,
        });
      }
    }
  }

  // Agrégats coverageSummary.totals
  for (const dk of dayKeys) {
    const d = coverageSummary.byDay[dk];
    coverageSummary.totals.totalNeed += d.totalNeed;
    coverageSummary.totals.totalPlanned += d.totalPlanned;
    coverageSummary.totals.totalGap += d.totalGap;
    coverageSummary.totals.roleGapsCount += d.roleGapsCount;
    coverageSummary.totals.skillGapsCount += d.skillGapsCount;
    coverageSummary.totals.slotsCount += d.slotsCount;
    coverageSummary.totals.slotsWithNeedCount += d.slotsWithNeedCount;
    coverageSummary.totals.slotsWithGapCount += d.slotsWithGapCount;
  }

  // Warnings coverage (compact)
  for (const g of coverageGaps.slice(0, 30)) {
    warnings.push({
      type: g.type || "coverage_gap",
      severity: g.severity || "warning",
      dayKey: g.dayKey,
      slotKey: g.slotKey,
      message: g.message,
      gap: g.gap,
    });
  }

  // =============================
  // 4) Coûts
  // =============================
  const estimatedCost = rowStats.reduce((s, r) => s + (Number(r.estimatedCost) || 0), 0);
  const estimatedCostByRole = {};

  for (const r of rowStats) {
    const role = String(r.role || "prep").toLowerCase();
    estimatedCostByRole[role] = (estimatedCostByRole[role] || 0) + (Number(r.estimatedCost) || 0);
  }

  const totalPlannedMinutes = rowStats.reduce((s, r) => s + (Number(r.weeklyMinutes) || 0), 0);
  const totalTargetMinutes = rowStats.reduce((s, r) => s + (Number(r.targetMin) || 0), 0);

  const skillCoverageGapsCount = coverageGaps.filter((g) => g.type === "coverage_skill_gap").length;
  const roleCoverageGapsCount = coverageGaps.filter((g) => g.type === "coverage_role_gap").length;
  const totalCoverageGapsCount = coverageGaps.length;

  return {
    summary: {
      staffCount: rows.length,
      warningsCount: warnings.length,

      totalPlannedMinutes,
      totalTargetMinutes,
      totalDeltaMinutes: totalPlannedMinutes - totalTargetMinutes,

      estimatedCost,
      estimatedPayrollCost: estimatedCost, // ✅ compat PlanningRH / AutoBalance
      estimatedCostByRole,

      coverageGapCount: totalCoverageGapsCount, // ✅ singulier
      coverageGapsCount: totalCoverageGapsCount, // ✅ pluriel compat
      skillCoverageGapsCount,
      roleCoverageGapsCount,

      slotsAnalyzed: needsBySlot.length,
      coverageSlotsAnalyzed: needsBySlot.length,
    },

    rowStats,
    byDay,
    warnings,

    needsBySlot,
    coverageGaps,
    coverageSummary,

    costs: {
      totalEstimated: estimatedCost,
      byRole: estimatedCostByRole,
      currency: "EUR",
    },

    meta: {
      coverageConfig: coverageCfg,
      requirementsDetected: !!requirementsByDaySlot && Object.keys(requirementsByDaySlot || {}).length > 0,
    },
  };
}

// ----- aliases rétrocompat
export const analyzeWeekPlanning = analyzePlanning;
export const getPlanningAnalysis = analyzePlanning;
export const computePlanningAnalysis = analyzePlanning;

export default analyzePlanning;