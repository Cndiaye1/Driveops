// src/utils/planningAnalyzer.js
/* =========================================================
   planningAnalyzer.js — Sprint 3 PRO / stable signatures
   ✅ Concordant avec PlanningRH (doc.config + DLX + coverageSummary + costs)
   ✅ Support skill actif par cellule: "06:00-13:30/PGC"
   ✅ Fallback sur row.skills si aucun suffixe de cellule
   Exports:
   - analyzePlanning(input, options?)
   - aliases: analyzeWeekPlanning, getPlanningAnalysis, computePlanningAnalysis
   - helpers: parseShiftCellDetailed / parseCell / getCellDetails / defaultParseShiftCellDetailed
   - default = analyzePlanning
   ========================================================= */

const DAY_KEYS_MON_START_DEFAULT = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const ABSENCE_CODES = new Set(["RH", "CP", "OFF", "AT", "MAL", "ABS", "CONGE", "VAC"]);

// --- mapping skills / postes Drive (normalisés)
const SKILL_ALIASES = {
  accueil: "accueil",
  acc: "accueil",

  pgc: "pgc",
  "produit grande consommation": "pgc",
  produitsgrandeconsommation: "pgc",

  fs: "fs",
  frais: "fs",

  liv: "liv",
  livraison: "liv",
  "livraison client": "liv",

  mes: "mes",
  "mise en stock": "mes",
  miseenstock: "mes",

  lad: "lad",
  "livraison a domicile": "lad",
  "livraison à domicile": "lad",
  livraisonadomicile: "lad",

  "fleg/surg": "fleg/surg",
  flegsurg: "fleg/surg",
  fleg: "fleg/surg",
  surg: "fleg/surg",
  surgele: "fleg/surg",
  surgeles: "fleg/surg",
  "surgelés": "fleg/surg",

  re: "re",
  replen: "re",
  replanish: "re",

  net: "net",
  nettoyage: "net",

  polyvalent: "polyvalent",
  poly: "polyvalent",
};

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

function normalizeRoleKey(role) {
  return String(role || "prep").trim().toLowerCase();
}

function normalizeSkillKey(v) {
  const raw = String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  if (!raw) return "";
  if (SKILL_ALIASES[raw]) return SKILL_ALIASES[raw];

  // versions compactées
  const compact = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[()]/g, "");

  return SKILL_ALIASES[compact] || raw;
}

function normalizeSkillList(skills) {
  if (!Array.isArray(skills)) return [];
  const set = new Set();
  for (const s of skills) {
    const n = normalizeSkillKey(s);
    if (n) set.add(n);
  }
  return [...set];
}

function extractDocConfig(input = {}, options = {}) {
  return (
    options?.docConfig ||
    input?.docConfig ||
    input?.doc?.config ||
    input?.planningDoc?.config ||
    input?.docConfigOverride ||
    {}
  );
}

/**
 * Parse cellule planning:
 * - "" => empty
 * - RH / CP / OFF / AT / MAL / ABS => absence
 * - 06:00-13:30
 * - 06:00-13:30/PGC
 * - 06H00-13H30/FLEG/SURG
 */
export function parseShiftCellDetailed(cell) {
  const raw0 = String(cell || "").trim();
  const raw = raw0.toUpperCase();

  if (!raw) {
    return {
      type: "empty",
      kind: "empty",
      valid: true,
      isWork: false,
      isAbsence: false,
      code: "",
      absenceCode: "",
      activeSkill: "",
      startHHMM: "",
      endHHMM: "",
      durationMin: 0,
      raw: raw0,
    };
  }

  if (ABSENCE_CODES.has(raw)) {
    return {
      type: "absence",
      kind: "absence",
      valid: true,
      isWork: false,
      isAbsence: true,
      code: raw,
      absenceCode: raw,
      activeSkill: "",
      startHHMM: "",
      endHHMM: "",
      durationMin: 0,
      raw: raw0,
    };
  }

  const normalized = raw.replaceAll("H", ":").replace(/\s+/g, "");
  // ✅ code suffix accepte slash interne (ex: FLEG/SURG)
  const m = normalized.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})(?:\/([A-Z0-9/_-]+))?$/);

  if (!m) {
    return {
      type: "invalid",
      kind: "unknown",
      valid: false,
      isWork: false,
      isAbsence: false,
      code: "",
      absenceCode: "",
      activeSkill: "",
      startHHMM: "",
      endHHMM: "",
      durationMin: 0,
      raw: raw0,
    };
  }

  const startHHMM = m[1];
  const endHHMM = m[2];
  const code = String(m[3] || "").toUpperCase();

  if (code && ABSENCE_CODES.has(code)) {
    return {
      type: "absence",
      kind: "absence",
      valid: true,
      isWork: false,
      isAbsence: true,
      code,
      absenceCode: code,
      activeSkill: "",
      startHHMM: "",
      endHHMM: "",
      durationMin: 0,
      raw: raw0,
    };
  }

  const startMin = hhmmToMin(startHHMM);
  const endMinRaw = hhmmToMin(endHHMM);

  if (!Number.isFinite(startMin) || !Number.isFinite(endMinRaw)) {
    return {
      type: "invalid",
      kind: "unknown",
      valid: false,
      isWork: false,
      isAbsence: false,
      code,
      absenceCode: "",
      activeSkill: normalizeSkillKey(code),
      startHHMM,
      endHHMM,
      durationMin: 0,
      raw: raw0,
    };
  }

  let durationMin = endMinRaw - startMin;
  let crossesMidnight = false;
  let absoluteEndMin = endMinRaw;

  if (durationMin < 0) {
    durationMin += 1440;
    crossesMidnight = true;
    absoluteEndMin = endMinRaw + 1440;
  }

  return {
    type: "work",
    kind: "work",
    valid: true,
    isWork: true,
    isAbsence: false,
    code,
    absenceCode: "",
    activeSkill: normalizeSkillKey(code),
    startHHMM,
    endHHMM,
    startMin,
    endMin: endMinRaw,
    absoluteEndMin,
    durationMin,
    crossesMidnight,
    raw: raw0,
  };
}

// Aliases pour compatibilité avec PlanningRH.safeParseCellDetailed()
export const parseCell = parseShiftCellDetailed;
export const getCellDetails = parseShiftCellDetailed;
export const defaultParseShiftCellDetailed = parseShiftCellDetailed;

function getWeeklyMinutes(cells, dayKeys) {
  let total = 0;
  for (const dk of dayKeys) {
    total += Number(parseShiftCellDetailed(cells?.[dk]).durationMin || 0);
  }
  return total;
}

function normalizeCoverageConfig(input, options) {
  const docConfig = extractDocConfig(input, options);

  const c = {
    ...(input?.defaults?.coverage || {}),
    ...(input?.coverageConfig || {}),
    ...(docConfig?.coverage || {}),
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

function normalizeRequirements(input, options) {
  const docConfig = extractDocConfig(input, options);

  return (
    input?.requirementsByDaySlot ||
    input?.doc?.requirementsByDaySlot ||
    input?.planningDoc?.requirementsByDaySlot ||
    docConfig?.requirementsByDaySlot ||
    input?.coverageRequirements ||
    {}
  );
}

function getHourlyRateForRow(row, input, options) {
  const docConfig = extractDocConfig(input, options);
  const costing = docConfig?.costing || {};

  const direct = Number(row?.hourlyRate);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const role = normalizeRoleKey(row?.role);

  const roleRateFromDoc =
    Number(costing?.hourlyRatesByRole?.[role]) ||
    Number(costing?.roleRates?.[role]) ||
    Number(costing?.hourlyRateByRole?.[role]);

  if (Number.isFinite(roleRateFromDoc) && roleRateFromDoc > 0) return roleRateFromDoc;

  const roleRateFromDefaults = Number(input?.defaults?.hourlyRateByRole?.[role]);
  if (Number.isFinite(roleRateFromDefaults) && roleRateFromDefaults > 0) return roleRateFromDefaults;

  const fallbackDoc =
    Number(costing?.defaultHourlyRate) ||
    Number(costing?.hourlyRate) ||
    Number(docConfig?.defaultHourlyRate);

  if (Number.isFinite(fallbackDoc) && fallbackDoc > 0) return fallbackDoc;

  const fallback = Number(input?.defaults?.hourlyRate);
  if (Number.isFinite(fallback) && fallback > 0) return fallback;

  return 0;
}

/**
 * Requirements formats supportés:
 * requirementsByDaySlot[dayKey][slotKey] = number
 * requirementsByDaySlot[dayKey][slotKey] = { total, roles:{prep:2}, skills:{pgc:1} }
 * slotKey:
 * - "06:00"
 * - "06:00-06:30"
 */
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
    if (raw.roles && typeof raw.roles === "object") {
      for (const [k, v] of Object.entries(raw.roles)) {
        const n = Math.max(0, Number(v) || 0);
        if (n > 0) roles[normalizeRoleKey(k)] = n;
      }
    }

    const skills = {};
    if (raw.skills && typeof raw.skills === "object") {
      for (const [k, v] of Object.entries(raw.skills)) {
        const n = Math.max(0, Number(v) || 0);
        const skill = normalizeSkillKey(k);
        if (n > 0 && skill) skills[skill] = n;
      }
    }

    return { total, roles, skills };
  }

  return { total: 0, roles: {}, skills: {} };
}

function rowWorksOnSlot(row, dayKey, slotStartMin) {
  const parsed = parseShiftCellDetailed(row?.cells?.[dayKey]);
  if (!parsed.isWork) return false;

  // Pour les shifts overnight, couverture sur la "journée" courante limitée à [start, 24h)
  if (parsed.crossesMidnight) {
    return slotStartMin >= parsed.startMin;
  }

  return slotStartMin >= parsed.startMin && slotStartMin < parsed.absoluteEndMin;
}

function getActiveSkillsForRowOnSlot(row, dayKey) {
  const parsed = parseShiftCellDetailed(row?.cells?.[dayKey]);
  if (!parsed.isWork) return [];

  const rowSkills = normalizeSkillList(row?.skills);

  // ✅ PRIORITÉ au skill actif de la cellule (suffixe /PGC /FS /MES...)
  if (parsed.activeSkill) {
    const out = [parsed.activeSkill];

    // On garde polyvalent si présent sur la fiche salarié (utile si exigence "polyvalent")
    if (rowSkills.includes("polyvalent") && parsed.activeSkill !== "polyvalent") {
      out.push("polyvalent");
    }

    return [...new Set(out)];
  }

  // Fallback legacy : compétences générales de la ligne
  return rowSkills;
}

function aggregateCoverageForSlot(rows, dayKey, slotStartMin) {
  const plannedRows = rows.filter((r) => rowWorksOnSlot(r, dayKey, slotStartMin));
  const plannedTotal = plannedRows.length;

  const plannedRoles = {};
  const plannedSkills = {};
  const plannedCodes = {};
  const plannedAssignments = []; // debug utile UI/diagnostic

  for (const r of plannedRows) {
    const role = normalizeRoleKey(r?.role);
    plannedRoles[role] = (plannedRoles[role] || 0) + 1;

    const parsed = parseShiftCellDetailed(r?.cells?.[dayKey]);
    const code = String(parsed.code || "").trim();
    const codeKey = code ? normalizeSkillKey(code) || code.toLowerCase() : "";

    if (codeKey) plannedCodes[codeKey] = (plannedCodes[codeKey] || 0) + 1;

    const activeSkills = getActiveSkillsForRowOnSlot(r, dayKey);
    for (const sk of activeSkills) {
      plannedSkills[sk] = (plannedSkills[sk] || 0) + 1;
    }

    plannedAssignments.push({
      rowId: r?.id || null,
      name: r?.name || "",
      role,
      shift: parsed.startHHMM && parsed.endHHMM ? `${parsed.startHHMM}-${parsed.endHHMM}` : "",
      cellCode: code || "",
      activeSkills,
    });
  }

  return { plannedRows, plannedTotal, plannedRoles, plannedSkills, plannedCodes, plannedAssignments };
}
function buildCoverageSummary(dayKeys, needsBySlot, coverageGaps) {
  const byDay = {};

  for (const dk of dayKeys) {
    byDay[dk] = {
      totalNeed: 0,
      totalPlanned: 0,
      totalGap: 0,
      roleGapsCount: 0,
      skillGapsCount: 0,
      slotsCount: 0,
    };
  }

  for (const slot of needsBySlot) {
    const d = byDay[slot.dayKey] || (byDay[slot.dayKey] = {
      totalNeed: 0,
      totalPlanned: 0,
      totalGap: 0,
      roleGapsCount: 0,
      skillGapsCount: 0,
      slotsCount: 0,
    });

    d.totalNeed += Number(slot.requiredTotal || 0);
    d.totalPlanned += Number(slot.plannedTotal || 0);
    d.totalGap += Number(slot.totalGap || 0);
    d.slotsCount += 1;

    d.roleGapsCount += (slot.roleGaps || []).filter((x) => Number(x.gap || 0) > 0).length;
    d.skillGapsCount += (slot.skillGaps || []).filter((x) => Number(x.gap || 0) > 0).length;
  }

  return {
    byDay,
    totals: {
      totalNeed: Object.values(byDay).reduce((s, d) => s + (d.totalNeed || 0), 0),
      totalPlanned: Object.values(byDay).reduce((s, d) => s + (d.totalPlanned || 0), 0),
      totalGap: Object.values(byDay).reduce((s, d) => s + (d.totalGap || 0), 0),
      roleGapsCount: Object.values(byDay).reduce((s, d) => s + (d.roleGapsCount || 0), 0),
      skillGapsCount: Object.values(byDay).reduce((s, d) => s + (d.skillGapsCount || 0), 0),
      coverageGapEvents: Array.isArray(coverageGaps) ? coverageGaps.length : 0,
    },
  };
}

export function analyzePlanning(input = {}, options = {}) {
  const dayKeys = normalizeDayKeys(input);
  const rows =
    (Array.isArray(input?.rows) && input.rows) ||
    (Array.isArray(input?.rowsWithStats) && input.rowsWithStats) ||
    [];

  const docConfig = extractDocConfig(input, options);
  const coverageCfg = normalizeCoverageConfig(input, options);
  const requirementsByDaySlot = normalizeRequirements(input, options);

  // ---- Row stats (contrats / coût)
  const rowStats = rows.map((r) => {
    const weeklyMinutes =
      Number(r?.weeklyMinutes) || getWeeklyMinutes(r?.cells || {}, dayKeys);

    const contractHours = Number(r?.contractHours) || 0;
    const targetMin = contractHours * 60;
    const deltaMin = weeklyMinutes - targetMin;

    const hourlyRate = getHourlyRateForRow(r, input, options);
    const estimatedCost = (weeklyMinutes / 60) * hourlyRate;

    return {
      rowId: r?.id || null,
      name: r?.name || "",
      role: normalizeRoleKey(r?.role),
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
        message: `${st.name || "Collaborateur"} : écart contrat ${st.deltaMin > 0 ? "+" : ""}${minutesToHourLabel(st.deltaMin)}`,
      });
    }
  }

  // ---- Day summary (heures réellement planifiées)
  const byDay = {};
  for (const dk of dayKeys) {
    let plannedCount = 0;
    let plannedMinutes = 0;

    for (const r of rows) {
      const p = parseShiftCellDetailed(r?.cells?.[dk]);
      if (p.isWork) {
        plannedCount += 1;
        plannedMinutes += Number(p.durationMin || 0);
      }
    }

    byDay[dk] = {
      plannedCount,
      plannedMinutes,
      plannedHours: Math.round((plannedMinutes / 60) * 100) / 100,
    };
  }

  // ---- Coverage by slot / gaps
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
        const roleKey = normalizeRoleKey(role);
        const planned = Number(cov.plannedRoles?.[roleKey] || 0);
        return {
          role: roleKey,
          needed: Number(needed) || 0,
          planned,
          gap: Math.max(0, (Number(needed) || 0) - planned),
        };
      });

      const skillGaps = Object.entries(req.skills || {}).map(([skill, needed]) => {
        const skillKey = normalizeSkillKey(skill);
        const planned = Number(cov.plannedSkills?.[skillKey] || 0);
        return {
          skill: skillKey,
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

        requiredTotal: Number(req.total) || 0,
        plannedTotal: Number(cov.plannedTotal) || 0,
        totalGap,

        requiredRoles: req.roles || {},
        plannedRoles: cov.plannedRoles || {},
        roleGaps,

        requiredSkills: req.skills || {},
        plannedSkills: cov.plannedSkills || {},
        skillGaps,

        plannedCodes: cov.plannedCodes || {},
        plannedAssignments: cov.plannedAssignments || [],
      };

      needsBySlot.push(slotRec);

      // Gap total (effectif)
      if (totalGap > 0) {
        coverageGaps.push({
          ...slotRec,
          type: "coverage_total_gap",
          gap: totalGap,
          severity: totalGap >= 2 ? "high" : "warning",
          message: `${String(dk).toUpperCase()} ${slotRec.slotLabel} : besoin ${req.total}, planifié ${cov.plannedTotal}`,
        });
      }

      // Gap rôles
      for (const rg of roleGaps) {
        if (Number(rg.gap || 0) <= 0) continue;
        coverageGaps.push({
          ...slotRec,
          type: "coverage_role_gap",
          role: rg.role,
          gap: rg.gap,
          severity: rg.gap >= 2 ? "high" : "warning",
          message: `${String(dk).toUpperCase()} ${slotRec.slotLabel} : manque rôle ${rg.role} (${rg.planned}/${rg.needed})`,
        });
      }

      // Gap skills
      for (const sg of skillGaps) {
        if (Number(sg.gap || 0) <= 0) continue;
        coverageGaps.push({
          ...slotRec,
          type: "coverage_skill_gap",
          skill: sg.skill,
          gap: sg.gap,
          severity: sg.gap >= 2 ? "high" : "warning",
          message: `${String(dk).toUpperCase()} ${slotRec.slotLabel} : manque skill ${sg.skill} (${sg.planned}/${sg.needed})`,
        });
      }
    }
  }

  // Warnings compact (coverage)
  for (const g of coverageGaps.slice(0, 30)) {
    warnings.push({
      type: g.type || "coverage_gap",
      severity: g.severity || "warning",
      dayKey: g.dayKey,
      slotKey: g.slotKey,
      message: g.message,
      gap: g.gap,
      role: g.role,
      skill: g.skill,
    });
  }

  // ---- Costs
  const totalEstimated = rowStats.reduce((s, r) => s + (Number(r.estimatedCost) || 0), 0);
  const byRoleCost = {};
  for (const r of rowStats) {
    const role = normalizeRoleKey(r.role);
    byRoleCost[role] = (byRoleCost[role] || 0) + (Number(r.estimatedCost) || 0);
  }

  const costingCfg = docConfig?.costing || {};
  const currency = String(costingCfg?.currency || "EUR");

  const totalPlannedMinutes = rowStats.reduce((s, r) => s + (Number(r.weeklyMinutes) || 0), 0);
  const totalTargetMinutes = rowStats.reduce((s, r) => s + (Number(r.targetMin) || 0), 0);

  const coverageSummary = buildCoverageSummary(dayKeys, needsBySlot, coverageGaps);

  const roleCoverageGapsCount = coverageGaps.filter((g) => g.type === "coverage_role_gap").length;
  const skillCoverageGapsCount = coverageGaps.filter((g) => g.type === "coverage_skill_gap").length;
  const totalCoverageGapsCount = coverageGaps.length;

  return {
    summary: {
      staffCount: rows.length,
      warningsCount: warnings.length,

      totalPlannedMinutes,
      totalTargetMinutes,
      totalDeltaMinutes: totalPlannedMinutes - totalTargetMinutes,

      estimatedCost: totalEstimated,
      estimatedPayrollCost: totalEstimated, // alias attendu par PlanningRH
      estimatedCostByRole: byRoleCost,

      coverageGapCount: totalCoverageGapsCount,   // alias 1
      coverageGapsCount: totalCoverageGapsCount,  // alias 2 (PlanningRH)
      roleCoverageGapsCount,
      skillCoverageGapsCount,

      slotsAnalyzed: needsBySlot.length,
    },

    // synthèse historique / journée
    byDay,

    // détail collaborateurs
    rowStats,

    // alertes
    warnings,

    // couverture
    needsBySlot,
    coverageGaps,
    coverageSummary,

    // coûts (format attendu par PlanningRH)
    costs: {
      totalEstimated,
      byRole: byRoleCost,
      currency,
    },

    // compat rétro (si d'autres modules lisent ces clés)
    rulesResults: [],
  };
}

// ----- aliases rétrocompat
export const analyzeWeekPlanning = analyzePlanning;
export const getPlanningAnalysis = analyzePlanning;
export const computePlanningAnalysis = analyzePlanning;

export default analyzePlanning;